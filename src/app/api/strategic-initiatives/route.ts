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

    // Collect all IDs to try
    const userIdsToTry: string[] = [user.id]
    const businessIdsToTry: string[] = [businessId]

    // Look up business owner
    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', businessId)
      .maybeSingle()

    console.log('[API /strategic-initiatives] Business lookup:', { businessId, owner_id: business?.owner_id, error: bizErr?.message })

    if (business?.owner_id && business.owner_id !== user.id) {
      userIdsToTry.push(business.owner_id)
    }

    // Look up business_profiles.id
    const { data: profile, error: profErr } = await supabase
      .from('business_profiles')
      .select('id, user_id')
      .eq('business_id', businessId)
      .maybeSingle()

    console.log('[API /strategic-initiatives] Profile lookup:', { profileId: profile?.id, profileUserId: profile?.user_id, error: profErr?.message })

    if (profile?.id) {
      businessIdsToTry.push(profile.id)
    }
    if (profile?.user_id && !userIdsToTry.includes(profile.user_id)) {
      userIdsToTry.push(profile.user_id)
    }

    console.log('[API /strategic-initiatives] IDs to try:', { userIdsToTry, businessIdsToTry, annualPlanOnly })

    // First: try a broad query by user_id WITHOUT the annual plan filter
    // to see if ANY initiatives exist at all
    for (const userId of userIdsToTry) {
      const { data: allData, error: allErr } = await supabase
        .from('strategic_initiatives')
        .select('id, title, step_type, selected_for_annual_plan')
        .eq('user_id', userId)

      console.log('[API /strategic-initiatives] All initiatives for user_id', userId, ':', {
        count: allData?.length || 0,
        error: allErr?.message,
        sample: allData?.slice(0, 3).map(d => ({ id: d.id, title: d.title, step_type: d.step_type, selected: d.selected_for_annual_plan })),
      })

      if (allData && allData.length > 0) {
        // Now apply the annual plan filter if needed
        if (annualPlanOnly) {
          const filtered = allData.filter(
            i => i.step_type === 'twelve_month' || i.selected_for_annual_plan === true
          )
          console.log('[API /strategic-initiatives] After annual plan filter:', filtered.length, 'of', allData.length)

          if (filtered.length > 0) {
            // Re-fetch with full columns for the filtered IDs
            const { data: fullData } = await supabase
              .from('strategic_initiatives')
              .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
              .in('id', filtered.map(i => i.id))
              .order('created_at', { ascending: false })

            return NextResponse.json({ initiatives: fullData || [] })
          }

          // Return all initiatives if none match the annual plan filter
          // (better to show something than nothing)
          console.log('[API /strategic-initiatives] No annual plan filter matches, returning all')
          const { data: fullData } = await supabase
            .from('strategic_initiatives')
            .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

          return NextResponse.json({ initiatives: fullData || [] })
        }

        // No filter — return all
        const { data: fullData } = await supabase
          .from('strategic_initiatives')
          .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        return NextResponse.json({ initiatives: fullData || [] })
      }
    }

    // Fallback: try by business_id
    for (const bizId of businessIdsToTry) {
      const { data, error } = await supabase
        .from('strategic_initiatives')
        .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
        .eq('business_id', bizId)
        .order('created_at', { ascending: false })

      console.log('[API /strategic-initiatives] business_id query:', bizId, 'count:', data?.length, 'error:', error?.message)

      if (!error && data && data.length > 0) {
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
