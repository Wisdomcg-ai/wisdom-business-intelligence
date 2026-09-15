import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSchema } from '@/lib/api/with-schema';

// VALID-04 (observe mode): POST reactivates a Xero connection for a business.
const ReactivatePostSchema = z
  .object({
    business_id: z.string(),
  })
  .passthrough();
import { createClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds';
import { getValidAccessToken } from '@/lib/xero/token-manager';
import { groupConnectionsByOrg, isRetiredOrg } from '@/lib/xero/connection-status';
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
);

interface ConnectionRow {
  id: string;
  business_id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  is_active: boolean | null;
  include_in_consolidation: boolean | null;
  expires_at: string | null;
  updated_at: string | null;
  created_at: string | null;
}

type OrgResult =
  | 'already_active'
  | 'retired'
  | 'reactivated'
  | 'token_expired'
  | 'refresh_failed'
  | 'save_failed';

interface OrgOutcome {
  connection_id: string;
  tenant_name: string | null;
  result: OrgResult;
  message?: string;
}

const time = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

/**
 * The row to revive for an org with no live row: the one Xero last granted a
 * token to (latest expires_at) carries the most recently rotated refresh token,
 * so it is the one most likely to still be accepted. Ties settle on updated_at,
 * then id, so the pick never depends on row order.
 */
function rowToRevive(orgRows: ConnectionRow[]): ConnectionRow {
  return [...orgRows].sort(
    (a, b) =>
      time(b.expires_at) - time(a.expires_at) ||
      time(b.updated_at) - time(a.updated_at) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )[0];
}

/**
 * POST /api/Xero/reactivate
 *
 * Attempts to re-activate a business's inactive Xero connections by delegating
 * the refresh-token grant to the centralized token-manager. On success, flips
 * `is_active=true`. On terminal failure (invalid_grant / access_denied), the
 * token-manager has already deactivated and we surface a 401 to the FE.
 *
 * Phase 53-02 refactor: this route used to inline its own
 * fetch(identity.xero.com) + decrypt + encrypt + save block. That bypassed
 * the lock + retry + race-aware deactivation policy in token-manager. Now
 * we delegate the entire token surface to getValidAccessToken.
 *
 * Behavioral note (53-02 PLAN-CHECK F1): on HEAD, any non-`invalid_grant`
 * failure (including `access_denied`) returned HTTP 500 / `error: 'refresh_failed'`.
 * Post-refactor, both `token_expired_permanently` (invalid_grant) AND
 * `token_revoked` (access_denied / unauthorized_client × MAX_RETRIES) return
 * HTTP 401 / `error: 'token_expired'`. This is a small behavioral improvement —
 * terminal "user must reconnect" failures now correctly signal re-auth instead
 * of being lumped into a generic 500. FE callers (`ForecastWizardV4.tsx`) do NOT
 * branch on `status === 500` for the reactivate path, so this change is
 * transparent to existing UX.
 *
 * Every org (2026-09-15): the route used to revive ONE row — the most recently
 * updated for one id form (`order updated_at desc limit 1`). Every token refresh
 * and sync bumps updated_at, so for a multi-org business it revived whichever org
 * was written last, and when that row happened to be live it answered "already
 * active" while a sibling org stayed switched off. Now every org of the business
 * (both id forms, grouped by Xero tenant) that has NO live row is revived:
 *   - a dead row whose org already has a live row was superseded by a reconnect,
 *     and reviving it would give that org two live rows — it is left alone;
 *   - an org retired on purpose (every row switched off AND excluded from
 *     consolidation) is not switched back on, unless every org is retired — the
 *     same rule `classifyBusinessConnections` uses to leave it out of the status.
 * `orgs` reports each org's outcome. `success` means every org that needed it
 * was revived; if any was not, the status is the worst failure's (401 when Xero
 * refused a token, else 500) and `was_inactive` says whether any org was revived.
 * A failed read of xero_connections is a 500 — it used to be a 404 telling the
 * user to connect Xero.
 */
