import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'

export const dynamic = 'force-dynamic'

/**
 * GET /api/forecast/cashflow/assumptions?forecast_id=xxx
 *
 * Reads the cashflow assumptions from financial_forecasts.assumptions.cashflow
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const forecastId = new URL(request.url).searchParams.get('forecast_id')
    if (!forecastId) {
      return NextResponse.json({ error: 'forecast_id is required' }, { status: 400 })
    }

    const { data: forecast, error } = await supabase
      .from('financial_forecasts')
      .select('business_id, assumptions')
      .eq('id', forecastId)
      .maybeSingle()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'forecast/cashflow/assumptions' }, extra: { context: "[Cashflow Assumptions] Error" } } as any)
      return NextResponse.json({ error: 'Failed to fetch assumptions' }, { status: 500 })
    }

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      supabase,            // auth-bound client (assigned from createRouteHandlerClient() above)
      user.id,
      (forecast as any).business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/forecast/cashflow/assumptions',
      user.id,
      (forecast as any).business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    const cashflow = forecast.assumptions?.cashflow ?? null
    return NextResponse.json({ data: cashflow })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'forecast/cashflow/assumptions' }, extra: { context: "[Cashflow Assumptions] Error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/forecast/cashflow/assumptions
 *
 * Saves cashflow assumptions into financial_forecasts.assumptions.cashflow
 * Body: { forecast_id, business_id, ...cashflow assumptions }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { forecast_id, business_id, ...cashflowAssumptions } = body

    if (!forecast_id) {
      return NextResponse.json({ error: 'forecast_id is required' }, { status: 400 })
    }

    // Read existing assumptions to merge (include business_id for section-permission gate)
    const { data: forecast, error: readError } = await supabase
      .from('financial_forecasts')
      .select('business_id, assumptions')
      .eq('id', forecast_id)
      .maybeSingle()

    if (readError || !forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    const existingAssumptions = forecast.assumptions ?? {}
    const updatedAssumptions = {
      ...existingAssumptions,
      cashflow: cashflowAssumptions,
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    // Use business_id from body if provided; fall back to the forecast's business_id.
    const _bizId = business_id || (forecast as any).business_id
    if (_bizId) {
      const _sectionVerdict = await requireSectionPermission(
        supabase,            // auth-bound client (assigned from createRouteHandlerClient() above)
        user.id,
        _bizId,
        'finances',
      )
      const _sectionBlocked = enforceSectionPermission(
        _sectionVerdict,
        'finances',
        'api/forecast/cashflow/assumptions',
        user.id,
        _bizId,
      )
      if (_sectionBlocked) return _sectionBlocked
    }

    const { error: updateError } = await supabase
      .from('financial_forecasts')
      .update({ assumptions: updatedAssumptions })
      .eq('id', forecast_id)

    if (updateError) {
      Sentry.captureException(updateError, { tags: { route: 'forecast/cashflow/assumptions' }, extra: { context: "[Cashflow Assumptions] Update error" } } as any)
      return NextResponse.json({ error: 'Failed to save assumptions' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'forecast/cashflow/assumptions' }, extra: { context: "[Cashflow Assumptions] Error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
