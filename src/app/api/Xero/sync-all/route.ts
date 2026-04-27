// /app/api/Xero/sync-all/route.ts
// Background job to sync all Xero connections with fresh P&L data
// Runs daily at 2am via Vercel Cron

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '@/lib/utils/encryption';
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids';

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
  const connectionBusinessId = connection.business_id; // business_profiles.id from xero_connections
  const tenantName = connection.tenant_name;

  try {
    // Resolve both ID formats — xero_pl_lines FK expects businesses.id
    const ids = await resolveBusinessIds(supabase, connectionBusinessId);
    const businessId = ids.bizId; // Use businesses.id for xero_pl_lines inserts (FK constraint)

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

    // ── Multi-window P&L fetch ────────────────────────────────────────────
    // Pre-2026-04-27 used `periods=11` with a far-back base month, which
    // Xero unreliably returns only the base column for. Switched to explicit
    // fromDate→toDate ranges with timeframe=MONTH; Xero returns one column
    // per month spanning the range. 3 windows give us the entire prior FY +
    // current FY YTD + prior-prior FY where data exists.
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-based
    const fyStartMonth: number = 7; // AU default (July). Per-tenant override is a future enhancement.

    // Compute current FY: if we're in Jul-Dec, FY = next year; if Jan-Jun, FY = current year.
    const currentFY = currentMonth >= fyStartMonth ? currentYear + 1 : currentYear;

    // FY{n} runs from {n-1}-fyStartMonth → {n}-(fyStartMonth-1).
    const fyRange = (fy: number) => {
      const startY = fy - 1;
      const startM = fyStartMonth;
      const endY = fy;
      const endM = fyStartMonth - 1 || 12;
      const endYAdj = fyStartMonth === 1 ? endY - 1 : endY;
      const fromDate = `${startY}-${String(startM).padStart(2, '0')}-01`;
      const lastDay = new Date(endYAdj, endM, 0).getDate();
      const toDate = `${endYAdj}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { fromDate, toDate };
    };

    // Current FY YTD: from FY start through end of current month
    const ytdStartY = currentMonth >= fyStartMonth ? currentYear : currentYear - 1;
    const ytdFrom = `${ytdStartY}-${String(fyStartMonth).padStart(2, '0')}-01`;
    const ytdLastDay = new Date(currentYear, currentMonth, 0).getDate();
    const ytdTo = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(ytdLastDay).padStart(2, '0')}`;

    const priorFY = fyRange(currentFY - 1);
    const priorPriorFY = fyRange(currentFY - 2);

    const windows = [
      { label: `FY${currentFY} YTD`, from: ytdFrom, to: ytdTo, required: true },
      { label: `FY${currentFY - 1}`, from: priorFY.fromDate, to: priorFY.toDate, required: true },
      { label: `FY${currentFY - 2}`, from: priorPriorFY.fromDate, to: priorPriorFY.toDate, required: false },
    ];

    console.log(`[Xero Sync] Syncing ${tenantName}: ${windows.map(w => w.label).join(', ')}`);

    let totalMonthCols = 0;
    const fetchedRanges: string[] = [];
    const failedRequiredWindows: string[] = [];

    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 300));

      const url = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${w.from}&toDate=${w.to}&timeframe=MONTH&standardLayout=false&paymentsOnly=false`;
      try {
        const resp = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'xero-tenant-id': connection.tenant_id,
            'Accept': 'application/json',
          },
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          console.error(`[Xero Sync] ${tenantName}: ${w.label} P&L request failed (${resp.status}): ${errorText.substring(0, 300)}`);
          if (w.required) failedRequiredWindows.push(w.label);
          continue;
        }

        const data = await resp.json();
        const report = data?.Reports?.[0];
        if (!report) {
          console.warn(`[Xero Sync] ${tenantName}: ${w.label} returned 200 but no Reports[0]`);
          if (w.required) failedRequiredWindows.push(w.label);
          continue;
        }

        const cols = parsePLResponse(report);
        totalMonthCols += cols;
        fetchedRanges.push(`${w.label}=${cols}mo`);
        console.log(`[Xero Sync] ${tenantName}: ${w.label} returned ${cols} month columns (${w.from} → ${w.to})`);
      } catch (err: any) {
        console.error(`[Xero Sync] ${tenantName}: ${w.label} fetch threw:`, err?.message || err);
        if (w.required) failedRequiredWindows.push(w.label);
      }
    }

    if (failedRequiredWindows.length > 0) {
      // Don't fail the whole sync — partial data is better than none — but
      // surface clearly so coaches know to investigate.
      console.error(`[Xero Sync] ${tenantName}: REQUIRED windows failed: ${failedRequiredWindows.join(', ')}. Sync will proceed with partial data.`);
    }
    console.log(`[Xero Sync] ${tenantName}: Total fetched ranges: ${fetchedRanges.join(', ')} (${totalMonthCols} columns total)`);

    // ── Reconciliation: verify monthly sums match full-period totals ──────
    // Xero's monthly breakdown can differ from the full-period total due to
    // back-dated transactions, manual journals, or adjustment entries.
    // Fetch authoritative full-period totals and adjust if needed.
    await new Promise(resolve => setTimeout(resolve, 300));

    // Determine the two FY periods to verify (current FY and prior FY).
    // fyStartMonth declared above for the multi-window fetch; reused here.
    const verifyPeriods = [
      // Prior FY
      { from: `${currentYear - 2}-07-01`, to: `${currentYear - 1}-06-30`, label: `FY${currentYear - 1}` },
      // Current FY (YTD)
      { from: `${currentYear - 1}-07-01`, to: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${new Date(currentYear, currentMonth, 0).getDate()}`, label: `FY${currentYear}` },
    ];

    const reconStats = { adjusted: 0, missingFromMonthly: 0, totalDiff: 0 };

    for (const period of verifyPeriods) {
      try {
        const verifyUrl = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${period.from}&toDate=${period.to}&standardLayout=false&paymentsOnly=false`;
        const verifyRes = await fetch(verifyUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'xero-tenant-id': connection.tenant_id,
            'Accept': 'application/json'
          }
        });

        if (!verifyRes.ok) {
          console.warn(`[Xero Sync] ${tenantName}: ${period.label} reconciliation request failed (${verifyRes.status})`);
          await new Promise(resolve => setTimeout(resolve, 300));
          continue;
        }

        const verifyData = await verifyRes.json();
        const verifyReport = verifyData?.Reports?.[0];
        if (!verifyReport?.Rows) {
          await new Promise(resolve => setTimeout(resolve, 300));
          continue;
        }

        // Parse the full-period totals (single column, no periods)
        for (const section of verifyReport.Rows) {
          if (section.RowType !== 'Section' || !section.Rows) continue;
          const sectionTitle = section.Title || 'Other';

          for (const row of section.Rows) {
            if (row.RowType !== 'Row' || !row.Cells) continue;
            const accountName = row.Cells[0]?.Value;
            if (!accountName || SUMMARY_ROW_NAMES.has(accountName.toLowerCase())) continue;
            const authoritativeTotal = parseFloat(row.Cells[1]?.Value || '0');
            if (isNaN(authoritativeTotal)) continue;

            // Compute month keys spanning this FY period.
            const fyStart = new Date(period.from);
            const fyEnd = new Date(period.to);
            const monthKeysInPeriod: string[] = [];
            let cur = new Date(fyStart);
            while (cur <= fyEnd) {
              monthKeysInPeriod.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
              cur.setMonth(cur.getMonth() + 1);
            }

            let account = allAccounts.get(accountName);
            if (!account) {
              // Account exists in Xero's authoritative totals but not in our
              // monthly breakdown. This means the per-month requests missed
              // it (Xero quirk for accounts with very few transactions, or
              // a section the parser didn't recognize). Synthesize the
              // account so totals reconcile — we'll attribute the full
              // value to the last month of the period as the best available
              // approximation; coaches see the right TOTAL.
              if (Math.abs(authoritativeTotal) < 0.01) continue;
              account = {
                business_id: businessId,
                account_name: accountName,
                account_code: accountCodeLookup.get(accountName) || null,
                account_type: mapSectionToType(sectionTitle),
                section: sectionTitle,
                monthly_values: {} as Record<string, number>,
                updated_at: new Date().toISOString(),
              };
              allAccounts.set(accountName, account);
              reconStats.missingFromMonthly++;
              console.warn(`[Xero Sync] ${tenantName}: ${period.label} account "${accountName}" missing from monthly breakdown — added with total $${authoritativeTotal} on ${monthKeysInPeriod[monthKeysInPeriod.length - 1]}`);
            }

            // Sum monthly values within this FY period
            let monthlySum = 0;
            for (const mk of monthKeysInPeriod) {
              monthlySum += account.monthly_values[mk] || 0;
            }

            // If there's a discrepancy, adjust the most recent month
            const diff = authoritativeTotal - monthlySum;
            if (Math.abs(diff) > 0.01 && monthKeysInPeriod.length > 0) {
              const lastMonth = monthKeysInPeriod[monthKeysInPeriod.length - 1];
              account.monthly_values[lastMonth] = (account.monthly_values[lastMonth] || 0) + diff;
              reconStats.adjusted++;
              reconStats.totalDiff += Math.abs(diff);
              if (Math.abs(diff) > 100) {
                // Surface non-trivial reconciliation gaps so coaches/devs can
                // investigate (back-dated journals, deleted txns, etc.).
                console.warn(`[Xero Sync] ${tenantName}: ${period.label} "${accountName}" diff $${diff.toFixed(2)} (Xero: $${authoritativeTotal}, monthly sum: $${monthlySum.toFixed(2)}) — applied to ${lastMonth}`);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[Xero Sync] ${period.label} reconciliation threw for ${tenantName}:`, (err as any)?.message || err);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    console.log(`[Xero Sync] ${tenantName}: Reconciliation summary — ${reconStats.adjusted} accounts adjusted, ${reconStats.missingFromMonthly} synthesized, total diff applied $${reconStats.totalDiff.toFixed(2)}`);

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
      // ids already resolved at top of syncConnection() — use ids.all for cleanup

      // In-memory dedup as belt-and-suspenders. The allAccounts Map keys by
      // account_name so this is normally a no-op, but keeps the contract
      // explicit before we hit the DB.
      const seen = new Set<string>();
      const dedupedPlLines: any[] = [];
      for (const line of plLines) {
        const key = line.account_code || `name:${line.account_name}`;
        if (seen.has(key)) {
          console.warn(`[Xero Sync] In-memory duplicate dropped for ${tenantName}: ${line.account_name} (${key})`);
          continue;
        }
        seen.add(key);
        dedupedPlLines.push(line);
      }

      // Delete existing lines for this business + verify before inserting.
      // Fail loud — silent delete failure is what created the Envisage dup
      // disaster (Apr 2026: 89 rows where 47 should exist).
      const { error: deleteError } = await supabase
        .from('xero_pl_lines')
        .delete()
        .in('business_id', ids.all);

      if (deleteError) {
        console.error(`[Xero Sync] Delete failed for ${tenantName}:`, deleteError);
        return {
          business_id: businessId,
          tenant_name: tenantName,
          status: 'failed',
          message: `Pre-insert delete failed: ${deleteError.message}`,
        };
      }

      // Verify deletion completed before inserting (prevents duplicates from concurrent syncs)
      const { count: postDeleteCount } = await supabase
        .from('xero_pl_lines')
        .select('*', { count: 'exact', head: true })
        .in('business_id', ids.all);

      if (postDeleteCount && postDeleteCount > 0) {
        console.warn(`[Xero Sync] ${postDeleteCount} rows still exist after delete for ${tenantName} — retrying delete`);
        const { error: retryDelErr } = await supabase
          .from('xero_pl_lines')
          .delete()
          .in('business_id', ids.all);
        if (retryDelErr) {
          console.error(`[Xero Sync] Retry delete failed for ${tenantName}:`, retryDelErr);
          return {
            business_id: businessId,
            tenant_name: tenantName,
            status: 'failed',
            message: `Retry delete failed: ${retryDelErr.message}`,
          };
        }
        const { count: secondCheck } = await supabase
          .from('xero_pl_lines')
          .select('*', { count: 'exact', head: true })
          .in('business_id', ids.all);
        if (secondCheck && secondCheck > 0) {
          // Aborting prevents creating new duplicates on top of the leftover rows.
          console.error(`[Xero Sync] ${secondCheck} rows STILL exist after retry for ${tenantName} — aborting to avoid dup-pile`);
          return {
            business_id: businessId,
            tenant_name: tenantName,
            status: 'failed',
            message: `Could not clear xero_pl_lines (${secondCheck} rows remain) — aborting to prevent duplicates`,
          };
        }
      }

      // Insert new lines (fallback without account_code if column not yet added)
      const { error: firstError } = await supabase
        .from('xero_pl_lines')
        .insert(dedupedPlLines);

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
      business_id: connectionBusinessId,
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
