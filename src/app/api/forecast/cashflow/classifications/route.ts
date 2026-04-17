import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import { autoClassify } from '@/lib/cashflow/statement'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/**
 * GET /api/forecast/cashflow/classifications?forecast_id=xxx
 * Returns all four-list classifications for the forecast.
 */
export async function GET(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const forecastId = new URL(request.url).searchParams.get('forecast_id')
    if (!forecastId) return NextResponse.json({ error: 'forecast_id required' }, { status: 400 })

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
      .from('cashflow_statement_classification')
      .select('*')
      .eq('forecast_id', forecastId)
      .order('account_code', { ascending: true })

    if (error) {
      console.error('[Classifications] GET error:', error)
      return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[Classifications] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/forecast/cashflow/classifications
 *
 * Two modes:
 * 1. Upsert a single classification:
 *    Body: { forecast_id, xero_account_id, account_code, account_name, account_type, list_type }
 * 2. Auto-classify all balance sheet accounts (seed from xero_accounts):
 *    Body: { forecast_id, auto_classify: true }
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { forecast_id, auto_classify } = body
    if (!forecast_id) return NextResponse.json({ error: 'forecast_id required' }, { status: 400 })

    const { data: forecast } = await supabase
      .from('financial_forecasts')
      .select('id, business_id')
      .eq('id', forecast_id)
      .maybeSingle()
    if (!forecast) return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })

    const ids = await resolveBusinessIds(supabase, forecast.business_id)
    const hasAccess = await verifyBusinessAccess(user.id, ids.bizId)
    if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    if (auto_classify) {
      // Seed classifications for every balance sheet account in xero_accounts
      // that doesn't already have a classification row.
      const { data: xeroAccts } = await supabase
        .from('xero_accounts')
        .select('xero_account_id, account_code, account_name, xero_type, xero_class')
        .eq('business_id', ids.bizId)

      const { data: existing } = await supabase
        .from('cashflow_statement_classification')
        .select('xero_account_id')
        .eq('forecast_id', forecast_id)

      const existingIds = new Set((existing ?? []).map(e => e.xero_account_id))

      // Only classify balance sheet items (Assets / Liabilities / Equity).
      // P&L items (Revenue / Expense) don't belong in the statement classification.
      const BS_CLASSES = new Set(['ASSET', 'LIABILITY', 'EQUITY'])

      const rows = (xeroAccts ?? [])
        .filter(a => a.xero_class && BS_CLASSES.has(a.xero_class))
        .filter(a => !existingIds.has(a.xero_account_id))
        .map(a => ({
          forecast_id,
          xero_account_id: a.xero_account_id,
          account_code: a.account_code,
          account_name: a.account_name,
          account_type: a.xero_class,   // Asset | Liability | Equity
          list_type: autoClassify(a.xero_type),
        }))

      if (rows.length === 0) {
        return NextResponse.json({ success: true, inserted: 0, message: 'Already classified' })
      }

      const { error } = await supabase
        .from('cashflow_statement_classification')
        .insert(rows)

      if (error) {
        console.error('[Classifications] Auto-classify error:', error)
        return NextResponse.json({ error: 'Auto-classify failed', detail: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, inserted: rows.length })
    }

    // Single upsert
    const {
      xero_account_id,
      account_code,
      account_name,
      account_type,
      list_type,
    } = body
    if (!xero_account_id || !list_type) {
      return NextResponse.json({ error: 'xero_account_id and list_type required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('cashflow_statement_classification')
      .upsert({
        forecast_id,
        xero_account_id,
        account_code: account_code ?? null,
        account_name: account_name ?? null,
        account_type: account_type ?? null,
        list_type,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'forecast_id,xero_account_id' })
      .select()
      .single()

    if (error) {
      console.error('[Classifications] Upsert error:', error)
      return NextResponse.json({ error: 'Upsert failed', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, success: true })
  } catch (err) {
    console.error('[Classifications] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
