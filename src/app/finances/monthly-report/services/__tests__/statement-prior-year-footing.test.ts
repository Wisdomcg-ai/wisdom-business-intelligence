/**
 * The prior-year column has to add up.
 *
 * Distinct Directions' August 2026 pack printed "Total Other Income ... 9,484"
 * in the prior-year column beneath one visible account, Interest Income, whose
 * prior year is 3. The other 9,481 was Other Revenue — nothing this year, $9,481
 * in August 2025 — and the silent-line rule hid it: it tested
 * `prior_year_actual`, a field nothing emits, so every account whose only money
 * was last year's read as dormant. The section total, built by the generate
 * route from every line, kept it. Revenue hid 1,912 the same way, Operating
 * Expenses 1,157.
 *
 * Figures are DD's generated report for August 2026, to the cent.
 */
import { describe, it, expect } from 'vitest'
import { sectionDetailRows } from '../statement-rows'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, pageContaining, textRuns } from './pdf-pack-fixture'
import type { GeneratedReport, ReportLine, ReportSection } from '../../types'

type Figures = [
  actual: number, budget: number, variance: number,
  ytdActual: number, ytdBudget: number, ytdVariance: number,
  unspent: number, nextMonth: number, annual: number, priorYear: number | null,
]

const l = (account_name: string, f: Figures, extra: Partial<ReportLine> = {}): ReportLine => ({
  account_name,
  xero_account_name: account_name,
  is_budget_only: false,
  actual: f[0], budget: f[1], variance_amount: f[2], variance_percent: 0,
  ytd_actual: f[3], ytd_budget: f[4], ytd_variance_amount: f[5], ytd_variance_percent: 0,
  unspent_budget: f[6], budget_next_month: f[7], budget_annual_total: f[8],
  prior_year: f[9],
  ...extra,
})

const OTHER_INCOME: ReportSection = {
  category: 'Other Income',
  lines: [
    l('FBT Contribution Journal', [0, 0, 0, 0, 0, 0, 0, 0, 0, null]),
    l('Other Revenue', [0, 0, 0, 0, 0, 0, 0, 0, 0, 9481]),
    l('Interest Income', [150.8, 0, 150.8, 262.6, 0, 262.6, -262.6, 0, 0, 2.81]),
  ],
  subtotal: l('Total Other Income', [150.8, 0, 150.8, 262.6, 0, 262.6, -262.6, 0, 0, 9483.81]),
}

const REVENUE: ReportSection = {
  category: 'Revenue',
  lines: [
    l('BATHURST: Psychological Treatment Income', [0, 0, 0, 0, 0, 0, 0, 0, 0, null]),
    l('ORANGE: Psychological Treatment NDIS', [0, 0, 0, 0, 0, 0, 0, 0, 0, 1980.43]),
    l('DUBBO: Psychological Treatment NDIS', [505.98, 0, 505.98, 505.98, 0, 505.98, -505.98, 0, 0, null]),
    l('BATHURST: Psychological Assessment Income', [0, 0, 0, 0, 0, 0, 0, 0, 0, 546.43]),
    l('BATHURST: Behavioural Assessment Income', [0, 222877, -222877, 0, 475623, -475623, 3310549, 272118, 3310549, null]),
    l('ORANGE: Behavioural Assessment Income', [0, 130082, -130082, 0, 296371, -296371, 2868240, 223535, 2868240, null], { is_budget_only: true }),
    l('DUBBO: Behavioural Assessment Income', [0, 52562, -52562, 0, 118376, -118376, 795179, 56322, 795179, null], { is_budget_only: true }),
    l('Psych Team 1', [46719.65, 0, 46719.65, 92807.7, 0, 92807.7, -92807.7, 0, 0, 17950.95]),
    l('Psych Team 2', [4488.84, 0, 4488.84, 10418.07, 0, 10418.07, -10418.07, 0, 0, 232.99]),
    l('Psych Team 3', [0, 0, 0, 0, 0, 0, 0, 0, 0, -615]),
    l('Psych Team 4', [600, 0, 600, 1323.15, 0, 1323.15, -1323.15, 0, 0, 261.18]),
    l('BIS Team 1', [190307.79, 0, 190307.79, 375405.58, 0, 375405.58, -375405.58, 0, 0, 156081.18]),
    l('BIS Team 2', [19046.55, 0, 19046.55, 43550.42, 0, 43550.42, -43550.42, 0, 0, 32706.5]),
    l('BIS Team 3', [32645.77, 0, 32645.77, 82831.47, 0, 82831.47, -82831.47, 0, 0, 52002.61]),
    l('BIS Team 4', [106279.88, 0, 106279.88, 235998.76, 0, 235998.76, -235998.76, 0, 0, 93015.97]),
    l('BIS Team 5', [18033.94, 0, 18033.94, 39091.75, 0, 39091.75, -39091.75, 0, 0, 31619.65]),
    l('BIS Team 6', [52621.51, 0, 52621.51, 110999.44, 0, 110999.44, -110999.44, 0, 0, 31574.66]),
  ],
  subtotal: l('Total Revenue', [471249.91, 405521, 65728.91, 992932.32, 890370, 102562.32, 5981035.68, 551975, 6973968, 417357.55]),
}

