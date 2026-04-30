// /app/api/xero/callback/route.ts
// This handles the return from Xero after user authorizes

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encrypt, verifySignedOAuthState } from '@/lib/utils/encryption';
import { resolveXeroBusinessId } from '@/lib/utils/resolve-xero-business-id';

export const dynamic = 'force-dynamic'

// Initialize Supabase with service key for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Get environment variables
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID!;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
  }
): Promise<{ success: boolean; error?: string; connectionId?: string }> {
  const { businessId, userId, tenant, tokens, expiresAt } = params;

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

  console.log('[Xero] Upserting connection for business:', canonicalBusinessId, 'tenant:', tenant.tenantId);
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
      },
      { onConflict: 'business_id,tenant_id' },
    )
    .select();

  if (upsertError || !insertedData || insertedData.length === 0) {
    console.error('[Xero] Connection upsert failed:', {
      error: upsertError,
      errorMessage: upsertError?.message,
      errorCode: upsertError?.code,
      errorDetails: upsertError?.details,
      errorHint: upsertError?.hint,
      businessId: canonicalBusinessId,
      userId,
      tenantId: tenant.tenantId,
      insertedDataLength: insertedData?.length,
    });
    // Encode error detail in redirect for user to see
    const detail = upsertError?.message || upsertError?.code || 'empty_insert';
    return { success: false, error: `database_error:${encodeURIComponent(detail.slice(0, 100))}` };
  }

  const id = (insertedData[0] as any).id;
  console.log('[Xero] Connection saved:', id, 'tenant:', tenant.tenantName);
  return { success: true, connectionId: id };
}

/**
 * Trigger an initial sync after successful OAuth connection.
 * Syncs bank summary and current month P&L to financial_metrics.
 */
