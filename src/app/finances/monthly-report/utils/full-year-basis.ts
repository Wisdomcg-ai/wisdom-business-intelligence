import type { FullYearReport, FullYearLine, FullYearMonthData } from '../types'
import { hasApprovedBudget, hasForecastBudget } from './full-year-approved'

/**
 * What a month the year has not closed yet is FILLED WITH on the Full Year page.
 *
 * Calxa's "Current Year Budget" page — Urban Road's pages 16-18 — is the
 * actuals to the report month and then the APPROVED budget: every Sep-Jun cell
 * is budget_lines for version 72c658c0, and Projected Total is the sum of the
 * two. Ours printed the wizard forecast in those cells, which for Urban Road is
 * the same number on most accounts and a very different one on four: Wages
 * 76,182 a month against an approved 42,015, Contractors excl. Artists 0 against
 * 28,525. The annual totals nearly cancelled (Projected Net Profit 518,408 vs
 * 520,152) while every month and both rows were wrong — a page that ties at the
 * bottom and nowhere else.
 *
 * The approved budget is the basis whenever the report CARRIES one. The loader
 * only resolves it for a client on the budget store (budget_source =
 * 'budget_version') whose version actually answered, so this is the settings
 * rule and the "did the store answer" rule in one test, read off the payload —
 * the same evidence hasApprovedBudget already uses. A client on the forecast,
 * or on the store with nothing in force, keeps the forecast path.
 *
 * Display only. The loader's payload is unchanged — `budget`, `projected_total`
 * and the variances are still projection-vs-forecast — because the analysis
 * charts and the cashflow pages compose from the same report and are not this
 * page.
 */
export type FullYearBasis = 'approved_budget' | 'forecast'

export function fullYearBasis(report: FullYearReport | null | undefined): FullYearBasis {
  return hasApprovedBudget(report) && approvedBudgetGaps(report).length === 0 ? 'approved_budget' : 'forecast'
}

/**
 * The months the page would fill from the approved budget that the budget has
 * no rows for.
 *
 * The resolver only refuses when the REPORT month is ungoverned, so a version
 * that covers part of the year — a six-month Xero budget, say — still resolves,
 * and the loader then fills `approvedMonths[m] ?? 0` for every month it does
 * not mention. On the approved basis those months would print $0 under
 * "Budget" and drop out of Projected Total: a missing number shown as a
 * decision. A report with any gap is therefore NOT on the approved basis; it
 * keeps the forecast and says why (fullYearBasisNote).
 *
 * Read off `approved_months_covered`, which the loader sets from the resolved
 * lines. A payload without it (a snapshot frozen before the field existed)
 * cannot be checked and counts as covered — every version in prod when the
 * field shipped covered twelve months.
 */
export function approvedBudgetGaps(report: FullYearReport | null | undefined): string[] {
  const covered = report?.approved_months_covered
  if (!report || !Array.isArray(covered)) return []
  const has = new Set(covered)
  return report.gross_profit.months
    .filter((md) => md.source !== 'actual' && !has.has(md.month))
    .map((md) => md.month)
}

/**
 * The one sentence the page owes a reader about what fills its unclosed months,
 * or null when the title already says it.
 *
 * One sentence, not a stack: a budget-store client with no version and no
 * forecast used to get "the months after August are the forecast, not the
 * budget" and then "no forecast exists" beneath it — two notes contradicting
 * each other. And none at all on the approved basis, where the forecast is not
 * on the page: Distinct Directions (a locked FY2027 version, its only forecast
 * inactive) was told "Projected is actuals to date" above a Projected Total
 * that included ten months of approved budget.
 *
 * @param onBudgetStore the client's settings say the budget store is its yardstick.
 */
export function fullYearBasisNote(
  report: FullYearReport | null | undefined,
  onBudgetStore: boolean,
): string | null {
  if (!report || fullYearBasis(report) === 'approved_budget') return null
  const fy = `FY${report.fiscal_year}`
  const after = fullYearMonthLabel(report.last_actual_month)
  const gaps = approvedBudgetGaps(report)
  const partial = hasApprovedBudget(report) && gaps.length > 0
  // What the approved budget failed to do, when the client is held to one.
  const budgetClause = partial
    ? `The approved budget for ${fy} does not cover ${
        gaps.length === 1 ? fullYearMonthLabel(gaps[0]) : `${gaps.length} of the months after ${after}, from ${fullYearMonthLabel(gaps[0])}`
      }`
    : onBudgetStore
      ? `No approved budget is in force for ${fy}`
      : null

  if (!hasForecastBudget(report)) {
    return budgetClause
      ? `${budgetClause} and no forecast exists, so the months after ${after} have no figure and Projected is actuals to date.`
      : `No forecast exists for ${fy}, so the months after ${after} have no figure and Projected is actuals to date.`
  }
  return budgetClause ? `${budgetClause}, so the months after ${after} are the forecast, not the budget.` : null
}

/**
 * One month's figure on the given basis: the actual for a closed month, the
 * basis's budget for any other. The approved basis is only chosen when the
 * budget covers every unclosed month (approvedBudgetGaps), so the `?? 0` is an
 * account the budget does not mention — a real 0 — never a month it does not.
 * Never borrows the forecast: mixing yardsticks within one row is how a total
 * stops meaning anything.
 */
