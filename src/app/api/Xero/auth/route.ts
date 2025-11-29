// /app/api/xero/auth/route.ts
// This initiates the Xero OAuth flow

import { NextRequest, NextResponse } from 'next/server';

// Get environment variables
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID!;
const REDIRECT_URI = process.env.NODE_ENV === 'production'
  ? 'https://your-domain.com/api/Xero/callback'  // Update this with your real domain
  : 'http://localhost:3001/api/Xero/callback';

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
    // Check if Xero credentials are configured
    if (!XERO_CLIENT_ID) {
      console.error('XERO_CLIENT_ID is not configured');
      return NextResponse.json(
        { error: 'Xero integration is not configured. Please check environment variables.' },
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

    // Create state parameter with business_id and optional return_to
    const state = Buffer.from(
      JSON.stringify({
        business_id: businessId,
        return_to: returnTo || '/integrations'
      })
    ).toString('base64');

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
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
