import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'

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

    const { data, error } = await supabase
      .from('forecast_payroll_summary')
      .select('*')
      .eq('forecast_id', forecastId)
      .maybeSingle()

    if (error) {
      console.error('[Payroll Summary] Error:', error)
      return NextResponse.json({ error: 'Failed to load payroll summary' }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? null })
  } catch (err) {
    console.error('[Payroll Summary] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
