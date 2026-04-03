import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createRouteHandlerClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const businessId = searchParams.get('business_id');

  if (!businessId) {
    return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
  }

  try {
    // Fetch the business profile
    const { data: profile, error: profileError } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('business_id', businessId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[business-profile] Error fetching profile:', profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ profile: profile || null });
  } catch (err) {
    console.error('[business-profile] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch business profile' },
      { status: 500 }
    );
  }
}
