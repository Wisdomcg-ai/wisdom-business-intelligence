/**
 * Shared helpers for monthly-report API routes.
 *
 * Extracted verbatim from src/app/api/monthly-report/generate/route.ts:15-101
 * (Phase 34 plan 00a — foundation for consolidated-report route reuse).
 *
 * DO NOT modify the sign conventions in calcVariance — downstream reports
 * depend on them. Revenue favourable = actual > budget (positive amount);
 * expense favourable = budget > actual (positive amount).
 */

export interface ReportLine {
  account_name: string
  xero_account_name?: string | null
  is_budget_only: boolean
  actual: number
  budget: number
  variance_amount: number
  variance_percent: number
  ytd_actual: number
  ytd_budget: number
  ytd_variance_amount: number
  ytd_variance_percent: number
  unspent_budget: number
  budget_next_month: number
  budget_annual_total: number
  prior_year: number | null
}

// Map xero account_type to report_category
export function mapTypeToCategory(accountType: string): string {
  switch ((accountType || '').toLowerCase()) {
    case 'revenue': return 'Revenue'
    case 'cogs': return 'Cost of Sales'
    case 'opex': return 'Operating Expenses'
    case 'other_income': return 'Other Income'
    case 'other_expense': return 'Other Expenses'
    default: return 'Other Expenses'
  }
}

// Calculate variance with correct sign convention
// Revenue: favorable = actual > budget (positive)
// Expenses: favorable = budget > actual (positive)
export function calcVariance(actual: number, budget: number, isRevenue: boolean): { amount: number; percent: number } {
  const amount = isRevenue ? actual - budget : budget - actual
  const percent = budget !== 0 ? (amount / Math.abs(budget)) * 100 : 0
  return { amount, percent }
}

// Build a subtotal line from an array of report lines
export function buildSubtotal(lines: ReportLine[], label: string): ReportLine {
  return {
    account_name: label,
    xero_account_name: null,
    is_budget_only: false,
    actual: lines.reduce((s, l) => s + l.actual, 0),
    budget: lines.reduce((s, l) => s + l.budget, 0),
    variance_amount: lines.reduce((s, l) => s + l.variance_amount, 0),
    variance_percent: 0, // Recalculated below
    ytd_actual: lines.reduce((s, l) => s + l.ytd_actual, 0),
    ytd_budget: lines.reduce((s, l) => s + l.ytd_budget, 0),
    ytd_variance_amount: lines.reduce((s, l) => s + l.ytd_variance_amount, 0),
    ytd_variance_percent: 0,
    unspent_budget: lines.reduce((s, l) => s + l.unspent_budget, 0),
    budget_next_month: lines.reduce((s, l) => s + l.budget_next_month, 0),
    budget_annual_total: lines.reduce((s, l) => s + l.budget_annual_total, 0),
    prior_year: lines.some(l => l.prior_year !== null) ? lines.reduce((s, l) => s + (l.prior_year || 0), 0) : null,
  }
}

// Get an array of month keys from start to end inclusive
export function getMonthRange(start: string, end: string): string[] {
  const months: string[] = []
  const [startY, startM] = start.split('-').map(Number)
  const [endY, endM] = end.split('-').map(Number)
  let y = startY
  let m = startM
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

// Get the next month key
export function getNextMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

// Get the prior year month key
export function getPriorYearMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${y - 1}-${String(m).padStart(2, '0')}`
}
