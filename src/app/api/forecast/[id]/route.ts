import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: forecastId } = await params

    if (!forecastId) {
      return NextResponse.json({ error: 'Forecast ID is required' }, { status: 400 })
    }

    // Fetch the forecast
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('*')
      .eq('id', forecastId)
      .maybeSingle()

    if (forecastError) {
      console.error('[API /forecast/[id]] Error fetching forecast:', forecastError)
      return NextResponse.json({ error: 'Failed to fetch forecast' }, { status: 500 })
    }

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    // Verify access: user owns the business, is a team member, or is a coach/admin
    // forecast.business_id is business_profiles.id (FK), so look up the actual business
    let businessId = forecast.business_id
    let ownerId: string | null = null

    // Try direct lookup in businesses table first
    const { data: bizDirect } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', forecast.business_id)
      .maybeSingle()

    if (bizDirect) {
      businessId = bizDirect.id
      ownerId = bizDirect.owner_id
    } else {
      // forecast.business_id is likely business_profiles.id — resolve to businesses.id
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('business_id, user_id')
        .eq('id', forecast.business_id)
        .maybeSingle()

      if (profile?.business_id) {
        businessId = profile.business_id
        const { data: biz } = await supabase
          .from('businesses')
          .select('owner_id')
          .eq('id', profile.business_id)
          .maybeSingle()
        ownerId = biz?.owner_id || null
      }
      // Also check if the profile user matches
      if (profile?.user_id === user.id) {
        ownerId = user.id // treat profile owner as business owner
      }
    }

    const isOwner = ownerId === user.id

    if (!isOwner) {
      // Check if user is a team member of this business
      const { data: teamMember } = await supabase
        .from('business_users')
        .select('id')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (!teamMember) {
        // Check if user is a coach/admin
        const { data: roleData } = await supabase
          .from('system_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()

        const isCoachOrAdmin = roleData?.role === 'coach' || roleData?.role === 'super_admin'
        if (!isCoachOrAdmin) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    }

    // Map wizard_v4 data from category_assumptions back to top-level 'assumptions'
    // so the wizard can read it (migration for dedicated columns not applied in production)
    const wizardV4 = forecast.category_assumptions?.wizard_v4
    if (wizardV4?.assumptions && !forecast.assumptions) {
      forecast.assumptions = wizardV4.assumptions
    }

    return NextResponse.json({ forecast })

  } catch (error) {
    console.error('[API /forecast/[id]] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
