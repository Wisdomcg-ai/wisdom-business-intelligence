/**
 * The payroll page, rendered through the real layout pipeline, from Urban
 * Road's July–August 2026 payslips: six employees, four runs in July and five
 * in August, $10,503.85 a run, against the approved wages budget of $42,015 and
 * $52,519.
 *
 * The rules — roster order, the standing figures, the window — are tested in
 * payroll-grid.test.ts and payroll-grid-config.test.ts. What this proves is
 * what reaches the paper: Calxa's Payroll Report when the placement asks for
 * it, and the page every other client already has when it does not.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, docText, pageContaining } from './pdf-pack-fixture'
import type { PDFLayout } from '../../types/pdf-layout'
import { buildPayrollGrid, type PayslipRow } from '@/lib/monthly-report/payroll-grid'

const JUL = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27']
const AUG = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']

// As Xero stores them — two first names carry a trailing space.
const STAFF: [string, string, number, string][] = [
  ['457cf25d', 'Deborah Leydon', 2500, '2018-01-22'],
  ['2c50063e', 'Andrea Shinners', 2500, '2020-03-05'],
  ['a1534c56', 'Lara Powell', 1923.08, '2022-05-09'],
  ['28cf67bf', 'Cheryl Henderson', 1538.46, '2025-06-09'],
  ['c8c1153c', 'Suzanne  Atkin', 1442.31, '2020-03-01'],
  ['d2224afe', 'Thomas  White', 600, '2018-02-12'],
]

const PAYSLIPS: PayslipRow[] = [...JUL, ...AUG].flatMap((d) =>
  STAFF.map(([id, name, wages]) => ({ employee_id: id, employee_name: name, payment_date: d, wages, super_amount: wages * 0.12 })))
const GRID = buildPayrollGrid(
  PAYSLIPS,
  STAFF.map(([employee_id, , , start_date]) => ({ employee_id, start_date })),
  ['2026-07', '2026-08'],
  { '2026-07': 42015, '2026-08': 52519 },
)

/** Urban Road's placement with the Calxa page turned on. The standing figures are Calxa's page 15. */
const CALXA = {
  layout: 'calxa',
  window: 'fy_to_date',
  months: 3,
  difference_fills: true,
  roster: [
    { name: 'Andrea Shinners', employee_id: '2c50063e', standard_units: 38, weekly_salary: 2500 },
    { name: 'Deborah Leydon', employee_id: '457cf25d', standard_units: 38, weekly_salary: 2500 },
    { name: 'Suzanne Atkin', employee_id: 'c8c1153c', standard_units: 38, weekly_salary: 1442.31 },
    { name: 'Lara Powell', employee_id: 'a1534c56', standard_units: 38, weekly_salary: 1923.08 },
    { name: 'Thomas White', employee_id: 'd2224afe', standard_units: 20, weekly_salary: 600 },
    { name: 'Cheryl Henderson', employee_id: '28cf67bf', standard_units: 38, weekly_salary: 1538.46 },
  ],
}