async function postHandler(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { business_id } = await request.json();

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    // Verify user has access to this business
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', business_id)
      .single();

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Allow owner, assigned coach, OR super_admin (platform operator).
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

    // Every connection row of the business under both id forms, inactive ones
    // included, in an order no write changes.
    const ids = await resolveBusinessProfileIds(supabaseAdmin, business_id);
    const { data, error: connError } = await supabaseAdmin
      .from('xero_connections')
      .select('id, business_id, tenant_id, tenant_name, is_active, include_in_consolidation, expires_at, updated_at, created_at')
      .in('business_id', ids.all)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true });

    if (connError) {
      Sentry.captureException(connError, { tags: { route: 'Xero/reactivate' }, extra: { context: '[Xero Reactivate] xero_connections read failed' } } as any);
      return NextResponse.json({
        success: false,
        error: 'internal_error',
        message: 'Could not read the Xero connections for this business'
      }, { status: 500 });
    }

    const rows = (data ?? []) as ConnectionRow[];
    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'no_connection',
        message: 'No Xero connection found. Please connect Xero from the Integrations page.'
      }, { status: 404 });
    }

    const orgs = groupConnectionsByOrg(rows);
    const everyOrgRetired = orgs.every(isRetiredOrg);
    const multiOrg = orgs.length > 1;
    const named = (outcome: OrgOutcome, message: string) =>
      multiOrg && outcome.tenant_name ? `${outcome.tenant_name}: ${message}` : message;

    const outcomes: OrgOutcome[] = [];
    for (const orgRows of orgs) {
      const live = orgRows.find((r) => r.is_active === true);
      if (live) {
        outcomes.push({ connection_id: live.id, tenant_name: live.tenant_name, result: 'already_active' });
        continue;
      }
      const row = rowToRevive(orgRows);
      const base = { connection_id: row.id, tenant_name: row.tenant_name };
      if (!everyOrgRetired && isRetiredOrg(orgRows)) {
        outcomes.push({ ...base, result: 'retired' });
        continue;
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Xero Reactivate] Attempting to reactivate connection:', row.id);
      }

      // 53-02: delegate refresh to centralized token-manager.
      // - Pass { id } so getValidAccessToken re-fetches the row internally
      //   (avoids stale-in-memory rotation race per 53-03 Hole A).
      // - token-manager runs the lock + retry + careful deactivation policy.
      //   On terminal failure it has already flipped is_active=false; we just
      //   map its error category to the FE-facing response shape.
      // - We do NOT decrypt the refresh_token here — token-manager owns
      //   decryption. The encryption module is no longer imported in this file.
      const tokenResult = await getValidAccessToken({ id: row.id }, supabaseAdmin);

      if (!tokenResult.success) {
        // Terminal: refresh_token expired (60-day idle / rotated past grace), or
        // the user revoked in Xero / unauthorized_client after MAX_RETRIES —
        // 53-03's categorizeError maps both of the latter to `token_revoked`.
        // All of them require the user to reconnect.
        if (tokenResult.error === 'token_expired_permanently') {
          outcomes.push({ ...base, result: 'token_expired', message: 'Refresh token has expired. Please reconnect Xero from the Integrations page.' });
        } else if (tokenResult.error === 'token_revoked') {
          outcomes.push({ ...base, result: 'token_expired', message: 'Access has been revoked. Please reconnect Xero from the Integrations page.' });
        } else {
          // Transient — token-manager already retried internally. (database_error,
          // network_error, server_error, rate_limited, unknown all land here.)
          outcomes.push({ ...base, result: 'refresh_failed', message: tokenResult.message ?? 'Token refresh failed' });
        }
        continue;
      }

      // 53-02: refresh succeeded. token-manager already saved the fresh
      // access_token / refresh_token / expires_at. We only need to flip the
      // activation flag. Single targeted UPDATE — do NOT re-write tokens here.
      const { error: updateError } = await supabaseAdmin
        .from('xero_connections')
        .update({
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id);

      if (updateError) {
        Sentry.captureException(updateError, {
          tags: { route: 'Xero/reactivate', invariant: 'xero_reactivate_flip_failed', connection_id: row.id },
          extra: { context: '[Xero Reactivate] Failed to flip is_active' },
        } as any);
        outcomes.push({ ...base, result: 'save_failed', message: 'Token refreshed but failed to flip is_active=true' });
        continue;
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Xero Reactivate] Connection reactivated successfully:', row.id);
      }
      outcomes.push({ ...base, result: 'reactivated' });
    }

    const reactivated = outcomes.filter((o) => o.result === 'reactivated');
    const failed = outcomes.filter(
      (o) => o.result === 'token_expired' || o.result === 'refresh_failed' || o.result === 'save_failed',
    );

    // If already active, just return success
    if (reactivated.length === 0 && failed.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Connection is already active',
        was_inactive: false,
        orgs: outcomes
      });
    }

    if (failed.length > 0) {
      const worst =
        failed.find((o) => o.result === 'token_expired') ??
        failed.find((o) => o.result === 'save_failed') ??
        failed[0];
      const error = worst.result === 'refresh_failed' ? 'refresh_failed' : worst.result;
      return NextResponse.json({
        success: false,
        error,
        message: named(worst, worst.message ?? 'Token refresh failed'),
        was_inactive: reactivated.length > 0,
        orgs: outcomes
      }, { status: worst.result === 'token_expired' ? 401 : 500 });
    }

    // Re-read the revived rows so the FE gets the freshly-saved expires_at for
    // "expires in N minutes" display.
    const { data: refreshedRows } = await supabaseAdmin
      .from('xero_connections')
      .select('id, tenant_name, expires_at')
      .in('id', reactivated.map((o) => o.connection_id));
    const refreshedExpiry = new Map(
      ((refreshedRows ?? []) as { id: string; expires_at: string | null }[]).map((r) => [r.id, r.expires_at]),
    );
    const first = reactivated[0];

    return NextResponse.json({
      success: true,
      message:
        reactivated.length === 1
          ? 'Xero connection has been reactivated'
          : `${reactivated.length} Xero organisations have been reactivated`,
      was_inactive: true,
      connection: {
        id: first.connection_id,
        tenant_name: first.tenant_name,
        expires_at: refreshedExpiry.get(first.connection_id) ?? rows.find((r) => r.id === first.connection_id)?.expires_at ?? null
      },
      orgs: outcomes
    });

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'Xero/reactivate' }, extra: { context: "[Xero Reactivate] Error" } } as any);
    return NextResponse.json({
      success: false,
      error: 'internal_error',
      message: 'Failed to reactivate connection'
    }, { status: 500 });
  }
}

export const POST = withSchema('Xero/reactivate', ReactivatePostSchema, postHandler);
