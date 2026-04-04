import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/utils/encryption';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { pending_id, tenant_id } = await request.json();

    if (!pending_id || !tenant_id) {
      return NextResponse.json(
        { error: 'pending_id and tenant_id are required' },
        { status: 400 }
      );
    }

    // Fetch the pending connection
    const { data: pending, error: pendingError } = await supabaseAdmin
      .from('pending_xero_connections')
      .select('*')
      .eq('id', pending_id)
      .maybeSingle();

    if (pendingError || !pending) {
      return NextResponse.json(
        { error: 'Pending connection not found or expired. Please try connecting again.' },
        { status: 404 }
      );
    }

    // Check TTL
    const age = Date.now() - new Date(pending.created_at).getTime();
    if (age > PENDING_TTL_MS) {
      await supabaseAdmin.from('pending_xero_connections').delete().eq('id', pending_id);
      return NextResponse.json(
        { error: 'Connection session expired. Please try connecting again.' },
        { status: 410 }
      );
    }

    // Verify user has access to this business
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', pending.business_id)
      .maybeSingle();

    if (!business || (business.owner_id !== user.id && business.assigned_coach_id !== user.id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify selected tenant is in the list
    const tenants = pending.tenants as { tenantId: string; tenantName: string }[];
    const selectedTenant = tenants.find(t => t.tenantId === tenant_id);
    if (!selectedTenant) {
      return NextResponse.json(
        { error: 'Selected organisation not found in authorised list' },
        { status: 400 }
      );
    }

    // Decrypt tokens from pending record
    const accessToken = decrypt(pending.encrypted_access_token);
    const refreshToken = decrypt(pending.encrypted_refresh_token);

    // Delete any OTHER connections for this business (different tenant)
    await supabaseAdmin
      .from('xero_connections')
      .delete()
      .eq('business_id', pending.business_id)
      .neq('tenant_id', tenant_id);

    // Delete existing connection for this business, then insert fresh
    await supabaseAdmin
      .from('xero_connections')
      .delete()
      .eq('business_id', pending.business_id);

    const { data: connection, error: insertError } = await supabaseAdmin
      .from('xero_connections')
      .insert({
        business_id: pending.business_id,
        user_id: pending.user_id,
        tenant_id: selectedTenant.tenantId,
        tenant_name: selectedTenant.tenantName,
        access_token: encrypt(accessToken),
        refresh_token: encrypt(refreshToken),
        expires_at: pending.token_expires_at,
        is_active: true,
      })
      .select()
      .maybeSingle();

    if (insertError || !connection) {
      console.error('[Xero Complete] Insert failed:', insertError);
      return NextResponse.json(
        { error: 'Failed to save connection' },
        { status: 500 }
      );
    }

    // Delete the pending record
    await supabaseAdmin
      .from('pending_xero_connections')
      .delete()
      .eq('id', pending_id);

    console.log('[Xero Complete] Connection saved:', connection.id, 'tenant:', selectedTenant.tenantName);

    // Trigger initial sync in the background
    triggerInitialSync(pending.business_id, accessToken, selectedTenant.tenantId).catch(err => {
      console.error('[Xero Complete] Initial sync failed:', err);
    });

    return NextResponse.json({
      success: true,
      tenant_name: selectedTenant.tenantName,
      redirect_to: `${pending.return_to || '/integrations'}?success=connected&syncing=true`,
    });
  } catch (error) {
    console.error('[Xero Complete] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Trigger an initial sync after connection.
 * Simplified version — syncs bank summary and current month P&L.
 */
async function triggerInitialSync(businessId: string, accessToken: string, tenantId: string) {
  try {
    const bankResponse = await fetch('https://api.xero.com/api.xro/2.0/BankSummary', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        'Accept': 'application/json'
      }
    });

    const bankData = bankResponse.ok ? await bankResponse.json() : null;
    let totalCash = 0;
    if (bankData?.BankSummary) {
      bankData.BankSummary.forEach((account: { ClosingBalance?: number }) => {
        totalCash += account.ClosingBalance || 0;
      });
    }

    await supabaseAdmin
      .from('financial_metrics')
      .upsert({
        business_id: businessId,
        metric_date: new Date().toISOString().split('T')[0],
        total_cash: totalCash,
      });

    await supabaseAdmin
      .from('xero_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('business_id', businessId);

    console.log('[Xero Complete] Initial sync done, cash:', totalCash);
  } catch (error) {
    console.error('[Xero Complete] Sync error:', error);
  }
}
