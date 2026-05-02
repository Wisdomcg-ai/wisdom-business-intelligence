/**
 * Historical P&L Summary Service
 *
 * Single source of truth for historical financial data.
 *
 * Phase 44 (Plan 44-09) — this service now delegates to ForecastReadService
 * (D-13) when an active forecast exists for `(business_id, fiscal_year)`. The
 * D-18 freshness invariant (forecast_pl_lines.computed_at vs
 * financial_forecasts.updated_at) is asserted by the service layer; this
 * function lets invariant errors propagate so the route handler can surface
 * them as a structured 500 to the wizard.
 *
 * When NO active forecast exists (e.g. brand-new business onboarding before
 * the wizard has ever been generated), the service falls back to a direct
 * read of `xero_pl_lines` rows so the wizard can still render Step 2's prior
 * FY card. This is a deliberate, narrow fallback — it does NOT bypass any
 * D-18 invariant because there are no forecast rows to be stale against.
 *
 * Used by: /api/Xero/pl-summary → Forecast Wizard Step 2
 */

import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import {
  calculateForecastPeriods,
  DEFAULT_YEAR_START_MONTH,
} from '@/lib/utils/fiscal-year-utils'
import {
  createForecastReadService,
  type MonthlyComposite,
  type CoverageRecord,
} from '@/lib/services/forecast-read-service'
import type { HistoricalPLSummary, PeriodSummary, OpExCategory, PLLineItem, XeroCoverage } from '@/app/finances/forecast/types'

// Account type enum from xero_pl_lines (set by sync-all's mapSectionToType)
type XeroAccountType = 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'

// Internal wide-shape row used for aggregation. Matches the legacy
// xero_pl_lines_wide_compat shape so the aggregatePeriod() helper below works
// with rows from EITHER ForecastReadService (preferred path) OR a direct
// fallback query.
interface WideXeroRow {
  account_name: string
  account_type: XeroAccountType
  monthly_values: Record<string, number>
}

/**
 * Get historical P&L summary from raw Xero data.
 *
 * Automatically detects extended forecast (planning season) and returns:
 * - Extended: prior = FY before current (complete 12mo), YTD = current FY actuals
 * - Standard: prior = FY-1, YTD = current FY if we're in it
 *
 * Coverage is sourced from ForecastReadService when an active forecast exists
 * for `(business_id, fiscal_year)`; otherwise computed inline.
 */
