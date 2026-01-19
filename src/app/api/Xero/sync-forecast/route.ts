import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '@/lib/xero/token-manager';

export const dynamic = 'force-dynamic'

const supabase = createClient(
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
    const { business_id, forecast_id } = await request.json();

    if (!business_id || !forecast_id) {
      return NextResponse.json(
        { error: 'business_id and forecast_id are required' },
        { status: 400 }
      );
    }

    // Get the Xero connection
    const { data: connection, error: connError } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'No active Xero connection found' },
        { status: 404 }
      );
    }

    // Get the forecast details to determine date range
    const { data: forecast, error: forecastError } = await supabase
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

    // Get valid access token using the robust token manager
    // This handles: refresh threshold (15 min), retry logic, race conditions
    const tokenResult = await getValidAccessToken(connection, supabase);

    if (!tokenResult.success) {
      console.error('[Xero Sync] Token refresh failed:', tokenResult.error, tokenResult.message);
      return NextResponse.json(
        {
          error: tokenResult.message || 'Xero connection expired. Please reconnect Xero from the Integrations page.',
          details: tokenResult.error,
          needsReconnect: tokenResult.shouldDeactivate
        },
        { status: 401 }
      );
    }

    const accessToken = tokenResult.accessToken!;

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

            // Check for "Other Income" FIRST since it also contains "INCOME"
            if (sectionTitle.includes('OTHER INCOME')) {
              category = 'Other Income';
            } else if (sectionTitle.includes('INCOME') || sectionTitle.includes('REVENUE') || sectionTitle.includes('SALES') || sectionTitle.includes('TRADING INCOME')) {
              category = 'Revenue';
            } else if (sectionTitle.includes('COST OF SALES') || sectionTitle.includes('DIRECT COSTS') || sectionTitle.includes('COST OF GOODS')) {
              category = 'Cost of Sales';
            } else if (sectionTitle.includes('OTHER EXPENSE')) {
              category = 'Other Expenses';
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
    const { error: deleteError } = await supabase
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
      const { data: insertedData, error: insertError } = await supabase
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
    await supabase
      .from('xero_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection.id);

    // Update the forecast's last sync timestamp
    await supabase
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
