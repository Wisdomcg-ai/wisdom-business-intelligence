// /api/monthly-report/sync-xero/route.ts
// Manual sync for a single business — delegates P&L to the Path A orchestrator
// (Phase 44.2-06B) and runs the existing BS snapshot loop in-place. The route's
// own per-tenant P&L fetcher was retired because (a) it wrote wide-format
// `monthly_values` JSONB into a long-format table, and (b) it set
// `xero_pl_lines.business_id = bizId` which violates the FK to
// business_profiles(id) added in 06A. Both bugs would cause every "Sync"
// click on the integration page to wipe and fail to re-insert P&L rows.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/xero/token-manager';
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds';
import { syncBusinessXeroPL } from '@/lib/xero/sync-orchestrator';
import { replaceTenantBSRows } from './bs-writer';
import { parseSingleMonthBSReport } from './report-parsers';
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic';
// Path A orchestrator can take >60s for multi-tenant + 24-month windows.
export const maxDuration = 300;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
);

// Map Xero section titles to account types
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
    const ids = await resolveBusinessProfileIds(supabaseAdmin, business_id);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Sync Xero] Resolved IDs for ${business_id}:`, ids);
    }

    stage = 'fetch_business';
    const { data: business, error: bizError } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', ids.businessId)
      .maybeSingle();

    if (bizError) {
      Sentry.captureException(bizError, { tags: { route: 'monthly-report/sync-xero' }, extra: { context: "[Sync Xero] Business fetch error" } } as any);
      return NextResponse.json({ error: 'Business lookup failed', detail: bizError.message, stage }, { status: 500 });
    }
    if (!business) {
      return NextResponse.json({ error: 'Business not found', stage, resolved_ids: ids }, { status: 404 });
    }

    stage = 'authz';
    if (business.owner_id !== user.id && business.assigned_coach_id !== user.id) {
      // Super-admin bypass — super_admins aren't the assigned coach but must
      // be able to trigger syncs for any business (support, ops, audits).
      // RPC is on the auth-bound client (not supabaseAdmin) so auth.uid()
      // resolves to the calling user inside the SECURITY DEFINER function.
      const { data: isSuper } = await supabase.rpc('auth_is_super_admin');
      if (!isSuper) {
        return NextResponse.json({ error: 'Access denied', stage, user_id: user.id }, { status: 403 });
      }
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
      Sentry.captureException(connError, { tags: { route: 'monthly-report/sync-xero' }, extra: { context: "[Sync Xero] Connection fetch error" } } as any);
      return NextResponse.json({ error: 'Connection lookup failed', detail: connError.message, stage }, { status: 500 });
    }
    if (!connections || connections.length === 0) {
      return NextResponse.json({ error: 'No active Xero connection found', stage, searched_ids: ids.all }, { status: 404 });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Sync Xero] Found ${connections.length} active connection(s) for business ${business_id}`);
    }

    // ── P&L sync via Path A orchestrator (Phase 44.2-06B) ──
    // Replaces this route's prior per-tenant fetcher. The orchestrator handles
    // multi-tenant iteration, /Organisation timezone, /Accounts catalog,
    // per-month single-period fetches, FY-total reconciliation, and upsert
    // into xero_pl_lines (with correct business_id = profileId per 06A FK).
    stage = 'sync_pl_via_orchestrator';
    const plResult = await syncBusinessXeroPL(business_id);
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[Sync Xero] P&L orchestrator: status=${plResult.status} rows_inserted=${plResult.rows_inserted} xero_requests=${plResult.xero_request_count}`
      );
    }

    const totalAccountsSynced = plResult.rows_inserted;
    let totalMonthsFetched = plResult.coverage?.months_covered ?? 0;
    let totalMonthsFailed = 0;
    const perTenantErrors: { tenant_id: string; error: string }[] = [];
    const syncedTenantIds: string[] = [];
    if (plResult.status === 'error' && plResult.error) {
      perTenantErrors.push({ tenant_id: 'all', error: `P&L orchestrator: ${plResult.error}` });
    }

    // Per-connection BS sync loop (P&L was handled above by the orchestrator).
    for (const connection of connections) {
      const tenantId = connection.tenant_id;
      const tenantLabel = connection.display_name || connection.tenant_name || tenantId;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Sync Xero] === BS sync for tenant ${tenantLabel} (${tenantId}) ===`);
      }

      stage = `refresh_token:${tenantId}`;
      const tokenResult = await getValidAccessToken(connection, supabaseAdmin);
      if (!tokenResult.success || !tokenResult.accessToken) {
        perTenantErrors.push({ tenant_id: tenantId, error: `Token: ${tokenResult.message || tokenResult.error}` });
        continue; // Skip this tenant, try the next
      }
      const accessToken = tokenResult.accessToken;

      // ── Balance Sheet snapshot sync (3 most-recent month-ends) ──
      // P&L was handled above by syncBusinessXeroPL. BS still uses this route's
      // own per-tenant fetcher until Phase 44.2-06D ports BS to the orchestrator.
      stage = `fetch_monthly_bs:${tenantId}`;
      const bsMonths = getMonthList(13).slice(0, 3); // most-recent 3 month-ends
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
          Sentry.captureMessage(`[Sync Xero BS] ${tenantLabel} ${month.key}: ${bsResult.status} ${bsResult.error?.slice(0, 150)}`, 'warning' as any);
          continue;
        }
        if (!bsResult.report) continue;

        const bsAccounts = parseSingleMonthBSReport(bsResult.report);
        for (const [name, data] of bsAccounts) {
          const existing = tenantBSAccounts.get(name) || {
            business_id: ids.businessId,
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

      // Replace this tenant's BS rows atomically-enough (R25 / DM-N5).
      // delete + insert are scoped to the same id-space (ids.businessId — the table
      // FK is businesses(id)); an empty fetch never wipes good rows; and a
      // failed insert restores the prior rows + surfaces as a tenant error
      // instead of silently returning success with an empty balance sheet.
      stage = `db_swap_bs:${tenantId}`;
      const bsSwap = await replaceTenantBSRows(supabaseAdmin, {
        businessId: ids.businessId,
        tenantId,
        tenantLabel,
        newRows: tenantBSLines,
      });
      if (bsSwap.status === 'delete_failed' || bsSwap.status === 'insert_failed') {
        perTenantErrors.push({
          tenant_id: tenantId,
          error: `BS sync failed (${bsSwap.status}${bsSwap.status === 'insert_failed' ? `, restored=${bsSwap.restored ?? false}` : ''}): ${bsSwap.error ?? 'unknown'}`,
        });
      } else if (bsSwap.status === 'written' && process.env.NODE_ENV !== 'production') {
        console.log(`[Sync Xero BS] ${tenantLabel}: ${bsSwap.written} BS accounts (${bsMonths.length} months)`);
      }

      await supabaseAdmin
        .from('xero_connections')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', connection.id);

      syncedTenantIds.push(tenantId);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Sync Xero] Done: ${totalAccountsSynced} accounts synced across ${syncedTenantIds.length}/${connections.length} tenants`);
    }

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
    Sentry.captureException(error, { tags: { route: 'monthly-report/sync-xero' }, extra: { context: "[Sync Xero] Error at stage \"${stage}\"" } } as any);
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
