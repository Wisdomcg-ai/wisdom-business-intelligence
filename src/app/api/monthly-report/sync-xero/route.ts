// /api/monthly-report/sync-xero/route.ts
// Manual P&L sync for a single business — syncs xero_pl_lines from Xero
// Fetches each month INDIVIDUALLY to guarantee correct monthly P&L values.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/xero/token-manager';
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids';

export const dynamic = 'force-dynamic';
// Vercel Hobby caps at 60s; request 60s explicitly
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Map Xero section titles to account types
function mapSectionToType(section: string): string {
  const lower = section.toLowerCase();
  if (lower.includes('other income')) return 'other_income';
  if (lower.includes('other expense')) return 'other_expense';
  if (lower.includes('income') || lower.includes('revenue')) return 'revenue';
  if (lower.includes('cost of') || lower.includes('cogs') || lower.includes('direct')) return 'cogs';
  if (lower.includes('expense') || lower.includes('operating')) return 'opex';
  return 'opex';
}

// Xero summary/calculated rows — NOT real accounts
const SUMMARY_ROW_NAMES = new Set([
  'gross profit', 'net profit', 'total income', 'total revenue',
  'total cost of sales', 'total direct costs', 'total operating expenses',
  'total expenses', 'total other income', 'total other expenses', 'operating profit',
]);

// Get last day of month (1-based month)
function lastDay(year: number, month: number): string {
  const d = new Date(year, month, 0);
  return d.toISOString().split('T')[0];
}

// Generate list of month keys for the last N months
function getMonthList(count: number): { key: string; fromDate: string; toDate: string }[] {
  const now = new Date();
  const months: { key: string; fromDate: string; toDate: string }[] = [];

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const fromDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const toDate = lastDay(y, m);
    months.push({ key, fromDate, toDate });
  }

  return months;
}

// Fetch single-month P&L from Xero — NO periods parameter
async function fetchSingleMonthPL(
  accessToken: string,
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<{ success: boolean; report?: any; error?: string; status?: number }> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}&standardLayout=true&paymentsOnly=false`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: errorText, status: response.status };
  }

  const data = await response.json();
  return { success: true, report: data?.Reports?.[0] };
}

// Parse single-month P&L report — extracts account name + single value
function parseSingleMonthReport(report: any): Map<string, { value: number; section: string }> {
  const accounts = new Map<string, { value: number; section: string }>();
  const rows = report.Rows || [];

  for (const section of rows) {
    if (section.RowType !== 'Section' || !section.Rows) continue;
    const sectionTitle = section.Title || 'Other';

    for (const row of section.Rows) {
      if (row.RowType !== 'Row' || !row.Cells) continue;
      const name = row.Cells[0]?.Value;
      if (!name) continue;
      if (SUMMARY_ROW_NAMES.has(name.toLowerCase())) continue;

      const value = parseFloat(row.Cells[1]?.Value || '0');
      if (!isNaN(value)) {
        accounts.set(name, { value, section: sectionTitle });
      }
    }
  }

  return accounts;
}

// Map Xero BS section titles to account_type for xero_balance_sheet_lines
function mapBSSectionToType(section: string): 'asset' | 'liability' | 'equity' | null {
  const t = section.trim().toLowerCase();
  // Xero uses plural "Assets"/"Liabilities"/"Equity"; also handle variants
  if (t.includes('asset')) return 'asset';
  if (t.includes('liabilit')) return 'liability';
  if (t.includes('equity') || t.includes("owner")) return 'equity';
  return null; // skip unknown/nested sections
}

// Fetch BS snapshot for a given month-end date
async function fetchSingleMonthBS(
  accessToken: string,
  tenantId: string,
  reportDate: string, // YYYY-MM-DD
): Promise<{ success: boolean; report?: any; error?: string; status?: number }> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${reportDate}&periods=1&timeframe=MONTH&standardLayout=true`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      'Accept': 'application/json',
    },
  });
  if (!response.ok) {
    const errText = await response.text();
    return { success: false, error: errText, status: response.status };
  }
  const data = await response.json();
  return { success: true, report: data?.Reports?.[0] };
}

