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

    // Track debug info to return in response
    const _debug: Record<string, unknown> = {
      userId: user.id,
      businessId,
      businessOwnerId: business?.owner_id,
      businessLookupError: bizErr?.message,
      profileId: profile?.id,
      profileUserId: profile?.user_id,
      profileLookupError: profErr?.message,
      userIdsToTry,
      businessIdsToTry,
      annualPlanOnly,
      queries: [] as Record<string, unknown>[],
    }

    // First: try a broad query by user_id WITHOUT the annual plan filter
    for (const userId of userIdsToTry) {
      const { data: allData, error: allErr } = await supabase
        .from('strategic_initiatives')
        .select('id, title, step_type, selected_for_annual_plan')
        .eq('user_id', userId)

      const queryInfo = { type: 'user_id', id: userId, count: allData?.length || 0, error: allErr?.message }
      ;(_debug.queries as Record<string, unknown>[]).push(queryInfo)

      if (allData && allData.length > 0) {
        if (annualPlanOnly) {
          const filtered = allData.filter(
            i => i.step_type === 'twelve_month' || i.selected_for_annual_plan === true
          )
          if (filtered.length > 0) {
            const { data: fullData } = await supabase
              .from('strategic_initiatives')
              .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
              .in('id', filtered.map(i => i.id))
              .order('created_at', { ascending: false })
            return NextResponse.json({ initiatives: fullData || [], _debug })
          }
          // No annual plan matches — return all
          const { data: fullData } = await supabase
            .from('strategic_initiatives')
            .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
          return NextResponse.json({ initiatives: fullData || [], _debug })
        }

        const { data: fullData } = await supabase
          .from('strategic_initiatives')
          .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
        return NextResponse.json({ initiatives: fullData || [], _debug })
      }
    }

    // Fallback: try by business_id
    for (const bizId of businessIdsToTry) {
      const { data, error } = await supabase
        .from('strategic_initiatives')
        .select('id, title, description, priority, step_type, estimated_cost, is_monthly_cost')
        .eq('business_id', bizId)
        .order('created_at', { ascending: false })

      const queryInfo = { type: 'business_id', id: bizId, count: data?.length || 0, error: error?.message }
      ;(_debug.queries as Record<string, unknown>[]).push(queryInfo)

      if (!error && data && data.length > 0) {
        return NextResponse.json({ initiatives: data, _debug })
      }
    }

    return NextResponse.json({ initiatives: [], _debug })

  } catch (error) {
    console.error('[API /strategic-initiatives] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
