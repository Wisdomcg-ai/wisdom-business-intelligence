/**
 * Cashflow Xero Actuals API — Phase 44 D-13 thin shim.
 *
 * Returns Xero P&L actuals reshaped as PLLine-compatible objects for the
 * cashflow forecast engine. Response shape preserved verbatim:
 *   { data: PLLine[] } with account_name, account_code, category,
 *   account_type, is_revenue, is_from_xero, actual_months, forecast_months.
 *
 * Routes through ForecastReadService.getMonthlyComposite when an active
 * forecast exists (D-13 — D-18 freshness invariant fires automatically and
 * is surfaced as a structured 500). Falls back to a direct
 * xero_pl_lines_wide_compat read for businesses with no active forecast yet
 * (e.g. brand-new onboarding).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import { createForecastReadService } from '@/lib/services/forecast-read-service'

export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

const CATEGORY_MAP: Record<string, string> = {
  revenue: 'Revenue', other_income: 'Other Income', cogs: 'Cost of Sales',
  opex: 'Operating Expenses', other_expense: 'Other Expenses',
}
const mapCategory = (t: string) => CATEGORY_MAP[t] ?? 'Operating Expenses'
const isRev = (t: string) => t === 'revenue' || t === 'other_income'

const toPLLine = (r: { account_name: string; account_code: string | null; account_type: string; monthly_values: Record<string, number> | null }, i: number) => ({
  id: `xero-actual-${i}`, account_name: r.account_name, account_code: r.account_code,
  category: mapCategory(r.account_type), account_type: r.account_type,
  is_revenue: isRev(r.account_type), is_from_xero: true as const,
  actual_months: r.monthly_values || {}, forecast_months: {},
})

export async function GET(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const businessId = url.searchParams.get('business_id')
    let forecastId = url.searchParams.get('forecast_id')
    if (!businessId) return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    if (!(await verifyBusinessAccess(user.id, businessId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const ids = await resolveBusinessIds(supabase, businessId)

    // If no explicit forecast_id, look up the active forecast for this business.
    if (!forecastId) {
      const { data } = await supabase
        .from('financial_forecasts').select('id')
        .in('business_id', ids.all).eq('is_active', true)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      forecastId = data?.id ?? null
    }

    if (forecastId) {
      // D-13 path. D-18 invariant violations propagate to the catch.
      const composite = await createForecastReadService(supabase).getMonthlyComposite(forecastId)
      return NextResponse.json({
        data: composite.rows.map((r, i) => toPLLine({
          account_name: r.account_name, account_code: r.account_code,
          account_type: r.account_type, monthly_values: r.monthly_values,
        }, i)),
      })
    }

    // Fallback: no active forecast yet → read raw Xero rows (no D-18 check applies).
    const { data: xeroLines, error } = await supabase
      .from('xero_pl_lines_wide_compat')
      .select('account_name, account_code, account_type, monthly_values')
      .in('business_id', ids.all)
    if (error) {
      console.error('[Xero Actuals] Error:', error)
      return NextResponse.json({ error: 'Failed to load Xero actuals' }, { status: 500 })
    }
    return NextResponse.json({ data: (xeroLines || []).map((xl: any, i: number) => toPLLine(xl, i)) })
  } catch (err: any) {
    const message = String(err?.message ?? err)
    const isInvariant = message.includes('INVARIANT VIOLATED')
    console.error('[Xero Actuals] Error:', err)
    return NextResponse.json(
      { error: isInvariant ? message : 'Internal server error', invariant_violation: isInvariant || undefined },
      { status: 500 },
    )
  }
}