export async function getHistoricalSummary(
  supabase: any,
  businessId: string,
  fiscalYear: number,
  yearStartMonth: number = DEFAULT_YEAR_START_MONTH,
): Promise<HistoricalPLSummary> {
  // Resolve dual business IDs (Phase 21+ pattern).
  const ids = await resolveBusinessIds(supabase, businessId)

  // Try the canonical D-13 path first: route through ForecastReadService.
  // We need an active forecast for (business_id, fiscal_year) to do that.
  let composite: MonthlyComposite | null = null
  const { data: activeForecast } = await supabase
    .from('financial_forecasts')
    .select('id')
    .in('business_id', ids.all)
    .eq('fiscal_year', fiscalYear)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeForecast?.id) {
    // Let any D-18 invariant violation propagate — the route handler surfaces it as a 500.
    const service = createForecastReadService(supabase)
    composite = await service.getMonthlyComposite(activeForecast.id)
  }

  // Source the wide-shaped Xero rows.
  let xeroLines: WideXeroRow[] = []
  let coverage: XeroCoverage | undefined

  if (composite) {
    // Preferred: convert composite rows to the wide shape aggregatePeriod() expects.
    xeroLines = composite.rows.map(r => ({
      account_name: r.account_name,
      account_type: r.account_type as XeroAccountType,
      monthly_values: r.monthly_values,
    }))
    coverage = {
      months_covered: composite.coverage.months_covered,
      first_period: composite.coverage.first_period,
      last_period: composite.coverage.last_period,
      expected_months: composite.coverage.expected_months,
    }
  } else {
    // Fallback (no active forecast): read xero_pl_lines_wide_compat directly.
    // No D-18 freshness check applies — there are no forecast_pl_lines rows
    // to be stale against.
    const { data: rawLines, error } = await supabase
      .from('xero_pl_lines_wide_compat')
      .select('account_name, account_type, monthly_values')
      .in('business_id', ids.all)

    if (error || !rawLines || rawLines.length === 0) {
      // No data — still surface a quality signal so the banner can explain why.
      const fallbackQuality = await createForecastReadService(supabase).getDataQualityForBusiness(ids.all)
      return {
        has_xero_data: false,
        data_quality: fallbackQuality.data_quality,
        per_tenant_quality: fallbackQuality.per_tenant_quality,
      }
    }
    xeroLines = rawLines as WideXeroRow[]
    coverage = computeCoverageFromRows(xeroLines)
  }

  if (xeroLines.length === 0) {
    const fallbackQuality = await createForecastReadService(supabase).getDataQualityForBusiness(ids.all)
    return {
      has_xero_data: false,
      data_quality: fallbackQuality.data_quality,
      per_tenant_quality: fallbackQuality.per_tenant_quality,
    }
  }

  // D-44.2-03 — quality gate. Active-forecast path inherits from composite
  // (already computed in 44.2-07 path); fallback path computes via the
  // public wrapper so both surfaces produce the same shape.
  const dataQuality = composite
    ? { data_quality: composite.data_quality, per_tenant_quality: composite.per_tenant_quality }
    : await createForecastReadService(supabase).getDataQualityForBusiness(ids.all)

  // Determine periods using centralized fiscal year logic.
  const periods = calculateForecastPeriods(fiscalYear, yearStartMonth)

  // Calculate prior FY summary.
  const priorFY = aggregatePeriod(
    xeroLines,
    periods.baseline_start_month,
    periods.baseline_end_month,
    `Prior FY`,
    yearStartMonth,
  )

  // Calculate current YTD summary (if we have actuals in the period).
  let currentYTD: HistoricalPLSummary['current_ytd'] = undefined

  if (periods.is_rolling && periods.actual_start_month && periods.actual_end_month) {
    const ytdSummary = aggregatePeriod(
      xeroLines,
      periods.actual_start_month,
      periods.actual_end_month,
      `Current FY YTD`,
      yearStartMonth,
    )

    if (ytdSummary && ytdSummary.months_count > 0) {
      const factor = 12 / ytdSummary.months_count
      currentYTD = {
        ...ytdSummary,
        run_rate_revenue: ytdSummary.total_revenue * factor,
        run_rate_opex: ytdSummary.operating_expenses * factor,
        run_rate_net_profit: ytdSummary.net_profit * factor,
        revenue_vs_prior_percent: priorFY && priorFY.total_revenue > 0
          ? ((ytdSummary.total_revenue * factor - priorFY.total_revenue) / priorFY.total_revenue) * 100
          : 0,
        opex_vs_prior_percent: priorFY && priorFY.operating_expenses > 0
          ? ((ytdSummary.operating_expenses * factor - priorFY.operating_expenses) / priorFY.operating_expenses) * 100
          : 0,
      }
    }
  }

  return {
    has_xero_data: true,
    prior_fy: priorFY || undefined,
    current_ytd: currentYTD,
    coverage,
    data_quality: dataQuality.data_quality,
    per_tenant_quality: dataQuality.per_tenant_quality,
  }
}

/**
 * Compute coverage from wide-shaped rows (fallback path, no forecast).
 * Mirrors ForecastReadService.computeCoverage so behaviour is identical.
 */
function computeCoverageFromRows(rows: WideXeroRow[]): XeroCoverage {
  const allMonths = new Set<string>()
  for (const r of rows) {
    for (const m of Object.keys(r.monthly_values || {})) allMonths.add(m)
  }
  const sorted = [...allMonths].sort()
  return {
    months_covered: sorted.length,
    first_period: sorted[0] ?? null,
    last_period: sorted.at(-1) ?? null,
    expected_months: 12,
  }
}

/**
 * Aggregate xero_pl_lines for a date range into a PeriodSummary.
 * Uses account_type enum directly — no string pattern matching.
 */
