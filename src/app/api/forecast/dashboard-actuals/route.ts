/**
 * Dashboard Actuals API Route
 *
 * Returns monthly actual vs forecast data for Revenue, Gross Profit, and Net Profit
 * charts on the business dashboard. Uses fiscal-year-aware month keys.
 *
 * Query params:
 *   businessId     (required) UUID of the business (dual-ID resolved)
 *   fiscalYear     (optional) defaults to current fiscal year
 *   yearStartMonth (optional) 1–12, default 7 (AU FY)
 */

import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateFiscalMonthKeys, getCurrentFiscalYear, getFiscalMonthLabels } from '@/lib/utils/fiscal-year-utils'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

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
    const businessId = searchParams.get('businessId')
    const fiscalYearParam = searchParams.get('fiscalYear')
    const yearStartMonthParam = searchParams.get('yearStartMonth')

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    const yearStartMonth = yearStartMonthParam ? parseInt(yearStartMonthParam, 10) : 7
    const fiscalYear = fiscalYearParam ? parseInt(fiscalYearParam, 10) : getCurrentFiscalYear(yearStartMonth)

    if (isNaN(fiscalYear)) {
      return NextResponse.json({ error: 'fiscalYear must be a valid integer' }, { status: 400 })
    }

    // Dual-ID resolution — CRITICAL: financial_forecasts.business_id is FK to business_profiles.id
    const ids = await resolveBusinessIds(supabase, businessId)

    // Find forecast using dual-ID resolution
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('id, business_id, fiscal_year')
      .in('business_id', ids.all)
      .eq('is_active', true)
      .order('fiscal_year', { ascending: false })
      .limit(1)
      .maybeSingle()

    // No forecast found — not an error, business may not have one yet
    if (!forecast) {
      return NextResponse.json({ data: null, hasData: false }, { status: 200 })
    }

    // Fetch all forecast_pl_lines for this forecast
    const { data: plLines, error: linesError } = await supabase
      .from('forecast_pl_lines')
      .select('account_name, category, account_type, actual_months, forecast_months, is_from_xero')
      .eq('forecast_id', forecast.id)

    if (linesError) {
      console.error('[dashboard-actuals] Error fetching pl_lines:', linesError)
      return NextResponse.json({ error: 'Failed to fetch P&L lines' }, { status: 500 })
    }

    const lines = plLines || []

    // Get last synced timestamp from financial_metrics
    const { data: metricsRow } = await supabase
      .from('financial_metrics')
      .select('updated_at')
      .in('business_id', ids.all)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastSyncedAt: string | null = metricsRow?.updated_at ?? null

    // Generate fiscal month keys in correct fiscal year order
    const monthKeys = generateFiscalMonthKeys(fiscalYear, yearStartMonth)
    const monthLabels = getFiscalMonthLabels(yearStartMonth)

    // Aggregate by month
    const months = monthKeys.map((monthKey, idx) => {
      let revenueActual = 0
      let revenueForecast = 0
      let cogsActual = 0
      let cogsForecast = 0
      let opexActual = 0
      let opexForecast = 0

      for (const line of lines) {
        const actualMonths = line.actual_months as Record<string, number> | null | undefined
        const forecastMonths = line.forecast_months as Record<string, number> | null | undefined

        const lineActual = actualMonths?.[monthKey] || 0
        const lineForecast = forecastMonths?.[monthKey] || 0

        if (isRevenue(line.category, line.account_type)) {
          revenueActual += lineActual
          revenueForecast += lineForecast
        } else if (isCOGS(line.category)) {
          cogsActual += lineActual
          cogsForecast += lineForecast
        } else {
          opexActual += lineActual
          opexForecast += lineForecast
        }
      }

      const gpActual = revenueActual - cogsActual
      const gpForecast = revenueForecast - cogsForecast
      const npActual = gpActual - opexActual
      const npForecast = gpForecast - opexForecast

      // Use null for months with zero actuals to indicate no data yet
      return {
        month: monthKey,
        label: monthLabels[idx],
        revenueActual: revenueActual !== 0 ? revenueActual : null,
        revenueForecast: revenueForecast !== 0 ? revenueForecast : null,
        gpActual: gpActual !== 0 ? gpActual : null,
        gpForecast: gpForecast !== 0 ? gpForecast : null,
        npActual: npActual !== 0 ? npActual : null,
        npForecast: npForecast !== 0 ? npForecast : null,
      }
    })

    // Check if there's any meaningful data
    const hasAnyData = months.some(m =>
      m.revenueActual !== null || m.revenueForecast !== null
    )

    console.log('[dashboard-actuals] Returning data for business', businessId, {
      forecastId: forecast.id,
      fiscalYear,
      monthCount: months.length,
      hasAnyData,
    })

    return NextResponse.json({
      data: {
        months,
        lastSyncedAt,
      },
      hasData: hasAnyData,
    })
  } catch (err) {
    console.error('[dashboard-actuals] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
