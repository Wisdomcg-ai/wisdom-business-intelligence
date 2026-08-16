// /api/monthly-report/sync-xero/route.ts
// Manual sync for a single business — delegates P&L to the Path A orchestrator
// (Phase 44.2-06B) and runs the existing BS snapshot loop in-place. The route's
// own per-tenant P&L fetcher was retired because (a) it wrote wide-format
// `monthly_values` JSONB into a long-format table, and (b) it set
// `xero_pl_lines.business_id = bizId` which violates the FK to
// business_profiles(id) added in 06A. Both bugs would cause every "Sync"
// click on the integration page to wipe and fail to re-insert P&L rows.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds';
import { syncBusinessXeroPL } from '@/lib/xero/sync-orchestrator';
import { syncBusinessBSMirror } from '@/lib/xero/bs-mirror-sync';
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

// VALID-05a (observe mode): POST triggers a Xero sync for a business.
const SyncXeroPostSchema = z.object({
  business_id: z.string(),
})

export const dynamic = 'force-dynamic';
// Path A orchestrator can take >60s for multi-tenant + 24-month windows.
export const maxDuration = 300;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
);

// Fetch BS snapshot for a given month-end date
async function postHandler(request: Request) {
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

    // BS sync via the shared mirror-sync module (one definition — the daily
    // cron /api/cron/sync-bs-mirror runs the SAME function, so a manual "Sync"
    // click and the scheduled refresh cannot drift).
    stage = 'sync_bs_mirror';
    const bsResult = await syncBusinessBSMirror(supabaseAdmin, ids.businessId, connections);
    perTenantErrors.push(...bsResult.perTenantErrors);
    syncedTenantIds.push(...bsResult.syncedTenantIds);
    // A missed month is dropped from the stored grid by the delete+insert swap,
    // so the response must not claim a clean sync. months_failed was declared
    // and returned but never incremented before this.
    totalMonthsFailed += bsResult.missedMonths.length;
    for (const m of bsResult.missedMonths) {
      perTenantErrors.push({
        tenant_id: m.tenant_id,
        error: `month ${m.month} missing from stored balance sheet (${m.reason})`,
      });
    }

    // Stamp the DATA freshness clock here, where it is earned: this request ran
    // BOTH the P&L orchestrator and the BS mirror. The shared BS module must not
    // stamp it — the daily BS-only cron calls the same function, and a BS-only
    // refresh marking a connection "fresh" would mask broken P&L syncs from
    // connection-health and the daily health report.
    stage = 'stamp_last_synced';
    for (const connection of connections) {
      if (!bsResult.syncedTenantIds.includes(connection.tenant_id)) continue;
      await supabaseAdmin
        .from('xero_connections')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', connection.id);
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
    Sentry.captureException(error, { tags: { route: 'monthly-report/sync-xero' }, extra: { context: `[Sync Xero] Error at stage "${stage}"` } } as any);
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

export const POST = withSchema('monthly-report/sync-xero', SyncXeroPostSchema, postHandler)
