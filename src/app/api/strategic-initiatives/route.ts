import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const annualPlanOnly = searchParams.get('annual_plan_only') === 'true'

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // The wizard passes businesses.id but strategic_initiatives may use
    // business_profiles.id or user_id. Look up the profile ID first.
    const { data: profile } = await supabase
      .from('business_profiles')
      .select('id, user_id')
      .eq('business_id', businessId)
      .maybeSingle()

    const profileId = profile?.id
    const profileUserId = profile?.user_id

    // Try querying with business_id (profile ID), then user_id fallback
    // matching the pattern from /api/annual-plan/route.ts
    let initiatives = null

    // First try: query by business_id = profileId
    if (profileId) {
      let query = supabase
        .from('strategic_initiatives')
        .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
        .eq('business_id', profileId)

      if (annualPlanOnly) {
        query = query.or('step_type.eq.twelve_month,selected_for_annual_plan.eq.true')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        initiatives = data
      }
    }

    // Second try: query by user_id (same fallback as annual-plan route)
    if (!initiatives && (profileUserId || user.id)) {
      const userId = profileUserId || user.id

      let query = supabase
        .from('strategic_initiatives')
        .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
        .eq('user_id', userId)

      if (annualPlanOnly) {
        query = query.or('step_type.eq.twelve_month,selected_for_annual_plan.eq.true')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (!error && data) {
        initiatives = data
      }
    }

    // Third try: query with raw businessId directly
    if (!initiatives) {
      let query = supabase
        .from('strategic_initiatives')
        .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
        .eq('business_id', businessId)

      if (annualPlanOnly) {
        query = query.or('step_type.eq.twelve_month,selected_for_annual_plan.eq.true')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (!error && data) {
        initiatives = data
      }
    }

    return NextResponse.json({ initiatives: initiatives || [] })

  } catch (error) {
    console.error('[API /strategic-initiatives] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
