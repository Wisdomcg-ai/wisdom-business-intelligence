import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { decrypt, encrypt } from '@/lib/utils/encryption';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * POST /api/Xero/reactivate
 *
 * Attempts to re-activate an inactive Xero connection by checking if the
 * refresh token is still valid. If valid, refreshes the tokens and marks
 * the connection as active again.
 */
export async function POST(request: NextRequest) {
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

    if (business.owner_id !== user.id && business.assigned_coach_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get ANY connection for this business (including inactive ones)
    const { data: connection, error: connError } = await supabaseAdmin
      .from('xero_connections')
      .select('*')
      .eq('business_id', business_id)
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

    console.log('[Xero Reactivate] Attempting to reactivate connection:', connection.id);

    // Try to refresh the tokens
    let decryptedRefreshToken: string;
    try {
      decryptedRefreshToken = decrypt(connection.refresh_token);
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: 'decrypt_failed',
        message: 'Failed to decrypt stored tokens. Please reconnect Xero.'
      }, { status: 500 });
    }

    // Attempt token refresh
    const response = await fetch('https://identity.xero.com/connect/token', {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Xero Reactivate] Token refresh failed:', response.status, errorText);

      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // Not JSON
      }

      // Check if it's a permanent failure
      if (errorData.error === 'invalid_grant') {
        return NextResponse.json({
          success: false,
          error: 'token_expired',
          message: 'Refresh token has expired. Please reconnect Xero from the Integrations page.'
        }, { status: 401 });
      }

      return NextResponse.json({
        success: false,
        error: 'refresh_failed',
        message: `Token refresh failed: ${errorData.error || 'Unknown error'}`
      }, { status: 500 });
    }

    // Token refresh succeeded - update and reactivate
    const tokens = await response.json();
    const newExpiry = new Date();
    newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in);

    const { error: updateError } = await supabaseAdmin
      .from('xero_connections')
      .update({
        access_token: encrypt(tokens.access_token),
        refresh_token: encrypt(tokens.refresh_token),
        expires_at: newExpiry.toISOString(),
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);

    if (updateError) {
      console.error('[Xero Reactivate] Failed to save tokens:', updateError);
      return NextResponse.json({
        success: false,
        error: 'save_failed',
        message: 'Failed to save updated tokens'
      }, { status: 500 });
    }

    console.log('[Xero Reactivate] Connection reactivated successfully:', connection.id);

    return NextResponse.json({
      success: true,
      message: 'Xero connection has been reactivated',
      was_inactive: true,
      connection: {
        id: connection.id,
        tenant_name: connection.tenant_name,
        expires_at: newExpiry.toISOString()
      }
    });

  } catch (error) {
    console.error('[Xero Reactivate] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'internal_error',
      message: 'Failed to reactivate connection'
    }, { status: 500 });
  }
}
