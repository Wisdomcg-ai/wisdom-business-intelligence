/**
 * Phase 59 Plan 02 — POST /api/forecast/seed-from-prior
 *
 * Seeds a target-FY forecast from the prior FY's forecast data.
 * Thin orchestration layer:
 *   1. Auth  (mirrors /api/forecast-wizard-v4/generate — businessId-first pattern)
 *   2. Validate body
 *   3. Load prior FY forecast (404 if absent)
 *   4. Load target FY forecast row (must exist — getOrCreateForecast ran on page load)
 *   5. Idempotency gate via isForecastSeedable
 *   6. Transform via 59-01 pure service
 *   7. UNCONDITIONALLY persist forecast_duration on target row (decision D3)
 *   8. Generate pl_lines via convertAssumptionsToPLLines
 *   9. Atomic write via save_assumptions_and_materialize RPC
 *
 * Does NOT write to the subscriptions budget table — it is not year-scoped and
 * carries forward automatically (research §Q4).
 *
 * Sentry only for errors — no console logging (post-Phase-46 SEC-07 norm).
 */

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { seedForecastFromPrior, isForecastSeedable } from '@/lib/services/forecast-seed-service'
import { convertAssumptionsToPLLines } from '@/app/finances/forecast/services/assumptions-to-pl-lines'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// VALID-04 (observe mode): seed a target-FY forecast from the prior FY.
const SeedFromPriorPostSchema = z
  .object({
    businessId: z.string(),
    targetFiscalYear: z.number(),
  })
  .passthrough()

