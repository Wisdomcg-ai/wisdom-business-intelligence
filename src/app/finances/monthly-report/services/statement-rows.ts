/**
 * The ROWS of the Actual vs Budget pages, decided apart from how they are drawn.
 *
 * The PDF service used to build these inline, cell by cell, inside the
 * autoTable call — so the only way to check that the summary page said
 * "Total Income 450,000 / 527,562 …" was to render a PDF and read it. These are
 * pure: a report goes in, a list of typed rows comes out, and a test can hold
 * them against the Calxa pack figure by figure.
 *
 * Calxa's shape, pages 2, 4, 6 and 10-11 of Urban Road's August 2026 pack:
 *
 *   summary   a grey heading row, then a bold "Total <section>" row, per
 *             section; Gross Profit, Operating Profit and Net Profit between;
 *             then Additional Information — the two margins across every column
 *   detail    the section heading; accounts indented beneath; for a grouped
 *             section the GROUP row carries the group's figures, bold, with its
 *             accounts indented one level further — there is no separate
 *             "Total <group>" row; then "Total <section>"
 */
import type { GeneratedReport, ReportLine, ReportSection } from '../types'
import { groupExpenseLines, withoutHeadingEcho } from '@/lib/monthly-report/expense-groups'
import { withoutSilentLines } from '@/lib/monthly-report/empty-lines'
import { sectionDisplayLabel, sectionTotalLabel, marginOf, marginPercentText, marginPointsText } from './pack-style'

// ── Summary page ────────────────────────────────────────────────────────────

export interface SummaryFigures {
  budget: number
  actual: number
  variance: number
  ytdBudget: number
  ytdActual: number
  ytdVariance: number
  unspent: number
  nextMonth: number
  annual: number
}

export type SummaryRow =
  | { kind: 'heading'; label: string }
  | { kind: 'total'; label: string; figures: SummaryFigures }
  | { kind: 'profit'; label: string; figures: SummaryFigures; key: 'gp' | 'op' | 'np' }

const fromSubtotal = (st: ReportLine | undefined): SummaryFigures => ({
  budget: st?.budget ?? 0,
  actual: st?.actual ?? 0,
  variance: st?.variance_amount ?? 0,
  ytdBudget: st?.ytd_budget ?? 0,
  ytdActual: st?.ytd_actual ?? 0,
  ytdVariance: st?.ytd_variance_amount ?? 0,
  unspent: st?.unspent_budget ?? 0,
  nextMonth: st?.budget_next_month ?? 0,
  annual: st?.budget_annual_total ?? 0,
})

/**
 * The summary page's rows. The figures are the ones the page has always
 * printed — the month from report.summary, the rest from each section's
 * subtotal, Operating Profit derived as Gross Profit less Operating Expenses —
 * only the row structure and the labels change.
 */
export function executiveSummaryRows(report: GeneratedReport): SummaryRow[] {
  const s = report.summary
  const gp = report.gross_profit_row
  const np = report.net_profit_row
  const find = (c: string) => report.sections.find((sec) => sec.category === c)
  const revenue = find('Revenue')
  const cogs = find('Cost of Sales')
  const opex = find('Operating Expenses')
  const otherIncome = find('Other Income')
  const otherExpenses = find('Other Expenses')

  const rows: SummaryRow[] = []
  const section = (category: string, figures: SummaryFigures) => {
    rows.push({ kind: 'heading', label: sectionDisplayLabel(category) })
    rows.push({ kind: 'total', label: sectionTotalLabel(category), figures })
  }

  section('Revenue', {
    ...fromSubtotal(revenue?.subtotal),
    budget: s.revenue.budget, actual: s.revenue.actual, variance: s.revenue.variance,
  })
  section('Cost of Sales', {
    ...fromSubtotal(cogs?.subtotal),
    budget: s.cogs.budget, actual: s.cogs.actual, variance: s.cogs.variance,
  })
  rows.push({
    kind: 'profit', key: 'gp', label: 'Gross Profit',
    figures: {
      ...fromSubtotal(gp),
      budget: s.gross_profit.budget, actual: s.gross_profit.actual, variance: s.gross_profit.variance,
    },
  })
  const opexFigures: SummaryFigures = {
    ...fromSubtotal(opex?.subtotal),
    budget: s.opex.budget, actual: s.opex.actual, variance: s.opex.variance,
  }
  section('Operating Expenses', opexFigures)
  rows.push({
    kind: 'profit', key: 'op', label: 'Operating Profit',
    figures: {
      budget: s.gross_profit.budget - s.opex.budget,
      actual: s.gross_profit.actual - s.opex.actual,
      variance: s.gross_profit.variance + s.opex.variance,
      ytdBudget: gp.ytd_budget - opexFigures.ytdBudget,
      ytdActual: gp.ytd_actual - opexFigures.ytdActual,
      ytdVariance: gp.ytd_variance_amount + opexFigures.ytdVariance,
      unspent: (gp.unspent_budget || 0) - opexFigures.unspent,
      nextMonth: (gp.budget_next_month || 0) - opexFigures.nextMonth,
      annual: (gp.budget_annual_total || 0) - opexFigures.annual,
    },
  })
  if (otherIncome) section('Other Income', fromSubtotal(otherIncome.subtotal))
  if (otherExpenses) section('Other Expenses', fromSubtotal(otherExpenses.subtotal))
  rows.push({
    kind: 'profit', key: 'np', label: 'Net Profit',
    figures: {
      ...fromSubtotal(np),
      budget: s.net_profit.budget, actual: s.net_profit.actual, variance: s.net_profit.variance,
    },
  })
  return rows
}

