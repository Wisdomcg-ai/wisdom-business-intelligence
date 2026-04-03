import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getValidAccessToken, checkConnectionHealth } from '@/lib/xero/token-manager';

export const dynamic = 'force-dynamic';

// Use service key to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

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
      .select('id, business_id, tenant_id, tenant_name, is_active, last_synced_at, expires_at, created_at, access_token, refresh_token')
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

    // Check connection health and refresh token if needed
    const healthCheck = await checkConnectionHealth(connection);

    // Proactively refresh token using the robust token manager
    const tokenResult = await getValidAccessToken(connection, supabaseAdmin);

    if (!tokenResult.success) {
      console.log('[Xero Status] Token refresh failed:', tokenResult.error, tokenResult.message);
      return NextResponse.json({
        connected: false,
        expired: true,
        error: tokenResult.error,
        message: tokenResult.message || 'Token expired and could not be refreshed. Please reconnect Xero.',
        needsReconnect: tokenResult.shouldDeactivate,
        connection: null
      });
    }

    // Re-fetch connection to get updated expiry time
    const { data: updatedConnection } = await supabaseAdmin
      .from('xero_connections')
      .select('id, tenant_name, is_active, last_synced_at, expires_at')
      .eq('id', connection.id)
      .single();

    return NextResponse.json({
      connected: true,
      expired: false,
      health: {
        isHealthy: healthCheck.isHealthy,
        expiresInMinutes: healthCheck.expiresIn,
        warnings: healthCheck.warnings
      },
      connection: {
        id: updatedConnection?.id || connection.id,
        tenant_name: updatedConnection?.tenant_name || connection.tenant_name,
        is_active: updatedConnection?.is_active ?? connection.is_active,
        last_synced_at: updatedConnection?.last_synced_at || connection.last_synced_at,
        expires_at: updatedConnection?.expires_at || connection.expires_at
      }
    });

  } catch (error) {
    console.error('[Xero Status] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
