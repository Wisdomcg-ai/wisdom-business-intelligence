import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const business_id = searchParams.get('business_id');

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    // IMPORTANT: Strategic initiatives are stored with business_profiles.id, not businesses.id
    // Look up the business_profiles.id from the businesses table
    let profileBusinessId = business_id;

    // First try to get business_profiles.id from businesses table
    const { data: business } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', business_id)
      .single();

    if (business?.owner_id) {
      // Get the business_profiles.id using the owner's user_id
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', business.owner_id)
        .single();

      if (profile?.id) {
        profileBusinessId = profile.id;
        console.log('[Strategic Initiatives] Mapped businesses.id to business_profiles.id:', business_id, '->', profileBusinessId);
      }
    }

    // Check which initiatives to return
    const annualPlanOnly = searchParams.get('annual_plan_only') === 'true';

    let initiatives = null;
    let error = null;

    if (annualPlanOnly) {
      // For forecast wizard: Get initiatives from the 12-month annual plan (Step 4)
      // These are stored with step_type = 'twelve_month'
      // Also include quarterly plans that have been assigned
      // Fallback to strategic_ideas if no annual plan initiatives exist
      let result = await supabase
        .from('strategic_initiatives')
        .select('*')
        .eq('business_id', profileBusinessId)
        .in('step_type', ['twelve_month', 'q1', 'q2', 'q3', 'q4'])
        .order('order_index', { ascending: true });

      // If no annual plan initiatives, fall back to strategic ideas
      if (!result.data || result.data.length === 0) {
        console.log('[Strategic Initiatives] No annual plan initiatives found, falling back to strategic_ideas');
        result = await supabase
          .from('strategic_initiatives')
          .select('*')
          .eq('business_id', profileBusinessId)
          .in('step_type', ['strategic_ideas', 'roadmap'])
          .order('order_index', { ascending: true });
      }

      // Final fallback: get ANY initiatives for this business
      if (!result.data || result.data.length === 0) {
        console.log('[Strategic Initiatives] No strategic_ideas found, getting ALL initiatives');
        result = await supabase
          .from('strategic_initiatives')
          .select('*')
          .eq('business_id', profileBusinessId)
          .order('created_at', { ascending: false })
          .limit(20);
        console.log('[Strategic Initiatives] Found', result.data?.length || 0, 'total initiatives');
      }

      initiatives = result.data;
      error = result.error;

      console.log('[Strategic Initiatives] Fetching annual plan initiatives (with fallback to strategic_ideas)');
    } else {
      // Return all initiatives
      const result = await supabase
        .from('strategic_initiatives')
        .select('*')
        .eq('business_id', profileBusinessId)
        .order('created_at', { ascending: false });
      initiatives = result.data;
      error = result.error;
    }

    if (error) {
      console.error('[Strategic Initiatives] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch initiatives' }, { status: 500 });
    }

    console.log('[Strategic Initiatives] Returning', initiatives?.length || 0,
      annualPlanOnly ? 'annual plan (twelve_month/quarterly)' : 'all',
      'initiatives for business_profiles.id:', profileBusinessId, '(from businesses.id:', business_id + ')');

    return NextResponse.json({
      initiatives: initiatives || [],
      count: initiatives?.length || 0
    });

  } catch (error) {
    console.error('[Strategic Initiatives] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
