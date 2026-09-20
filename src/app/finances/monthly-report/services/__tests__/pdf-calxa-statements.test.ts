/**
 * The Actual vs Budget pages against Calxa's, with Urban Road's August 2026
 * figures (snapshot 074486a6's section subtotals, to the cent).
 *
 * Calxa's August pack printed these pages from the same ledger, less one $854
 * credit note on Returns & Allowances that was posted after Calxa ran — so
 * every income-side figure here is Calxa's minus 854, and every margin and
 * every expense figure is Calxa's exactly.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { executiveSummaryRows, marginRow, sectionDetailRows, type SummaryFigures } from '../statement-rows'
import {
  statementColumns,
  packMonthYear,
  shortPeriodMonth,
  ytdPeriodLabel,
  marginPercentText,
  marginPointsText,
  sectionDisplayLabel,
} from '../pack-style'
import { fixtureReport, textRuns, pageContaining, docText } from './pdf-pack-fixture'
import type { GeneratedReport, ReportLine } from '../../types'
import type { PDFLayout } from '../../types/pdf-layout'

type Figures = Pick<ReportLine,
  'budget' | 'actual' | 'variance_amount' | 'ytd_budget' | 'ytd_actual' | 'ytd_variance_amount' |
  'unspent_budget' | 'budget_next_month' | 'budget_annual_total'>

const l = (account_name: string, f: Figures, extra: Partial<ReportLine> = {}): ReportLine => ({
  account_name,
  xero_account_name: account_name,
  is_budget_only: false,
  variance_percent: 0,
  ytd_variance_percent: 0,
  prior_year: null,
  ...f,
  ...extra,
})

const f = (
  budget: number, actual: number, variance_amount: number,
  ytd_budget: number, ytd_actual: number, ytd_variance_amount: number,
  unspent_budget: number, budget_next_month: number, budget_annual_total: number,
): Figures => ({ budget, actual, variance_amount, ytd_budget, ytd_actual, ytd_variance_amount, unspent_budget, budget_next_month, budget_annual_total })

// Snapshot subtotals, Urban Road Pty Ltd, August 2026.
const REVENUE = f(450000, 527561.8, 77561.8, 900000, 1022778.83, 122778.83, 4877222.17, 450000, 5900001)
const COGS = f(264697, 232736.92, 31960.08, 529394, 550348.72, -20954.72, 2981196.28, 279697, 3531545)
const OPEX = f(163783, 162234.55, 1548.45, 317099, 325830.39, -8731.39, 1615735.61, 155047, 1941566)
const OTHER_INCOME = f(0, 110.93, 110.93, 0, 168.8, 168.8, -168.8, 0, 0)
const GP = f(185303, 294824.88, 109521.88, 370606, 472430.11, 101824.11, 1896025.89, 170303, 2368456)
const NP = f(21520, 132701.26, 111181.26, 53507, 146768.52, 93261.52, 280121.48, 15256, 426890)

const EMPLOYMENT: ReportLine[] = [
  l('Employ - Other Expenses', f(0, 0, 0, 0, 0, 0, 0, 0, 0), { group: 'Employment Expense' }),
  l('Employ - Staff Amenities', f(450, 1240.81, -790.81, 900, 1369.85, -469.85, 4030.15, 450, 5400), { group: 'Employment Expense' }),
  l('Employ - Staff Recruitment', f(208, 208.16, -0.16, 416, 416.32, -0.32, 2079.68, 208, 2496), { group: 'Employment Expense' }),
  l('Employ - Superannuation', f(6302, 6302.35, -0.35, 11344, 11344.23, -0.23, 56363.77, 5042, 67708), { group: 'Employment Expense' }),
  l('Employ - Wages & Salaries', f(52519, 52519.25, -0.25, 94534, 94534.65, -0.65, 469687.35, 42015, 564222), { group: 'Employment Expense' }),
  l("Employ - Workers' Compensation", f(0, 0, 0, 0, 0, 0, 9110, 911, 9110), { group: 'Employment Expense' }),
]
const BANK_REVALUATIONS = l('Bank Revaluations', f(20, 0, 20, 40, 0, 40, 240, 20, 240), { group: 'Bank and Other Fees', is_budget_only: true })

function urbanRoadAugust(): GeneratedReport {
  const base = fixtureReport()
  return {
    ...base,
    budget_source: 'budget_version',
    budget_forecast_name: 'Overall Budget (Xero, rev 12 Aug 2026)',
    settings: {
      ...base.settings,
      show_ytd: true,
      show_unspent_budget: true,
      show_budget_next_month: true,
      show_budget_annual_total: true,
      show_prior_year: false,
      expense_group_order: ['Employment Expense', 'Bank and Other Fees'],
    },
    sections: [
      { category: 'Revenue', lines: [l('Canvas Sales', f(279320, 295826.71, 16506.71, 558640, 633228.59, 74588.59, 3022677.41, 279320, 3655906))], subtotal: l('Total Revenue', REVENUE) },
      { category: 'Cost of Sales', lines: [l('Antons Canvas', f(172488, 156163, 16325, 344976, 364428, -19452, 1893980, 172488, 2258408))], subtotal: l('Total Cost of Sales', COGS) },
      { category: 'Operating Expenses', lines: [...EMPLOYMENT, BANK_REVALUATIONS], subtotal: l('Total Operating Expenses', OPEX) },
      { category: 'Other Income', lines: [l('Interest Income', OTHER_INCOME)], subtotal: l('Total Other Income', OTHER_INCOME) },
    ],
    summary: {
      revenue: { actual: 527561.8, budget: 450000, variance: 77561.8, variance_percent: 17.24 },
      cogs: { actual: 232736.92, budget: 264697, variance: 31960.08, variance_percent: 12.07 },
      gross_profit: { actual: 294824.88, budget: 185303, variance: 109521.88, gp_percent: 55.88 },
      opex: { actual: 162234.55, budget: 163783, variance: 1548.45, variance_percent: 0.95 },
      net_profit: { actual: 132701.26, budget: 21520, variance: 111181.26, np_percent: 25.15 },
    },
    gross_profit_row: l('Gross Profit', GP),
    net_profit_row: l('Net Profit', NP),
  }
}

/** jsPDF writes the em dash as one WinAnsi byte, so match either side of it. */
const isTitle = (run: string, subject: string, entity: string) =>
  run.startsWith(`${subject} `) && run.endsWith(` ${entity}`) && run.length <= subject.length + entity.length + 3