const cents = (n: number) => Math.round(n * 100)
const visibleLines = (section: ReportSection, priorYear: boolean) =>
  sectionDetailRows(section, null, { priorYear }).flatMap((r) => (r.kind === 'line' ? [r.line] : []))

describe('with the prior-year column printed, every section foots in it', () => {
  it("DD's Total Other Income of 9,484 sits over rows that add up to it", () => {
    const shown = visibleLines(OTHER_INCOME, true)
    expect(shown.map((x) => x.account_name)).toEqual(['Other Revenue', 'Interest Income'])
    expect(shown.reduce((s, x) => s + cents(x.prior_year ?? 0), 0)).toBe(cents(OTHER_INCOME.subtotal.prior_year!))
  })

  it('Revenue keeps the three accounts whose only money was August 2025', () => {
    const shown = visibleLines(REVENUE, true).map((x) => x.account_name)
    expect(shown).toContain('ORANGE: Psychological Treatment NDIS')
    expect(shown).toContain('BATHURST: Psychological Assessment Income')
    expect(shown).toContain('Psych Team 3')
    // Silent in every column, last year included: still left out.
    expect(shown).not.toContain('BATHURST: Psychological Treatment Income')
  })

  it('every figure column foots, not only the prior year', () => {
    for (const section of [OTHER_INCOME, REVENUE]) {
      const shown = visibleLines(section, true)
      const sum = (pick: (x: ReportLine) => number) => shown.reduce((s, x) => s + cents(pick(x)), 0)
      expect(sum((x) => x.prior_year ?? 0)).toBe(cents(section.subtotal.prior_year!))
      expect(sum((x) => x.actual)).toBe(cents(section.subtotal.actual))
      expect(sum((x) => x.budget)).toBe(cents(section.subtotal.budget))
      expect(sum((x) => x.ytd_actual)).toBe(cents(section.subtotal.ytd_actual))
      expect(sum((x) => x.budget_annual_total)).toBe(cents(section.subtotal.budget_annual_total))
    }
  })
})

describe('with the prior-year column switched off, nothing changes', () => {
  it('an account whose only money is last year stays out — no column would show it', () => {
    expect(visibleLines(OTHER_INCOME, false).map((x) => x.account_name)).toEqual(['Interest Income'])
    expect(visibleLines(REVENUE, false).map((x) => x.account_name)).not.toContain('Psych Team 3')
  })
})

describe('the rendered statement', () => {
  const ddAugust = (showPriorYear: boolean): GeneratedReport => {
    const base = fixtureReport()
    return {
      ...base,
      settings: { ...base.settings, show_prior_year: showPriorYear },
      sections: [base.sections[0], base.sections[1], OTHER_INCOME],
    }
  }
  const layout = {
    version: 1 as const,
    pages: [{
      id: 'table', orientation: 'landscape' as const,
      widgets: [{ id: 't', type: 'budget_vs_actual' as const, col: 0, row: 0, colSpan: 3, rowSpan: 3 }],
    }],
  }

  it('prints Other Revenue and its 9,481 above the 9,484 total', () => {
    const doc: any = new MonthlyReportPDFService(ddAugust(true), { pdfLayout: layout }).generate()
    const page = pageContaining(doc, 'Total Other Income')
    const runs = textRuns(doc, page)
    expect(runs).toContain('Other Revenue')
    expect(runs).toContain('9,481')
    expect(runs).toContain('9,484')
  })

  it('leaves it out when the pack does not print the prior-year column', () => {
    const doc: any = new MonthlyReportPDFService(ddAugust(false), { pdfLayout: layout }).generate()
    const runs = textRuns(doc, pageContaining(doc, 'Total Other Income'))
    expect(runs).not.toContain('Other Revenue')
    expect(runs).toContain('Interest Income')
  })
})
