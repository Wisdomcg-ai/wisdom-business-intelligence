import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/forecast/cashflow/assumptions?forecast_id=...
 * Load cashflow assumptions for a forecast.
 */
export async function GET(request: NextRequest) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const forecastId = request.nextUrl.searchParams.get('forecast_id')
    if (!forecastId) {
      return NextResponse.json({ error: 'forecast_id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('cashflow_assumptions')
      .select('*')
      .eq('forecast_id', forecastId)
      .maybeSingle()

    if (error) {
      console.error('[Cashflow Assumptions] Error loading:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[Cashflow Assumptions] Error:', err)
    return NextResponse.json({ error: 'Failed to load cashflow assumptions' }, { status: 500 })
  }
}

/**
 * POST /api/forecast/cashflow/assumptions
 * Upsert cashflow assumptions for a forecast.
 */
export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { forecast_id, business_id, ...assumptions } = body

    if (!forecast_id || !business_id) {
      return NextResponse.json({ error: 'forecast_id and business_id are required' }, { status: 400 })
    }

    // Check if assumptions already exist
    const { data: existing } = await supabase
      .from('cashflow_assumptions')
      .select('id')
      .eq('forecast_id', forecast_id)
      .maybeSingle()

    let result
    if (existing) {
      // Update
      result = await supabase
        .from('cashflow_assumptions')
        .update({
          ...assumptions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()
    } else {
      // Insert
      result = await supabase
        .from('cashflow_assumptions')
        .insert({
          forecast_id,
          business_id,
          ...assumptions,
        })
        .select()
        .single()
    }

    if (result.error) {
      console.error('[Cashflow Assumptions] Upsert error:', result.error)
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: result.data })
  } catch (err) {
    console.error('[Cashflow Assumptions] Error:', err)
    return NextResponse.json({ error: 'Failed to save cashflow assumptions' }, { status: 500 })
  }
}