async function postHandler(request: Request) {
  try {
    const supabase = await createRouteHandlerClient()

    // ── 1. Auth — getUser first (Phase 46 ordering: 401 before 403) ─────────
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 2. Validate body ──────────────────────────────────────────────────────
    const body = await request.json().catch(() => ({}))
    const { businessId, targetFiscalYear } = body as {
      businessId?: string
      targetFiscalYear?: number
    }

    if (!businessId || !targetFiscalYear) {
      return NextResponse.json(
        { error: 'businessId and targetFiscalYear are required' },
        { status: 400 },
      )
    }

    // ── 3. Auth — businessId-first pattern, mirrors generate route exactly ────
    // (verbatim copy from /api/forecast-wizard-v4/generate/route.ts:38-79)
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', businessId)
      .maybeSingle()

    if (bizError || !business) {
      return NextResponse.json(
        { error: 'Business not found or access denied' },
        { status: 403 },
      )
    }

    const isOwner = business.owner_id === user.id
    if (!isOwner) {
      const { data: teamMember } = await supabase
        .from('business_users')
        .select('id')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (!teamMember) {
        const { data: roleData } = await supabase
          .from('system_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()

        const isCoachOrAdmin =
          roleData?.role === 'coach' || roleData?.role === 'super_admin'
        if (!isCoachOrAdmin) {
          return NextResponse.json(
            { error: 'Business not found or access denied' },
            { status: 403 },
          )
        }
      }
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      supabase,            // auth-bound client (assigned from createRouteHandlerClient() above)
      user.id,
      businessId,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/forecast/seed-from-prior',
      user.id,
      businessId,
    )
    if (_sectionBlocked) return _sectionBlocked

    // ── 4. Resolve dual-IDs for financial_forecasts queries ───────────────────
    // financial_forecasts.business_id is business_profiles.id (research pitfall 3)
    const ids = await resolveBusinessProfileIds(supabase, businessId)

    // ── 5. Load prior FY forecast ─────────────────────────────────────────────
    const priorFY = targetFiscalYear - 1
    const { data: priorForecast } = await supabase
      .from('financial_forecasts')
      .select('id, assumptions, fiscal_year, forecast_duration')
      .in('business_id', ids.all)
      .eq('fiscal_year', priorFY)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!priorForecast?.assumptions) {
      return NextResponse.json(
        { error: `No prior FY${priorFY} forecast found` },
        { status: 404 },
      )
    }

    // ── 6. Load target FY forecast row ────────────────────────────────────────
    const { data: targetForecast } = await supabase
      .from('financial_forecasts')
      .select('id, assumptions, forecast_start_month, forecast_end_month')
      .in('business_id', ids.all)
      .eq('fiscal_year', targetFiscalYear)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!targetForecast) {
      return NextResponse.json(
        { error: `No FY${targetFiscalYear} forecast row found. Visit the page first.` },
        { status: 404 },
      )
    }

    // ── 7. Idempotency gate ───────────────────────────────────────────────────
    // Count pl_lines for target forecast (exact count, head query)
    const { count: targetPlLineCount } = await supabase
      .from('forecast_pl_lines')
      .select('id', { count: 'exact', head: true })
      .eq('forecast_id', targetForecast.id)

    if (!isForecastSeedable(targetForecast.assumptions, targetPlLineCount ?? 0)) {
      return NextResponse.json(
        { error: 'Target forecast already has data. Seed refused.' },
        { status: 409 },
      )
    }

    // ── 8. Transform via 59-01 pure service ───────────────────────────────────
    // NOTE: SeedResult = { assumptions, forecastDuration } — NO plLines field.
    // Do NOT load priorPlLines from forecast_pl_lines — the seed service
    // transforms assumptions only (per critical decision 2).
    const priorDuration = (priorForecast.forecast_duration ?? 1) as number
    const { assumptions: seededAssumptions, forecastDuration } = seedForecastFromPrior(
      priorForecast.assumptions,
      targetFiscalYear,
      priorDuration,
    )

    // ── 9. UNCONDITIONALLY persist forecast_duration on target row ────────────
    // Decision D3: forecastDuration === priorDuration by construction from 59-01,
    // but we still write it so the target row reflects the prior horizon
    // explicitly. The UPDATE fires once on every success path — tests pin this
    // contract (Group F spy assertion).
    const { error: durErr } = await supabase
      .from('financial_forecasts')
      .update({ forecast_duration: forecastDuration })
      .eq('id', targetForecast.id)

    if (durErr) {
      Sentry.captureException(durErr, {
        tags: { route: 'forecast/seed-from-prior' },
        extra: { context: '[forecast/seed-from-prior] forecast_duration update failed' },
      } as any)
      return NextResponse.json(
        { error: `forecast_duration update failed: ${durErr.message}` },
        { status: 500 },
      )
    }

    // ── 10. Generate pl_lines via existing transformer ────────────────────────
    // SEPARATE call — do not expect plLines from SeedResult (it does not exist).
    // Pass seeded assumptions so month keys are already shifted.
    const generatedLines = convertAssumptionsToPLLines({
      assumptions: seededAssumptions,
      forecastStartMonth: targetForecast.forecast_start_month as string,
      forecastEndMonth: targetForecast.forecast_end_month as string,
      fiscalYear: targetFiscalYear,
      forecastDuration,
      existingLines: [],
    })

    // ── 11. Shape rows for RPC (mirrors generate/route.ts verbatim) ───────────
    const rpcPLLines = generatedLines.map((line, i) => ({
      account_name: line.account_name,
      account_code: line.account_code ?? null,
      category: line.category,
      subcategory: line.subcategory ?? null,
      sort_order: line.sort_order ?? i,
      actual_months: line.actual_months || {},
      forecast_months: line.forecast_months || {},
      is_from_xero: line.is_from_xero || false,
    }))

    // ── 12. Atomic write via save_assumptions_and_materialize RPC ─────────────
    // research §Don't Hand-Roll: serial writes have silent-failure risk
    const { error: rpcError } = await supabase.rpc('save_assumptions_and_materialize', {
      p_forecast_id: targetForecast.id,
      p_assumptions: seededAssumptions,
      p_pl_lines: rpcPLLines,
    })

    if (rpcError) {
      Sentry.captureException(rpcError, {
        tags: { route: 'forecast/seed-from-prior' },
        extra: { context: '[forecast/seed-from-prior] Atomic save failed' },
      } as any)
      return NextResponse.json(
        {
          error: `Seed failed: ${rpcError.message}`,
          code: (rpcError as { code?: string }).code,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, forecastId: targetForecast.id })
  } catch (err: any) {
    Sentry.captureException(err, {
      tags: { route: 'forecast/seed-from-prior' },
      extra: { context: '[forecast/seed-from-prior] Unexpected error' },
    } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withSchema('forecast/seed-from-prior', SeedFromPriorPostSchema, postHandler)
