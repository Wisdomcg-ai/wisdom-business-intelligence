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
 * forecast otherwise — and `budgetLabel` records which. The legend prints
 * Calxa's "Budgets" for either (analysisChartLegend); the label decides only
 * whether there is a middle series at all. See the comment on the branch.
 *
 * Actual is null (not 0) for months the FY hasn't reached — the renderer draws
 * no bar rather than a zero bar, matching how Calxa's charts stop the actual
 * series at the last completed month while budget and prior-year run all 12.
 */
import type { FullYearReport } from '../../types'
import { hasApprovedBudget, hasForecastBudget, forecastAbsentNote } from '../../utils/full-year-approved'
import { packMonthYear, sectionDisplayLabel } from '../../services/pack-style'
import { PACK_BUDGET_LABEL } from '../../utils/budget-yardstick'

export type AnalysisChartSection = 'income' | 'cogs' | 'expense'

const SECTION_CONFIG: Record<AnalysisChartSection, { category: string; title: string }> = {
  income: { category: 'Revenue', title: 'Income Analysis' },
  cogs: { category: 'Cost of Sales', title: 'COGS Analysis' },
  expense: { category: 'Operating Expenses', title: 'Expenses Analysis' },
}

export interface AnalysisChartMonth {
  /** 'YYYY-MM' */
  month: string
  /** Month and year, e.g. 'Jul 2026' */
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
  /** The legend's name for the section: 'Income' / 'Cost of Sales' / 'Expense'. */
  noun: string
  /** First to last month on the axis, 'Jul 2026 - Jun 2027' — the title's period line. */
  period: string
  months: AnalysisChartMonth[]
  maxValue: number
  /**
   * Which yardstick the middle series is ('Approved Budget' or 'Budget') — or
   * null when there is none to plot, in which case `budgetAbsentNote` says why
   * in a sentence. Not the word the pack prints: the legend says "Budgets" for
   * either (see analysisChartLegend), and the page has no subtitle.
   */
  budgetLabel: string | null
  budgetAbsentNote: string | null
}

/** The three legend entries, in bar order — the middle one only when there is a series for it. */
export function analysisChartLegend(data: Pick<AnalysisChartData, 'noun' | 'budgetLabel'>): string[] {
  // Calxa's words, run-together "LastYear" included: these pages replace ones
  // the client has read every month, and the legend is how they find a bar.
  //
  // The middle word is Calxa's "Budgets" whichever yardstick the series is.
  // It said "Approved Budget" for a budget-store client while the statement
  // pages did; Matt's column-names decision (14 Sep 2026) put "Budgets" on
  // those pages, and the chart says what the table beneath it says.
  // `budgetLabel` still records which yardstick it is — only the word is shared.
  const middle = data.budgetLabel === null ? [] : [PACK_BUDGET_LABEL]
  return [`${data.noun} Actuals`, ...middle.map((w) => `${data.noun} ${w}`), `${data.noun} LastYear Actuals`]
}

export interface AnalysisChartAxis {
  min: number
  max: number
  step: number
  /** Gridline values, bottom to top, every one inside [min, max]. */
  ticks: number[]
}

/**
 * The value axis, the way Calxa scales it.
 *
 * Measured off the August 2026 pack: the plot runs 10% past the tallest bar
 * (Income's 800,000 → a frame at 880,000; Expenses' 273,794 → 301,174, one
 * hair above its 300,000 gridline), and the gridlines step on the smallest of
 * 1, 2, 3 or 5 × 10ⁿ that fits the frame no more than twelve and a half times
 * — 100,000 on Income, 50,000 on COGS, 30,000 on Expenses.
 *
 * Both halves hold on all fourteen analysis charts in the Calxa packs on file
 * (Urban Road, Distinct Directions, Dragon, JDS, IICT): every frame is 1.100×
 * its tallest bar, and every step is the one this rule picks. The bounds on
 * the cap come from two of them. IICT's COGS page grids a 121,800 frame on
 * 10,000 — 12.18 intervals, so the cap is above that — and Distinct
 * Directions' Income page passes over 50,000 at 12.96 for 100,000. There is
 * no 2.5: Urban Road's Expenses page passes over 25,000 at 12.03 intervals,
 * below the 12.18 IICT kept.
 *
 * The old step was a fifth of the range rounded UP to a leading digit, which
 * put Income and COGS both on 200,000: three gridlines on a COGS page Calxa
 * gives eleven, and a reader could not place a bar within 50,000 of its value.
 *
 * A negative month (a rebate-heavy COGS month, contra revenue) gets the same
 * 10% below zero. The figures themselves are never touched.
 */
export function analysisChartAxis(minValue: number, maxValue: number): AnalysisChartAxis {
  let max = Math.max(0, maxValue) * 1.1
  let min = Math.min(0, minValue) * 1.1
  if (!(max - min > 0) || !Number.isFinite(max - min)) return { min: 0, max: 1, step: 1, ticks: [0, 1] }

  // Whole dollars only, because the gridlines print as whole dollars. A chart
  // this small is one stray posting in an otherwise empty section, and a 0.05
  // step printed "0" seven times. Under a dollar the frame widens to the next
  // whole dollar either side, so there are two gridlines to read the bar
  // against — the bar itself is drawn at its figure regardless.
  if (max - min < 1) {
    min = Math.floor(min)
    max = Math.ceil(max)
  }
  const span = max - min

  const MAX_INTERVALS = 12.5
  const LADDER = [1, 2, 3, 5, 10]
  // The smallest ladder value that fits. `mag` is the power of ten at or below
  // span / MAX_INTERVALS, so ten of it always fits; floored at 1 so a small
  // chart still steps in whole dollars.
  const mag = Math.max(1, Math.pow(10, Math.floor(Math.log10(span / MAX_INTERVALS))))
  const step = LADDER.map((k) => k * mag).find((s) => span / s <= MAX_INTERVALS + 1e-9) ?? 10 * mag

  const ticks: number[] = []
  // Integer multiples, so 0.1 + 0.2 never lands a gridline a hair off its label.
  // `|| 0` because ceil of a hair below zero is -0, which prints as "-0".
  for (let i = Math.ceil(min / step - 1e-9); i * step <= max + 1e-9; i++) ticks.push(i * step || 0)
  return { min, max, step, ticks }
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
    // The pack's fixed month table, not toLocaleDateString: en-AU's short
    // September is "Sept", and the month alone left twelve bars that could be
    // any year's. Calxa's axis reads "Sep 2026".
    label: packMonthYear(m.month),
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

  const period = `${months[0].label} - ${months[months.length - 1].label}`

  // The legend names the section in the statements' words, singular ("Total
  // Expense"), from the same table the Actual vs Budget pages print — not
  // WisdomBI's category keys.
  const noun = sectionDisplayLabel(cfg.category)

  return { section, title: cfg.title, noun, period, months, maxValue, budgetLabel, budgetAbsentNote }
}
