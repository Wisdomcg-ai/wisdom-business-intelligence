import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { convertAssumptionsToPLLines } from '@/app/finances/forecast/services/assumptions-to-pl-lines'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
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
    const ids = await resolveBusinessIds(supabase, businessId)
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

    let resultForecastId: string

    if (forecastId && !createNew) {
      // UPDATE existing forecast
      const { data: updated, error: updateError } = await supabase
        .from('financial_forecasts')
        .update(forecastData)
        .eq('id', forecastId)
        .select('id')
        .single()

      if (updateError) {
        console.error('[wizard-v4/generate] Update error:', updateError)
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
        console.error('[wizard-v4/generate] Locked-insert error:', rpcError)
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
    let plLinesGenerated = 0
    let computedAt: string | null = null
    if (assumptions) {
      const { data: existingPLLines } = await supabase
        .from('forecast_pl_lines')
        .select('*')
        .eq('forecast_id', resultForecastId)
        .order('sort_order', { ascending: true })

      const generatedLines = convertAssumptionsToPLLines({
        assumptions,
        forecastStartMonth: forecastData.forecast_start_month as string,
        forecastEndMonth: forecastData.forecast_end_month as string,
        fiscalYear,
        forecastDuration: forecastDuration || 1,
        existingLines: existingPLLines || [],
      })

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
        console.error('[wizard-v4/generate] Atomic save failed:', rpcError)
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
    console.error('[wizard-v4/generate] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