export interface MarginCells {
  budget: string
  actual: string
  variance: string
  ytdBudget: string
  ytdActual: string
  ytdVariance: string
  unspent: string
  nextMonth: string
  annual: string
}

/**
 * One Additional Information row — a profit as a margin of income, in every
 * column the table above it has.
 *
 * The page used to print the month's ACTUAL margin alone, to one decimal, in a
 * separate little table (55.9%). Calxa runs it across the whole row, and the
 * derived columns are differences of margins, not margins of differences:
 *
 *   Variance        actual margin − budget margin, in points
 *   Unspent Budget  annual budget margin − YTD actual margin, in points
 *
 * Checked against August: Gross Profit 41% | 56% | 15 | 41% | 46% | 5 | (6) |
 * 38% | 40% — the same integers Calxa prints from the same ledger.
 */
export function marginRow(profit: SummaryFigures, income: SummaryFigures): MarginCells {
  const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b)
  const budget = marginOf(profit.budget, income.budget)
  const actual = marginOf(profit.actual, income.actual)
  const ytdBudget = marginOf(profit.ytdBudget, income.ytdBudget)
  const ytdActual = marginOf(profit.ytdActual, income.ytdActual)
  const annual = marginOf(profit.annual, income.annual)
  return {
    budget: marginPercentText(profit.budget, income.budget),
    actual: marginPercentText(profit.actual, income.actual),
    variance: marginPointsText(diff(actual, budget)),
    ytdBudget: marginPercentText(profit.ytdBudget, income.ytdBudget),
    ytdActual: marginPercentText(profit.ytdActual, income.ytdActual),
    ytdVariance: marginPointsText(diff(ytdActual, ytdBudget)),
    unspent: marginPointsText(diff(annual, ytdActual)),
    nextMonth: marginPercentText(profit.nextMonth, income.nextMonth),
    annual: marginPercentText(profit.annual, income.annual),
  }
}

// ── Detail tables ───────────────────────────────────────────────────────────

export type DetailRow =
  | { kind: 'section'; label: string }
  /** A group heading that carries the group's own figures. */
  | { kind: 'group'; label: string; line: ReportLine }
  | { kind: 'line'; line: ReportLine; indent: 1 | 2 }
  | { kind: 'total'; label: string; line: ReportLine }

/**
 * One section of an Actual vs Budget detail table, top to bottom.
 *
 * Dormant accounts (nothing actual, nothing budgeted, anywhere) are left out,
 * as they have been since #497. A section with no groups is the flat list it
 * always was, one indent under its heading.
 */
export function sectionDetailRows(
  section: ReportSection,
  groupOrder: readonly string[] | null | undefined,
): DetailRow[] {
  const label = sectionDisplayLabel(section.category)
  const rows: DetailRow[] = [{ kind: 'section', label }]
  for (const g of withoutHeadingEcho(groupExpenseLines(withoutSilentLines(section.lines), groupOrder, section.category), label)) {
    // The group row IS the subtotal. Printing an empty heading and then a
    // "Total Employment Expense" row nine lines later added a row per group —
    // nine on Urban Road's expense page, which is what pushed it from Calxa's
    // two pages to three.
    if (g.name && g.subtotal) rows.push({ kind: 'group', label: g.name, line: g.subtotal })
    for (const line of g.lines) rows.push({ kind: 'line', line, indent: g.name ? 2 : 1 })
  }
  rows.push({ kind: 'total', label: sectionTotalLabel(section.category), line: section.subtotal })
  return rows
}
