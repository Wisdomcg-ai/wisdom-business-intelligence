/**
 * The pack's Full Year page groups expenses the way its Actual vs Budget page
 * does.
 *
 * It printed Operating Expenses as one flat run while the Actual vs Budget page
 * two pages earlier gathered the same accounts under nine headings — and
 * Calxa's Current Year Budget page groups them too. Same membership (the line's
 * `group`) and heading order (the report settings) as that page; the layout is
 * Calxa's Full Year one: the group heading row CARRIES the subtotal and there
 * is no trailing "Total <group>" row.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, fixtureFullYear, textRuns, pageContaining } from './pdf-pack-fixture'
import type { FullYearLine, FullYearReport } from '../../types'

const ORDER = [
  'Employment Expense', 'Travel & Accommodation', 'Professional Expense',
  'IT Hardware and Software', 'Marketing and Advertising', 'Occupancy Expense',
  'Foreign Currency Gains and Losses', 'Bank and Other Fees', 'Other Operating Expenses',
]

/** The fixture's full year, with Urban Road-shaped expense lines in code order. */
function groupedFullYear(grouped = true): FullYearReport {
  const fy = fixtureFullYear({ forecastMonthly: 90_000 })
  const opex = fy.sections.find((s) => s.category === 'Operating Expenses')!
  const template = opex.lines[0]
  const withName = (account_name: string, account_code: string, group: string | null, scale: number): FullYearLine => ({
    ...template,
    account_name,
    account_code,
    group: grouped ? group : null,
    months: template.months.map((m) => ({ ...m, actual: m.actual * scale, budget: m.budget * scale })),
    projected_total: template.projected_total * scale,
    annual_budget: template.annual_budget * scale,
  })
  // Code order as text: Bank Revaluations (497) first, Bank Fees (60550)
  // before Wages (62170) — and neither is the heading order.
  opex.lines = [
    withName('Bank Revaluations', '497', null, 0.001),
    withName('Bank Fees', '60550', 'Bank and Other Fees', 0.01),
    withName('Employ - Wages & Salaries', '62170', 'Employment Expense', 0.5),
    withName('Memberships & Registrations', '64900', 'Bank and Other Fees', 0.02),
  ]
  return fy
}

function fullYearRuns(fy: FullYearReport, order: string[] | null = ORDER): string[] {
  const report = fixtureReport()
  report.settings = { ...report.settings, expense_group_order: order }
  const doc: any = new MonthlyReportPDFService(report, { fullYearReport: fy }).generate()
  const page = pageContaining(doc, 'Full Year Projection')
  expect(page).toBeGreaterThan(0)
  return textRuns(doc, page)
}

const indexOf = (runs: string[], text: string) => {
  // A client on the forecast keeps the variance columns, and the narrower label
  // column ellipsizes the longest names ("Memberships & Registra...").
  const i = runs.findIndex((r) => r === text || (r.endsWith('...') && text.startsWith(r.slice(0, -3))))
  expect(i, `"${text}" is on the page`).toBeGreaterThanOrEqual(0)
  return i
}

describe('Full Year page — expense groups', () => {
  it('prints each group heading before its accounts, in the coach order, ungrouped last', () => {
    const runs = fullYearRuns(groupedFullYear())
    const sequence = [
      'Employment Expense',
      'Employ - Wages & Salaries',
      'Bank and Other Fees',
      'Bank Fees',
      'Memberships & Registrations',
      'Bank Revaluations',
      'Total Expense',
    ].map((t) => indexOf(runs, t))
    expect([...sequence].sort((a, b) => a - b)).toEqual(sequence)
  })

  it('puts the group subtotal ON the heading row, with no trailing Total row', () => {
    const runs = fullYearRuns(groupedFullYear())
    expect(runs).not.toContain('Total Employment Expense')
    expect(runs).not.toContain('Total Bank and Other Fees')
    // Bank Fees (0.01) + Memberships (0.02) of the template line's 30,000 July actual.
    const heading = indexOf(runs, 'Bank and Other Fees')
    expect(runs[heading + 1]).toBe('900')
  })

  it('leaves the section subtotal row as it was', () => {
    const runs = fullYearRuns(groupedFullYear())
    const flat = fullYearRuns(groupedFullYear(false))
    const after = (r: string[]) => r.slice(r.indexOf('Total Expense'), r.indexOf('Total Expense') + 14)
    expect(after(runs)).toEqual(after(flat))
  })

  it('falls back to the payload heading order when the report settings carry none', () => {
    const fy = { ...groupedFullYear(), expense_group_order: ORDER }
    const runs = fullYearRuns(fy, null)
    expect(indexOf(runs, 'Employment Expense')).toBeLessThan(indexOf(runs, 'Bank and Other Fees'))
  })

  it('keeps a long group name on one line of the label column', () => {
    // Urban Road's real FX heading once wrapped to two lines — "Losses" alone
    // underneath — making it the only double-height row on the page. Calxa
    // shortens the same label.
    const fy = groupedFullYear()
    const opex = fy.sections.find((s) => s.category === 'Operating Expenses')!
    opex.lines = [
      ...opex.lines,
      { ...opex.lines[1], account_name: 'Realised Currency Gains and Losses on Foreign Exchange', account_code: '499', group: 'Foreign Currency Gains and Losses on Revaluation' },
    ]
    const runs = fullYearRuns(fy)
    expect(runs.filter((r) => r.startsWith('Foreign Currency Gains'))).toHaveLength(1)
    expect(runs).not.toContain('Revaluation')
    expect(runs).not.toContain('Exchange')
  })

  it('prints no headings for a client that has grouped nothing', () => {
    const runs = fullYearRuns(groupedFullYear(false))
    expect(runs).not.toContain('Employment Expense')
    expect(runs).not.toContain('Bank and Other Fees')
    expect(runs).toContain('Employ - Wages & Salaries')
    expect(runs).toContain('Total Expense')
  })

  it('prints no group row that only repeats its section heading', () => {
    // Envisage maps all five income accounts to the group "Income", and the
    // page names the Revenue section "Income": the page read "Income / Income"
    // over a group subtotal equal to Total Income two rows further down.
    const fy = groupedFullYear()
    const rev = fy.sections.find((s) => s.category === 'Revenue')!
    rev.lines = rev.lines.map((ln) => ({ ...ln, group: 'Income' }))
    const runs = fullYearRuns(fy)
    expect(runs.filter((r) => r === 'Income')).toHaveLength(1)
    const sequence = ['Income', 'Sales', 'Total Income'].map((t) => indexOf(runs, t))
    expect([...sequence].sort((a, b) => a - b)).toEqual(sequence)
  })

  it('keeps such a row when the section has other groups, because then its subtotal is its own', () => {
    const fy = groupedFullYear()
    const rev = fy.sections.find((s) => s.category === 'Revenue')!
    rev.lines = [
      { ...rev.lines[0], group: 'Income' },
      { ...rev.lines[0], account_name: 'Grants', account_code: '42000', group: 'Government' },
    ]
    const runs = fullYearRuns(fy, [...ORDER, 'Income', 'Government'])
    expect(runs.filter((r) => r === 'Income')).toHaveLength(2)
  })
})
