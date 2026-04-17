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

const DEFAULT_SETTINGS = {
  use_explicit_accounts: false,
  bank_account_ids: [] as string[],
  retained_earnings_account_id: null,
  current_year_earnings_account_id: null,
  gst_method: 'Accrual' as 'Accrual' | 'Cash',
  gst_rate: 0.10,
  gst_collected_account_id: null,
  gst_paid_account_id: null,
  gst_schedule: 'quarterly_bas_au',
  wages_expense_account_id: null,
  payg_wh_rate: null,
  payg_wh_liability_account_id: null,
  payg_wh_schedule: 'quarterly_bas_au',
  super_expense_account_id: null,
  super_payable_account_id: null,
  super_rate: 0.115,
  super_schedule: 'quarterly_super_au',
  depreciation_expense_account_id: null,
  depreciation_accumulated_account_ids: [] as string[],
  debtors_account_id: null,
  creditors_account_id: null,
  company_tax_rate: 0.25,
  company_tax_liability_account_id: null,
  company_tax_schedule: 'quarterly_payg_instalment',
}

/**
 * GET /api/forecast/cashflow/settings?forecast_id=xxx
 *
 * Returns the cashflow_settings row for this forecast. If no row exists,
 * returns defaults without creating one — so the UI can show the settings
 * panel even for forecasts that haven't opted into explicit accounts yet.
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

    // Look up forecast to get business_id + verify access
    const { data: forecast } = await supabase
      .from('financial_forecasts')
      .select('id, business_id')
      .eq('id', forecastId)
      .maybeSingle()

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    // forecast.business_id may be businesses.id or business_profiles.id — resolve
    const ids = await resolveBusinessIds(supabase, forecast.business_id)
    const canonicalBusinessId = ids.bizId

    const hasAccess = await verifyBusinessAccess(user.id, canonicalBusinessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { data: row, error } = await supabase
      .from('cashflow_settings')
      .select('*')
      .eq('forecast_id', forecastId)
      .maybeSingle()

    if (error) {
      console.error('[Cashflow Settings] GET error:', error)
      return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
    }

    if (!row) {
      return NextResponse.json({
        data: {
          ...DEFAULT_SETTINGS,
          forecast_id: forecastId,
          business_id: canonicalBusinessId,
        },
        is_default: true,
      })
    }

    return NextResponse.json({ data: row, is_default: false })
  } catch (err) {
    console.error('[Cashflow Settings] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/forecast/cashflow/settings
 *
 * Upserts the cashflow_settings row for a forecast.
 * Body: { forecast_id, ...all settings fields }
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { forecast_id, ...settings } = body

    if (!forecast_id) {
      return NextResponse.json({ error: 'forecast_id is required' }, { status: 400 })
    }

    // Resolve business_id from the forecast + verify access
    const { data: forecast } = await supabase
      .from('financial_forecasts')
      .select('id, business_id')
      .eq('id', forecast_id)
      .maybeSingle()

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    const ids = await resolveBusinessIds(supabase, forecast.business_id)
    const canonicalBusinessId = ids.bizId

    const hasAccess = await verifyBusinessAccess(user.id, canonicalBusinessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Merge defaults so partial updates work
    const row = {
      ...DEFAULT_SETTINGS,
      ...settings,
      forecast_id,
      business_id: canonicalBusinessId,
      updated_at: new Date().toISOString(),
    }

    // Drop any fields that aren't columns of cashflow_settings
    // (explicitly only keep known fields to avoid schema errors on future additions)
    const allowedFields = [
      'forecast_id', 'business_id', 'use_explicit_accounts',
      'bank_account_ids', 'retained_earnings_account_id', 'current_year_earnings_account_id',
      'gst_method', 'gst_rate', 'gst_collected_account_id', 'gst_paid_account_id', 'gst_schedule',
      'wages_expense_account_id', 'payg_wh_rate', 'payg_wh_liability_account_id', 'payg_wh_schedule',
      'super_expense_account_id', 'super_payable_account_id', 'super_rate', 'super_schedule',
      'depreciation_expense_account_id', 'depreciation_accumulated_account_ids',
      'debtors_account_id', 'creditors_account_id',
      'company_tax_rate', 'company_tax_liability_account_id', 'company_tax_schedule',
      'updated_at',
    ]
    const clean: Record<string, any> = {}
    for (const key of allowedFields) {
      if (row[key as keyof typeof row] !== undefined) clean[key] = row[key as keyof typeof row]
    }

    const { data, error } = await supabase
      .from('cashflow_settings')
      .upsert(clean, { onConflict: 'forecast_id' })
      .select()
      .single()

    if (error) {
      console.error('[Cashflow Settings] POST error:', error)
      return NextResponse.json({ error: 'Failed to save settings', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, success: true })
  } catch (err) {
    console.error('[Cashflow Settings] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
