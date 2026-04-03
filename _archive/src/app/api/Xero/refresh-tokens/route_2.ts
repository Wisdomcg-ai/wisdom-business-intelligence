// /app/api/Xero/refresh-tokens/route.ts
// Background job to proactively refresh Xero tokens before they expire
// Can be called by Vercel Cron, external scheduler, or client-side keepalive

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '@/lib/utils/encryption';

export const dynamic = 'force-dynamic';

// Allow longer timeout for batch processing
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID!;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET!;

interface RefreshResult {
  business_id: string;
  tenant_name: string;
  status: 'refreshed' | 'still_valid' | 'failed' | 'deactivated';
  message: string;
  new_expiry?: string;
}

async function refreshConnection(connection: any): Promise<RefreshResult> {
  const now = new Date();
  const expiry = new Date(connection.expires_at);

  // Refresh if token expires within 15 minutes (proactive refresh)
  const refreshThreshold = new Date(now.getTime() + 15 * 60 * 1000);

  if (expiry > refreshThreshold) {
    return {
      business_id: connection.business_id,
      tenant_name: connection.tenant_name,
      status: 'still_valid',
      message: `Token valid until ${expiry.toISOString()}`
    };
  }

  console.log(`[Token Refresh] Refreshing token for ${connection.tenant_name} (expires ${expiry.toISOString()})`);

  try {
    const decryptedRefreshToken = decrypt(connection.refresh_token);

    const refreshResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: decryptedRefreshToken
      })
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      console.error(`[Token Refresh] Failed for ${connection.tenant_name}:`, refreshResponse.status, errorText);

      // Check if it's a permanent failure (invalid_grant = refresh token expired/revoked)
      if (errorText.includes('invalid_grant') || refreshResponse.status === 400) {
        // Mark connection as inactive
        await supabase
          .from('xero_connections')
          .update({ is_active: false })
          .eq('id', connection.id);

        return {
          business_id: connection.business_id,
          tenant_name: connection.tenant_name,
          status: 'deactivated',
          message: 'Refresh token expired or revoked - user needs to reconnect'
        };
      }

      return {
        business_id: connection.business_id,
        tenant_name: connection.tenant_name,
        status: 'failed',
        message: `Refresh failed: ${refreshResponse.status}`
      };
    }

    const tokens = await refreshResponse.json();
    const newExpiry = new Date();
    newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in);

    // Update tokens in database
    const { error: updateError } = await supabase
      .from('xero_connections')
      .update({
        access_token: encrypt(tokens.access_token),
        refresh_token: encrypt(tokens.refresh_token),
        expires_at: newExpiry.toISOString()
      })
      .eq('id', connection.id);

    if (updateError) {
      console.error(`[Token Refresh] Failed to save tokens for ${connection.tenant_name}:`, updateError);
      return {
        business_id: connection.business_id,
        tenant_name: connection.tenant_name,
        status: 'failed',
        message: 'Failed to save refreshed tokens'
      };
    }

    console.log(`[Token Refresh] Success for ${connection.tenant_name}, new expiry: ${newExpiry.toISOString()}`);

    return {
      business_id: connection.business_id,
      tenant_name: connection.tenant_name,
      status: 'refreshed',
      message: 'Token refreshed successfully',
      new_expiry: newExpiry.toISOString()
    };

  } catch (error) {
    console.error(`[Token Refresh] Error for ${connection.tenant_name}:`, error);
    return {
      business_id: connection.business_id,
      tenant_name: connection.tenant_name,
      status: 'failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    // Optional: Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Allow without auth in development
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    console.log('[Token Refresh] Starting batch token refresh...');

    // Get all active Xero connections
    const { data: connections, error } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('[Token Refresh] Failed to fetch connections:', error);
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active Xero connections to refresh',
        results: []
      });
    }

    console.log(`[Token Refresh] Found ${connections.length} active connections`);

    // Process all connections
    const results: RefreshResult[] = [];
    for (const connection of connections) {
      const result = await refreshConnection(connection);
      results.push(result);

      // Small delay between refreshes to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const summary = {
      total: results.length,
      refreshed: results.filter(r => r.status === 'refreshed').length,
      still_valid: results.filter(r => r.status === 'still_valid').length,
      failed: results.filter(r => r.status === 'failed').length,
      deactivated: results.filter(r => r.status === 'deactivated').length
    };

    console.log('[Token Refresh] Complete:', summary);

    return NextResponse.json({
      success: true,
      summary,
      results
    });

  } catch (error) {
    console.error('[Token Refresh] Error:', error);
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 500 });
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
