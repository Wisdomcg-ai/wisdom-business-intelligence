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

// ─────────────────────────────────────────────────────────────────────────────
// WA.1 — canonical profit structure.
//
// Gross Profit is trading only: Revenue − Cost of Sales. Other Income and
// Other Expenses sit BELOW Operating Profit and enter Net Profit exactly once:
//
//   Income              (Revenue section only)
//   − Cost of Sales
//   = Gross Profit
//   − Operating Expenses
//   = Operating Profit
//   + Other Income
//   − Other Expenses
//   = Net Profit
//
// Every profit derivation in the monthly report used to fold Other Income into
// the revenue total (so it inflated Gross Profit and GP%) and Other Expenses
// into the opex total — in four places with slightly different bugs each
// (generate route, consolidated adapter, full-year route, trend charts), and
// the PDF summary then listed Other Income/Expenses AGAIN as their own rows,
// so the page did not foot. Confirmed against the Calxa packs this report
// replaces: Calxa prints Other Income below Operating Profit, once.
//
// This helper is now the single derivation for the scalar (single-month) case;
// generate/route.ts and the consolidated adapter both call it. Sign
// conventions are unchanged: revenue-like variance = actual − budget,
// expense-like variance = budget − actual, profit rows are revenue-like.
// Net Profit's VALUE is identical to the old formula — (rev+oi) − cogs −
// (opex+oe) ≡ rev − cogs − opex + oi − oe — so only GP, OP and the
// revenue/opex aggregates move.
// ─────────────────────────────────────────────────────────────────────────────

import { netProfitFromBuckets } from '@/lib/finance/net-profit'

export interface ProfitSummaryEntry {
  actual: number
  budget: number
  variance: number
  variance_percent: number
}

export interface ReportProfitSummary {
  revenue: ProfitSummaryEntry
  cogs: ProfitSummaryEntry
  gross_profit: { actual: number; budget: number; variance: number; gp_percent: number }
  opex: ProfitSummaryEntry
  operating_profit: { actual: number; budget: number; variance: number; op_percent: number }
  other_income: ProfitSummaryEntry
  other_expenses: ProfitSummaryEntry
  net_profit: { actual: number; budget: number; variance: number; np_percent: number }
}

export interface ProfitDerivation {
  summary: ReportProfitSummary
  gross_profit_row: ReportLine
  operating_profit_row: ReportLine
  net_profit_row: ReportLine
}

/** Section subtotals by category; omit a category the report doesn't have. */
export interface ProfitSectionInputs {
  revenue?: ReportLine
  cogs?: ReportLine
  opex?: ReportLine
  otherIncome?: ReportLine
  otherExpenses?: ReportLine
  /**
   * When false, the *_budget-derived extras (unspent_budget) are zeroed instead
   * of degenerating into "0 − YTD actual".
   */
  hasBudget: boolean
}

const pct = (amount: number, base: number): number =>
  base !== 0 ? (amount / Math.abs(base)) * 100 : 0

