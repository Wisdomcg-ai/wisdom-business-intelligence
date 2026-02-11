// /app/api/xero/callback/route.ts
// This handles the return from Xero after user authorizes

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encrypt, verifySignedOAuthState } from '@/lib/utils/encryption';

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

    // Try to verify as signed state first (new format)
    const signedStateData = verifySignedOAuthState<{ business_id: string; return_to?: string; timestamp: number }>(state);

    if (signedStateData) {
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
    } else {
      // Fallback: try legacy base64 format (for backwards compatibility during migration)
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        businessId = stateData.business_id;
        returnTo = stateData.return_to || '/integrations';
        console.warn('Using legacy OAuth state format - please update auth route');
      } catch (e) {
        console.error('Invalid state:', e);
        return NextResponse.redirect(
          new URL('/integrations?error=invalid_state', request.url)
        );
      }
    }

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
        new URL(`${returnTo}?error=token_exchange_failed`, request.url)
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
        new URL(`${returnTo}?error=connections_failed`, request.url)
      );
    }

    const connections = await connectionsResponse.json();

    if (!connections || connections.length === 0) {
      console.error('No Xero organizations found');
      return NextResponse.redirect(
        new URL(`${returnTo}?error=no_organizations`, request.url)
      );
    }

    // Use the first organization (tenant)
    const tenant = connections[0];
    console.log('Using tenant:', tenant.tenantName);

    // Step 3: Calculate token expiry
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

    // Step 4: Get owner_id from business
    const { data: businessData } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', businessId)
      .single();

    const userId = businessData?.owner_id;
    if (!userId) {
      console.error('Could not find owner_id for business');
      return NextResponse.redirect(
        new URL(`${returnTo}?error=user_not_found`, request.url)
      );
    }

    // Step 5: Save to database
    console.log('Saving connection to database...');

    // First, deactivate any existing connection for this business
    await supabase
      .from('xero_connections')
      .update({ is_active: false })
      .eq('business_id', businessId);

    // Insert the new connection with encrypted tokens
    const { data, error: dbError } = await supabase
      .from('xero_connections')
      .insert({
        business_id: businessId,
        user_id: userId,
        tenant_id: tenant.tenantId,
        tenant_name: tenant.tenantName,
        access_token: encrypt(tokens.access_token),
        refresh_token: encrypt(tokens.refresh_token),
        expires_at: expiresAt.toISOString(),
        is_active: true
      });

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.redirect(
        new URL(`${returnTo}?error=database_error`, request.url)
      );
    }

    console.log('Connection saved successfully');

    // Redirect back to the page that initiated the connection
    return NextResponse.redirect(
      new URL(`${returnTo}?success=connected`, request.url)
    );

  } catch (error) {
    console.error('Callback error:', error);
    return NextResponse.redirect(
      new URL('/integrations?error=unknown_error', request.url)
    );
  }
}