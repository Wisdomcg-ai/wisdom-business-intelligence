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

    // Fetch Chart of Accounts to get account codes (P&L reports don't include them)
    const accountCodeLookup = new Map<string, string>();
    try {
      const coaResp = await fetch(
        `https://api.xero.com/api.xro/2.0/Accounts?where=${encodeURIComponent('Type=="REVENUE"||Type=="OTHERINCOME"||Type=="DIRECTCOSTS"||Type=="EXPENSE"||Type=="OVERHEADS"')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'xero-tenant-id': connection.tenant_id,
            'Accept': 'application/json',
          },
        }
      );
      if (coaResp.ok) {
        const coaData = await coaResp.json();
        for (const acc of coaData.Accounts || []) {
          if (acc.Name && acc.Code) accountCodeLookup.set(acc.Name, acc.Code);
        }
      }
    } catch {
      // Non-fatal — codes won't be set
    }

    // Calculate date range: last 24 months in two batches
    // Xero Reports API allows max 11 periods per request for MONTH timeframe
    const now = new Date();
    const plLines: any[] = [];
    const allAccounts = new Map<string, any>();
    let monthColumns: string[] = [];

    // Helper to parse a single P&L report response
    const parsePLResponse = (report: any) => {
      const rows = report.Rows || [];
      const headerRow = rows.find((r: any) => r.RowType === 'Header');
      const cols = headerRow?.Cells?.slice(1)?.map((c: any) => c.Value) || [];

      for (const section of rows) {
        if (section.RowType !== 'Section' || !section.Rows) continue;
        const sectionTitle = section.Title || 'Other';

        for (const row of section.Rows) {
          if (row.RowType !== 'Row' || !row.Cells) continue;
          const accountName = row.Cells[0]?.Value;
          if (!accountName) continue;

          // Skip Xero summary/calculated rows (Gross Profit, Net Profit, etc.)
          if (SUMMARY_ROW_NAMES.has(accountName.toLowerCase())) continue;

          const existing = allAccounts.get(accountName) || {
            business_id: businessId,
            account_name: accountName,
            account_code: accountCodeLookup.get(accountName) || null,
            account_type: mapSectionToType(sectionTitle),
            section: sectionTitle,
            monthly_values: {} as Record<string, number>,
            updated_at: new Date().toISOString()
          };

          for (let i = 1; i < row.Cells.length && i <= cols.length; i++) {
            const monthKey = cols[i - 1];
            const value = parseFloat(row.Cells[i]?.Value || '0');
            if (monthKey && !isNaN(value)) {
              const monthDate = parseMonthString(monthKey);
              if (monthDate) {
                existing.monthly_values[monthDate] = value;
              }
            }
          }

          allAccounts.set(accountName, existing);
        }
      }

      return cols.length;
    };

    // Request 1: Recent 12 months (periods=11)
    // Use single-month base period (current month) so each column is one month
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-based
    const recentFrom = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const recentTo = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0]; // last day of current month

    console.log(`[Xero Sync] Syncing ${tenantName}: base month ${recentFrom}`);

    const reportUrl1 = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${recentFrom}&toDate=${recentTo}&periods=11&timeframe=MONTH&standardLayout=true&paymentsOnly=false`;
    const reportResponse1 = await fetch(reportUrl1, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'xero-tenant-id': connection.tenant_id,
        'Accept': 'application/json'
      }
    });

    if (!reportResponse1.ok) {
      const errorText = await reportResponse1.text();
      console.error(`[Xero Sync] P&L fetch failed for ${tenantName}:`, errorText);
      return {
        business_id: businessId,
        tenant_name: tenantName,
        status: 'failed',
        message: `API error: ${reportResponse1.status}`
      };
    }

    const reportData1 = await reportResponse1.json();
    const report1 = reportData1?.Reports?.[0];

    if (!report1) {
      return {
        business_id: businessId,
        tenant_name: tenantName,
        status: 'failed',
        message: 'No P&L report returned'
      };
    }

    let totalMonthCols = parsePLResponse(report1);

    // Request 2: Older 12 months (non-fatal if it fails)
    await new Promise(resolve => setTimeout(resolve, 300));

    // Base period = the month that is 12 months before current month (single month)
    const olderDate = new Date(currentYear, currentMonth - 13, 1);
    const olderYear = olderDate.getFullYear();
    const olderMonthNum = olderDate.getMonth() + 1;
    const olderFrom = `${olderYear}-${String(olderMonthNum).padStart(2, '0')}-01`;
    const olderTo = new Date(olderYear, olderMonthNum, 0).toISOString().split('T')[0]; // last day of that month

    const reportUrl2 = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${olderFrom}&toDate=${olderTo}&periods=11&timeframe=MONTH&standardLayout=true&paymentsOnly=false`;
    try {
      const reportResponse2 = await fetch(reportUrl2, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': connection.tenant_id,
          'Accept': 'application/json'
        }
      });

      if (reportResponse2.ok) {
        const reportData2 = await reportResponse2.json();
        const report2 = reportData2?.Reports?.[0];
        if (report2) {
          totalMonthCols += parsePLResponse(report2);
        }
      }
    } catch (err) {
      console.warn(`[Xero Sync] Older period fetch failed for ${tenantName}, continuing with recent data`);
    }

    // Convert map to array for insert
    for (const entry of allAccounts.values()) {
      if (Object.keys(entry.monthly_values).length > 0) {
        plLines.push(entry);
      }
    }

    monthColumns = Array.from(new Set(
      plLines.flatMap(l => Object.keys(l.monthly_values))
    ));

    // Upsert P&L lines to database
    if (plLines.length > 0) {
      // Delete existing lines for this business + verify before inserting
      const { error: deleteError } = await supabase
        .from('xero_pl_lines')
        .delete()
        .eq('business_id', businessId);

      if (deleteError) {
        console.error(`[Xero Sync] Delete failed for ${tenantName}:`, deleteError);
      }

      // Verify deletion completed before inserting (prevents duplicates from concurrent syncs)
      const { count } = await supabase
        .from('xero_pl_lines')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId);

      if (count && count > 0) {
        console.warn(`[Xero Sync] ${count} rows still exist after delete for ${tenantName} — retrying delete`);
        await supabase
          .from('xero_pl_lines')
          .delete()
          .eq('business_id', businessId);
      }

      // Insert new lines (fallback without account_code if column not yet added)
      const { error: firstError } = await supabase
        .from('xero_pl_lines')
        .insert(plLines);

      if (firstError?.message?.includes('account_code')) {
        const linesWithoutCode = plLines.map(({ account_code, ...rest }: any) => rest);
        const { error: retryError } = await supabase
          .from('xero_pl_lines')
          .insert(linesWithoutCode);
        if (retryError) {
          console.error(`[Xero Sync] Insert failed for ${tenantName}:`, retryError);
          return {
            business_id: businessId,
            tenant_name: tenantName,
            status: 'failed',
            message: 'Database insert failed'
          };
        }
      } else if (firstError) {
        console.error(`[Xero Sync] Insert failed for ${tenantName}:`, firstError);
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
  // Check 'other income/expense' BEFORE generic 'income/expense' to avoid false matches
  if (lower.includes('other income')) return 'other_income';
  if (lower.includes('other expense')) return 'other_expense';
  if (lower.includes('income') || lower.includes('revenue')) return 'revenue';
  if (lower.includes('cost of') || lower.includes('cogs') || lower.includes('direct')) return 'cogs';
  if (lower.includes('expense') || lower.includes('operating')) return 'opex';
  // Custom Xero sections (Think Bigger, VCFO, etc.) are typically expense categories
  return 'opex';
}

// Xero summary/calculated rows that should NOT be stored as account lines
const SUMMARY_ROW_NAMES = new Set([
  'gross profit',
  'net profit',
  'total income',
  'total revenue',
  'total cost of sales',
  'total direct costs',
  'total operating expenses',
  'total expenses',
  'total other income',
  'total other expenses',
  'operating profit',
]);

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
