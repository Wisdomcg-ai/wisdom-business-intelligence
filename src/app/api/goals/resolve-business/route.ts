import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/goals/resolve-business?business_id=xxx
 *
 * Resolves a businesses.id to the correct business_profiles.id, owner user ID,
 * and industry. Uses the service role client to bypass RLS, so coaches can
 * always resolve client business IDs even without SELECT policies on
 * business_profiles.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createRouteHandlerClient()
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')

    if (!businessId) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
    }

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use service role client to bypass RLS for all lookups
    const admin = createServiceRoleClient()

    // Verify the caller has access: owner, team member, coach, or super_admin
    const { data: business } = await admin
      .from('businesses')
      .select('id, owner_id, owner_email, name, assigned_coach_id')
      .eq('id', businessId)
      .single()

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const isOwner = business.owner_id === user.id
    const isCoach = business.assigned_coach_id === user.id

    // Check team membership
    const { data: membership } = await admin
      .from('business_users')
      .select('user_id')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .maybeSingle()

    // Check super_admin
    const { data: superAdmin } = await admin
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle()

    if (!isOwner && !isCoach && !membership && !superAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Resolve business_profiles.id
    const { data: profile } = await admin
      .from('business_profiles')
      .select('id, user_id, industry, business_id')
      .eq('business_id', businessId)
      .maybeSingle()

    // If no profile found by business_id, try via owner's user_id
    let profileId = profile?.id || null
    let profileIndustry = profile?.industry || null
    let ownerUserId = business.owner_id

    if (!profileId && business.owner_id) {
      const { data: profileByUser } = await admin
        .from('business_profiles')
        .select('id, industry')
        .eq('user_id', business.owner_id)
        .maybeSingle()

      if (profileByUser) {
        profileId = profileByUser.id
        profileIndustry = profileByUser.industry
      }
    }

    return NextResponse.json({
      profileId,
      businessesId: businessId,
      ownerUserId,
      industry: profileIndustry,
      businessName: business.name
    })
  } catch (err) {
    console.error('[API /goals/resolve-business] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
