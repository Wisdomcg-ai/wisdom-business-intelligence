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
    const { data: business } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', businessId)
      .maybeSingle()

    if (business?.owner_id && business.owner_id !== user.id) {
      userIdsToTry.push(business.owner_id)
    }

    // Look up business_profiles.id
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

    // Use only core columns that definitely exist on the table.
    // Some columns (estimated_cost, selected_for_annual_plan, is_monthly_cost)
    // may not exist if migrations haven't been applied to production.
    const baseColumns = 'id, title, description, priority, step_type, category, timeline, notes'

    // Try by user_id first
    for (const userId of userIdsToTry) {
      let query = supabase
        .from('strategic_initiatives')
        .select(baseColumns)
        .eq('user_id', userId)

      if (annualPlanOnly) {
        // Filter to annual plan items: step_type = 'twelve_month' or timeline = 'year1'
        query = query.or('step_type.eq.twelve_month,timeline.eq.year1')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        // Map to the shape Step6CapEx expects
        const initiatives = data.map(d => ({
          id: d.id,
          title: d.title,
          description: d.description,
          priority: d.priority,
          step_type: d.step_type,
          estimated_cost: undefined,
          is_monthly_cost: undefined,
        }))
        return NextResponse.json({ initiatives })
      }

      // If the filtered query returned nothing, try without the annual plan filter
      if (annualPlanOnly) {
        const { data: allData, error: allErr } = await supabase
          .from('strategic_initiatives')
          .select(baseColumns)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (!allErr && allData && allData.length > 0) {
          const initiatives = allData.map(d => ({
            id: d.id,
            title: d.title,
            description: d.description,
            priority: d.priority,
            step_type: d.step_type,
            estimated_cost: undefined,
            is_monthly_cost: undefined,
          }))
          return NextResponse.json({ initiatives })
        }
      }
    }

    // Fallback: try by business_id
    for (const bizId of businessIdsToTry) {
      const { data, error } = await supabase
        .from('strategic_initiatives')
        .select(baseColumns)
        .eq('business_id', bizId)
        .order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        const initiatives = data.map(d => ({
          id: d.id,
          title: d.title,
          description: d.description,
          priority: d.priority,
          step_type: d.step_type,
          estimated_cost: undefined,
          is_monthly_cost: undefined,
        }))
        return NextResponse.json({ initiatives })
      }
    }

    return NextResponse.json({ initiatives: [] })

  } catch (error) {
    console.error('[API /strategic-initiatives] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
