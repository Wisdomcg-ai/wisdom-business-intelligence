import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { convertAssumptionsToPLLines } from '@/app/finances/forecast/services/assumptions-to-pl-lines'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

const PostBodySchema = z
  .object({
    businessId: z.string(),
    fiscalYear: z.number(),
    forecastDuration: z.number().optional(),
    forecastId: z.string().optional(),
    forecastName: z.string().optional(),
    createNew: z.boolean().optional(),
    isDraft: z.boolean().optional(),
    assumptions: z.unknown().optional(),
    summary: z.unknown().optional(),
  })
  .passthrough()

async function postHandler(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      businessId,
      fiscalYear,
      forecastDuration,
      forecastId,
      forecastName,
      createNew,
      isDraft,
      assumptions,
      summary,
    } = body

    if (!businessId || !fiscalYear) {
      return NextResponse.json(
        { error: 'businessId and fiscalYear are required' },
        { status: 400 }
      )
    }

    // Verify user has access to this business
    // businessId is businesses.id — check ownership, team membership, or coach/admin role
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', businessId)
      .maybeSingle()

    if (bizError || !business) {
      return NextResponse.json(
        { error: 'Business not found or access denied' },
        { status: 403 }
      )
    }

    const isOwner = business.owner_id === user.id
    if (!isOwner) {
      // Check team membership
      const { data: teamMember } = await supabase
        .from('business_users')
        .select('id')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (!teamMember) {
        // Check coach/admin
        const { data: roleData } = await supabase
          .from('system_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()

        const isCoachOrAdmin = roleData?.role === 'coach' || roleData?.role === 'super_admin'
        if (!isCoachOrAdmin) {
          return NextResponse.json(
            { error: 'Business not found or access denied' },
            { status: 403 }
          )
        }
      }
    }

    // financial_forecasts.business_id FK references business_profiles(id),
    // but the wizard passes businesses.id — resolve both IDs
    const ids = await resolveBusinessProfileIds(supabase, businessId)
    const profileId = ids.profileId

    // Build the forecast data to upsert
    const year1 = summary?.year1 || {}
    const forecastData: Record<string, unknown> = {
      business_id: profileId,
      user_id: business.owner_id || user.id,
      fiscal_year: fiscalYear,
      name: forecastName || `FY${fiscalYear} Forecast`,
      year_type: 'FY',
      actual_start_month: `${fiscalYear - 2}-07`,
      actual_end_month: `${fiscalYear - 1}-06`,
      forecast_start_month: `${fiscalYear - 1}-07`,
      forecast_end_month: `${fiscalYear + (forecastDuration || 1) - 1}-06`,
      revenue_goal: year1.revenue || 0,
      gross_profit_goal: year1.grossProfit || 0,
      net_profit_goal: year1.netProfit || 0,
      goal_source: 'wizard_v4',
      assumptions: assumptions || null,
      forecast_duration: forecastDuration || 1,
      wizard_state: summary || null,
      updated_at: new Date().toISOString(),
    }

    // If not a draft (i.e., final generate), mark as completed
    if (!isDraft) {
      forecastData.is_completed = true
      forecastData.completed_at = new Date().toISOString()
    }

    // ── Phase A (CFO-only clients) — refuse to finalize an EMPTY forecast ──
    //
    // Derive the P&L lines BEFORE any row is created or activated. A final
    // generate whose assumptions carry no revenue/COGS/OpEx lines (the
    // failed-seed wizard trap: Dragon Roofing 2026-04/2026-08, Efficient
    // Living 2026-07) used to activate a 0-line forecast that the monthly
    // report then auto-picked as a silent $0 budget and the cashflow page
    // choked on. Draft saves stay allowed — a mid-wizard draft is
    // legitimately incomplete.
    let generatedLines: ReturnType<typeof convertAssumptionsToPLLines> | null = null
    if (assumptions && !isDraft) {
      let existingPLLines: Parameters<typeof convertAssumptionsToPLLines>[0]['existingLines'] = []
      if (forecastId && !createNew) {
        const { data } = await supabase
          .from('forecast_pl_lines')
          .select('*')
          .eq('forecast_id', forecastId)
          .order('sort_order', { ascending: true })
        existingPLLines = data || []
      }

      generatedLines = convertAssumptionsToPLLines({
        assumptions,
        forecastStartMonth: forecastData.forecast_start_month as string,
        forecastEndMonth: forecastData.forecast_end_month as string,
        fiscalYear,
        forecastDuration: forecastDuration || 1,
        existingLines: existingPLLines,
      })

      if (!isDraft && generatedLines.length === 0) {
        return NextResponse.json(
          {
            error:
              'This forecast has no P&L lines to generate — revenue, COGS and operating expense lines are all empty. ' +
              'Use "Refresh from Xero" on the Prior Year step (or add lines manually) before generating.',
            code: 'EMPTY_FORECAST',
          },
          { status: 422 },
        )
      }
    }

    let resultForecastId: string

    // ── PR-A (M5) — drafts are saves, not publishes ────────────────────────
    //
    // A draft autosave used to route through create_active_forecast_locked,
    // which DEACTIVATED the business's approved forecast and installed a
    // 3-second-old, half-configured draft as the live budget the monthly
    // report varies against. Draft creates now insert an is_active=false row
    // and never touch the active forecast; only a final Generate activates.
    if (isDraft && !forecastId) {
      const { data: draftRow, error: draftError } = await supabase
        .from('financial_forecasts')
        .insert({ ...forecastData, forecast_type: 'forecast', is_active: false })
        .select('id')
        .single()

      if (draftError || !draftRow) {
        Sentry.captureException(draftError, { tags: { route: 'forecast-wizard-v4/generate' }, extra: { context: '[wizard-v4/generate] Draft insert error' } } as any)
        return NextResponse.json(
          { error: 'Failed to create draft forecast', details: draftError?.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        forecastId: draftRow.id,
        plLinesGenerated: 0,
        computed_at: null,
        is_draft: true,
      })
    }

    if (forecastId && !createNew) {
      // UPDATE existing forecast
      const { data: updated, error: updateError } = await supabase
        .from('financial_forecasts')
        .update(forecastData)
        .eq('id', forecastId)
        .select('id')
        .single()

      if (updateError) {
        Sentry.captureException(updateError, { tags: { route: 'forecast-wizard-v4/generate' }, extra: { context: "[wizard-v4/generate] Update error" } } as any)
        return NextResponse.json(
          { error: 'Failed to update forecast', details: updateError.message },
          { status: 500 }
        )
      }

      resultForecastId = updated.id
    } else {
      // P0-15 — atomic deactivate+insert under pg_advisory_xact_lock keyed on
      // (business, fiscal_year). Two concurrent POSTs to /generate could
      // otherwise both deactivate-then-insert with overlapping windows,
      // leaving multiple is_active=true rows that the partial unique index
      // unique_active_forecast_per_fy fails to catch (it only fires when the
      // 2nd INSERT physically commits AFTER the 1st). The RPC runs both
      // statements in a single transaction so the lock holds across both.
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'create_active_forecast_locked',
        {
          p_business_id: profileId,
          p_fiscal_year: fiscalYear,
          p_forecast_type: 'forecast',
          p_row: forecastData as Record<string, unknown>,
        }
      )

      if (rpcError || !rpcData?.id) {
        Sentry.captureException(rpcError, { tags: { route: 'forecast-wizard-v4/generate' }, extra: { context: "[wizard-v4/generate] Locked-insert error" } } as any)
        return NextResponse.json(
          { error: 'Failed to create forecast', details: rpcError?.message ?? 'no id returned' },
          { status: 500 }
        )
      }

      resultForecastId = rpcData.id as string
    }

    // ── Phase 44 D-12 — atomic save + materialize via Postgres RPC ─────────
    //
    // Replaces the legacy serial UPDATE-then-INSERT (which had silent-failure
    // catch-blocks: assumption saved but pl_lines silently failed → downstream
    // consumers saw stale data forever). The RPC writes assumptions AND
    // forecast_pl_lines in a single transaction — derivation failure rolls
    // back the assumption write. See migration
    // supabase/migrations/20260429000002_save_assumptions_and_materialize_rpc.sql.
    // PR-A (M5): drafts never materialize. The old unconditional materialize
    // meant every 3-second autosave overwrote the live forecast's P&L lines
    // with the half-configured draft state (per-account clobber). Lines are
    // derived only on a final Generate; the D-18 freshness invariant is
    // log-only by default, and Generate recomputes computed_at.
    let plLinesGenerated = 0
    let computedAt: string | null = null
    if (assumptions && generatedLines && !isDraft) {
      // Lines were derived above (pre-write emptiness gate). For the update
      // path the existing rows were read via `forecastId` — identical to
      // `resultForecastId`; for the create path the forecast is brand-new and
      // has no rows, matching the previous read-after-create behaviour.

      // Shape pl_lines for the RPC — the RPC owns the INSERT (and the DELETE
      // of existing is_manual=false rows), so we pass plain objects, not the
      // legacy id-keyed upsert payload.
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

      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'save_assumptions_and_materialize',
        {
          p_forecast_id: resultForecastId,
          p_assumptions: assumptions,
          p_pl_lines: rpcPLLines,
        },
      )

      if (rpcError) {
        Sentry.captureException(rpcError, { tags: { route: 'forecast-wizard-v4/generate' }, extra: { context: "[wizard-v4/generate] Atomic save failed" } } as any)
        return NextResponse.json(
          {
            error: `Atomic save failed: ${rpcError.message}`,
            code: (rpcError as { code?: string }).code,
          },
          { status: 500 },
        )
      }

      const result = rpcResult as
        | { forecast_id: string; computed_at: string; lines_count: number }
        | null
      if (result) {
        plLinesGenerated = result.lines_count ?? generatedLines.length
        computedAt = result.computed_at ?? null
      }
    }

    return NextResponse.json({
      success: true,
      forecastId: resultForecastId,
      plLinesGenerated,
      computed_at: computedAt,
    })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'forecast-wizard-v4/generate' }, extra: { context: "[wizard-v4/generate] Error" } } as any)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withSchema('forecast-wizard-v4/generate', PostBodySchema, postHandler)
