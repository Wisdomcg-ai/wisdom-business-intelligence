/**
 * How a forecast_pl_lines row is bucketed into Revenue / COGS / OpEx, and the
 * Year-1 plan those rows add up to.
 *
 * Extracted from ForecastOverview (8 Sep 2026) so the KPI cards above the P&L
 * and the Overview dashboard below it cannot answer "what is net profit?"
 * differently. The KPI card used to skip the P&L entirely and print the Step-1
 * GOAL under the heading "Net Profit": Urban Road showed $530k (8.8%) while the
 * table underneath it — and the wizard's own Review — said $536,245 (8.9%).
 */
import type { PLLine } from '../types'

export const REVENUE_CATEGORIES = ['revenue', 'trading revenue', 'other revenue', 'other income']
export const COGS_CATEGORIES = ['cost of sales', 'cogs', 'direct costs', 'cost of goods sold']

export function isRevenueLine(line: Pick<PLLine, 'category' | 'account_type'>): boolean {
  const t = line.account_type?.toLowerCase()
  // Phase 65: prior-FY actuals from xero_pl_lines carry account_type but no
  // category. 'other_income' belongs above the bottom line (Total Income in
  // Xero) so it joins the revenue bucket here — otherwise it leaks into
  // OpEx and silently *reduces* Net Profit.
  if (t === 'revenue' || t === 'other_income') return true
  if (!line.category) return false
  return REVENUE_CATEGORIES.includes(line.category.toLowerCase())
}

export function isCOGSLine(line: Pick<PLLine, 'category' | 'account_type'>): boolean {
  // Phase 65: same root cause as isRevenueLine — actuals-only rows lack
  // category. Fall back to account_type so COGS doesn't leak into OpEx
  // (which collapses Gross Profit to Revenue).
  if (line.account_type?.toLowerCase() === 'cogs') return true
  if (!line.category) return false
  return COGS_CATEGORIES.includes(line.category.toLowerCase())
}

export function isOpExLine(line: Pick<PLLine, 'category' | 'account_type'>): boolean {
  if (isRevenueLine(line) || isCOGSLine(line)) return false
  const cat = (line.category || '').toLowerCase()
  // Treat anything that isn't classed as revenue/COGS as OpEx for this tab
  if (cat.includes('other income')) return false
  return true
}

export interface AnnualPlanTotals {
  revenue: number
  cogs: number
  grossProfit: number
  opex: number
  netProfit: number
  grossProfitPct: number
  netProfitPct: number
  /**
   * False when these rows carry no plan for the requested months — a forecast
   * that was never generated, or a year outside the stored horizon. Callers
   * must fall back to the operator's goals rather than print zeros.
   */
  hasPlan: boolean
}

/**
 * Sum ONE year of the stored plan.
 *
 * `forecast_months` is the plan (a completed month is locked to its actual
 * value inside forecast_months by the wizard, so this is the full-year figure
 * the Review step and the stored P&L agree on). `actual_months` is deliberately
 * ignored: this answers "what does the plan say", not "where will we land" —
 * that second question is the Overview's, and it has its own month-by-month
 * rollup which prefers actuals.
 *
 * monthKeys scopes the sum to a single year: a 2- or 3-year forecast stores
 * every year's months on the same row, so summing them all would print three
 * years of revenue on a Year-1 card.
 */
export function sumAnnualPlan(plLines: PLLine[], monthKeys: readonly string[]): AnnualPlanTotals {
  let revenue = 0
  let cogs = 0
  let opex = 0
  let sawValue = false

  for (const line of plLines) {
    const months = (line.forecast_months || {}) as Record<string, number>
    let lineTotal = 0
    for (const key of monthKeys) {
      const v = Number(months[key])
      if (Number.isFinite(v) && v !== 0) {
        lineTotal += v
        sawValue = true
      }
    }
    if (lineTotal === 0) continue

    if (isRevenueLine(line)) revenue += lineTotal
    else if (isCOGSLine(line)) cogs += lineTotal
    else if (isOpExLine(line)) opex += lineTotal
  }

  const grossProfit = revenue - cogs
  const netProfit = grossProfit - opex
  return {
    revenue,
    cogs,
    grossProfit,
    opex,
    netProfit,
    grossProfitPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    netProfitPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    // Revenue is the gate: a plan with expenses but no revenue is not a plan
    // anyone should see totals from.
    hasPlan: sawValue && revenue > 0,
  }
}