function layout(config?: unknown): PDFLayout {
  return {
    version: 1,
    pages: [
      { id: 'p1', orientation: 'portrait', widgets: [{ id: 'es', type: 'executive_summary', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
      {
        id: 'p2', orientation: 'landscape',
        widgets: [{ id: 'pay', type: 'payroll_grid', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: config as Record<string, unknown> | undefined }],
      },
    ],
  }
}

function render(config?: unknown, grid = GRID) {
  return new MonthlyReportPDFService(fixtureReport(), { pdfLayout: layout(config), payrollGrid: grid }).generate() as any
}

/** The page's text, in draw order. */
function pageText(doc: any, page: number): string {
  return (doc.internal.pages[page] as string[]).join('\n')
}

describe("Calxa's Payroll Report", () => {
  it('prints one landscape page headed the way Calxa heads it', () => {
    const doc = render(CALXA)
    expect(doc.internal.getNumberOfPages()).toBe(2)
    expect(pageContaining(doc, 'Payroll Report')).toBe(2)
    const page = pageText(doc, 2)
    expect(page).toContain('LAST 2 MONTHS')
    const size = doc.internal.pageSize
    doc.setPage(2)
    expect(size.getWidth()).toBeGreaterThan(size.getHeight())
    expect(docText(doc)).not.toContain('Render error')
  })

  it("lists the roster in Calxa's order with single-spaced names, standing units and weekly budgets", () => {
    const page = pageText(render(CALXA), 2)
    const at = (s: string) => page.indexOf(s)
    const order = ['Andrea Shinners', 'Deborah Leydon', 'Suzanne Atkin', 'Lara Powell', 'Thomas White', 'Cheryl Henderson']
    for (const name of order) expect(at(`(${name})`)).toBeGreaterThan(-1)
    expect(order.map((n) => at(`(${n})`))).toEqual([...order.map((n) => at(`(${n})`))].sort((a, b) => a - b))
    expect(page).not.toContain('Suzanne  Atkin')
    // The header wraps inside its column: "Weekly / Salary / (Budget)".
    for (const label of ['(Standard)', '(Units)', '(Weekly)', '(Salary)', '(\\(Budget\\))', '(20)', '(38)']) {
      expect(page).toContain(label)
    }
    // Nine runs paid $1,442 plus the roster's budget beside her name.
    expect(page.match(/\(1,442\)/g)?.length).toBe(10)
  })

  it("prints Calxa's dates: '5-Mar-2020' for a start, '6-Jul' over a run", () => {
    const page = pageText(render(CALXA), 2)
    for (const d of ['(5-Mar-2020)', '(22-Jan-2018)', '(9-Jun-2025)', '(6-Jul)', '(27-Jul)', '(3-Aug)', '(31-Aug)']) expect(page).toContain(d)
    expect(page).toContain('(Jul 2026)')
    expect(page).toContain('(Aug 2026)')
  })

  it('totals each run, then each month under its runs, then Budget and Difference — and nothing in month columns', () => {
    const page = pageText(render(CALXA), 2)
    // $10,504 a run and $10,504 in the Weekly Salary (Budget) column: nine run
    // totals plus the column's own.
    expect(page.match(/\(10,504\)/g)?.length).toBe(10)
    // Each month total and its budget, once each.
    expect(page.match(/\(42,015\)/g)?.length).toBe(2)
    expect(page.match(/\(52,519\)/g)?.length).toBe(2)
    for (const label of ['(Total)', '(Budget)', '(Difference)']) expect(page).toContain(label)
    // The old layout's per-employee month columns are gone: Andrea's $10,000
    // July and $12,500 August are nowhere on the page.
    expect(page).not.toContain('(10,000)')
    expect(page).not.toContain('(12,500)')
    expect(page).not.toContain('Jul 26')
    expect(page).not.toContain('Paid amounts are Xero payslips')
  })

  it('an overrun prints in red parentheses under its month', () => {
    const over = buildPayrollGrid(
      PAYSLIPS,
      STAFF.map(([employee_id, , , start_date]) => ({ employee_id, start_date })),
      ['2026-07', '2026-08'],
      { '2026-07': 42015, '2026-08': 47234 },
    )
    const page = pageText(render(CALXA, over), 2)
    expect(page).toContain('(\\(5,285\\))')
  })

  it("a roster without the standing figures prints dashes, and says what a dash means", () => {
    const blank = { ...CALXA, roster: CALXA.roster.map(({ name, employee_id }) => ({ name, employee_id })) }
    const page = pageText(render(blank), 2)
    expect(page).toContain('not yet entered')
    expect(page.match(/\(1,442\)/g)?.length).toBe(9)
    expect(page).not.toContain('(38)')
    // No column total over blanks — but every paid figure is unchanged.
    expect(page.match(/\(10,504\)/g)?.length).toBe(9)
    expect(page.match(/\(42,015\)/g)?.length).toBe(2)
  })

  it('names somebody paid who is not on the roster', () => {
    const short = { ...CALXA, roster: CALXA.roster.filter((r) => r.name !== 'Cheryl Henderson') }
    expect(docText(render(short))).toContain('listed last: Cheryl Henderson')
  })

  it('a budgeted month with no pay run keeps a column, its budget and its difference', () => {
    const augOnly = buildPayrollGrid(
      PAYSLIPS.filter((p) => p.payment_date >= '2026-08-01'),
      STAFF.map(([employee_id, , , start_date]) => ({ employee_id, start_date })),
      ['2026-07', '2026-08'],
      { '2026-07': 42015, '2026-08': 52519 },
    )
    const page = pageText(render(CALXA, augOnly), 2)
    expect(page).toContain('(No runs)')
    expect(page).toContain('(Jul 2026)')
    // July's budget, and all of it unspent.
    expect(page.match(/\(42,015\)/g)?.length).toBe(2)
  })

  it('a July window of one month names the month instead of "Last 1 Months"', () => {
    const july = buildPayrollGrid(
      PAYSLIPS,
      STAFF.map(([employee_id, , , start_date]) => ({ employee_id, start_date })),
      ['2026-07'],
      { '2026-07': 42015 },
    )
    const page = pageText(render(CALXA, july), 2)
    expect(page).toContain('MONTH: JUL 2026')
    expect(page).not.toContain('LAST 1')
  })
})

describe('the payroll page with no config', () => {
  it('is the page every other client already has', () => {
    const page = pageText(render(undefined), 2)
    expect(page).toContain('Payroll')
    expect(page).not.toContain('Payroll Report')
    expect(page).toContain('(Weekly)')
    expect(page).toContain('(Started)')
    expect(page).toContain('(12,500)') // the per-employee month column
    expect(page).toContain('Paid amounts are Xero payslips')
    // Highest paid first, as before — though the names are now single-spaced.
    expect(page.indexOf('(Lara Powell)')).toBeLessThan(page.indexOf('(Suzanne Atkin)'))
  })

  it('a config it cannot read prints the reason above the default page', () => {
    const doc = render({ layout: 'calxa', rooster: [] })
    const text = docText(doc)
    expect(pageContaining(doc, 'Payroll')).toBe(2)
    expect(text).toContain('settings could not be read')
    expect(text).toContain('rooster')
    // A config that fails to read is the defaults: the grid page, never a
    // Calxa page "without its roster".
    expect(text).toContain('prints its default layout')
    expect(text).not.toContain('Payroll Report')
    expect(text).not.toContain('Render error')
  })
})