// Parse BS report → Map<account_name, { value, section, account_type }>
// Skips Section headers, SummaryRow subtotals, and unmapped sections.
function parseSingleMonthBSReport(
  report: any,
): Map<string, { value: number; section: string; account_type: 'asset' | 'liability' | 'equity' }> {
  const accounts = new Map<string, { value: number; section: string; account_type: 'asset' | 'liability' | 'equity' }>();
  const rows = report?.Rows || [];
  for (const row of rows) {
    if (row.RowType !== 'Section' || !row.Rows) continue;
    const sectionTitle = (row.Title || '').trim();
    const mappedType = mapBSSectionToType(sectionTitle);
    if (!mappedType) continue;
    for (const inner of row.Rows) {
      if (inner.RowType !== 'Row' || !inner.Cells) continue; // skip SummaryRow subtotals
      const name = inner.Cells[0]?.Value;
      if (!name) continue;
      const raw = inner.Cells[1]?.Value ?? '';
      if (!raw.trim()) continue;
      const value = parseFloat(raw.replace(/,/g, ''));
      if (isNaN(value)) continue;
      accounts.set(name, { value, section: sectionTitle, account_type: mappedType });
    }
  }
  return accounts;
}

export async function POST(request: NextRequest) {
  // Stage tracker — included in error responses to aid debugging
  let stage = 'init';
  try {
    stage = 'auth';
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized', stage }, { status: 401 });
    }

    stage = 'parse_body';
    const body = await request.json();
    const { business_id } = body;
    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required', stage }, { status: 400 });
    }

    stage = 'resolve_business_ids';
    const ids = await resolveBusinessIds(supabaseAdmin, business_id);
    console.log(`[Sync Xero] Resolved IDs for ${business_id}:`, ids);

    stage = 'fetch_business';
    const { data: business, error: bizError } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', ids.bizId)
      .maybeSingle();

    if (bizError) {
      console.error('[Sync Xero] Business fetch error:', bizError);
      return NextResponse.json({ error: 'Business lookup failed', detail: bizError.message, stage }, { status: 500 });
    }
    if (!business) {
      return NextResponse.json({ error: 'Business not found', stage, resolved_ids: ids }, { status: 404 });
    }

    stage = 'authz';
    if (business.owner_id !== user.id && business.assigned_coach_id !== user.id) {
      return NextResponse.json({ error: 'Access denied', stage, user_id: user.id }, { status: 403 });
    }

    stage = 'fetch_connections';
    // Tenant-aware sync: pull ALL active Xero connections for this business,
    // sync each one separately, tag rows with tenant_id.
    const { data: connections, error: connError } = await supabaseAdmin
      .from('xero_connections')
      .select('*')
      .in('business_id', ids.all)
      .eq('is_active', true);

    if (connError) {
      console.error('[Sync Xero] Connection fetch error:', connError);
      return NextResponse.json({ error: 'Connection lookup failed', detail: connError.message, stage }, { status: 500 });
    }
    if (!connections || connections.length === 0) {
      return NextResponse.json({ error: 'No active Xero connection found', stage, searched_ids: ids.all }, { status: 404 });
    }

    console.log(`[Sync Xero] Found ${connections.length} active connection(s) for business ${business_id}`);

    const months = getMonthList(13);
    let totalAccountsSynced = 0;
    let totalMonthsFetched = 0;
    let totalMonthsFailed = 0;
    const perTenantErrors: { tenant_id: string; error: string }[] = [];
    const syncedTenantIds: string[] = [];

    // Per-connection sync loop
    for (const connection of connections) {
      const tenantId = connection.tenant_id;
      const tenantLabel = connection.display_name || connection.tenant_name || tenantId;
      console.log(`[Sync Xero] === Syncing tenant ${tenantLabel} (${tenantId}) ===`);

      stage = `refresh_token:${tenantId}`;
      const tokenResult = await getValidAccessToken(connection, supabaseAdmin);
      if (!tokenResult.success || !tokenResult.accessToken) {
        perTenantErrors.push({ tenant_id: tenantId, error: `Token: ${tokenResult.message || tokenResult.error}` });
        continue; // Skip this tenant, try the next
      }
      const accessToken = tokenResult.accessToken;

      stage = `fetch_chart_of_accounts:${tenantId}`;
      const accountCodeLookup = new Map<string, string>();
      try {
        const coaResp = await fetch(
          `https://api.xero.com/api.xro/2.0/Accounts?where=${encodeURIComponent('Type=="REVENUE"||Type=="OTHERINCOME"||Type=="DIRECTCOSTS"||Type=="EXPENSE"||Type=="OVERHEADS"')}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'xero-tenant-id': tenantId,
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
      } catch (coaErr) {
        console.warn(`[Sync Xero] ${tenantLabel}: could not fetch CoA (non-fatal):`, coaErr);
      }

      stage = `fetch_monthly_pl:${tenantId}`;
      const tenantAccounts = new Map<string, {
        business_id: string;
        tenant_id: string;
        account_name: string;
        account_code: string | null;
        account_type: string;
        section: string;
        monthly_values: Record<string, number>;
        updated_at: string;
      }>();
      let fetchedCount = 0;
      let failedCount = 0;

      for (const month of months) {
        if (fetchedCount > 0) await new Promise((r) => setTimeout(r, 500));

        const result = await fetchSingleMonthPL(accessToken, tenantId, month.fromDate, month.toDate);

        if (!result.success) {
          if (result.status === 401) {
            perTenantErrors.push({ tenant_id: tenantId, error: `Token expired mid-sync at ${month.key}` });
            break;
          }
          if (result.status === 429) {
            await new Promise((r) => setTimeout(r, 10000));
            const retry = await fetchSingleMonthPL(accessToken, tenantId, month.fromDate, month.toDate);
            if (!retry.success) {
              failedCount++;
              continue;
            }
            result.report = retry.report;
          } else {
            failedCount++;
            continue;
          }
        }
        if (!result.report) {
          failedCount++;
          continue;
        }

        const monthAccounts = parseSingleMonthReport(result.report);
        for (const [name, data] of monthAccounts) {
          const existing = tenantAccounts.get(name) || {
            business_id: ids.bizId,
            tenant_id: tenantId,
            account_name: name,
            account_code: accountCodeLookup.get(name) || null,
            account_type: mapSectionToType(data.section),
            section: data.section,
            monthly_values: {} as Record<string, number>,
            updated_at: new Date().toISOString(),
          };
          existing.monthly_values[month.key] = data.value;
          tenantAccounts.set(name, existing);
        }
        fetchedCount++;
      }

      console.log(`[Sync Xero] ${tenantLabel}: ${fetchedCount}/${months.length} months OK, ${failedCount} failed, ${tenantAccounts.size} accounts`);
      totalMonthsFetched += fetchedCount;
      totalMonthsFailed += failedCount;

      const tenantPlLines = Array.from(tenantAccounts.values()).filter(
        (l) => Object.keys(l.monthly_values).length > 0,
      );

      // Replace this tenant's P&L rows (scoped by tenant_id — does NOT touch other tenants)
      stage = `db_delete:${tenantId}`;
      const { error: deleteError } = await supabaseAdmin
        .from('xero_pl_lines')
        .delete()
        .in('business_id', ids.all)
        .eq('tenant_id', tenantId);
      if (deleteError) {
        perTenantErrors.push({ tenant_id: tenantId, error: `Delete failed: ${deleteError.message}` });
        continue;
      }

      if (tenantPlLines.length > 0) {
        stage = `db_insert:${tenantId}`;
        const { error: insertError } = await supabaseAdmin
          .from('xero_pl_lines')
          .insert(tenantPlLines);
        if (insertError) {
          perTenantErrors.push({ tenant_id: tenantId, error: `Insert failed: ${insertError.message}` });
          continue;
        }
      }

      // ── Balance Sheet snapshot sync (same tenant, 3 most-recent months) ──
      // Scoped to 3 months to stay within Vercel's 60s function budget when
      // 3 tenants × (13 P&L months + 3 BS months) × 500ms ≈ 24s. BS is a
      // point-in-time snapshot, so each month-end gets its own row set.
      stage = `fetch_monthly_bs:${tenantId}`;
      const bsMonths = months.slice(0, 3); // most-recent 3 months
      const tenantBSAccounts = new Map<string, {
        business_id: string;
        tenant_id: string;
        account_name: string;
        account_code: string | null;
        account_type: 'asset' | 'liability' | 'equity';
        section: string;
        monthly_values: Record<string, number>;
        updated_at: string;
      }>();

      for (const month of bsMonths) {
        // Pacing — stay under Xero's 60/min limit
        await new Promise((r) => setTimeout(r, 500));
        const bsResult = await fetchSingleMonthBS(accessToken, tenantId, month.toDate);
        if (!bsResult.success) {
          console.warn(`[Sync Xero BS] ${tenantLabel} ${month.key}: ${bsResult.status} ${bsResult.error?.slice(0, 150)}`);
          continue;
        }
        if (!bsResult.report) continue;

        const bsAccounts = parseSingleMonthBSReport(bsResult.report);
        for (const [name, data] of bsAccounts) {
          const existing = tenantBSAccounts.get(name) || {
            business_id: ids.bizId,
            tenant_id: tenantId,
            account_name: name,
            account_code: null,
            account_type: data.account_type,
            section: data.section,
            monthly_values: {} as Record<string, number>,
            updated_at: new Date().toISOString(),
          };
          existing.monthly_values[month.key] = data.value;
          tenantBSAccounts.set(name, existing);
        }
      }

      const tenantBSLines = Array.from(tenantBSAccounts.values()).filter(
        (l) => Object.keys(l.monthly_values).length > 0,
      );

      // Replace this tenant's BS rows (scoped)
      stage = `db_delete_bs:${tenantId}`;
      const { error: bsDeleteError } = await supabaseAdmin
        .from('xero_balance_sheet_lines')
        .delete()
        .in('business_id', ids.all)
        .eq('tenant_id', tenantId);
      if (bsDeleteError) {
        console.warn(`[Sync Xero BS] ${tenantLabel}: delete failed — ${bsDeleteError.message}`);
      } else if (tenantBSLines.length > 0) {
        stage = `db_insert_bs:${tenantId}`;
        const { error: bsInsertError } = await supabaseAdmin
          .from('xero_balance_sheet_lines')
          .insert(tenantBSLines);
        if (bsInsertError) {
          console.warn(`[Sync Xero BS] ${tenantLabel}: insert failed — ${bsInsertError.message}`);
        } else {
          console.log(`[Sync Xero BS] ${tenantLabel}: ${tenantBSLines.length} BS accounts (${bsMonths.length} months)`);
        }
      }

      await supabaseAdmin
        .from('xero_connections')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', connection.id);

      totalAccountsSynced += tenantPlLines.length;
      syncedTenantIds.push(tenantId);
    }

    console.log(`[Sync Xero] Done: ${totalAccountsSynced} accounts synced across ${syncedTenantIds.length}/${connections.length} tenants`);

    return NextResponse.json({
      success: true,
      tenants_synced: syncedTenantIds.length,
      tenants_total: connections.length,
      accounts_synced: totalAccountsSynced,
      months_fetched: totalMonthsFetched,
      months_failed: totalMonthsFailed,
      errors: perTenantErrors.length > 0 ? perTenantErrors : undefined,
    });

  } catch (error) {
    console.error(`[Sync Xero] Error at stage "${stage}":`, error);
    const errMsg = error instanceof Error ? error.message : 'Sync failed';
    const stack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json(
      {
        error: errMsg,
        stage,
        stack_preview: stack?.slice(0, 500),
      },
      { status: 500 }
    );
  }
}
