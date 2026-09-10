/**
 * WD.1 — Actual / Budget / Last-Year analysis chart data.
 *
 * The single most-used chart in every Calxa pack: 12 monthly bar groups of
 * Actuals, Budgets and Last-Year Actuals, one chart per P&L section (Income /
 * COGS / Expenses). The web Trends tab has computed this shape since Phase 27;
 * the PDF never rendered it — its only trend chart carried actuals alone.
 *
 * Section-scoped by design: each chart reads ONE section's subtotal months, so
 * the Other-Income fold question never arises here.
 *
 * The middle series is whichever yardstick the rest of the pack holds this
 * client to — the approved budget once they are on the budget store, the
 * forecast otherwise — and `budgetLabel` carries the word for it. See the
 * comment on the branch.
 *
 * Actual is null (not 0) for months the FY hasn't reached — the renderer draws
 * no bar rather than a zero bar, matching how Calxa's charts stop the actual
 * series at the last completed month while budget and prior-year run all 12.
 */
import type { FullYearReport } from '../../types'
import { hasApprovedBudget, hasForecastBudget, forecastAbsentNote } from '../../utils/full-year-approved'

export type AnalysisChartSection = 'income' | 'cogs' | 'expense'

const SECTION_CONFIG: Record<
  AnalysisChartSection,
  { category: string; title: string }
> = {
  income: { category: 'Revenue', title: 'Income Analysis' },
  cogs: { category: 'Cost of Sales', title: 'COGS Analysis' },
  expense: { category: 'Operating Expenses', title: 'Expenses Analysis' },
}

export interface AnalysisChartMonth {
  /** 'YYYY-MM' */
  month: string
  /** Short label, e.g. 'Jul' */
  label: string
  /** null for months without actuals yet — draw no bar, not a zero bar. */
  actual: number | null
  /**
   * The yardstick series. Null on the same terms as `actual`: a month the
   * chosen yardstick does not answer for draws no bar. A yardstick that
   * genuinely budgets nothing for a month is a real 0 and still draws.
   */
  budget: number | null
  priorYear: number
}

export interface AnalysisChartData {
  section: AnalysisChartSection
  title: string
  months: AnalysisChartMonth[]
  maxValue: number
  /**
   * What the middle series IS, in the word the legend and the subtitle both
   * use — or null when there is no yardstick to plot at all, in which case
   * `budgetAbsentNote` says why in a sentence.
   */
  budgetLabel: string | null
  budgetAbsentNote: string | null
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'short' })
}

export function transformAnalysisChartData(
  report: FullYearReport,
  section: AnalysisChartSection,
): AnalysisChartData | null {
  const cfg = SECTION_CONFIG[section]
  const sec = report.sections?.find((s) => s.category === cfg.category)
  if (!sec?.subtotal?.months?.length) return null

  /*
   * Which of the two yardsticks this chart plots.
   *
   * The Calxa page this replaces measures the section against the budget the
   * client was held to, and for a client on the budget store that is the
   * APPROVED budget — the same number the Budget-vs-Actual table on the very
   * next page of the pack is measured against, and the same number the Full
   * Year page calls "Approved Budget". Reading `m.budget` there plotted the
   * forecast instead: a different yardstick, unlabelled, one page above a
   * table holding the client to the other one.
   *
   * It also silently emptied the series. Distinct Directions has an approved
   * FY2027 budget and no active forecast, so every m.budget is 0 while
   * `maxValue` stayed non-zero on the actuals — three landscape pages headed
   * "Income / COGS / Expenses Analysis", legended "Budget", with no budget
   * bar anywhere on them.
   *
   * Ten of the eleven clients with a settings row are still on a forecast and
   * take the second branch, which is byte-for-byte what this function did
   * before.
   */
  const approved = hasApprovedBudget(report)
  const forecast = hasForecastBudget(report)
  const budgetLabel = approved ? 'Approved Budget' : forecast ? 'Budget' : null
  const budgetAbsentNote = budgetLabel === null ? forecastAbsentNote(report) : null

  const months: AnalysisChartMonth[] = sec.subtotal.months.map((m) => ({
    month: m.month,
    label: monthLabel(m.month),
    actual: m.source === 'actual' ? m.actual : null,
    budget: approved ? m.approved_budget : forecast ? m.budget : null,
    priorYear: m.prior_year ?? 0,
  }))

  const maxValue = Math.max(
    0,
    ...months.flatMap((m) => [m.actual ?? 0, m.budget ?? 0, m.priorYear]),
  )
  // A chart with nothing on any series is not worth a page.
  if (maxValue === 0) return null

  return { section, title: cfg.title, months, maxValue, budgetLabel, budgetAbsentNote }
}