function aggregatePeriod(
  lines: WideXeroRow[],
  startMonth: string,
  endMonth: string,
  label: string,
  yearStartMonth: number,
): PeriodSummary | null {
  // Generate month keys for the range.
  const monthKeys: string[] = []
  let current = new Date(startMonth + '-01')
  const end = new Date(endMonth + '-01')

  while (current <= end) {
    monthKeys.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`)
    current.setMonth(current.getMonth() + 1)
  }

  if (monthKeys.length === 0) return null

  // Initialize accumulators.
  let totalRevenue = 0
  let totalCogs = 0
  let totalOpex = 0
  let totalOtherIncome = 0
  let totalOtherExpenses = 0
  const revenueByMonth: Record<string, number> = {}
  const cogsByMonth: Record<string, number> = {}
  const opexByMonth: Record<string, number> = {}
  const otherIncomeByMonth: Record<string, number> = {}
  const otherExpensesByMonth: Record<string, number> = {}
  const opexAccounts: Record<string, { total: number; account_name: string }> = {}
  const revenueLines: PLLineItem[] = []
  const cogsLines: PLLineItem[] = []

  for (const mk of monthKeys) {
    revenueByMonth[mk] = 0
    cogsByMonth[mk] = 0
    opexByMonth[mk] = 0
    otherIncomeByMonth[mk] = 0
    otherExpensesByMonth[mk] = 0
  }

  // Aggregate by account_type enum — no string matching.
  for (const line of lines) {
    const values = line.monthly_values || {}
    let lineTotal = 0

    for (const mk of monthKeys) {
      const val = values[mk] || 0
      lineTotal += val

      switch (line.account_type) {
        case 'revenue':
          revenueByMonth[mk] += val
          totalRevenue += val
          break
        case 'cogs':
          cogsByMonth[mk] += val
          totalCogs += val
          break
        case 'opex':
          opexByMonth[mk] += val
          totalOpex += val
          break
        case 'other_income':
          otherIncomeByMonth[mk] += val
          totalOtherIncome += val
          break
        case 'other_expense':
          otherExpensesByMonth[mk] += val
          totalOtherExpenses += val
          break
      }
    }

    // Build line items for revenue and COGS.
    if (line.account_type === 'revenue' && lineTotal !== 0) {
      revenueLines.push({
        account_name: line.account_name,
        category: 'Revenue',
        total: lineTotal,
        by_month: Object.fromEntries(monthKeys.map(mk => [mk, values[mk] || 0])),
        percent_of_revenue: 100,
      })
    } else if (line.account_type === 'cogs' && lineTotal !== 0) {
      cogsLines.push({
        account_name: line.account_name,
        category: 'Cost of Sales',
        total: lineTotal,
        by_month: Object.fromEntries(monthKeys.map(mk => [mk, values[mk] || 0])),
      })
    } else if (line.account_type === 'opex' && lineTotal !== 0) {
      opexAccounts[line.account_name] = {
        total: lineTotal,
        account_name: line.account_name,
      }
    }
  }

  // Build OpEx by category — return ALL accounts.
  const opexCategories: OpExCategory[] = Object.values(opexAccounts)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .map(acc => ({
      category: 'Operating Expenses',
      account_name: acc.account_name,
      total: acc.total,
      monthly_average: monthKeys.length > 0 ? acc.total / monthKeys.length : 0,
    }))

  // Calculate seasonality pattern (12 FY month percentages).
  const seasonality: number[] = []
  if (totalRevenue > 0) {
    const fyMonthKeys = monthKeys.length === 12 ? monthKeys : monthKeys.slice(0, 12)
    for (const mk of fyMonthKeys) {
      seasonality.push((revenueByMonth[mk] || 0) / totalRevenue * 100)
    }
    while (seasonality.length < 12) {
      seasonality.push(100 / 12)
    }
  }

  const grossProfit = totalRevenue - totalCogs
  const netProfit = grossProfit - totalOpex + totalOtherIncome - totalOtherExpenses

  return {
    period_label: label,
    start_month: startMonth,
    end_month: endMonth,
    months_count: monthKeys.length,
    total_revenue: totalRevenue,
    total_cogs: totalCogs,
    gross_profit: grossProfit,
    gross_margin_percent: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    operating_expenses: totalOpex,
    operating_expenses_by_category: opexCategories,
    other_income: totalOtherIncome,
    other_expenses: totalOtherExpenses,
    net_profit: netProfit,
    net_margin_percent: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
    revenue_by_month: revenueByMonth,
    cogs_by_month: cogsByMonth,
    opex_by_month: opexByMonth,
    other_income_by_month: otherIncomeByMonth,
    other_expenses_by_month: otherExpensesByMonth,
    seasonality_pattern: seasonality.length > 0 ? seasonality : undefined,
    revenue_lines: revenueLines,
    cogs_lines: cogsLines,
  }
}
