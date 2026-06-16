/**
 * Annual Reset — FY actuals provider (Option B "B-with-fallback" seeding).
 *
 * Returns the just-finished FY's real financial actuals (revenue / gross_profit
 * / net_profit) so the annual reset can seed the goals-wizard `current` column
 * from achieved results instead of last year's target.
 *
 * Deterministic single-FY read (getFiscalYearActuals) — no planning-season
 * heuristics, so the number is stable regardless of when the reset runs.
 *
 * GATE (fail-closed): only a COMPLETE 12-month FY with positive revenue is
 * trustworthy as an annual actual. Anything less (no Xero connection,
 * multi-currency, partial sync, $0) → usable:false and the reset keeps the D3
 * (prior-target) value. We never seed an understated partial year.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { getFiscalYearActuals } from '@/lib/services/historical-pl-summary'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sp = request.nextUrl.searchParams
    const businessId = sp.get('business_id')
    const fiscalYearParam = sp.get('fiscal_year')
    const yearStartMonthParam = sp.get('year_start_month')

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }
    const fiscalYear = fiscalYearParam ? parseInt(fiscalYearParam, 10) : NaN
    if (!Number.isFinite(fiscalYear)) {
      return NextResponse.json({ error: 'fiscal_year is required and must be numeric' }, { status: 400 })
    }

    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const yearStartMonth = yearStartMonthParam ? parseInt(yearStartMonthParam, 10) : 7

    const fy = await getFiscalYearActuals(supabase, businessId, fiscalYear, yearStartMonth)

    const usable = fy.has_xero_data && fy.months_covered === 12 && fy.revenue > 0

    return NextResponse.json({
      usable,
      months_covered: fy.months_covered,
      actuals: usable
        ? { revenue: fy.revenue, gross_profit: fy.gross_profit, net_profit: fy.net_profit }
        : null,
    })
  } catch (error: any) {
    // Never surface a hard failure as a blocker — the reset caller treats any
    // non-usable response as "keep the D3 value".
    return NextResponse.json(
      { usable: false, error: String(error?.message ?? error) },
      { status: 500 },
    )
  }
}
