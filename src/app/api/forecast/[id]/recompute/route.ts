/**
 * Phase 44 D-12 — Forecast recompute (recovery hatch).
 *
 * Re-derives forecast_pl_lines from the CURRENT financial_forecasts.assumptions
 * row and writes via the atomic save_assumptions_and_materialize RPC. The
 * assumption JSONB is re-written unchanged (idempotent), so the only effect
 * is a fresh forecast_pl_lines materialization with a fresh computed_at.
 *
 * Useful for:
 *   1. Forecasts created before Phase 44 with stale or NULL computed_at.
 *   2. Derivation logic changes — deploy a new convertAssumptionsToPLLines
 *      and trigger this for affected forecasts.
 *   3. Manual remediation when ForecastReadService rejects a stale forecast
 *      via the runtime invariant (D-18).
 *
 * Auth: user must own / coach / belong to / be super_admin for the forecast's
 * business. Mirrors verifyBusinessAccess used elsewhere.
 *
 * Request body: empty.
 * Response (200): { success: true, forecast_id, computed_at, lines_count }.
 */

import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { convertAssumptionsToPLLines } from '@/app/finances/forecast/services/assumptions-to-pl-lines'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: forecastId } = await params
    if (!forecastId) {
      return NextResponse.json({ error: 'Forecast ID is required' }, { status: 400 })
    }

    // ── Load forecast (with the fields needed to re-derive pl_lines) ──────
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select(
        'id, business_id, fiscal_year, forecast_start_month, forecast_end_month, forecast_duration, assumptions',
      )
      .eq('id', forecastId)
      .maybeSingle()

    if (forecastError) {
      return NextResponse.json(
        { error: 'Failed to load forecast', details: forecastError.message },
        { status: 500 },
      )
    }
    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    // ── Access check ──────────────────────────────────────────────────────
    // financial_forecasts.business_id is a business_profiles.id; resolve to
    // both businesses.id and business_profiles.id (Phase 21 dual-ID system).
    const ids = await resolveBusinessIds(supabase, forecast.business_id as string)

    // Owner / coach via the businesses row.
    const { data: bizRow } = await supabase
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .in('id', ids.all)
      .limit(1)
      .maybeSingle()

    const isOwner = bizRow?.owner_id === user.id
    const isAssignedCoach = bizRow?.assigned_coach_id === user.id

    let isMember = false
    if (!isOwner && !isAssignedCoach) {
      const { data: member } = await supabase
        .from('business_users')
        .select('id')
        .in('business_id', ids.all)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      isMember = !!member
    }

    let isAdmin = false
    if (!isOwner && !isAssignedCoach && !isMember) {
      const { data: roleRow } = await supabase
        .from('system_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      isAdmin = roleRow?.role === 'super_admin' || roleRow?.role === 'coach'
    }

    if (!isOwner && !isAssignedCoach && !isMember && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ── Re-derive pl_lines from current assumptions ───────────────────────
    const assumptions = forecast.assumptions ?? {}

    // Read existing pl_lines so the converter can preserve coach overrides
    // and stable sort_order — same pattern as the wizard generate route.
    const { data: existingPLLines } = await supabase
      .from('forecast_pl_lines')
      .select('*')
      .eq('forecast_id', forecastId)
      .order('sort_order', { ascending: true })

    const generatedLines = convertAssumptionsToPLLines({
      assumptions: assumptions as any,
      forecastStartMonth: forecast.forecast_start_month as string,
      forecastEndMonth: forecast.forecast_end_month as string,
      fiscalYear: forecast.fiscal_year as number,
      forecastDuration: (forecast.forecast_duration as number) || 1,
      existingLines: (existingPLLines as any) || [],
    })

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

    // ── Atomic save + materialize ─────────────────────────────────────────
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'save_assumptions_and_materialize',
      {
        p_forecast_id: forecastId,
        p_assumptions: assumptions,
        p_pl_lines: rpcPLLines,
      },
    )

    if (rpcError) {
      console.error('[forecast/recompute] Atomic recompute failed:', rpcError)
      return NextResponse.json(
        {
          error: `Recompute failed: ${rpcError.message}`,
          code: (rpcError as { code?: string }).code,
        },
        { status: 500 },
      )
    }

    const result = rpcResult as
      | { forecast_id: string; computed_at: string; lines_count: number }
      | null

    return NextResponse.json({
      success: true,
      forecast_id: result?.forecast_id ?? forecastId,
      computed_at: result?.computed_at ?? null,
      lines_count: result?.lines_count ?? generatedLines.length,
    })
  } catch (error) {
    console.error('[forecast/recompute] Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Internal server error', detail: message },
      { status: 500 },
    )
  }
}
