/**
 * The pack's Full Year page groups expenses the way its Actual vs Budget page
 * does.
 *
 * It printed Operating Expenses as one flat run while the Actual vs Budget page
 * two pages earlier gathered the same accounts under nine headings, each with a
 * "Total <group>" row — and Calxa's Full Year page groups them too. Same
 * membership (the line's `group`), same heading order (the report settings),
 * same shading.
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
  const i = runs.indexOf(text)
  expect(i, `"${text}" is on the page`).toBeGreaterThanOrEqual(0)
  return i
}

describe('Full Year page — expense groups', () => {
  it('prints each group under its heading with a Total row, in the coach order, ungrouped last', () => {
    const runs = fullYearRuns(groupedFullYear())
    const sequence = [
      'Employment Expense',
      'Employ - Wages & Salaries',
      'Total Employment Expense',
      'Bank and Other Fees',
      'Bank Fees',
      'Memberships & Registrations',
      'Total Bank and Other Fees',
      'Bank Revaluations',
      'Total Operating Expenses',
    ].map((t) => indexOf(runs, t))
    expect([...sequence].sort((a, b) => a - b)).toEqual(sequence)
  })

  it('leaves the section subtotal row as it was', () => {
    const runs = fullYearRuns(groupedFullYear())
    const flat = fullYearRuns(groupedFullYear(false))
    const after = (r: string[]) => r.slice(r.indexOf('Total Operating Expenses'), r.indexOf('Total Operating Expenses') + 16)
    expect(after(runs)).toEqual(after(flat))
  })

  it('falls back to the payload heading order when the report settings carry none', () => {
    const fy = { ...groupedFullYear(), expense_group_order: ORDER }
    const runs = fullYearRuns(fy, null)
    expect(indexOf(runs, 'Employment Expense')).toBeLessThan(indexOf(runs, 'Bank and Other Fees'))
  })

  it('keeps a long group total on one line of the 38mm Account column', () => {
    // Urban Road's real FX heading. "Total Foreign Currency Gains and Losses"
    // wrapped to two lines — "Losses" alone underneath — making it the only
    // double-height subtotal on the page.
    const fy = groupedFullYear()
    const opex = fy.sections.find((s) => s.category === 'Operating Expenses')!
    opex.lines = [
      ...opex.lines,
      { ...opex.lines[1], account_name: 'Realised Currency Gains', account_code: '499', group: 'Foreign Currency Gains and Losses' },
    ]
    const runs = fullYearRuns(fy)
    const total = runs.filter((r) => r.startsWith('Total Foreign Currency'))
    expect(total).toHaveLength(1)
    expect(runs).not.toContain('Losses')
    // The heading row spans the table, so the full name is still printed.
    expect(runs).toContain('Foreign Currency Gains and Losses')
  })

  it('prints no headings and no group totals for a client that has grouped nothing', () => {
    const runs = fullYearRuns(groupedFullYear(false))
    expect(runs).not.toContain('Total Employment Expense')
    expect(runs).not.toContain('Total Bank and Other Fees')
    expect(runs).not.toContain('Employment Expense')
    expect(runs).toContain('Employ - Wages & Salaries')
    expect(runs).toContain('Total Operating Expenses')
  })
})
