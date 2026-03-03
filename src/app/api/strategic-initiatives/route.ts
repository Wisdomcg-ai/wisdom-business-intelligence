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

    // The wizard passes businesses.id. Strategic initiatives are stored with
    // user_id (the business owner). We need to find the owner to query correctly.
    // Also try business_profiles.id as the business_id FK.

    // Collect all IDs to try for user_id and business_id lookups
    const userIdsToTry: string[] = [user.id]
    const businessIdsToTry: string[] = [businessId]

    // Look up business owner
    const { data: business } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', businessId)
      .maybeSingle()

    if (business?.owner_id && business.owner_id !== user.id) {
      userIdsToTry.push(business.owner_id)
    }

    // Look up business_profiles.id (the FK used in some tables)
    const { data: profile } = await supabase
      .from('business_profiles')
      .select('id, user_id')
      .eq('business_id', businessId)
      .maybeSingle()

    if (profile?.id) {
      businessIdsToTry.push(profile.id)
    }
    if (profile?.user_id && !userIdsToTry.includes(profile.user_id)) {
      userIdsToTry.push(profile.user_id)
    }

    console.log('[API /strategic-initiatives] Looking up initiatives:', {
      businessId,
      userIdsToTry,
      businessIdsToTry,
      annualPlanOnly,
    })

    // Try by user_id first (matches annual-plan route pattern)
    for (const userId of userIdsToTry) {
      let query = supabase
        .from('strategic_initiatives')
        .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
        .eq('user_id', userId)

      if (annualPlanOnly) {
        query = query.or('step_type.eq.twelve_month,selected_for_annual_plan.eq.true')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        console.log('[API /strategic-initiatives] Found', data.length, 'initiatives via user_id:', userId)
        return NextResponse.json({ initiatives: data })
      }
    }

    // Try by business_id
    for (const bizId of businessIdsToTry) {
      let query = supabase
        .from('strategic_initiatives')
        .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
        .eq('business_id', bizId)

      if (annualPlanOnly) {
        query = query.or('step_type.eq.twelve_month,selected_for_annual_plan.eq.true')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        console.log('[API /strategic-initiatives] Found', data.length, 'initiatives via business_id:', bizId)
        return NextResponse.json({ initiatives: data })
      }
    }

    console.log('[API /strategic-initiatives] No initiatives found for any ID combination')
    return NextResponse.json({ initiatives: [] })

  } catch (error) {
    console.error('[API /strategic-initiatives] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
