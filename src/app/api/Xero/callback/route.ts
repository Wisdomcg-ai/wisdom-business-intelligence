// /app/api/xero/callback/route.ts
// This handles the return from Xero after user authorizes

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { encrypt, verifySignedOAuthState } from '@/lib/utils/encryption';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { safeReturnPath, withReturnParams } from '@/lib/utils/safe-return-path';
import { resolveXeroBusinessId } from '@/lib/business/resolveXeroBusinessId';
import { getXeroOrgTimezone } from '@/lib/xero/organisation';
import { getAppBaseUrl } from '@/lib/config/brand'
import { withQuerySchema } from '@/lib/api/with-schema'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { grantedScopesColumns, resolveGrantedScopes } from '@/lib/xero/granted-scopes';

export const dynamic = 'force-dynamic'

const GetQuerySchema = z
  .object({
    code: z.string().optional(),
    state: z.string().optional(),
  })
  .passthrough()

// Initialize Supabase with service key for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
);

// Get environment variables
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID!;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET!;
const APP_URL = getAppBaseUrl();
const REDIRECT_URI = `${APP_URL}/api/Xero/callback`;

// Xero token URL
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';

/**
 * Save a Xero connection to the database.
 * Shared by single-tenant auto-connect and multi-tenant selection confirm.
 */
async function saveXeroConnection(
  params: {
    businessId: string;
    userId: string;
    tenant: { tenantId: string; tenantName: string };
    tokens: { access_token: string; refresh_token: string };
    expiresAt: Date;
    /** Scopes this token carries (granted-scopes.ts). Null = unknown, leave column as is. */
    grantedScopes: string[] | null;
  }
): Promise<{ success: boolean; error?: string; connectionId?: string }> {
  const { businessId, userId, tenant, tokens, expiresAt, grantedScopes } = params;

  // Phase 34 pivot: upsert by (business_id, tenant_id) so reconnecting the same
  // Xero org refreshes its tokens in place, and connecting a DIFFERENT Xero org
  // to the same business adds a new row (does NOT wipe other tenants).
  //
  // Resolve the dual-ID form in case the caller passed business_profiles.id.
  let canonicalBusinessId = businessId;
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('id, business_id')
    .or(`id.eq.${businessId},business_id.eq.${businessId}`)
    .maybeSingle();
  if (profile?.business_id) {
    canonicalBusinessId = profile.business_id;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Xero] Upserting connection for business:', canonicalBusinessId, 'tenant:', tenant.tenantId);
  }
  const { data: insertedData, error: upsertError } = await supabase
    .from('xero_connections')
    .upsert(
      {
        business_id: canonicalBusinessId,
        user_id: userId,
        tenant_id: tenant.tenantId,
        tenant_name: tenant.tenantName,
        display_name: tenant.tenantName, // default; user can rename later
        access_token: encrypt(tokens.access_token),
        refresh_token: encrypt(tokens.refresh_token),
        expires_at: expiresAt.toISOString(),
        is_active: true,
        ...grantedScopesColumns(grantedScopes),
      },
      { onConflict: 'business_id,tenant_id' },
    )
    .select();

  if (upsertError || !insertedData || insertedData.length === 0) {
    Sentry.captureException(upsertError ?? new Error('Xero connection upsert failed'), {
      tags: { route: 'Xero/callback' },
      extra: {
        context: '[Xero] Connection upsert failed',
        errorMessage: upsertError?.message,
        errorCode: upsertError?.code,
        errorDetails: upsertError?.details,
        errorHint: upsertError?.hint,
        businessId: canonicalBusinessId,
        userId,
        tenantId: tenant.tenantId,
        insertedDataLength: insertedData?.length,
      },
    } as any);
    // Encode error detail in redirect for user to see
    const detail = upsertError?.message || upsertError?.code || 'empty_insert';
    return { success: false, error: `database_error:${encodeURIComponent(detail.slice(0, 100))}` };
  }

  const id = (insertedData[0] as any).id;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Xero] Connection saved:', id, 'tenant:', tenant.tenantName);
  }

  // Phase 67-01: capture Xero's BaseCurrency so xero_connections.functional_currency
  // matches the source of truth. The consolidation engine reads this column to
  // decide whether to FX-translate via fx_rates. Non-fatal on failure — the
  // sync orchestrator will retry on the first sync.
  try {
    const org = await getXeroOrgTimezone(
      { tenant_id: tenant.tenantId },
      tokens.access_token,
    );
    if (org.baseCurrency) {
      const { error: ccyErr } = await supabase
        .from('xero_connections')
        .update({ functional_currency: org.baseCurrency })
        .eq('id', id);
      if (ccyErr) {
        console.warn('[Xero] functional_currency capture failed at callback:', ccyErr.message);
      } else if (process.env.NODE_ENV !== 'production') {
        console.log('[Xero] functional_currency captured:', org.baseCurrency, 'for', tenant.tenantName);
      }
    }
  } catch (err) {
    // Don't block OAuth on /Organisation hiccups — sync orchestrator will refresh.
    console.warn('[Xero] /Organisation read failed at callback (non-fatal):', err instanceof Error ? err.message : err);
  }

  return { success: true, connectionId: id };
}

