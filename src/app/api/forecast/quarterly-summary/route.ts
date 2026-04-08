/**
 * Quarterly Forecast Summary API Route
 *
 * Returns forecast vs actual variance data for a specific quarter of a forecast.
 * Used by the quarterly review panel to display "Q3 forecast: $2.8M | Actual: $2.6M | Variance: -7%".
 *
 * Query params:
 *   forecastId      (required) UUID of the financial forecast
 *   quarter         (required) 1–4
 *   fiscalYear      (required) e.g. 2026
 *   yearStartMonth  (optional) 1–12, default 7 (AU FY)
 */

import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getMonthKeysForQuarter, sumMonthsForKeys } from '@/lib/utils/fiscal-year-utils'

export const dynamic = 'force-dynamic'

// Categories that map to Revenue in the P&L
const REVENUE_CATEGORIES = ['Revenue', 'revenue', 'Trading Revenue', 'Other Revenue']
// Categories that map to COGS
const COGS_CATEGORIES = ['Cost of Sales', 'COGS', 'cogs', 'Direct Costs', 'Cost of Goods Sold']

function isCOGS(category?: string): boolean {
  if (!category) return false
  return COGS_CATEGORIES.some(c => c.toLowerCase() === category.toLowerCase())
}

function isRevenue(category?: string, accountType?: string): boolean {
  if (accountType && accountType.toLowerCase() === 'revenue') return true
  if (!category) return false
  return REVENUE_CATEGORIES.some(c => c.toLowerCase() === category.toLowerCase())
}

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    // Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const forecastId = searchParams.get('forecastId')
    const quarterParam = searchParams.get('quarter')
    const fiscalYearParam = searchParams.get('fiscalYear')
    const yearStartMonthParam = searchParams.get('yearStartMonth')

    if (!forecastId) {
      return NextResponse.json({ error: 'forecastId is required' }, { status: 400 })
    }

    if (!quarterParam) {
      return NextResponse.json({ error: 'quarter is required' }, { status: 400 })
    }

    if (!fiscalYearParam) {
      return NextResponse.json({ error: 'fiscalYear is required' }, { status: 400 })
    }

    const quarter = parseInt(quarterParam, 10)
    if (isNaN(quarter) || quarter < 1 || quarter > 4) {
      return NextResponse.json({ error: 'quarter must be an integer between 1 and 4' }, { status: 400 })
    }

    const fiscalYear = parseInt(fiscalYearParam, 10)
    if (isNaN(fiscalYear)) {
      return NextResponse.json({ error: 'fiscalYear must be a valid integer' }, { status: 400 })
    }

    const yearStartMonth = yearStartMonthParam ? parseInt(yearStartMonthParam, 10) : 7

    // Fetch forecast row
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('id, business_id, fiscal_year, is_locked')
      .eq('id', forecastId)
      .maybeSingle()

    if (forecastError) {
      console.error('[quarterly-summary] Error fetching forecast:', forecastError)
      return NextResponse.json({ error: 'Failed to fetch forecast' }, { status: 500 })
    }

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    // Fetch all forecast_pl_lines for this forecast
    const { data: plLines, error: linesError } = await supabase
      .from('forecast_pl_lines')
      .select('account_name, account_type, category, forecast_months, actual_months')
      .eq('forecast_id', forecastId)

    if (linesError) {
      console.error('[quarterly-summary] Error fetching pl_lines:', linesError)
      return NextResponse.json({ error: 'Failed to fetch P&L lines' }, { status: 500 })
    }

    // Get the 3 YYYY-MM keys for the requested quarter
    const qKeys = getMonthKeysForQuarter(quarter as 1 | 2 | 3 | 4, fiscalYear, yearStartMonth)

    const lines = plLines || []

    // Aggregate totals per category
    let revForecast = 0
    let revActual = 0
    let cogsForecast = 0
    let cogsActual = 0
    let opexForecast = 0
    let opexActual = 0

    let hasActuals = false

    for (const line of lines) {
      const forecastMonths = line.forecast_months as Record<string, number> | null | undefined
      const actualMonths = line.actual_months as Record<string, number> | null | undefined

      const lineForecast = sumMonthsForKeys(forecastMonths, qKeys)
      const lineActual = sumMonthsForKeys(actualMonths, qKeys)

      // Check if any actual data exists for this quarter
      if (!hasActuals && lineActual !== 0) {
        hasActuals = true
      }

      if (isRevenue(line.category, line.account_type)) {
        revForecast += lineForecast
        revActual += lineActual
      } else if (isCOGS(line.category)) {
        cogsForecast += lineForecast
        cogsActual += lineActual
      } else {
        opexForecast += lineForecast
        opexActual += lineActual
      }
    }

    // Derived values
    const gpForecast = revForecast - cogsForecast
    const gpActual = revActual - cogsActual
    const npForecast = gpForecast - opexForecast
    const npActual = gpActual - opexActual

    function calcVariancePct(forecast: number, actual: number): number {
      if (forecast === 0) return 0
      return Math.round(((actual - forecast) / forecast) * 100)
    }

    const result = {
      quarter,
      fiscalYear,
      forecastId,
      revenue: {
        forecast: revForecast,
        actual: revActual,
        variance: revActual - revForecast,
        variancePct: calcVariancePct(revForecast, revActual),
      },
      cogs: {
        forecast: cogsForecast,
        actual: cogsActual,
        variance: cogsActual - cogsForecast,
        variancePct: calcVariancePct(cogsForecast, cogsActual),
      },
      grossProfit: {
        forecast: gpForecast,
        actual: gpActual,
        variance: gpActual - gpForecast,
        variancePct: calcVariancePct(gpForecast, gpActual),
      },
      opex: {
        forecast: opexForecast,
        actual: opexActual,
        variance: opexActual - opexForecast,
        variancePct: calcVariancePct(opexForecast, opexActual),
      },
      netProfit: {
        forecast: npForecast,
        actual: npActual,
        variance: npActual - npForecast,
        variancePct: calcVariancePct(npForecast, npActual),
      },
      hasActuals,
    }

    console.log('[quarterly-summary] Returning summary for forecast', forecastId, {
      quarter,
      fiscalYear,
      qKeys,
      hasActuals,
      revForecast,
      revActual,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[quarterly-summary] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