const rounded = (x: SummaryFigures) => [
  x.budget, x.actual, x.variance, x.ytdBudget, x.ytdActual, x.ytdVariance, x.unspent, x.nextMonth, x.annual,
].map(Math.round)

describe('the summary page rows (Calxa page 2)', () => {
  const rows = executiveSummaryRows(urbanRoadAugust())

  it('runs heading, total, heading, total, Gross Profit … Net Profit, in Calxa\'s words', () => {
    expect(rows.map((r) => r.label)).toEqual([
      'Income', 'Total Income',
      'Cost of Sales', 'Total Cost of Sales',
      'Gross Profit',
      'Expense', 'Total Expense',
      'Operating Profit',
      'Other Income', 'Total Other Income',
      'Net Profit',
    ])
    expect(rows.filter((r) => r.kind === 'heading').map((r) => r.label)).toEqual(['Income', 'Cost of Sales', 'Expense', 'Other Income'])
  })

  it('carries August\'s figures on every total and profit row', () => {
    const fig = (label: string) => {
      const r = rows.find((x) => x.label === label)
      if (!r || r.kind === 'heading') throw new Error(label)
      return rounded(r.figures)
    }
    expect(fig('Total Income')).toEqual([450000, 527562, 77562, 900000, 1022779, 122779, 4877222, 450000, 5900001])
    expect(fig('Total Cost of Sales')).toEqual([264697, 232737, 31960, 529394, 550349, -20955, 2981196, 279697, 3531545])
    expect(fig('Gross Profit')).toEqual([185303, 294825, 109522, 370606, 472430, 101824, 1896026, 170303, 2368456])
    expect(fig('Total Expense')).toEqual([163783, 162235, 1548, 317099, 325830, -8731, 1615736, 155047, 1941566])
    expect(fig('Operating Profit')).toEqual([21520, 132590, 111070, 53507, 146600, 93093, 280290, 15256, 426890])
    expect(fig('Total Other Income')).toEqual([0, 111, 111, 0, 169, 169, -169, 0, 0])
    expect(fig('Net Profit')).toEqual([21520, 132701, 111181, 53507, 146769, 93262, 280121, 15256, 426890])
  })

  it('Additional Information prints the same integers Calxa printed', () => {
    const income = rows.find((r) => r.label === 'Total Income')!
    const gp = rows.find((r) => r.label === 'Gross Profit')!
    const np = rows.find((r) => r.label === 'Net Profit')!
    if (income.kind === 'heading' || gp.kind === 'heading' || np.kind === 'heading') throw new Error('shape')
    expect(Object.values(marginRow(gp.figures, income.figures))).toEqual(['41%', '56%', '15', '41%', '46%', '5', '(6)', '38%', '40%'])
    expect(Object.values(marginRow(np.figures, income.figures))).toEqual(['5%', '25%', '20', '6%', '14%', '8', '(7)', '3%', '7%'])
  })

  it('a loss margin is bracketed, and no income is a dash rather than a divide-by-zero', () => {
    expect(marginPercentText(-1_250, 120_000)).toBe('(1%)')
    expect(marginPointsText(-5.5)).toBe('(6)')
    expect(marginPointsText(0.4)).toBe('0')
    expect(marginPercentText(10_000, 0)).toBe('—')
    expect(marginRow(
      { budget: 0, actual: 5, variance: 0, ytdBudget: 0, ytdActual: 5, ytdVariance: 0, unspent: 0, nextMonth: 0, annual: 0 },
      { budget: 0, actual: 100, variance: 0, ytdBudget: 0, ytdActual: 100, ytdVariance: 0, unspent: 0, nextMonth: 0, annual: 0 },
    ).variance).toBe('—')
  })
})

