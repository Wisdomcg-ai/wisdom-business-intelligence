import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { encrypt, decrypt } from '@/lib/utils/encryption';

export const dynamic = 'force-dynamic'

// Service client for database operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Map Xero account types to our P&L categories
const ACCOUNT_TYPE_MAPPING: { [key: string]: string } = {
  'REVENUE': 'Revenue',
  'SALES': 'Revenue',
  'OTHERINCOME': 'Other Income',
  'EXPENSE': 'Operating Expenses',
  'DIRECTCOSTS': 'Cost of Sales',
  'OVERHEADS': 'Operating Expenses',
  'DEPRECIATION': 'Operating Expenses',
  'EQUITY': 'Other Expenses',
  'LIABILITY': 'Other Expenses',
  'ASSET': 'Other Income'
};

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify user is authenticated
    const cookieStore = cookies();
    const supabaseAuth = createRouteHandlerClient({ cookies: () => cookieStore });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { business_id, forecast_id } = await request.json();

    if (!business_id || !forecast_id) {
      return NextResponse.json(
        { error: 'business_id and forecast_id are required' },
        { status: 400 }
      );
    }

    // SECURITY: Verify user has access to this business
    const { data: businessAccess } = await supabaseAuth
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', business_id)
      .single();

    if (!businessAccess) {
      return NextResponse.json(
        { error: 'Business not found or access denied' },
        { status: 403 }
      );
    }

    // Check if user is owner, assigned coach, or team member
    const isOwner = businessAccess.owner_id === user.id;
    const isCoach = businessAccess.assigned_coach_id === user.id;

    if (!isOwner && !isCoach) {
      // Check if user is a team member
      const { data: teamMember } = await supabaseAuth
        .from('business_users')
        .select('id')
        .eq('business_id', business_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (!teamMember) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    }

    // Get the Xero connection (use admin client to bypass RLS for Xero data)
    const { data: connection, error: connError } = await supabaseAdmin
      .from('xero_connections')
      .select('*')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .maybeSingle();

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'No active Xero connection found' },
        { status: 404 }
      );
    }

    // Get the forecast details to determine date range
    const { data: forecast, error: forecastError } = await supabaseAdmin
      .from('financial_forecasts')
      .select('*')
      .eq('id', forecast_id)
      .single();

    if (forecastError || !forecast) {
      return NextResponse.json(
        { error: 'Forecast not found' },
        { status: 404 }
      );
    }

    // Decrypt tokens from database
    const decryptedAccessToken = decrypt(connection.access_token);
    const decryptedRefreshToken = decrypt(connection.refresh_token);

    // Check if token needs refresh
    const now = new Date();
    const expiry = new Date(connection.expires_at);
    let accessToken = decryptedAccessToken;

    if (expiry <= now) {
      // Refresh the token
      const refreshResponse = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(
            `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
          ).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: decryptedRefreshToken
        })
      });

      if (!refreshResponse.ok) {
        return NextResponse.json(
          { error: 'Failed to refresh Xero token' },
          { status: 401 }
        );
      }

      const tokens = await refreshResponse.json();
      accessToken = tokens.access_token;

      // Update tokens in database (encrypted)
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in);

      await supabaseAdmin
        .from('xero_connections')
        .update({
          access_token: encrypt(tokens.access_token),
          refresh_token: encrypt(tokens.refresh_token),
          expires_at: newExpiry.toISOString()
        })
        .eq('id', connection.id);
    }

    // Fetch P&L data for BOTH baseline and actual periods
    // Baseline = prior FY for comparison/patterns (e.g., FY25: Jul 2024 - Jun 2025)
    // Actual = current FY YTD for performance tracking (e.g., FY26 YTD: Jul-Oct 2025)

    const periods = [];

    // Always fetch baseline if available
    if (forecast.baseline_start_month && forecast.baseline_end_month) {
      periods.push({
        name: 'baseline',
        start: forecast.baseline_start_month,
        end: forecast.baseline_end_month
      });
    }

    // Fetch actual period (current FY YTD)
    periods.push({
      name: 'actual',
      start: forecast.actual_start_month,
      end: forecast.actual_end_month
    });

    console.log(`[Sync] Fetching data for periods:`, periods);

    // We'll aggregate all monthly data into a single structure
    const monthlyData: { [accountName: string]: { category: string; months: { [monthKey: string]: number } } } = {}

    // Fetch each period
    for (const period of periods) {
      console.log(`[Sync] Fetching ${period.name} period: ${period.start} to ${period.end}`);

      const startMonth = new Date(period.start + '-01');
      const endMonth = new Date(period.end + '-01');

      let currentMonth = new Date(startMonth);
      while (currentMonth <= endMonth) {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();  // 0-based month
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

      // Build date strings directly to avoid timezone issues
      const monthStr = String(month + 1).padStart(2, '0');
      const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
      const fromDate = `${year}-${monthStr}-01`;
      const toDate = `${year}-${monthStr}-${String(lastDayOfMonth).padStart(2, '0')}`;

      console.log(`[Sync] Fetching month: ${monthKey} (${fromDate} to ${toDate})`);

      // Fetch P&L for this single month
      const monthResponse = await fetch(
        `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'xero-tenant-id': connection.tenant_id,
            'Accept': 'application/json'
          }
        }
      );

      if (!monthResponse.ok) {
        console.error(`[Sync] Failed to fetch ${monthKey}`);
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        continue;
      }

      const monthData = await monthResponse.json();

      // Parse this month's data
      if (monthData?.Reports?.[0]?.Rows) {
        monthData.Reports[0].Rows.forEach((section: any) => {
          if (section.RowType === 'Section' && section.Rows) {
            // Determine category
            let category = 'Operating Expenses';
            const sectionTitle = section.Title?.toUpperCase() || '';

            if (sectionTitle.includes('INCOME') || sectionTitle.includes('REVENUE') || sectionTitle.includes('SALES')) {
              category = 'Revenue';
            } else if (sectionTitle.includes('COST OF SALES') || sectionTitle.includes('DIRECT COSTS')) {
              category = 'Cost of Sales';
            } else if (sectionTitle.includes('OTHER INCOME')) {
              category = 'Other Income';
            }

            // Process rows
            section.Rows.forEach((row: any) => {
              if (row.RowType === 'Row' && row.Cells && row.Cells.length > 0) {
                const accountName = row.Cells[0]?.Value || 'Unknown';

                // Skip summary rows
                const lowerName = accountName.toLowerCase();
                if (!accountName ||
                    lowerName.includes('total') ||
                    lowerName.includes('gross profit') ||
                    lowerName.includes('net profit') ||
                    lowerName.includes('net income') ||
                    lowerName.includes('operating profit') ||
                    lowerName.includes('ebitda')) {
                  return;
                }

                // Get the value (second cell is the total for the period)
                const value = parseFloat(row.Cells[1]?.Value) || 0;

                // Initialize account if needed
                if (!monthlyData[accountName]) {
                  monthlyData[accountName] = { category, months: {} };
                }

                // Store this month's value
                monthlyData[accountName].months[monthKey] = value;
              }
            });
          }
        });
      }

        // Move to next month
        currentMonth.setMonth(currentMonth.getMonth() + 1);
      }
    }

    console.log(`[Sync] Fetched all periods. Processing ${Object.keys(monthlyData).length} accounts`);

    // Convert aggregated data to P&L lines
    const plLines: Array<{
      account_code?: string;
      account_name: string;
      account_type?: string;
      category: string;
      actual_months: { [key: string]: number };
      is_from_xero: boolean;
    }> = [];

    Object.entries(monthlyData).forEach(([accountName, data]) => {
      const { category, months } = data;
      const actual_months: { [key: string]: number } = {};

      // Extract just the month values
      Object.entries(months).forEach(([key, value]) => {
        if (typeof value === 'number') {
          actual_months[key] = value;
        }
      });

      // Only add if there's actual data
      const hasData = Object.values(actual_months).some(val => val !== 0);
      if (hasData) {
        plLines.push({
          account_name: accountName,
          category: category as string,
          actual_months,
          is_from_xero: true
        });
      }
    });

    console.log(`[Sync] Created ${plLines.length} P&L line items from monthly data`);

    // Log sample data from first line to verify month keys and values
    if (plLines.length > 0) {
      console.log('[Sync] Sample line:', {
        name: plLines[0].account_name,
        category: plLines[0].category,
        monthKeys: Object.keys(plLines[0].actual_months),
        sampleValues: Object.entries(plLines[0].actual_months).slice(0, 3)
      });
    }

    // Delete existing Xero-synced lines for this forecast
    console.log('[Sync] Deleting existing Xero lines...');
    const { error: deleteError } = await supabaseAdmin
      .from('forecast_pl_lines')
      .delete()
      .eq('forecast_id', forecast_id)
      .eq('is_from_xero', true);

    if (deleteError) {
      console.error('[Sync] Delete error:', deleteError);
    }

    // Insert new lines
    if (plLines.length > 0) {
      const linesToInsert = plLines.map((line, index) => ({
        forecast_id,
        ...line,
        sort_order: index,
        forecast_months: {} // Start with empty forecast months
      }));

      console.log(`[Sync] Inserting ${linesToInsert.length} lines...`);
      const { data: insertedData, error: insertError } = await supabaseAdmin
        .from('forecast_pl_lines')
        .insert(linesToInsert)
        .select();

      if (insertError) {
        console.error('[Sync] Failed to insert P&L lines:', insertError);
        return NextResponse.json(
          { error: 'Failed to save P&L data', details: insertError },
          { status: 500 }
        );
      }

      console.log(`[Sync] Successfully inserted ${insertedData?.length || 0} lines`);
    } else {
      console.log('[Sync] No lines to insert - plLines is empty');
    }

    // Update last sync time
    await supabaseAdmin
      .from('xero_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection.id);

    // Update the forecast's last sync timestamp
    await supabaseAdmin
      .from('financial_forecasts')
      .update({
        last_xero_sync_at: new Date().toISOString()
      })
      .eq('id', forecast_id);

    console.log(`[Sync] Successfully synced ${plLines.length} lines from both baseline and actual periods`);

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${plLines.length} P&L line items from Xero`,
      lines_count: plLines.length
    });

  } catch (error) {
    console.error('Sync forecast error:', error);
    return NextResponse.json(
      { error: 'Failed to sync forecast data' },
      { status: 500 }
    );
  }
}
