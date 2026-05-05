import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * POST /api/Xero/disconnect
 *
 * Hard-deletes all `xero_connections` rows for a given business under BOTH
 * ID forms — `businesses.id` AND `business_profiles.id`.
 *
 * Why this route exists (Phase 53-01):
 *   The previous browser-side delete in src/app/integrations/page.tsx did
 *   .eq('business_id', businessId) with a single ID. Because legacy connection
 *   rows can live keyed by `business_profiles.id` and newer rows by
 *   `businesses.id`, the FE delete only removed ONE row when both existed —
 *   leaving a stale row that the next sync attempt would still pick up. JDS
 *   surfaced this on 2026-05-05; see 53-RESEARCH.md §3 for the full forensic.
 *
 * Auth + RBAC mirror /api/Xero/reactivate (cookie-session getUser → 401;
 * owner / assigned coach / super_admin → 200; else 403).
 *
 * NOTE on business lookup vs reactivate (plan-check F2):
 *   This route's lookup is INTENTIONALLY more permissive than reactivate's.
 *   reactivate does a direct .eq('id', business_id).single() because the FE
 *   always sends the canonical businesses.id. Disconnect must accept EITHER
 *   form because the FE may pass either depending on which loader produced
 *   `businessId` (the integrations page resolves through resolveBusinessId(),
 *   which can yield either form). We therefore try businesses.id first, then
 *   fall back to business_profiles.id.
 *
 * NOTE on hard delete safety:
 *   The only FK referencing xero_connections.id is forecasts.xero_connection_id
 *   with ON DELETE SET NULL (baseline_schema.sql:8785). Other Xero data tables
 *   (xero_pl_lines, sync_jobs, etc.) key off business_id, NOT xero_connections.id,
 *   so historical sync data persists across reconnects — which is the desired
 *   behaviour: when the user reconnects, those rows remain useful as long as
 *   the new connection covers the same tenant.
 *
 * NOTE on service-role rationale:
 *   RLS would permit the DELETE for the owner/coach session (53-RESEARCH §3).
 *   Using the admin client is deliberate for: (a) a single auditable code path,
 *   (b) explicit row-count return that the FE can gate on, (c) immunity to any
 *   future RLS changes that might tighten DELETE on this table.
 *
 * NOTE on `pending_xero_connections` (plan-check F1):
 *   This route does NOT touch `pending_xero_connections`. Those rows are keyed
 *   by user_id (not business_id), are scoped to an in-flight OAuth dance, and
 *   self-expire after 10 minutes (baseline_schema.sql:3807-3823). Cleaning
 *   them here would interfere with concurrent reconnect attempts; leaving them
 *   alone is correct.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Cookie-session auth via the route-handler client.
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Body parse — tolerate missing/invalid JSON with an explicit 400.
    let parsed: any;
    try {
      parsed = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const business_id: string | undefined = parsed?.business_id;
    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    // 3. Dual-ID resolution. We need BOTH the canonical businesses.id and the
    //    matching business_profiles.id (when one exists) so the delete can
    //    cover both forms in a single .in() call. Do NOT short-circuit on the
    //    first hit — that's resolveXeroBusinessId's behaviour, which is wrong
    //    here.
    let canonicalBusinessId: string | null = null;
    let profileBusinessId: string | null = null;
    let business: { id: string; owner_id: string | null; assigned_coach_id: string | null } | null = null;

    // Try input as businesses.id first.
    const { data: bizDirect } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', business_id)
      .maybeSingle();

    if (bizDirect) {
      business = bizDirect;
      canonicalBusinessId = bizDirect.id;
      const { data: profile } = await supabaseAdmin
        .from('business_profiles')
        .select('id')
        .eq('business_id', bizDirect.id)
        .maybeSingle();
      profileBusinessId = profile?.id ?? null;
    } else {
      // Try input as business_profiles.id.
      const { data: profile } = await supabaseAdmin
        .from('business_profiles')
        .select('id, business_id')
        .eq('id', business_id)
        .maybeSingle();
      if (profile?.business_id) {
        profileBusinessId = profile.id;
        canonicalBusinessId = profile.business_id;
        const { data: bizFromProfile } = await supabaseAdmin
          .from('businesses')
          .select('id, owner_id, assigned_coach_id')
          .eq('id', profile.business_id)
          .maybeSingle();
        if (bizFromProfile) business = bizFromProfile;
      }
    }

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // 4. RBAC: owner OR assigned coach OR super_admin (mirrors reactivate exactly).
    let allowed = business.owner_id === user.id || business.assigned_coach_id === user.id;
    if (!allowed) {
      const { data: roleRow } = await supabase
        .from('system_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (roleRow?.role === 'super_admin') allowed = true;
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // 5. Build the dual-ID delete target list (drop nulls, drop dupes).
    const idsToDelete = Array.from(
      new Set([canonicalBusinessId, profileBusinessId].filter(Boolean) as string[])
    );

    // 6. Hard DELETE via service role. .select() returns the deleted rows so we
    //    can return an authoritative count to the FE.
    const { data: deletedRows, error: deleteError } = await supabaseAdmin
      .from('xero_connections')
      .delete()
      .in('business_id', idsToDelete)
      .select('id, business_id, tenant_id, is_active');

    if (deleteError) {
      console.error('[Xero Disconnect] Delete failed:', deleteError);
      return NextResponse.json(
        {
          success: false,
          error: 'delete_failed',
          message: deleteError.message,
        },
        { status: 500 }
      );
    }

    const deleted_count = deletedRows?.length ?? 0;

    if (deleted_count === 0) {
      // Soft failure: the row may have been pre-cleaned. The FE MUST NOT
      // optimistically flip to 'disconnected' on this — surface a clear message
      // so the operator knows the request was acknowledged but a no-op.
      return NextResponse.json({
        success: false,
        error: 'nothing_to_delete',
        message:
          'No Xero connections found for this business under either ID form. The connection may have already been removed.',
        deleted_count: 0,
        ids_checked: idsToDelete,
      });
    }

    console.log(
      '[Xero Disconnect] Deleted',
      deleted_count,
      'rows for business',
      business_id,
      'across IDs',
      idsToDelete
    );

    return NextResponse.json({
      success: true,
      deleted_count,
      deleted_ids: idsToDelete,
      deleted_rows: (deletedRows ?? []).map((r: any) => ({
        id: r.id,
        business_id: r.business_id,
        tenant_id: r.tenant_id,
        was_active: r.is_active,
      })),
    });
  } catch (error) {
    console.error('[Xero Disconnect] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