describe('the detail table rows (Calxa pages 4, 6, 10-11)', () => {
  it('puts the Employment Expense figures on its heading row, with no Total row', () => {
    const report = urbanRoadAugust()
    const opex = report.sections.find((s) => s.category === 'Operating Expenses')!
    const rows = sectionDetailRows(opex, report.settings.expense_group_order, { priorYear: false })
    expect(rows[0]).toEqual({ kind: 'section', label: 'Expense' })
    const group = rows[1]
    expect(group.kind).toBe('group')
    if (group.kind !== 'group') return
    expect(group.label).toBe('Employment Expense')
    expect([
      group.line.budget, group.line.actual, group.line.variance_amount,
      group.line.ytd_budget, group.line.ytd_actual, group.line.ytd_variance_amount,
      group.line.unspent_budget, group.line.budget_next_month, group.line.budget_annual_total,
    ].map(Math.round)).toEqual([59479, 60271, -792, 107194, 107665, -471, 541271, 48626, 648936])
    // Dormant "Employ - Other Expenses" left out; the rest indented under the group.
    const accounts = rows.filter((r) => r.kind === 'line')
    expect(accounts.map((r) => r.kind === 'line' && r.line.account_name)).not.toContain('Employ - Other Expenses')
    expect(accounts.every((r) => r.kind === 'line' && r.indent === 2)).toBe(true)
    expect(rows.some((r) => 'label' in r && r.label.startsWith('Total Employment'))).toBe(false)
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'total', label: 'Total Expense' })
  })

  it('a section whose only group is named as the heading is its accounts, with no echo row', () => {
    const report = urbanRoadAugust()
    const revenue = { ...report.sections[0], lines: report.sections[0].lines.map((ln) => ({ ...ln, group: 'income ' })) }
    const rows = sectionDetailRows(revenue, null, { priorYear: false })
    expect(rows.map((r) => r.kind)).toEqual(['section', 'line', 'total'])
    expect(rows[1]).toMatchObject({ indent: 1 })
  })

  it('an ungrouped section is its accounts, one indent under the heading', () => {
    const report = urbanRoadAugust()
    const rows = sectionDetailRows(report.sections[0], null, { priorYear: false })
    expect(rows.map((r) => r.kind)).toEqual(['section', 'line', 'total'])
    expect(rows[1]).toMatchObject({ indent: 1 })
    expect(rows[2]).toMatchObject({ label: 'Total Income' })
  })
})

