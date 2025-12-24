// /app/api/Xero/sync-all/route.ts
// Background job to sync all Xero connections with fresh P&L data
// Runs daily at 2am via Vercel Cron

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '@/lib/utils/encryption';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for batch processing

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface SyncResult {
  business_id: string;
  tenant_name: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  accounts_synced?: number;
  months_synced?: number;
}

// Refresh token if needed
async function getValidAccessToken(connection: any): Promise<string | null> {
  const now = new Date();
  const expiry = new Date(connection.expires_at);
  const bufferTime = new Date(expiry.getTime() - 5 * 60 * 1000); // 5 min buffer

  const decryptedAccessToken = decrypt(connection.access_token);
  const decryptedRefreshToken = decrypt(connection.refresh_token);

  if (bufferTime > now) {
    return decryptedAccessToken;
  }

  console.log(`[Xero Sync] Refreshing token for ${connection.tenant_name}`);

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
    console.error(`[Xero Sync] Token refresh failed for ${connection.tenant_name}`);
    await supabase
      .from('xero_connections')
      .update({ is_active: false })
      .eq('id', connection.id);
    return null;
  }

  const tokens = await refreshResponse.json();
  const newExpiry = new Date();
  newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in);

  await supabase
    .from('xero_connections')
    .update({
      access_token: encrypt(tokens.access_token),
      refresh_token: encrypt(tokens.refresh_token),
      expires_at: newExpiry.toISOString()
    })
    .eq('id', connection.id);

  return tokens.access_token;
}

// Sync P&L data for a single connection
async function syncConnection(connection: any): Promise<SyncResult> {
  const businessId = connection.business_id;
  const tenantName = connection.tenant_name;

  try {
    const accessToken = await getValidAccessToken(connection);
    if (!accessToken) {
      return {
        business_id: businessId,
        tenant_name: tenantName,
        status: 'failed',
        message: 'Token refresh failed - connection deactivated'
      };
    }

    // Calculate date range: last 24 months for comprehensive historical data
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - 24);

    const fromDateStr = fromDate.toISOString().split('T')[0];
    const toDateStr = toDate.toISOString().split('T')[0];

    console.log(`[Xero Sync] Syncing ${tenantName}: ${fromDateStr} to ${toDateStr}`);

    // Fetch P&L report from Xero
    const reportUrl = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${fromDateStr}&toDate=${toDateStr}&periods=24&timeframe=MONTH`;

    const reportResponse = await fetch(reportUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'xero-tenant-id': connection.tenant_id,
        'Accept': 'application/json'
      }
    });

    if (!reportResponse.ok) {
      const errorText = await reportResponse.text();
      console.error(`[Xero Sync] P&L fetch failed for ${tenantName}:`, errorText);
      return {
        business_id: businessId,
        tenant_name: tenantName,
        status: 'failed',
        message: `API error: ${reportResponse.status}`
      };
    }

    const reportData = await reportResponse.json();
    const report = reportData?.Reports?.[0];

    if (!report) {
      return {
        business_id: businessId,
        tenant_name: tenantName,
        status: 'failed',
        message: 'No P&L report returned'
      };
    }

    // Parse and store P&L lines
    const plLines: any[] = [];
    const rows = report.Rows || [];

    // Get column headers (months)
    let monthColumns: string[] = [];
    const headerRow = rows.find((r: any) => r.RowType === 'Header');
    if (headerRow?.Cells) {
      monthColumns = headerRow.Cells.slice(1).map((cell: any) => cell.Value);
    }

    // Process each section
    for (const section of rows) {
      if (section.RowType !== 'Section' || !section.Rows) continue;

      const sectionTitle = section.Title || 'Other';

      for (const row of section.Rows) {
        if (row.RowType !== 'Row' || !row.Cells) continue;

        const accountName = row.Cells[0]?.Value;
        if (!accountName) continue;

        // Get values for each month
        const monthlyValues: Record<string, number> = {};
        for (let i = 1; i < row.Cells.length && i <= monthColumns.length; i++) {
          const monthKey = monthColumns[i - 1];
          const value = parseFloat(row.Cells[i]?.Value || '0');
          if (monthKey && !isNaN(value)) {
            // Convert month name to YYYY-MM format
            const monthDate = parseMonthString(monthKey);
            if (monthDate) {
              monthlyValues[monthDate] = value;
            }
          }
        }

        if (Object.keys(monthlyValues).length > 0) {
          plLines.push({
            business_id: businessId,
            account_name: accountName,
            account_type: mapSectionToType(sectionTitle),
            section: sectionTitle,
            monthly_values: monthlyValues,
            updated_at: new Date().toISOString()
          });
        }
      }
    }

    // Upsert P&L lines to database
    if (plLines.length > 0) {
      // Delete existing lines for this business
      await supabase
        .from('xero_pl_lines')
        .delete()
        .eq('business_id', businessId);

      // Insert new lines
      const { error: insertError } = await supabase
        .from('xero_pl_lines')
        .insert(plLines);

      if (insertError) {
        console.error(`[Xero Sync] Insert failed for ${tenantName}:`, insertError);
        return {
          business_id: businessId,
          tenant_name: tenantName,
          status: 'failed',
          message: 'Database insert failed'
        };
      }
    }

    // Update last_synced_at
    await supabase
      .from('xero_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection.id);

    console.log(`[Xero Sync] Success for ${tenantName}: ${plLines.length} accounts, ${monthColumns.length} months`);

    return {
      business_id: businessId,
      tenant_name: tenantName,
      status: 'success',
      message: 'Sync completed',
      accounts_synced: plLines.length,
      months_synced: monthColumns.length
    };

  } catch (error) {
    console.error(`[Xero Sync] Error for ${tenantName}:`, error);
    return {
      business_id: businessId,
      tenant_name: tenantName,
      status: 'failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Helper to parse month string like "Jan 2024" to "2024-01"
function parseMonthString(monthStr: string): string | null {
  try {
    const date = new Date(monthStr + ' 1');
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  } catch {
    return null;
  }
}

// Map Xero section titles to account types
function mapSectionToType(section: string): string {
  const lower = section.toLowerCase();
  if (lower.includes('income') || lower.includes('revenue')) return 'revenue';
  if (lower.includes('cost of') || lower.includes('cogs') || lower.includes('direct')) return 'cogs';
  if (lower.includes('expense') || lower.includes('operating')) return 'opex';
  if (lower.includes('other income')) return 'other_income';
  if (lower.includes('other expense')) return 'other_expense';
  return 'other';
}

export async function GET(request: NextRequest) {
  try {
    // Optional: Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    console.log('[Xero Sync] Starting daily sync for all connections...');

    // Get all active Xero connections
    const { data: connections, error } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('[Xero Sync] Failed to fetch connections:', error);
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active Xero connections to sync',
        results: []
      });
    }

    console.log(`[Xero Sync] Found ${connections.length} active connections`);

    // Process all connections
    const results: SyncResult[] = [];
    for (const connection of connections) {
      const result = await syncConnection(connection);
      results.push(result);

      // Delay between syncs to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const summary = {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length
    };

    console.log('[Xero Sync] Complete:', summary);

    return NextResponse.json({
      success: true,
      summary,
      results
    });

  } catch (error) {
    console.error('[Xero Sync] Error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
