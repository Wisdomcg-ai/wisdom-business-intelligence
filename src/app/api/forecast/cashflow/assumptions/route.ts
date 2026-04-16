import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'

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
      .select('assumptions')
      .eq('id', forecastId)
      .maybeSingle()

    if (error) {
      console.error('[Cashflow Assumptions] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch assumptions' }, { status: 500 })
    }

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    const cashflow = forecast.assumptions?.cashflow ?? null
    return NextResponse.json({ data: cashflow })
  } catch (err) {
    console.error('[Cashflow Assumptions] Error:', err)
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

    // Read existing assumptions to merge
    const { data: forecast, error: readError } = await supabase
      .from('financial_forecasts')
      .select('assumptions')
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

    const { error: updateError } = await supabase
      .from('financial_forecasts')
      .update({ assumptions: updatedAssumptions })
      .eq('id', forecast_id)

    if (updateError) {
      console.error('[Cashflow Assumptions] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to save assumptions' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Cashflow Assumptions] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
