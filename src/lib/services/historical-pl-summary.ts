/**
 * Historical P&L Summary Service
 *
 * Single source of truth for historical financial data.
 * Reads directly from xero_pl_lines (raw 24-month Xero data),
 * NOT from forecast_pl_lines (which is a working copy for forecasts).
 *
 * Used by: /api/Xero/pl-summary → Forecast Wizard Step 2
 */

import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import {
  calculateForecastPeriods,
  generateFiscalMonthKeys,
  getCurrentFiscalYear,
  DEFAULT_YEAR_START_MONTH,
} from '@/lib/utils/fiscal-year-utils'
import type { HistoricalPLSummary, PeriodSummary, OpExCategory, PLLineItem } from '@/app/finances/forecast/types'

// Account type enum from xero_pl_lines (set by sync-all's mapSectionToType)
type XeroAccountType = 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'

// Map account_type enum to display category
const CATEGORY_MAP: Record<XeroAccountType, string> = {
  revenue: 'Revenue',
  cogs: 'Cost of Sales',
  opex: 'Operating Expenses',
  other_income: 'Other Income',
  other_expense: 'Other Expenses',
}

interface XeroPLLine {
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
 */
export async function getHistoricalSummary(
  supabase: { from: (table: string) => any },
  businessId: string,
  fiscalYear: number,
  yearStartMonth: number = DEFAULT_YEAR_START_MONTH,
): Promise<HistoricalPLSummary> {
  // Resolve dual business IDs
  const ids = await resolveBusinessIds(supabase, businessId)

  // Fetch raw Xero P&L lines — the source of truth
  const { data: xeroLines, error } = await supabase
    .from('xero_pl_lines_wide_compat')
    .select('account_name, account_type, monthly_values')
    .in('business_id', ids.all)

  if (error || !xeroLines || xeroLines.length === 0) {
    return { has_xero_data: false }
  }

  // Determine periods using centralized fiscal year logic
  const periods = calculateForecastPeriods(fiscalYear, yearStartMonth)

  // Calculate prior FY summary
  const priorFY = aggregatePeriod(
    xeroLines as XeroPLLine[],
    periods.baseline_start_month,
    periods.baseline_end_month,
    `Prior FY`,
    yearStartMonth,
  )

  // Calculate current YTD summary (if we have actuals in the period)
  let currentYTD: HistoricalPLSummary['current_ytd'] = undefined

  if (periods.is_rolling && periods.actual_start_month && periods.actual_end_month) {
    const ytdSummary = aggregatePeriod(
      xeroLines as XeroPLLine[],
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
  }
}

/**
 * Aggregate xero_pl_lines for a date range into a PeriodSummary.
 * Uses account_type enum directly — no string pattern matching.
 */
function aggregatePeriod(
  lines: XeroPLLine[],
  startMonth: string,
  endMonth: string,
  label: string,
  yearStartMonth: number,
): PeriodSummary | null {
  // Generate month keys for the range
  const monthKeys: string[] = []
  let current = new Date(startMonth + '-01')
  const end = new Date(endMonth + '-01')

  while (current <= end) {
    monthKeys.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`)
    current.setMonth(current.getMonth() + 1)
  }

  if (monthKeys.length === 0) return null

  // Initialize accumulators
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

  // Aggregate by account_type enum — no string matching
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

    // Build line items for revenue and COGS
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

  // Build OpEx by category — return ALL accounts so the wizard reflects 100% of Xero.
  // Was capped at top 10 historically; that meant any business with >10 OpEx
  // accounts had silent gaps in the wizard's breakdown (totals were correct,
  // but per-line data was incomplete).
  const opexCategories: OpExCategory[] = Object.values(opexAccounts)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .map(acc => ({
      category: 'Operating Expenses',
      account_name: acc.account_name,
      total: acc.total,
      monthly_average: monthKeys.length > 0 ? acc.total / monthKeys.length : 0,
    }))

  // Calculate seasonality pattern (12 FY month percentages)
  const seasonality: number[] = []
  if (totalRevenue > 0) {
    // Generate the 12 FY month keys for seasonality
    const fyMonthKeys = monthKeys.length === 12 ? monthKeys : monthKeys.slice(0, 12)
    for (const mk of fyMonthKeys) {
      seasonality.push((revenueByMonth[mk] || 0) / totalRevenue * 100)
    }
    // Pad to 12 if less
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
