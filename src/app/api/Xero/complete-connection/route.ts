import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSchema } from '@/lib/api/with-schema';

// VALID-04 (observe mode): POST completes a pending Xero connection (1+ tenants).
const CompleteConnectionPostSchema = z
  .object({
    pending_id: z.string(),
    tenant_id: z.string().optional(),
    tenant_ids: z.array(z.string()).optional(),
  })
  .passthrough();
import { createClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/utils/encryption';
import { resolveXeroBusinessId } from '@/lib/business/resolveXeroBusinessId';
import * as Sentry from '@sentry/nextjs'
import { grantedScopesColumns, resolveGrantedScopes } from '@/lib/xero/granted-scopes';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
);

const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function postHandler(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { pending_id, tenant_id, tenant_ids } = await request.json();

    // Accept either a single tenant_id (legacy) or an array tenant_ids.
    // Phase 34 multi-tenant flow: the select-org page sends `tenant_ids` so
    // users can connect multiple Xero orgs to one business in a single step.
    const selectedTenantIds: string[] = Array.isArray(tenant_ids)
      ? tenant_ids
      : tenant_id
        ? [tenant_id]
        : [];

    if (!pending_id || selectedTenantIds.length === 0) {
      return NextResponse.json(
        { error: 'pending_id and at least one tenant id are required' },
        { status: 400 }
      );
    }

    // Fetch the pending connection
    const { data: pending, error: pendingError } = await supabaseAdmin
      .from('pending_xero_connections')
      .select('*')
      .eq('id', pending_id)
      .maybeSingle();

    if (pendingError || !pending) {
      return NextResponse.json(
        { error: 'Pending connection not found or expired. Please try connecting again.' },
        { status: 404 }
      );
    }

    // Check TTL
    const age = Date.now() - new Date(pending.created_at).getTime();
    if (age > PENDING_TTL_MS) {
      await supabaseAdmin.from('pending_xero_connections').delete().eq('id', pending_id);
      return NextResponse.json(
        { error: 'Connection session expired. Please try connecting again.' },
        { status: 410 }
      );
    }

    // Verify user has access to this business
    // pending.business_id may be business_profiles.id, so check both tables
    let hasAccess = false;
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', pending.business_id)
      .maybeSingle();

    if (business && (business.owner_id === user.id || business.assigned_coach_id === user.id)) {
      hasAccess = true;
    }

    if (!hasAccess) {
      const { data: profile } = await supabaseAdmin
        .from('business_profiles')
        .select('business_id')
        .eq('id', pending.business_id)
        .maybeSingle();
      if (profile?.business_id) {
        const { data: biz } = await supabaseAdmin
          .from('businesses')
          .select('id, owner_id, assigned_coach_id')
          .eq('id', profile.business_id)
          .maybeSingle();
        if (biz && (biz.owner_id === user.id || biz.assigned_coach_id === user.id)) {
          hasAccess = true;
        }
      }
    }

    // Super-admin fallback (platform operator connecting on behalf of clients)
    if (!hasAccess) {
      const { data: roleRow } = await supabaseAdmin
        .from('system_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (roleRow?.role === 'super_admin') hasAccess = true;
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify every selected tenant is in the authorised list
    const tenants = pending.tenants as { tenantId: string; tenantName: string }[];
    const selectedTenants = selectedTenantIds
      .map((tid) => tenants.find((t) => t.tenantId === tid))
      .filter((t): t is { tenantId: string; tenantName: string } => !!t);
    if (selectedTenants.length !== selectedTenantIds.length) {
      return NextResponse.json(
        { error: 'One or more selected organisations are not in the authorised list' },
        { status: 400 }
      );
    }

    // Decrypt tokens from pending record (shared across all selected tenants —
    // Xero's OAuth grant covers all authorised orgs)
    const accessToken = decrypt(pending.encrypted_access_token);
    const refreshToken = decrypt(pending.encrypted_refresh_token);
    // The pending row holds no token-response `scope`; the access token's JWT
    // claim is the same fact. Shared across every selected tenant (one grant).
    const scopeColumns = grantedScopesColumns(resolveGrantedScopes({ accessToken }));

    // Phase 34 pivot: upsert every selected tenant as its own xero_connections
    // row. (business_id, tenant_id) is unique, so reconnecting the same tenant
    // refreshes tokens in place; a new tenant adds a new row.
    let bizId = pending.business_id;
    const { data: profile } = await supabaseAdmin
      .from('business_profiles')
      .select('id, business_id')
      .or(`id.eq.${bizId},business_id.eq.${bizId}`)
      .maybeSingle();
    if (profile?.business_id) {
      bizId = profile.business_id;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Xero Complete] Using canonical business_id:', bizId, 'tenants:', selectedTenants.length);
    }

    const rowsToUpsert = selectedTenants.map((t) => ({
      business_id: bizId,
      user_id: pending.user_id,
      tenant_id: t.tenantId,
      tenant_name: t.tenantName,
      display_name: t.tenantName,
      access_token: encrypt(accessToken),
      refresh_token: encrypt(refreshToken),
      expires_at: pending.token_expires_at,
      is_active: true,
      ...scopeColumns,
    }));

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('xero_connections')
      .upsert(rowsToUpsert, { onConflict: 'business_id,tenant_id' })
      .select();

    if (insertError) {
      Sentry.captureException(insertError, { tags: { route: 'Xero/complete-connection' }, extra: { context: 'Upsert failed', bizId } } as any);
      return NextResponse.json(
        { error: 'Failed to save connection(s)', detail: insertError.message },
        { status: 500 }
      );
    }

    // Delete the pending record
    await supabaseAdmin.from('pending_xero_connections').delete().eq('id', pending_id);

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[Xero Complete] Saved',
        inserted?.length ?? 0,
        'connection(s):',
        selectedTenants.map((t) => t.tenantName).join(', '),
      );
    }

    // No sync runs here, and nothing here writes last_synced_at — the data clock
    // every connection-health surface classifies, which only a real per-tenant
    // sync success moves (sync-orchestrator.ts). This route used to fire an
    // "initial sync" per org after responding: a BankSummary URL Xero does not
    // have, a financial_metrics upsert that errored on a second same-day call,
    // then last_synced_at = now on EVERY connection of the business, whatever
    // Xero answered. Connecting one org made its siblings — including one Xero
    // refuses — read current for 48h, and new orgs skipped pending_first_sync.
    //
    // Nor does it start a real one: every org here holds the SAME refresh token,
    // so their syncs must never refresh in parallel; work left running after the
    // response is not reliable on Vercel; and a sync here would hold the
    // business's single-flight lock against the one the landing page runs on
    // ?syncing=true. That page, a Sync press or the next 6-hourly cron (stalest
    // connections first) does the first real sync.
    return NextResponse.json({
      success: true,
      tenant_count: selectedTenants.length,
      tenant_names: selectedTenants.map((t) => t.tenantName),
      redirect_to: `${pending.return_to || '/integrations'}?success=connected&syncing=true`,
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'Xero/complete-connection' }, extra: { context: "[Xero Complete] Error" } } as any);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withSchema('Xero/complete-connection', CompleteConnectionPostSchema, postHandler);