describe('the statement columns', () => {
  const base = {
    reportMonth: '2026-08', fiscalYear: 2027, budgetLabel: 'Budgets', ytdBudgetLabel: 'YTD Budget',
    showYtd: true, showUnspent: true, showNextMonth: true, showAnnual: true,
  }

  it("is Calxa's nine under 'Aug 2026' | 'Jul 2026 - Aug 2026' | blank", () => {
    const c = statementColumns({ ...base, showPriorYear: false, showVariancePercent: false })
    expect(c.labels).toEqual(['', 'Budgets', 'Actual', 'Variance', 'YTD Budget', 'YTD Actuals', 'Variance', 'Unspent\nBudget', 'Budget -\nNext Month', 'Budget -\nAnnual Total'])
    expect(c.band.map((b) => [b.label, b.colSpan])).toEqual([['', 1], ['Aug 2026', 3], ['Jul 2026 - Aug 2026', 3], ['', 3]])
    expect(c.budgetCols).toEqual([1, 4])
    expect(c.varianceCols).toEqual([3, 6])
    expect(c.figureCount).toBe(9)
  })

  it('keeps the percentages when asked, and gives the prior year its own band — never "Budget"', () => {
    const c = statementColumns({ ...base, showPriorYear: true, showVariancePercent: true })
    expect(c.labels).toContain('Var (%)')
    expect(c.labels).toContain('YTD Var (%)')
    expect(c.band.map((b) => b.label)).toEqual(['', 'Aug 2026', 'Jul 2026 - Aug 2026', '', 'Aug 2025'])
    expect(c.band.map((b) => b.label)).not.toContain('Budget')
    expect(c.budgetCols).toEqual([1, 5])
    expect(c.varianceCols).toEqual([3, 7])
  })

  it('names months from a fixed table — "Sep", never en-AU\'s "Sept"', () => {
    expect(packMonthYear('2026-09')).toBe('Sep 2026')
    expect(shortPeriodMonth('September 2026')).toBe('Sep 2026')
    expect(shortPeriodMonth('FY2027')).toBe('FY2027')
    expect(ytdPeriodLabel('2026-07', 2027)).toBe('Jul 2026 - Jul 2026')
    expect(ytdPeriodLabel('2027-03', 2027)).toBe('Jul 2026 - Mar 2027')
    expect(sectionDisplayLabel('Operating Expenses')).toBe('Expense')
  })
})

