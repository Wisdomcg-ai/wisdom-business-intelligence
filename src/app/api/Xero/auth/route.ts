// /app/api/xero/auth/route.ts
// This initiates the Xero OAuth flow

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { createSignedOAuthState } from '@/lib/utils/encryption';

export const dynamic = 'force-dynamic'

// Get environment variables
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const REDIRECT_URI = `${APP_URL}/api/Xero/callback`;

// Xero OAuth URL
const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';

// Scopes we need for P&L and financial data
const SCOPES = [
  'offline_access',           // Required for refresh tokens
  'accounting.transactions.read',
  'accounting.reports.read',
  'accounting.settings.read',
  'accounting.contacts.read'
].join(' ');

export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated before initiating OAuth
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(
        new URL('/auth/login?error=unauthorized&redirect=/integrations', request.url)
      );
    }

    // Check if Xero credentials are configured
    if (!XERO_CLIENT_ID) {
      console.error('XERO_CLIENT_ID is not configured');
      return NextResponse.json(
        { error: 'Xero integration is not configured.' },
        { status: 500 }
      );
    }

    // Get business_id and return_to from query params
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');
    const returnTo = searchParams.get('return_to');

    if (!businessId) {
      return NextResponse.json(
        { error: 'business_id is required' },
        { status: 400 }
      );
    }

    // Verify the user has access to this business (owner or assigned coach)
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', businessId)
      .single();

    if (bizError || !business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    // Check if user is owner or assigned coach
    if (business.owner_id !== user.id && business.assigned_coach_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied. You do not have permission to connect integrations for this business.' },
        { status: 403 }
      );
    }

    // Create signed state parameter with business_id, return_to, and timestamp
    // This prevents CSRF attacks by ensuring state can only be created by our server
    const state = createSignedOAuthState({
      business_id: businessId,
      return_to: returnTo || '/integrations',
      timestamp: Date.now()
    });

    // Build Xero authorization URL
    const authUrl = new URL(XERO_AUTH_URL);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', XERO_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', SCOPES);
    authUrl.searchParams.append('state', state);

    const xeroAuthUrl = authUrl.toString();
    console.log('Redirecting to Xero auth:', xeroAuthUrl);

    // Redirect to Xero using a 307 redirect
    return new NextResponse(null, {
      status: 307,
      headers: {
        'Location': xeroAuthUrl
      }
    });

  } catch (error) {
    console.error('[Xero Auth] Error:', error);
    console.error('[Xero Auth] Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('[Xero Auth] Environment check:', {
      hasXeroClientId: !!process.env.XERO_CLIENT_ID,
      hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
      hasOAuthStateSecret: !!process.env.OAUTH_STATE_SECRET,
      hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || 'not set'
    });
    // Return error message with hint for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to connect to Xero. Please try again. (${errorMessage})` },
      { status: 500 }
    );
  }
}
