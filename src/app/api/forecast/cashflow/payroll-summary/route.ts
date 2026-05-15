import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'

export const dynamic = 'force-dynamic'

/**
 * GET /api/forecast/cashflow/payroll-summary?forecast_id=xxx
 *
 * Returns the forecast_payroll_summary row for this forecast, which the
 * cashflow engine uses to correctly time wages, PAYG WH, and super payments.
 *
 * Returns { data: null } if no summary exists (e.g. forecast was built
 * without the payroll wizard step).
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

    // Resolve business_id from forecast for section-permission gate
    const { data: forecastRow } = await supabase
      .from('financial_forecasts')
      .select('business_id')
      .eq('id', forecastId)
      .maybeSingle()

    if (forecastRow?.business_id) {
      // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
      const _sectionVerdict = await requireSectionPermission(
        supabase,            // auth-bound client (assigned from createRouteHandlerClient() above)
        user.id,
        forecastRow.business_id,
        'finances',
      )
      const _sectionBlocked = enforceSectionPermission(
        _sectionVerdict,
        'finances',
        'api/forecast/cashflow/payroll-summary',
        user.id,
        forecastRow.business_id,
      )
      if (_sectionBlocked) return _sectionBlocked
    }

    const { data, error } = await supabase
      .from('forecast_payroll_summary')
      .select('*')
      .eq('forecast_id', forecastId)
      .maybeSingle()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'forecast/cashflow/payroll-summary' }, extra: { context: "[Payroll Summary] Error" } } as any)
      return NextResponse.json({ error: 'Failed to load payroll summary' }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? null })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'forecast/cashflow/payroll-summary' }, extra: { context: "[Payroll Summary] Error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
