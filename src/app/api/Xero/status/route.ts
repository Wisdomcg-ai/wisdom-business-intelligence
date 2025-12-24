import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/utils/encryption';

export const dynamic = 'force-dynamic';

// Use service key to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Proactively refresh token if expiring within 10 minutes
async function refreshTokenIfNeeded(connection: any): Promise<boolean> {
  const now = new Date();
  const expiry = new Date(connection.expires_at);
  const refreshThreshold = new Date(now.getTime() + 10 * 60 * 1000); // 10 min buffer

  if (expiry > refreshThreshold) {
    return true; // Token still valid
  }

  console.log('[Xero Status] Token expiring soon, refreshing...');

  try {
    const decryptedRefreshToken = decrypt(connection.refresh_token);

    const refreshResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
        ).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: decryptedRefreshToken
      })
    });

    if (!refreshResponse.ok) {
      console.error('[Xero Status] Token refresh failed:', refreshResponse.status);

      // Mark as inactive if refresh token is invalid
      if (refreshResponse.status === 400) {
        await supabaseAdmin
          .from('xero_connections')
          .update({ is_active: false })
          .eq('id', connection.id);
      }
      return false;
    }

    const tokens = await refreshResponse.json();
    const newExpiry = new Date();
    newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in);

    await supabaseAdmin
      .from('xero_connections')
      .update({
        access_token: encrypt(tokens.access_token),
        refresh_token: encrypt(tokens.refresh_token),
        expires_at: newExpiry.toISOString()
      })
      .eq('id', connection.id);

    console.log('[Xero Status] Token refreshed, new expiry:', newExpiry.toISOString());
    return true;

  } catch (error) {
    console.error('[Xero Status] Token refresh error:', error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('business_id');

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    // Verify user has access to this business
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', businessId)
      .single();

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Check if user is owner or assigned coach
    if (business.owner_id !== user.id && business.assigned_coach_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get Xero connection using admin client (bypasses RLS)
    // First check if ANY connection exists for debugging
    const { data: allConnections } = await supabaseAdmin
      .from('xero_connections')
      .select('id, tenant_name, is_active, business_id')
      .eq('business_id', businessId);

    console.log('[Xero Status] All connections for business:', businessId, allConnections);

    const { data: connection, error: connError } = await supabaseAdmin
      .from('xero_connections')
      .select('id, tenant_name, is_active, last_synced_at, expires_at, created_at, access_token, refresh_token')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .maybeSingle();

    console.log('[Xero Status] Active connection:', connection?.id, 'Error:', connError);

    if (connError) {
      console.error('[Xero Status] Error:', connError);
      return NextResponse.json({ error: 'Failed to check connection' }, { status: 500 });
    }

    if (!connection) {
      return NextResponse.json({
        connected: false,
        connection: null
      });
    }

    // Proactively refresh token if expiring soon
    const tokenValid = await refreshTokenIfNeeded(connection);

    if (!tokenValid) {
      return NextResponse.json({
        connected: false,
        expired: true,
        message: 'Token expired and could not be refreshed. Please reconnect Xero.',
        connection: null
      });
    }

    return NextResponse.json({
      connected: true,
      expired: false,
      connection: {
        id: connection.id,
        tenant_name: connection.tenant_name,
        is_active: connection.is_active,
        last_synced_at: connection.last_synced_at,
        expires_at: connection.expires_at
      }
    });

  } catch (error) {
    console.error('[Xero Status] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
