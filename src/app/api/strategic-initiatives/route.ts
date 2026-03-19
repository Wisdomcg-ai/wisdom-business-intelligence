import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Columns that always exist
const CORE_COLUMNS = 'id, title, description, priority, step_type, category, timeline, notes'
// Extended columns that may not exist on older schemas
const EXTENDED_COLUMNS = CORE_COLUMNS + ', estimated_cost, is_monthly_cost'

function mapInitiative(d: any, hasExtendedCols: boolean) {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    priority: d.priority,
    step_type: d.step_type,
    estimated_cost: hasExtendedCols ? (d.estimated_cost ?? undefined) : undefined,
    is_monthly_cost: hasExtendedCols ? (d.is_monthly_cost ?? undefined) : undefined,
  }
}

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

    // Detect if extended columns exist by trying once
    let columns = EXTENDED_COLUMNS
    let hasExtendedCols = true
    {
      const { error: testErr } = await supabase
        .from('strategic_initiatives')
        .select(EXTENDED_COLUMNS)
        .limit(0)
      if (testErr) {
        columns = CORE_COLUMNS
        hasExtendedCols = false
        console.log('[API /strategic-initiatives] Extended columns NOT available:', testErr.message)
      } else {
        console.log('[API /strategic-initiatives] Extended columns available (estimated_cost, is_monthly_cost)')
      }
    }

    // Try by user_id first
    for (const userId of userIdsToTry) {
      let query = supabase
        .from('strategic_initiatives')
        .select(columns)
        .eq('user_id', userId)

      if (annualPlanOnly) {
        query = query.or('step_type.eq.twelve_month,timeline.eq.year1')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        const mapped = data.map(d => mapInitiative(d, hasExtendedCols))
        console.log('[API /strategic-initiatives] Returning', mapped.length, 'initiatives. Sample costs:', mapped.slice(0, 3).map(m => ({ title: m.title, estimated_cost: m.estimated_cost, is_monthly_cost: m.is_monthly_cost })))
        return NextResponse.json({ initiatives: mapped })
      }

      // If the filtered query returned nothing, try without the annual plan filter
      if (annualPlanOnly) {
        const { data: allData, error: allErr } = await supabase
          .from('strategic_initiatives')
          .select(columns)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (!allErr && allData && allData.length > 0) {
          return NextResponse.json({ initiatives: allData.map(d => mapInitiative(d, hasExtendedCols)) })
        }
      }
    }

    // Fallback: try by business_id
    for (const bizId of businessIdsToTry) {
      const { data, error } = await supabase
        .from('strategic_initiatives')
        .select(columns)
        .eq('business_id', bizId)
        .order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        return NextResponse.json({ initiatives: data.map(d => mapInitiative(d, hasExtendedCols)) })
      }
    }

    return NextResponse.json({ initiatives: [] })

  } catch (error) {
    console.error('[API /strategic-initiatives] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
