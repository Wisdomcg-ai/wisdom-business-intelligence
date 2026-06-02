import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withQuerySchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

const GetQuerySchema = z
  .object({
    business_id: z.string().optional(),
    annual_plan_only: z.string().optional(),
  })
  .passthrough()

// R12: estimated_cost + is_monthly_cost have been part of the canonical schema
// since baseline, so the previous per-request "do these columns exist?" probe
// (an extra DB round-trip on EVERY request, always succeeding) was dead weight.
// Always select them.
const COLUMNS =
  'id, title, description, priority, step_type, category, timeline, notes, estimated_cost, is_monthly_cost'

function mapInitiative(d: any) {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    priority: d.priority,
    step_type: d.step_type,
    estimated_cost: d.estimated_cost ?? undefined,
    is_monthly_cost: d.is_monthly_cost ?? undefined,
  }
}

async function getHandler(request: Request) {
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

    const userIdsToTry: string[] = [user.id]
    const businessIdsToTry: string[] = [businessId]

    // R12: the business-owner lookup and the business_profiles lookup are
    // independent — run them in parallel instead of serially.
    const [{ data: business }, { data: profile }] = await Promise.all([
      supabase.from('businesses').select('owner_id').eq('id', businessId).maybeSingle(),
      supabase.from('business_profiles').select('id, user_id').eq('business_id', businessId).maybeSingle(),
    ])

    if (business?.owner_id && business.owner_id !== user.id) {
      userIdsToTry.push(business.owner_id)
    }
    if (profile?.id) {
      businessIdsToTry.push(profile.id)
    }
    if (profile?.user_id && !userIdsToTry.includes(profile.user_id)) {
      userIdsToTry.push(profile.user_id)
    }

    // Try by user_id first. NOTE: strategic_initiatives is one of the dual-ID
    // "MIXED" tables (rows live under multiple id-spaces); this returns the first
    // id-space that has data. Collapsing these into a single OR query is
    // deliberately deferred to the R14 data cleanse so we don't merge polluted
    // rows from different id-spaces and surface duplicates.
    for (const userId of userIdsToTry) {
      let query = supabase
        .from('strategic_initiatives')
        .select(COLUMNS)
        .eq('user_id', userId)

      if (annualPlanOnly) {
        query = query.or('step_type.eq.twelve_month,timeline.eq.year1')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        return NextResponse.json({ initiatives: data.map(mapInitiative) })
      }

      // If the filtered query returned nothing, try without the annual-plan filter.
      if (annualPlanOnly) {
        const { data: allData, error: allErr } = await supabase
          .from('strategic_initiatives')
          .select(COLUMNS)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (!allErr && allData && allData.length > 0) {
          return NextResponse.json({ initiatives: allData.map(mapInitiative) })
        }
      }
    }

    // Fallback: try by business_id.
    for (const bizId of businessIdsToTry) {
      const { data, error } = await supabase
        .from('strategic_initiatives')
        .select(COLUMNS)
        .eq('business_id', bizId)
        .order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        return NextResponse.json({ initiatives: data.map(mapInitiative) })
      }
    }

    return NextResponse.json({ initiatives: [] })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'strategic-initiatives' }, extra: { context: "[API /strategic-initiatives] Unexpected error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('strategic-initiatives', GetQuerySchema, getHandler)