export function deriveProfitRows(inputs: ProfitSectionInputs): ProfitDerivation {
  const z: ReportLine = {
    account_name: '',
    xero_account_name: null,
    is_budget_only: false,
    actual: 0, budget: 0, variance_amount: 0, variance_percent: 0,
    ytd_actual: 0, ytd_budget: 0, ytd_variance_amount: 0, ytd_variance_percent: 0,
    unspent_budget: 0, budget_next_month: 0, budget_annual_total: 0,
    prior_year: null,
  }
  const rev = inputs.revenue ?? z
  const cogs = inputs.cogs ?? z
  const opex = inputs.opex ?? z
  const oi = inputs.otherIncome ?? z
  const oe = inputs.otherExpenses ?? z
  const { hasBudget } = inputs

  // Prior-year totals stay null unless at least one section carries data —
  // mirrors the pre-existing hasPriorYearData behaviour in the generate route.
  const sections = [rev, cogs, opex, oi, oe]
  const hasPriorYear = sections.some((s) => s.prior_year !== null && s.prior_year !== undefined)
  const py = (line: ReportLine) => line.prior_year ?? 0

  const np = (b: { revenue: number; cogs: number; opex: number; otherIncome: number; otherExpense: number }) =>
    netProfitFromBuckets(b)

  // ── scalar aggregates ──
  const gpActual = rev.actual - cogs.actual
  const gpBudget = rev.budget - cogs.budget
  const opActual = gpActual - opex.actual
  const opBudget = gpBudget - opex.budget
  const npActual = np({ revenue: rev.actual, cogs: cogs.actual, opex: opex.actual, otherIncome: oi.actual, otherExpense: oe.actual })
  const npBudget = np({ revenue: rev.budget, cogs: cogs.budget, opex: opex.budget, otherIncome: oi.budget, otherExpense: oe.budget })

  const gpYtdActual = rev.ytd_actual - cogs.ytd_actual
  const gpYtdBudget = rev.ytd_budget - cogs.ytd_budget
  const opYtdActual = gpYtdActual - opex.ytd_actual
  const opYtdBudget = gpYtdBudget - opex.ytd_budget
  const npYtdActual = np({ revenue: rev.ytd_actual, cogs: cogs.ytd_actual, opex: opex.ytd_actual, otherIncome: oi.ytd_actual, otherExpense: oe.ytd_actual })
  const npYtdBudget = np({ revenue: rev.ytd_budget, cogs: cogs.ytd_budget, opex: opex.ytd_budget, otherIncome: oi.ytd_budget, otherExpense: oe.ytd_budget })

  const gpAnnual = rev.budget_annual_total - cogs.budget_annual_total
  const opAnnual = gpAnnual - opex.budget_annual_total
  const npAnnual = np({
    revenue: rev.budget_annual_total, cogs: cogs.budget_annual_total, opex: opex.budget_annual_total,
    otherIncome: oi.budget_annual_total, otherExpense: oe.budget_annual_total,
  })

  const gpNext = rev.budget_next_month - cogs.budget_next_month
  const opNext = gpNext - opex.budget_next_month
  const npNext = np({
    revenue: rev.budget_next_month, cogs: cogs.budget_next_month, opex: opex.budget_next_month,
    otherIncome: oi.budget_next_month, otherExpense: oe.budget_next_month,
  })

  const gpPY = hasPriorYear ? py(rev) - py(cogs) : null
  const opPY = hasPriorYear ? (gpPY ?? 0) - py(opex) : null
  const npPY = hasPriorYear
    ? np({ revenue: py(rev), cogs: py(cogs), opex: py(opex), otherIncome: py(oi), otherExpense: py(oe) })
    : null

  const profitRow = (
    name: string,
    a: { actual: number; budget: number; ytdA: number; ytdB: number; annual: number; next: number; prior: number | null },
  ): ReportLine => ({
    account_name: name,
    xero_account_name: null,
    is_budget_only: false,
    actual: a.actual,
    budget: a.budget,
    variance_amount: a.actual - a.budget,
    variance_percent: pct(a.actual - a.budget, a.budget),
    ytd_actual: a.ytdA,
    ytd_budget: a.ytdB,
    ytd_variance_amount: a.ytdA - a.ytdB,
    ytd_variance_percent: pct(a.ytdA - a.ytdB, a.ytdB),
    unspent_budget: hasBudget ? a.annual - a.ytdA : 0,
    budget_next_month: a.next,
    budget_annual_total: a.annual,
    prior_year: a.prior,
  })

  const summary: ReportProfitSummary = {
    revenue: {
      actual: rev.actual, budget: rev.budget,
      variance: rev.actual - rev.budget,
      variance_percent: pct(rev.actual - rev.budget, rev.budget),
    },
    cogs: {
      actual: cogs.actual, budget: cogs.budget,
      variance: cogs.budget - cogs.actual,
      variance_percent: pct(cogs.budget - cogs.actual, cogs.budget),
    },
    gross_profit: {
      actual: gpActual, budget: gpBudget,
      variance: gpActual - gpBudget,
      gp_percent: pct(gpActual, rev.actual),
    },
    opex: {
      actual: opex.actual, budget: opex.budget,
      variance: opex.budget - opex.actual,
      variance_percent: pct(opex.budget - opex.actual, opex.budget),
    },
    operating_profit: {
      actual: opActual, budget: opBudget,
      variance: opActual - opBudget,
      op_percent: pct(opActual, rev.actual),
    },
    other_income: {
      actual: oi.actual, budget: oi.budget,
      variance: oi.actual - oi.budget,
      variance_percent: pct(oi.actual - oi.budget, oi.budget),
    },
    other_expenses: {
      actual: oe.actual, budget: oe.budget,
      variance: oe.budget - oe.actual,
      variance_percent: pct(oe.budget - oe.actual, oe.budget),
    },
    net_profit: {
      actual: npActual, budget: npBudget,
      variance: npActual - npBudget,
      np_percent: pct(npActual, rev.actual),
    },
  }

  return {
    summary,
    gross_profit_row: profitRow('Gross Profit', {
      actual: gpActual, budget: gpBudget, ytdA: gpYtdActual, ytdB: gpYtdBudget,
      annual: gpAnnual, next: gpNext, prior: gpPY,
    }),
    operating_profit_row: profitRow('Operating Profit', {
      actual: opActual, budget: opBudget, ytdA: opYtdActual, ytdB: opYtdBudget,
      annual: opAnnual, next: opNext, prior: opPY,
    }),
    net_profit_row: profitRow('Net Profit', {
      actual: npActual, budget: npBudget, ytdA: npYtdActual, ytdB: npYtdBudget,
      annual: npAnnual, next: npNext, prior: npPY,
    }),
  }
}