async function getHandler(request: NextRequest) {
  try {
    // Get code and state from query params
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for errors from Xero
    if (error) {
      Sentry.captureException(error, { tags: { route: 'Xero/callback' }, extra: { context: "Xero returned error" } } as any);
      return NextResponse.redirect(
        new URL('/integrations?error=xero_denied', request.url)
      );
    }

    if (!code || !state) {
      Sentry.captureMessage('Missing code or state', 'error' as any);
      return NextResponse.redirect(
        new URL('/integrations?error=missing_params', request.url)
      );
    }

    // Verify and decode the signed state to get business_id and return_to
    let businessId: string;
    let returnTo: string = '/integrations';

    const signedStateData = verifySignedOAuthState<{ business_id: string; user_id?: string; return_to?: string; timestamp: number }>(state);

    if (!signedStateData) {
      Sentry.captureMessage('Invalid OAuth state - signature verification failed', 'error' as any);
      return NextResponse.redirect(
        new URL('/integrations?error=invalid_state', request.url)
      );
    }

    // Check state is not too old (max 10 minutes)
    const stateAge = Date.now() - signedStateData.timestamp;
    if (stateAge > 10 * 60 * 1000) {
      Sentry.captureMessage('OAuth state expired', 'error' as any);
      return NextResponse.redirect(
        new URL('/integrations?error=state_expired', request.url)
      );
    }

    // S4 (22 Sep 2026): only the person who started this connect may finish it.
    // The state is signed, but it used to name only the business — a client
    // could send someone their Xero login link and that person's orgs were
    // saved onto the client's business (Matt's full multi-org list pre-ticked).
    // The callback is a top-level redirect back from Xero, so the session
    // cookie is present; a state minted before this check (no user_id) is refused.
    const sessionClient = await createRouteHandlerClient();
    const { data: { user: sessionUser } } = await sessionClient.auth.getUser();
    if (!signedStateData.user_id || !sessionUser || sessionUser.id !== signedStateData.user_id) {
      Sentry.captureMessage('Xero callback: session is not the user who started the connect', {
        level: 'warning',
        tags: { route: 'Xero/callback', invariant: 'xero_oauth_state_user_mismatch' },
        extra: { hasStateUser: !!signedStateData.user_id, hasSession: !!sessionUser },
      } as any);
      return NextResponse.redirect(
        new URL('/integrations?error=session_mismatch', request.url)
      );
    }

    businessId = signedStateData.business_id;
    // S2: re-checked here as well as when the state was minted.
    returnTo = safeReturnPath(signedStateData.return_to);

    // Step 1: Exchange code for tokens
    if (process.env.NODE_ENV !== 'production') {
      console.log('Exchanging code for tokens...');
    }
    
    // Create the authorization header
    const authHeader = Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString('base64');
    
    // Prepare the token request
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI
    });

    // Make the token request
    const tokenResponse = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      Sentry.captureException(errorText, { tags: { route: 'Xero/callback' }, extra: { context: "Token exchange failed" } } as any);
      return NextResponse.redirect(
        new URL('/integrations?error=token_exchange_failed', request.url)
      );
    }

    const tokens = await tokenResponse.json();
    if (process.env.NODE_ENV !== 'production') {
      console.log('Got tokens successfully');
    }

    // Step 2: Get tenant information
    if (process.env.NODE_ENV !== 'production') {
      console.log('Getting tenant information...');
    }

    const connectionsResponse = await fetch(XERO_CONNECTIONS_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!connectionsResponse.ok) {
      Sentry.captureMessage('Failed to get connections', 'error' as any);
      return NextResponse.redirect(
        new URL('/integrations?error=connections_failed', request.url)
      );
    }

    const connections = await connectionsResponse.json();

    if (!connections || connections.length === 0) {
      Sentry.captureMessage('No Xero organizations found', 'error' as any);
      return NextResponse.redirect(
        new URL('/integrations?error=no_organizations', request.url)
      );
    }

    // Calculate token expiry
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

    // Get owner_id from business
    const { data: businessData } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', businessId)
      .single();

    const userId = businessData?.owner_id;
    if (!userId) {
      Sentry.captureMessage('Could not find owner_id for business', 'error' as any);
      return NextResponse.redirect(
        new URL('/integrations?error=user_not_found', request.url)
      );
    }

    // =====================================================
    // MULTI-TENANT HANDLING
    // If user has access to multiple Xero orgs, redirect to
    // a selection page instead of blindly picking the first.
    // =====================================================
    if (connections.length > 1) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Xero Callback] Multiple tenants (${connections.length}), redirecting to selection`);
      }

      // Resolve business_id to the correct format for xero_connections FK
      const { connectionBusinessId: resolvedBizId } = await resolveXeroBusinessId(supabase, businessId);

      // Clean up any stale pending records for this business
      await supabase
        .from('pending_xero_connections')
        .delete()
        .eq('business_id', resolvedBizId);

      // Store tokens + tenant list temporarily (encrypted, 10-minute TTL)
      const { data: pending, error: pendingError } = await supabase
        .from('pending_xero_connections')
        .insert({
          business_id: resolvedBizId,
          user_id: userId,
          encrypted_access_token: encrypt(tokens.access_token),
          encrypted_refresh_token: encrypt(tokens.refresh_token),
          token_expires_at: expiresAt.toISOString(),
          tenants: connections.map((c: { tenantId: string; tenantName: string }) => ({
            tenantId: c.tenantId,
            tenantName: c.tenantName,
          })),
          return_to: returnTo,
        })
        .select('id')
        .single();

      if (pendingError || !pending) {
        Sentry.captureException(pendingError, { tags: { route: 'Xero/callback' }, extra: { context: "[Xero Callback] Failed to store pending connection" } } as any);
        return NextResponse.redirect(
          new URL('/integrations?error=database_error', request.url)
        );
      }

      return NextResponse.redirect(
        new URL(`/xero-connect/select-org?pending_id=${pending.id}&business_id=${businessId}`, request.url)
      );
    }

    // =====================================================
    // SINGLE TENANT — auto-connect (existing behaviour)
    // =====================================================
    const tenant = connections[0];
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Xero Callback] Single tenant, auto-connecting:', tenant.tenantName);
    }

    // Save connection
    const saveResult = await saveXeroConnection({
      businessId,
      userId,
      tenant,
      tokens,
      expiresAt,
      grantedScopes: resolveGrantedScopes({ scope: tokens.scope, accessToken: tokens.access_token }),
    });

    if (!saveResult.success) {
      return NextResponse.redirect(
        new URL(`/integrations?error=${saveResult.error}`, request.url)
      );
    }

    // No sync runs here, and nothing here writes last_synced_at. That column is
    // the data clock the connection pill, /cfo and /api/Xero/status classify,
    // and only a real per-tenant sync success moves it (sync-orchestrator.ts).
    // This route used to run an "initial sync" — a BankSummary URL Xero does
    // not have, a financial_metrics row of zeros when the P&L was refused — then
    // stamp EVERY connection of the business fresh whatever Xero answered, so
    // reconnecting one org made a sibling Xero refuses read current for 48h and
    // a new org skipped pending_first_sync. The first real sync is the landing
    // page's (forecast and monthly report run one on return), a Sync press, or
    // the next 6-hourly cron, which takes the stalest connections first.
    //
    // ?syncing=true is the forecast page's cue to run that sync.
    return NextResponse.redirect(
      new URL(withReturnParams(returnTo, { success: 'connected', syncing: 'true' }), request.url)
    );

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'Xero/callback' }, extra: { context: "Callback error" } } as any);
    return NextResponse.redirect(
      new URL('/integrations?error=unknown_error', request.url)
    );
  }
}

export const GET = withQuerySchema(
  'Xero/callback',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>
)