async function triggerInitialSync(businessId: string, accessToken: string, tenantId: string) {
  console.log('[Xero Callback] Starting initial sync for business:', businessId);

  try {
    // Get bank accounts
    const bankResponse = await fetch('https://api.xero.com/api.xro/2.0/BankSummary', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        'Accept': 'application/json'
      }
    });

    const bankData = bankResponse.ok ? await bankResponse.json() : null;

    // Calculate total cash
    let totalCash = 0;
    if (bankData?.BankSummary) {
      bankData.BankSummary.forEach((account: { ClosingBalance?: number }) => {
        totalCash += account.ClosingBalance || 0;
      });
    }

    // Get P&L for current month
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const plResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${startOfMonth.toISOString().split('T')[0]}&toDate=${endOfMonth.toISOString().split('T')[0]}&standardLayout=true&paymentsOnly=false`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': tenantId,
          'Accept': 'application/json'
        }
      }
    );

    let monthlyMetrics = {
      revenue_month: 0,
      cogs_month: 0,
      expenses_month: 0,
      net_profit_month: 0
    };

    if (plResponse.ok) {
      const plData = await plResponse.json();
      if (plData?.Reports?.[0]?.Rows) {
        plData.Reports[0].Rows.forEach((row: { RowType?: string; Title?: string; Rows?: { Cells?: { Value?: string }[] }[] }) => {
          if (row.RowType === 'Section') {
            const title = (row.Title || '').toUpperCase();
            // Check COGS first — "LESS COST OF SALES" contains "SALES"
            if (title.includes('COST OF SALES') || title.includes('DIRECT COSTS') || title.includes('COST OF GOODS')) {
              row.Rows?.forEach((subRow) => {
                if (subRow.Cells?.[1]?.Value) {
                  monthlyMetrics.cogs_month += parseFloat(subRow.Cells[1].Value) || 0;
                }
              });
            } else if (title.includes('INCOME') || title.includes('REVENUE') || title.includes('SALES') || title.includes('TRADING INCOME')) {
              // Excludes "OTHER INCOME" for main revenue (could add separate tracking)
              row.Rows?.forEach((subRow) => {
                if (subRow.Cells?.[1]?.Value) {
                  monthlyMetrics.revenue_month += parseFloat(subRow.Cells[1].Value) || 0;
                }
              });
            } else if (title.includes('EXPENSE') || title.includes('OPERATING')) {
              row.Rows?.forEach((subRow) => {
                if (subRow.Cells?.[1]?.Value) {
                  monthlyMetrics.expenses_month += parseFloat(subRow.Cells[1].Value) || 0;
                }
              });
            }
          }
        });
      }
    }

    // DEPRECATED (Tier 3 cleanup, 2026-04-30): see /api/Xero/sync/route.ts for
    // the same dead-write rationale. 3-bucket formula omits Xero
    // other_income/other_expense buckets. No current consumer reads
    // `financial_metrics.net_profit_month`; remove in a future migration.
    monthlyMetrics.net_profit_month = monthlyMetrics.revenue_month - monthlyMetrics.cogs_month - monthlyMetrics.expenses_month;

    // Save to financial_metrics table
    await supabase
      .from('financial_metrics')
      .upsert({
        business_id: businessId,
        metric_date: new Date().toISOString().split('T')[0],
        total_cash: totalCash,
        revenue_month: monthlyMetrics.revenue_month,
        cogs_month: monthlyMetrics.cogs_month,
        expenses_month: monthlyMetrics.expenses_month,
        net_profit_month: monthlyMetrics.net_profit_month,
        gross_profit_month: monthlyMetrics.revenue_month - monthlyMetrics.cogs_month,
        gross_margin_percent: monthlyMetrics.revenue_month > 0
          ? ((monthlyMetrics.revenue_month - monthlyMetrics.cogs_month) / monthlyMetrics.revenue_month) * 100
          : 0,
        net_margin_percent: monthlyMetrics.revenue_month > 0
          ? (monthlyMetrics.net_profit_month / monthlyMetrics.revenue_month) * 100
          : 0
      });

    // Update last sync time
    await supabase
      .from('xero_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('business_id', businessId);

    console.log('[Xero Callback] Initial sync completed successfully:', {
      totalCash,
      ...monthlyMetrics
    });

  } catch (error) {
    console.error('[Xero Callback] Initial sync error:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get code and state from query params
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for errors from Xero
    if (error) {
      console.error('Xero returned error:', error);
      return NextResponse.redirect(
        new URL('/integrations?error=xero_denied', request.url)
      );
    }

    if (!code || !state) {
      console.error('Missing code or state');
      return NextResponse.redirect(
        new URL('/integrations?error=missing_params', request.url)
      );
    }

    // Verify and decode the signed state to get business_id and return_to
    let businessId: string;
    let returnTo: string = '/integrations';

    const signedStateData = verifySignedOAuthState<{ business_id: string; return_to?: string; timestamp: number }>(state);

    if (!signedStateData) {
      console.error('Invalid OAuth state - signature verification failed');
      return NextResponse.redirect(
        new URL('/integrations?error=invalid_state', request.url)
      );
    }

    // Check state is not too old (max 10 minutes)
    const stateAge = Date.now() - signedStateData.timestamp;
    if (stateAge > 10 * 60 * 1000) {
      console.error('OAuth state expired');
      return NextResponse.redirect(
        new URL('/integrations?error=state_expired', request.url)
      );
    }
    businessId = signedStateData.business_id;
    returnTo = signedStateData.return_to || '/integrations';

    // Step 1: Exchange code for tokens
    console.log('Exchanging code for tokens...');
    
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
      console.error('Token exchange failed:', errorText);
      return NextResponse.redirect(
        new URL('/integrations?error=token_exchange_failed', request.url)
      );
    }

    const tokens = await tokenResponse.json();
    console.log('Got tokens successfully');

    // Step 2: Get tenant information
    console.log('Getting tenant information...');

    const connectionsResponse = await fetch(XERO_CONNECTIONS_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!connectionsResponse.ok) {
      console.error('Failed to get connections');
      return NextResponse.redirect(
        new URL('/integrations?error=connections_failed', request.url)
      );
    }

    const connections = await connectionsResponse.json();

    if (!connections || connections.length === 0) {
      console.error('No Xero organizations found');
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
      console.error('Could not find owner_id for business');
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
      console.log(`[Xero Callback] Multiple tenants (${connections.length}), redirecting to selection`);

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
        console.error('[Xero Callback] Failed to store pending connection:', pendingError);
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
    console.log('[Xero Callback] Single tenant, auto-connecting:', tenant.tenantName);

    // Save connection
    const saveResult = await saveXeroConnection({
      businessId,
      userId,
      tenant,
      tokens,
      expiresAt,
    });

    if (!saveResult.success) {
      return NextResponse.redirect(
        new URL(`/integrations?error=${saveResult.error}`, request.url)
      );
    }

    // Trigger an initial sync in the background
    triggerInitialSync(businessId, tokens.access_token, tenant.tenantId).catch(err => {
      console.error('[Xero Callback] Initial sync failed:', err);
    });

    // Redirect back with success
    return NextResponse.redirect(
      new URL(`${returnTo}?success=connected&syncing=true`, request.url)
    );

  } catch (error) {
    console.error('Callback error:', error);
    return NextResponse.redirect(
      new URL('/integrations?error=unknown_error', request.url)
    );
  }
}