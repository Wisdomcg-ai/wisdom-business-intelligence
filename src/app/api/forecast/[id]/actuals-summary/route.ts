/**
 * Forecast Actuals Summary API Route
 *
 * Aggregates a forecast's actual_months data from forecast_pl_lines into the
 * PriorYearData shape that ForecastWizardV4 / useForecastWizard expects.
 *
 * Used when a locked prior-year forecast is available, so the next year's
 * wizard can load actuals from the forecast DB instead of re-fetching Xero.
 */

import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { withQuerySchema } from '@/lib/api/with-schema'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const GetQuerySchema = z.object({}).passthrough()

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

function sumActualMonths(actual_months: Record<string, number> | null | undefined): number {
  if (!actual_months) return 0
  return Object.values(actual_months).reduce((sum, v) => sum + (v || 0), 0)
}

async function getHandler(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createRouteHandlerClient()

  try {
    // Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: forecastId } = await params

    if (!forecastId) {
      return NextResponse.json({ error: 'Forecast ID is required' }, { status: 400 })
    }

    // Fetch forecast row (include business_id for section-permission gate)
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('id, business_id, fiscal_year, is_locked, actual_start_month, actual_end_month')
      .eq('id', forecastId)
      .maybeSingle()

    if (forecastError) {
      Sentry.captureException(forecastError, { tags: { route: 'forecast/[id]/actuals-summary' }, extra: { context: "[actuals-summary] Error fetching forecast" } } as any)
      return NextResponse.json({ error: 'Failed to fetch forecast' }, { status: 500 })
    }

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      supabase,            // auth-bound client (assigned from createRouteHandlerClient() above)
      user.id,
      forecast.business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/forecast/[id]/actuals-summary',
      user.id,
      forecast.business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    // Fetch all pl_lines for this forecast
    const { data: plLines, error: linesError } = await supabase
      .from('forecast_pl_lines')
      .select('account_name, account_type, category, actual_months, sort_order')
      .eq('forecast_id', forecastId)
      .order('sort_order', { ascending: true })

    if (linesError) {
      Sentry.captureException(linesError, { tags: { route: 'forecast/[id]/actuals-summary' }, extra: { context: "[actuals-summary] Error fetching pl_lines" } } as any)
      return NextResponse.json({ error: 'Failed to fetch P&L lines' }, { status: 500 })
    }

    const lines = plLines || []

    // Separate into revenue, COGS, and OpEx buckets
    const revenueLines: { account_name: string; actual_months: Record<string, number> }[] = []
    const cogsLines: { account_name: string; actual_months: Record<string, number> }[] = []
    const opexLines: { account_name: string; actual_months: Record<string, number> }[] = []

    for (const line of lines) {
      const actualMonths = (line.actual_months as Record<string, number>) || {}
      const total = sumActualMonths(actualMonths)
      if (total === 0) continue // Skip zero-value lines

      if (isRevenue(line.category, line.account_type)) {
        revenueLines.push({ account_name: line.account_name, actual_months: actualMonths })
      } else if (isCOGS(line.category)) {
        cogsLines.push({ account_name: line.account_name, actual_months: actualMonths })
      } else {
        // Everything else goes to OpEx (Operating Expenses, Admin, etc.)
        opexLines.push({ account_name: line.account_name, actual_months: actualMonths })
      }
    }

    // Aggregate revenue
    const revenueByLine = revenueLines.map((line, idx) => {
      const total = sumActualMonths(line.actual_months)
      const byMonth: Record<string, number> = {}
      Object.entries(line.actual_months).forEach(([k, v]) => { byMonth[k] = Math.round(v || 0) })
      return {
        id: `revenue-${idx}`,
        name: line.account_name,
        total: Math.round(total),
        byMonth,
      }
    })

    const totalRevenue = revenueByLine.reduce((s, l) => s + l.total, 0)

    // Aggregate revenue by month (sum across all revenue lines)
    const revenueByMonth: Record<string, number> = {}
    for (const line of revenueLines) {
      Object.entries(line.actual_months).forEach(([k, v]) => {
        revenueByMonth[k] = Math.round((revenueByMonth[k] || 0) + (v || 0))
      })
    }

    // Aggregate COGS
    const cogsByLine = cogsLines.map((line, idx) => {
      const total = sumActualMonths(line.actual_months)
      const byMonth: Record<string, number> = {}
      Object.entries(line.actual_months).forEach(([k, v]) => { byMonth[k] = Math.round(v || 0) })
      const percentOfRevenue = totalRevenue > 0
        ? Math.round((total / totalRevenue) * 1000) / 10
        : 0
      return {
        id: `cogs-${idx}`,
        name: line.account_name,
        total: Math.round(total),
        byMonth,
        percentOfRevenue,
      }
    })

    const totalCOGS = cogsByLine.reduce((s, l) => s + l.total, 0)
    const cogsByMonth: Record<string, number> = {}
    for (const line of cogsLines) {
      Object.entries(line.actual_months).forEach(([k, v]) => {
        cogsByMonth[k] = Math.round((cogsByMonth[k] || 0) + (v || 0))
      })
    }

    // Aggregate OpEx
    const opexByLine = opexLines.map((line, idx) => {
      const total = sumActualMonths(line.actual_months)
      const monthlyAvg = Math.round(total / Math.max(1, Object.keys(line.actual_months).length))
      return {
        id: `opex-${idx}`,
        name: line.account_name,
        total: Math.round(total),
        monthlyAvg,
        isOneOff: false,
      }
    })

    const totalOpEx = opexByLine.reduce((s, l) => s + l.total, 0)
    const opexByMonth: Record<string, number> = {}
    for (const line of opexLines) {
      Object.entries(line.actual_months).forEach(([k, v]) => {
        opexByMonth[k] = Math.round((opexByMonth[k] || 0) + (v || 0))
      })
    }

    // Gross profit
    const grossProfitTotal = totalRevenue - totalCOGS
    const grossProfitPercent = totalRevenue > 0
      ? Math.round((grossProfitTotal / totalRevenue) * 1000) / 10
      : 0

    const grossProfitByMonth: Record<string, number> = {}
    const allMonthKeys = Array.from(new Set([
      ...Object.keys(revenueByMonth),
      ...Object.keys(cogsByMonth),
    ]))
    for (const k of allMonthKeys) {
      grossProfitByMonth[k] = Math.round((revenueByMonth[k] || 0) - (cogsByMonth[k] || 0))
    }

    // Calculate seasonality pattern from revenue by month
    // Sort month keys in fiscal year order and compute percentages
    const sortedRevenueMonths = Object.entries(revenueByMonth)
      .sort(([a], [b]) => a.localeCompare(b))

    let seasonalityPattern: number[] = Array(12).fill(8.33)
    if (sortedRevenueMonths.length === 12 && totalRevenue > 0) {
      seasonalityPattern = sortedRevenueMonths.map(([, v]) =>
        Math.round((v / totalRevenue) * 10000) / 100
      )
    }

    // Build PriorYearData-shaped response
    const result = {
      fiscal_year: forecast.fiscal_year,
      revenue: {
        total: totalRevenue,
        byMonth: revenueByMonth,
        byLine: revenueByLine,
      },
      cogs: {
        total: totalCOGS,
        percentOfRevenue: totalRevenue > 0 ? Math.round((totalCOGS / totalRevenue) * 1000) / 10 : 0,
        byMonth: cogsByMonth,
        byLine: cogsByLine,
      },
      grossProfit: {
        total: grossProfitTotal,
        percent: grossProfitPercent,
        byMonth: grossProfitByMonth,
      },
      opex: {
        total: totalOpEx,
        byMonth: opexByMonth,
        byLine: opexByLine,
      },
      seasonalityPattern,
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[actuals-summary] Returning summary for forecast', forecastId, {
        fiscal_year: forecast.fiscal_year,
        is_locked: forecast.is_locked,
        revenueTotal: totalRevenue,
        cogsTotal: totalCOGS,
        opexTotal: totalOpEx,
        revenueLines: revenueByLine.length,
        cogsLines: cogsByLine.length,
        opexLines: opexByLine.length,
      })
    }

    return NextResponse.json(result)
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'forecast/[id]/actuals-summary' }, extra: { context: "[actuals-summary] Unexpected error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema(
  'forecast/[id]/actuals-summary',
  GetQuerySchema,
  getHandler as unknown as (
    request: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>,
)
