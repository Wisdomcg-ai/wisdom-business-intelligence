import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/**
 * GET /api/forecast/cashflow/profiles?forecast_id=xxx
 * Returns all cashflow_account_profiles rows for the forecast.
 */
export async function GET(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const forecastId = new URL(request.url).searchParams.get('forecast_id')
    if (!forecastId) {
      return NextResponse.json({ error: 'forecast_id is required' }, { status: 400 })
    }

    // Verify access
    const { data: forecast } = await supabase
      .from('financial_forecasts')
      .select('id, business_id')
      .eq('id', forecastId)
      .maybeSingle()
    if (!forecast) return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })

    const ids = await resolveBusinessIds(supabase, forecast.business_id)
    const hasAccess = await verifyBusinessAccess(user.id, ids.bizId)
    if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const { data, error } = await supabase
      .from('cashflow_account_profiles')
      .select('*')
      .eq('forecast_id', forecastId)
      .order('account_code', { ascending: true })

    if (error) {
      console.error('[Cashflow Profiles] GET error:', error)
      return NextResponse.json({ error: 'Failed to load profiles' }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[Cashflow Profiles] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/forecast/cashflow/profiles
 *
 * Upsert a single account profile or delete it.
 * Body: { forecast_id, xero_account_id, account_code, account_name,
 *         cashflow_type (1-5), days?, distribution?, schedule_base_periods? }
 *
 * To clear a profile: POST with cashflow_type = null and the other fields
 * empty — the row will be deleted (reverts to default behaviour).
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      forecast_id,
      xero_account_id,
      account_code,
      account_name,
      cashflow_type,
      days,
      distribution,
      schedule_base_periods,
      delete: deleteFlag,
    } = body

    if (!forecast_id || !xero_account_id) {
      return NextResponse.json({ error: 'forecast_id and xero_account_id required' }, { status: 400 })
    }

    // Verify access
    const { data: forecast } = await supabase
      .from('financial_forecasts')
      .select('id, business_id')
      .eq('id', forecast_id)
      .maybeSingle()
    if (!forecast) return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })

    const ids = await resolveBusinessIds(supabase, forecast.business_id)
    const hasAccess = await verifyBusinessAccess(user.id, ids.bizId)
    if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    if (deleteFlag) {
      const { error } = await supabase
        .from('cashflow_account_profiles')
        .delete()
        .eq('forecast_id', forecast_id)
        .eq('xero_account_id', xero_account_id)
      if (error) return NextResponse.json({ error: 'Delete failed', detail: error.message }, { status: 500 })
      return NextResponse.json({ success: true, deleted: true })
    }

    if (typeof cashflow_type !== 'number' || cashflow_type < 1 || cashflow_type > 5) {
      return NextResponse.json({ error: 'cashflow_type must be 1-5' }, { status: 400 })
    }

    const row = {
      forecast_id,
      xero_account_id,
      account_code: account_code ?? null,
      account_name: account_name ?? null,
      cashflow_type,
      days: days ?? null,
      distribution: distribution ?? null,
      schedule_base_periods: schedule_base_periods ?? null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('cashflow_account_profiles')
      .upsert(row, { onConflict: 'forecast_id,xero_account_id' })
      .select()
      .single()

    if (error) {
      console.error('[Cashflow Profiles] POST error:', error)
      return NextResponse.json({ error: 'Upsert failed', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, success: true })
  } catch (err) {
    console.error('[Cashflow Profiles] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