describe('the rendered pages', () => {
  const calxaLayout = (section: string, config: Record<string, unknown> = {}): PDFLayout => ({
    version: 1,
    pages: [
      { id: 'summary', orientation: 'landscape', widgets: [{ id: 's', type: 'executive_summary', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
      {
        id: 'table', orientation: 'landscape',
        widgets: [{ id: 't', type: 'budget_vs_actual', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: { section, ...config } }],
      },
    ],
  })

  it("prints the summary's heading rows and Additional Information across the columns", () => {
    const doc: any = new MonthlyReportPDFService(urbanRoadAugust(), { pdfLayout: calxaLayout('expense'), entityName: 'Urban Road Pty Ltd' }).generate()
    const runs = textRuns(doc, 1)
    expect(runs.some((r) => isTitle(r, 'Actual vs Budget', 'Urban Road Pty Ltd'))).toBe(true)
    expect(runs).toContain('MONTH: AUG 2026')
    for (const label of ['Income', 'Total Income', 'Expense', 'Total Expense', 'Additional Information', 'Gross Profit Margin', 'Jul 2026 - Aug 2026']) {
      expect(runs).toContain(label)
    }
    expect(runs).toContain('41%')
    expect(runs).toContain('\\(6\\)')
    // Gone: the FY line, the 1-decimal margin, the "YTD FY2027" band.
    expect(runs).not.toContain('FY2027')
    expect(runs).not.toContain('55.9%')
  })

  it('a table placed with variance_percent: false has no percentage columns, and is titled Actual vs Budget', () => {
    const doc: any = new MonthlyReportPDFService(urbanRoadAugust(), {
      pdfLayout: calxaLayout('expense', { variance_percent: false }),
      entityName: 'Urban Road Pty Ltd',
    }).generate()
    const page = pageContaining(doc, 'Employ - Staff Amenities')
    const runs = textRuns(doc, page)
    expect(runs.some((r) => isTitle(r, 'Actual vs Budget', 'Urban Road Pty Ltd'))).toBe(true)
    expect(runs).not.toContain('Var (%)')
    expect(runs).toContain('Employment Expense')
    expect(runs).not.toContain('Total Employment Expense')
    expect(runs).toContain('Total Expense')
    // "(budget only)" is not printed; the row says it.
    expect(runs).toContain('Bank Revaluations')
    expect(docText(doc)).not.toContain('budget only')
  })

  it('keeps the percentage columns for a placement that does not switch them off', () => {
    const doc: any = new MonthlyReportPDFService(urbanRoadAugust(), { pdfLayout: calxaLayout('income') }).generate()
    const page = pageContaining(doc, 'Canvas Sales')
    expect(textRuns(doc, page)).toContain('Var \\(%\\)')
  })

  it('a variance that rounds to nothing prints 0.0%, unsigned — not -0.0% or +0.0%', () => {
    // Urban Road's Superannuation and Wages were budgeted to the dollar and
    // missed by cents: -0.35 and -0.25 print as a 0 variance, and the ratio
    // beside them printed "-0.0%", a sign on a number that is not there.
    const report = urbanRoadAugust()
    const opex = report.sections.find((s) => s.category === 'Operating Expenses')!
    opex.lines = opex.lines.map((ln) =>
      ln.account_name === 'Employ - Superannuation' ? { ...ln, variance_percent: -0.0056, ytd_variance_percent: -0.002 }
      : ln.account_name === 'Employ - Wages & Salaries' ? { ...ln, variance_percent: 0.0048, ytd_variance_percent: -0.049 }
      : ln,
    )
    const doc: any = new MonthlyReportPDFService(report, { pdfLayout: calxaLayout('expense') }).generate()
    const runs = textRuns(doc, pageContaining(doc, 'Employ - Superannuation'))
    expect(runs).toContain('Var \\(%\\)')
    expect(runs).not.toContain('-0.0%')
    expect(runs).not.toContain('+0.0%')
    expect(runs).toContain('0.0%')
  })

  it("honours a placement's title override", () => {
    const layout = calxaLayout('cogs')
    layout.pages[1].widgets[0].titleOverride = 'COGS Detail'
    const doc: any = new MonthlyReportPDFService(urbanRoadAugust(), { pdfLayout: layout, businessName: 'Urban Road' }).generate()
    expect(textRuns(doc, pageContaining(doc, 'Antons Canvas')).some((r) => isTitle(r, 'COGS Detail', 'Urban Road'))).toBe(true)
  })
})

describe('a grouped income section keeps income polarity on its group row', () => {
  // The group row is the most prominent row of the table, and it was summed
  // with expense polarity (budget − actual) whatever the section: Precision's
  // "Trading Income" read +66,826 two lines above a Total Income of (66,826).
  it('an income shortfall is negative on the group row and on the total alike', () => {
    const report = urbanRoadAugust()
    const shortfall = f(279320, 212494, -66826, 558640, 451190, -107450, 3204716, 279320, 3655906)
    const revenue = {
      category: 'Revenue' as const,
      lines: [l('Canvas Sales', shortfall, { group: 'Trading Income', variance_percent: -23.92, ytd_variance_percent: -19.23 })],
      subtotal: l('Total Revenue', shortfall, { variance_percent: -23.92, ytd_variance_percent: -19.23 }),
    }
    const rows = sectionDetailRows(revenue, report.settings.expense_group_order, { priorYear: false })
    const group = rows.find((r) => r.kind === 'group')
    const total = rows.find((r) => r.kind === 'total')
    if (group?.kind !== 'group' || total?.kind !== 'total') throw new Error('shape')
    expect(group.line.variance_amount).toBeCloseTo(-66826, 2)
    expect(group.line.ytd_variance_amount).toBeCloseTo(-107450, 2)
    expect(group.line.variance_amount).toBeCloseTo(total.line.variance_amount, 2)
    expect(group.line.ytd_variance_amount).toBeCloseTo(total.line.ytd_variance_amount, 2)
    expect(group.line.variance_percent).toBeCloseTo(-23.92, 2)
    expect(group.line.ytd_variance_percent).toBeCloseTo(-19.23, 2)
  })

  it('Other Income is income too; an expense group is unchanged', () => {
    const other = {
      category: 'Other Income' as const,
      lines: [l('Interest Income', f(200, 110.93, -89.07, 400, 168.8, -231.2, 0, 0, 0), { group: 'Interest' })],
      subtotal: l('Total Other Income', f(200, 110.93, -89.07, 400, 168.8, -231.2, 0, 0, 0)),
    }
    const g = sectionDetailRows(other, null, { priorYear: false }).find((r) => r.kind === 'group')
    if (g?.kind !== 'group') throw new Error('shape')
    expect(g.line.variance_amount).toBeCloseTo(-89.07, 2)

    const report = urbanRoadAugust()
    const opex = report.sections.find((s) => s.category === 'Operating Expenses')!
    const e = sectionDetailRows(opex, report.settings.expense_group_order, { priorYear: false }).find((r) => r.kind === 'group')
    if (e?.kind !== 'group') throw new Error('shape')
    expect(Math.round(e.line.variance_amount)).toBe(-792)
  })
})

/** The baseline, in points from the foot of the page, of the first run equal to `text`. */
function runBaseline(doc: any, pageNumber: number, text: string): number | null {
  const ops = doc.internal.pages[pageNumber].join('\n').split('\n')
  let y: number | null = null
  for (const op of ops) {
    const td = /^(-?[\d.]+) (-?[\d.]+) Td$/.exec(op.trim())
    if (td) y = Number(td[2])
    const tj = /^(?:T\* )?\((.*)\) Tj$/.exec(op.trim())
    if (tj && tj[1].startsWith(text)) return y
  }
  return null
}

/** How many images a page draws. */
const imagesOn = (doc: any, pageNumber: number) =>
  doc.internal.pages[pageNumber].join('\n').split('\n').filter((op: string) => / Do$/.test(op.trim())).length

describe('placements the Calxa layout does not use, rendered', () => {
  const onePage = (orientation: 'portrait' | 'landscape', type: string, config?: Record<string, unknown>): PDFLayout => ({
    version: 1,
    pages: [
      { id: 'lead', orientation: 'landscape', widgets: [{ id: 's', type: 'executive_summary', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
      { id: 'p', orientation, widgets: [{ id: 'w', type: type as never, col: 0, row: 0, colSpan: 3, rowSpan: 3, ...(config ? { config } : {}) }] },
    ],
  })

  it('a detail table on a PORTRAIT page prints every figure whole', () => {
    // The landscape proportions (10pt, a 62.5mm label, nine columns) on a
    // 180mm page broke "279,320" over two lines — "279,32" above "0" — which
    // reads as two wrong numbers.
    for (const config of [{ section: 'income', variance_percent: false }, { section: 'income' }]) {
      const doc: any = new MonthlyReportPDFService(urbanRoadAugust(), { pdfLayout: onePage('portrait', 'budget_vs_actual', config) }).generate()
      const runs = textRuns(doc, pageContaining(doc, 'Canvas Sales'))
      for (const figure of ['279,320', '295,827', '3,022,677', '3,655,906', '450,000', '527,562', '5,900,001']) {
        expect(runs, `${figure} with ${JSON.stringify(config)}`).toContain(figure)
      }
    }
  })

  it('a cover on a LANDSCAPE page keeps "Prepared on" on the sheet', () => {
    const layout = onePage('landscape', 'cover_page')
    layout.pages = [layout.pages[1]]
    const doc: any = new MonthlyReportPDFService(urbanRoadAugust(), { pdfLayout: layout, entityName: 'Urban Road Pty Ltd' }).generate()
    const y = runBaseline(doc, 1, 'Prepared on')
    expect(y).not.toBeNull()
    // Points from the foot of a 210mm sheet: on it, and above the footer band.
    expect(y!).toBeGreaterThan(10 * 2.835)
    expect(y!).toBeLessThan(runBaseline(doc, 1, 'August 2026')!)
    for (const text of ['Monthly Report', 'Urban Road Pty Ltd', 'August 2026']) {
      expect(runBaseline(doc, 1, text)!).toBeGreaterThan(y!)
    }
  })

  it('the corner mark is on the page a table opened, not on the page it ran on to', () => {
    // Forty expense accounts run the table onto a second sheet.
    const report = urbanRoadAugust()
    const many = Array.from({ length: 40 }, (_, i) =>
      l(`Expense Account ${String(i + 1).padStart(2, '0')}`, f(1000, 1100, -100, 2000, 2100, -100, 9900, 1000, 12000)))
    report.sections = report.sections.map((s) => (s.category === 'Operating Expenses' ? { ...s, lines: many } : s))
    const doc: any = new MonthlyReportPDFService(report, { pdfLayout: onePage('landscape', 'budget_vs_actual', { section: 'expense' }) }).generate()
    const opened = pageContaining(doc, 'Expense Account 01')
    const runOn = pageContaining(doc, 'Expense Account 40')
    expect(runOn).toBe(opened + 1)
    expect(imagesOn(doc, opened)).toBe(1)
    expect(imagesOn(doc, runOn)).toBe(0)
  })
})