export function fullYearCell(md: FullYearMonthData, basis: FullYearBasis): number {
  if (md.source === 'actual') return md.actual
  return basis === 'approved_budget' ? (md.approved_budget ?? 0) : md.budget
}

/**
 * Projected Total, as the SUM OF THE MONTHS PRINTED beside it — derived here
 * rather than read from `projected_total`, which is forecast-basis. On the
 * forecast basis the two are the same number; on the approved basis only this
 * one reconciles across the row.
 */
export function fullYearProjected(line: FullYearLine, basis: FullYearBasis): number {
  return line.months.reduce((sum, md) => sum + fullYearCell(md, basis), 0)
}

/** The full-year yardstick the optional variance columns measure against. */
export function fullYearAnnualYardstick(line: FullYearLine, basis: FullYearBasis): number {
  return basis === 'approved_budget' ? (line.approved_annual_budget ?? 0) : line.annual_budget
}

/** Rows where more is better. Profit rows included — a derived row has a direction too. */
const INCOME_LIKE = new Set(['Revenue', 'Other Income', 'Gross Profit', 'Operating Profit', 'Net Profit'])

/**
 * Projected against the basis's own annual yardstick, favourable-positive. The
 * variance is measured against the SAME numbers the months are filled with: a
 * variance to one yardstick beside months from another is the mismatch this
 * module exists to remove.
 */
export function fullYearVariance(
  line: FullYearLine,
  basis: FullYearBasis,
): { amount: number; percent: number | null } {
  const projected = fullYearProjected(line, basis)
  const yardstick = fullYearAnnualYardstick(line, basis)
  const amount = INCOME_LIKE.has(line.category) ? projected - yardstick : yardstick - projected
  // Null, not 0.0%: a percentage of nothing is not "on budget".
  return { amount, percent: yardstick !== 0 ? (amount / Math.abs(yardstick)) * 100 : null }
}

/**
 * Operating Profit = Gross Profit − Operating Expenses, month by month, on the
 * payload's own fields so it can be printed on either basis.
 *
 * Calxa prints it between Total Expense and Other Income; the full-year payload
 * never carried one, so the page went Total Operating Expenses → Other Income →
 * Net Profit and the operating result Calxa prints for Urban Road (520,837)
 * had no row at all. Same
 * structure as deriveProfitRows in lib/monthly-report/shared, which the
 * executive summary uses. Null when there is no Operating Expenses section — a
 * row equal to Gross Profit under a different name says nothing — and null when
 * there is no Other Income or Other Expense section, for the same reason with
 * Net Profit.
 */
export function deriveFullYearOperatingProfit(report: FullYearReport): FullYearLine | null {
  const opex = report.sections.find((s) => s.category === 'Operating Expenses')
  if (!opex) return null
  // Nor when nothing sits between it and Net Profit. The loader drops empty
  // sections, so with no Other Income or Other Expense the two rows are the
  // same number twice — Precision's page printed exactly that.
  if (!report.sections.some((s) => s.category === 'Other Income' || s.category === 'Other Expenses')) return null
  const gp = report.gross_profit
  const months: FullYearMonthData[] = gp.months.map((g, i) => {
    const o = opex.subtotal.months[i]
    return {
      month: g.month,
      actual: g.actual - (o?.actual ?? 0),
      budget: g.budget - (o?.budget ?? 0),
      // Null only when neither side has one — the rule the loader's GP and NP use.
      approved_budget: g.approved_budget === null && (o?.approved_budget ?? null) === null
        ? null
        : (g.approved_budget ?? 0) - (o?.approved_budget ?? 0),
      prior_year: (g.prior_year || 0) - (o?.prior_year || 0),
      source: g.source,
    }
  })
  const projected = months.reduce((s, md) => s + (md.source === 'actual' ? md.actual : md.budget), 0)
  const annual = months.reduce((s, md) => s + md.budget, 0)
  return {
    account_name: 'Operating Profit',
    category: 'Operating Profit',
    months,
    projected_total: projected,
    annual_budget: annual,
    approved_annual_budget: months.some((md) => md.approved_budget !== null)
      ? months.reduce((s, md) => s + (md.approved_budget ?? 0), 0)
      : null,
    variance_amount: projected - annual,
    variance_percent: annual !== 0 ? ((projected - annual) / Math.abs(annual)) * 100 : 0,
  }
}

/**
 * The statement's section names in the pack's words. The route's categories
 * are internal keys; Calxa — and the client, for years — reads "Income",
 * "Expense", "Total Income", "Total Expense".
 */
const SECTION_LABELS: Record<string, string> = {
  'Revenue': 'Income',
  'Cost of Sales': 'Cost of Sales',
  'Operating Expenses': 'Expense',
  'Other Income': 'Other Income',
  'Other Expenses': 'Other Expense',
}

export function fullYearSectionLabel(category: string): string {
  return SECTION_LABELS[category] ?? category
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Jul 2026". Fixed three-letter months: en-AU's toLocaleDateString gives
 * "Sept", which is neither Calxa's label nor the width the column was sized for.
 */
export function fullYearMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`
}

/** "Jul 2026 - Jun 2027", from the months the page prints rather than from fiscal_year. */
export function fullYearPeriodLabel(report: FullYearReport): string {
  const months = report.gross_profit.months
  if (months.length === 0) return `FY${report.fiscal_year}`
  return `${fullYearMonthLabel(months[0].month)} - ${fullYearMonthLabel(months[months.length - 1].month)}`
}
