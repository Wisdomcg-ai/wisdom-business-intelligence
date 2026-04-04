import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pendingId = request.nextUrl.searchParams.get('pending_id');
    if (!pendingId) {
      return NextResponse.json({ error: 'pending_id is required' }, { status: 400 });
    }

    // Clean up expired pending records
    await supabaseAdmin
      .from('pending_xero_connections')
      .delete()
      .lt('created_at', new Date(Date.now() - PENDING_TTL_MS).toISOString());

    // Fetch the pending connection
    const { data: pending, error } = await supabaseAdmin
      .from('pending_xero_connections')
      .select('id, business_id, tenants, return_to, created_at')
      .eq('id', pendingId)
      .maybeSingle();

    if (error || !pending) {
      return NextResponse.json(
        { error: 'Pending connection not found or expired. Please try connecting again.' },
        { status: 404 }
      );
    }

    // Verify user has access to this business
    // pending.business_id may be business_profiles.id, so check both tables
    let hasAccess = false;
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', pending.business_id)
      .maybeSingle();

    if (business && (business.owner_id === user.id || business.assigned_coach_id === user.id)) {
      hasAccess = true;
    }

    if (!hasAccess) {
      // Try resolving through business_profiles
      const { data: profile } = await supabaseAdmin
        .from('business_profiles')
        .select('business_id')
        .eq('id', pending.business_id)
        .maybeSingle();
      if (profile?.business_id) {
        const { data: biz } = await supabaseAdmin
          .from('businesses')
          .select('id, owner_id, assigned_coach_id')
          .eq('id', profile.business_id)
          .maybeSingle();
        if (biz && (biz.owner_id === user.id || biz.assigned_coach_id === user.id)) {
          hasAccess = true;
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Return tenant list (names only — no tokens exposed to browser)
    return NextResponse.json({
      pending_id: pending.id,
      business_id: pending.business_id,
      tenants: pending.tenants,
      return_to: pending.return_to || '/integrations',
    });
  } catch (error) {
    console.error('[Xero Pending] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
