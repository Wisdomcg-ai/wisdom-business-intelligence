/**
 * POST /api/plan-snapshots — B8 (Phase 68)
 *
 * Saves an operator-triggered plan snapshot from the Step 4 wizard. Client
 * sends ONLY the Step-4 partial; the route fetches and merges
 * vision/mission/values/SWOT/companyName/ownerGoals server-side so the
 * snapshot shape matches scripts/68-08-armstrong-plan-snapshot-baseline.mjs
 * exactly.
 *
 * Schema notes (from Phase 68 Wave 1 discoveries):
 *   - plan_snapshots.business_id stores business_profiles.id
 *   - strategy_data is keyed by user_id (business_id null on existing rows)
 *   - swot_items uses singular categories ('strength','weakness','opportunity','threat')
 *     and a `title` field (not `content`); joined via swot_analyses.id
 *   - businesses.name resolved via business_profiles.business_id
 */

import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'
import type { OnePagePlanData } from '@/app/one-page-plan/types'

export const dynamic = 'force-dynamic'

interface RequestBody {
  business_id: string
  label?: string
  step4_plan_data: Partial<OnePagePlanData>
}

const PostBodySchema = z
  .object({
    business_id: z.string(),
    label: z.string().optional(),
    step4_plan_data: z.object({}).passthrough(),
  })
  .passthrough()

async function postHandler(req: Request) {
  try {
    const supabase = await createRouteHandlerClient()

    // 1. Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Validate body shape
    const body = await req.json().catch(() => null) as RequestBody | null
    if (!body || typeof body.business_id !== 'string' || !body.step4_plan_data) {
      return NextResponse.json(
        { ok: false, error: 'business_id and step4_plan_data required' },
        { status: 400 },
      )
    }
    const { business_id, step4_plan_data, label: labelOverride } = body

    // 3. Authorization gate — RLS-backed read of business_profiles confirms access
    const { data: bp, error: bpErr } = await supabase
      .from('business_profiles')
      .select('id, business_id, company_name, owner_info')
      .eq('id', business_id)
      .maybeSingle()
    if (bpErr) {
      Sentry.captureException(bpErr, { tags: { route: 'plan-snapshots' } })
      return NextResponse.json({ ok: false, error: bpErr.message }, { status: 500 })
    }
    if (!bp) {
      return NextResponse.json({ ok: false, error: 'business not found or access denied' }, { status: 404 })
    }
    const businessesIdLink = (bp as { business_id?: string }).business_id

    // 4. Server-side composition — mirrors scripts/68-08-armstrong-plan-snapshot-baseline.mjs
    //    SWOT is a 2-step read because swot_items category values are singular
    //    and swot_analyses owns the per-business linkage.
    const [strategyRes, swotAnalysesRes, businessesRes] = await Promise.all([
      supabase
        .from('strategy_data')
        .select('vision_mission')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('swot_analyses')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      businessesIdLink
        ? supabase
            .from('businesses')
            .select('name')
            .eq('id', businessesIdLink)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as { data: { name: string } | null; error: null }),
    ])

    let swotItems: Array<{ category: string; title: string }> = []
    if (swotAnalysesRes.data?.id) {
      const { data: items } = await supabase
        .from('swot_items')
        .select('category, title')
        .eq('swot_analysis_id', swotAnalysesRes.data.id)
      swotItems = (items as Array<{ category: string; title: string }>) || []
    }

    const vm = (strategyRes.data?.vision_mission || {}) as {
      vision_statement?: string
      mission_statement?: string
      core_values?: string[]
    }
    const businessName = (businessesRes.data?.name as string | undefined) || (bp as { company_name?: string }).company_name || ''
    const ownerInfo = ((bp as { owner_info?: Record<string, unknown> }).owner_info || {}) as Record<string, unknown>

    const ownerGoals: OnePagePlanData['ownerGoals'] = {
      desiredHoursPerWeek: ownerInfo.desired_hours as number | undefined,
      currentHoursPerWeek: ownerInfo.current_hours as number | undefined,
      primaryGoal:         ownerInfo.primary_goal as string | undefined,
      timeHorizon:         ownerInfo.time_horizon as string | undefined,
      exitStrategy:        ownerInfo.exit_strategy as string | undefined,
    }

    // SWOT category values are singular — verified in Phase 68 Plan 06
    const groupSwot = (cat: 'strength' | 'weakness' | 'opportunity' | 'threat'): string[] =>
      swotItems.filter(i => i.category === cat).map(i => i.title)

    // 5. Merge into final plan_data — step4_plan_data wins for any overlapping key
    const merged = {
      vision:        vm.vision_statement || '',
      mission:       vm.mission_statement || '',
      coreValues:    Array.isArray(vm.core_values) ? vm.core_values : [],
      strengths:     groupSwot('strength'),
      weaknesses:    groupSwot('weakness'),
      opportunities: groupSwot('opportunity'),
      threats:       groupSwot('threat'),
      companyName:   businessName,
      ownerGoals,
      ...step4_plan_data,
    } as OnePagePlanData

    // 6. Compute next version_number for this business
    const { data: maxRow, error: maxErr } = await supabase
      .from('plan_snapshots')
      .select('version_number')
      .eq('business_id', business_id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (maxErr) {
      Sentry.captureException(maxErr, { tags: { route: 'plan-snapshots' } })
      return NextResponse.json({ ok: false, error: maxErr.message }, { status: 500 })
    }
    const nextVersion = ((maxRow?.version_number as number | undefined) ?? 0) + 1

    const label = labelOverride || `Wizard snapshot ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

    // 7. Insert
    const { data: inserted, error: insErr } = await supabase
      .from('plan_snapshots')
      .insert({
        business_id,
        user_id: user.id,
        snapshot_type: 'goals_wizard_complete',
        version_number: nextVersion,
        plan_data: merged,
        label,
      })
      .select('id, version_number, label')
      .single()
    if (insErr) {
      Sentry.captureException(insErr, { tags: { route: 'plan-snapshots' } })
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      id: inserted.id,
      version_number: inserted.version_number,
      label: inserted.label,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error'
    Sentry.captureException(e, { tags: { route: 'plan-snapshots' } })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export const POST = withSchema('plan-snapshots', PostBodySchema, postHandler)
