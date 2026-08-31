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
 * Actual is null (not 0) for months the FY hasn't reached — the renderer draws
 * no bar rather than a zero bar, matching how Calxa's charts stop the actual
 * series at the last completed month while budget and prior-year run all 12.
 */
import type { FullYearReport } from '../../types'

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
  budget: number
  priorYear: number
}

export interface AnalysisChartData {
  section: AnalysisChartSection
  title: string
  months: AnalysisChartMonth[]
  maxValue: number
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

  const months: AnalysisChartMonth[] = sec.subtotal.months.map((m) => ({
    month: m.month,
    label: monthLabel(m.month),
    actual: m.source === 'actual' ? m.actual : null,
    budget: m.budget,
    priorYear: m.prior_year ?? 0,
  }))

  const maxValue = Math.max(
    0,
    ...months.flatMap((m) => [m.actual ?? 0, m.budget, m.priorYear]),
  )
  // A chart with nothing on any series is not worth a page.
  if (maxValue === 0) return null

  return { section, title: cfg.title, months, maxValue }
}
