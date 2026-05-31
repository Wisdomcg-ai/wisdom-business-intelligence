import { NextRequest, NextResponse } from 'next/server';
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
import { resolveXeroBusinessId } from '@/lib/business/resolveXeroBusinessId';
import { getValidAccessToken } from '@/lib/xero/token-manager';
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
);

/**
 * POST /api/Xero/reactivate
 *
 * Attempts to re-activate an inactive Xero connection by delegating the
 * refresh-token grant to the centralized token-manager. On success, flips
 * `is_active=true`. On terminal failure (invalid_grant / access_denied),
 * the token-manager has already deactivated and we surface a 401 to the FE.
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
 * of being lumped into a generic 500. FE callers (`integrations/page.tsx` and
 * `ForecastWizardV4.tsx:1430`) do NOT branch on `status === 500` for the
 * reactivate path, so this change is transparent to existing UX.
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

    // Resolve business_id to the correct format for xero_connections FK
    const { connectionBusinessId } = await resolveXeroBusinessId(supabaseAdmin, business_id);

    // Get ANY connection for this business (including inactive ones)
    const { data: connection, error: connError } = await supabaseAdmin
      .from('xero_connections')
      .select('*')
      .eq('business_id', connectionBusinessId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      return NextResponse.json({
        success: false,
        error: 'no_connection',
        message: 'No Xero connection found. Please connect Xero from the Integrations page.'
      }, { status: 404 });
    }

    // If already active, just return success
    if (connection.is_active) {
      return NextResponse.json({
        success: true,
        message: 'Connection is already active',
        was_inactive: false
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Xero Reactivate] Attempting to reactivate connection:', connection.id);
    }

    // 53-02: delegate refresh to centralized token-manager.
    // - Pass { id } so getValidAccessToken re-fetches the row internally
    //   (avoids stale-in-memory rotation race per 53-03 Hole A).
    // - token-manager runs the lock + retry + careful deactivation policy.
    //   On terminal failure it has already flipped is_active=false; we just
    //   map its error category to the FE-facing response shape.
    // - We do NOT decrypt connection.refresh_token here — token-manager owns
    //   decryption. The encryption module is no longer imported in this file.
    const tokenResult = await getValidAccessToken({ id: connection.id }, supabaseAdmin);

    if (!tokenResult.success) {
      // Terminal: refresh_token expired (60-day idle / rotated past grace).
      if (tokenResult.error === 'token_expired_permanently') {
        return NextResponse.json({
          success: false,
          error: 'token_expired',
          message: 'Refresh token has expired. Please reconnect Xero from the Integrations page.'
        }, { status: 401 });
      }
      // Terminal: user revoked in Xero, or unauthorized_client after MAX_RETRIES.
      // 53-03's categorizeError maps both `access_denied` and exhausted
      // `unauthorized_client` to the `token_revoked` category. Both require
      // user reconnection.
      if (tokenResult.error === 'token_revoked') {
        return NextResponse.json({
          success: false,
          error: 'token_expired',
          message: 'Access has been revoked. Please reconnect Xero from the Integrations page.'
        }, { status: 401 });
      }
      // Transient — token-manager already retried internally. Surface as 500
      // with the underlying message so ops can correlate. (database_error,
      // network_error, server_error, rate_limited, unknown all land here.)
      return NextResponse.json({
        success: false,
        error: 'refresh_failed',
        message: tokenResult.message ?? 'Token refresh failed'
      }, { status: 500 });
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
      .eq('id', connection.id);

    if (updateError) {
      Sentry.captureException(updateError, { tags: { route: 'Xero/reactivate' }, extra: { context: "[Xero Reactivate] Failed to flip is_active" } } as any);
      return NextResponse.json({
        success: false,
        error: 'save_failed',
        message: 'Token refreshed but failed to flip is_active=true'
      }, { status: 500 });
    }

    // Re-read the row so the FE gets the freshly-saved expires_at for
    // "expires in N minutes" display.
    const { data: refreshedRow } = await supabaseAdmin
      .from('xero_connections')
      .select('id, tenant_name, expires_at')
      .eq('id', connection.id)
      .single();

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Xero Reactivate] Connection reactivated successfully:', connection.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Xero connection has been reactivated',
      was_inactive: true,
      connection: {
        id: connection.id,
        tenant_name: connection.tenant_name,
        expires_at: refreshedRow?.expires_at ?? connection.expires_at
      }
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
