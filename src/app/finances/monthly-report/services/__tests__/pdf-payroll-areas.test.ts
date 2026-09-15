/**
 * Distinct Directions' Payrun Analysis (Calxa p12-13), printed by the Payroll
 * Report placement once its roster carries areas (P10: DD-19, DD-20):
 *
 *   - Head Office, Bathurst, Orange and Dubbo, each headed and totalled —
 *     45,962 / 123,283 / 55,284 / 21,325 — then all areas, 245,854
 *   - Month actual / Month budget / Variance beside every row
 *   - each weekly pay shaded against the weekly budget
 *   - no Standard Units column
 *   - the Budget row on either basis: Calxa's roster (245,584, a Difference of
 *     (270)) or the approved wages budget (237,711, (8,143)), which also says
 *     how far the roster is from it
 *
 * Every other placement's page is pinned byte for byte in
 * pdf-insert-widgets-golden.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, docText } from './pdf-pack-fixture'
import type { PDFLayout } from '../../types/pdf-layout'
import { DD_ROSTER, ddGrid } from '@/lib/monthly-report/__tests__/fixtures/dd-payrun-2026-08'
import { buildPayrollGrid } from '@/lib/monthly-report/payroll-grid'

const DD = {
  layout: 'calxa',
  window: 'fixed',
  months: 1,
  difference_fills: true,
  roster: DD_ROSTER,
  employee_month_columns: true,
  pay_fills: true,
  standard_units_column: false,
  notes: ['Adam Davey (Bathurst) was paid $16,299 on 7 August: 222 hours of annual leave on his final pay.'],
}

function layout(config: unknown): PDFLayout {
  return {
    version: 1,
    pages: [
      { id: 'p1', orientation: 'portrait', widgets: [{ id: 'es', type: 'executive_summary', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
      { id: 'p2', orientation: 'landscape', widgets: [{ id: 'pay', type: 'payroll_grid', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: config as Record<string, unknown> }] },
    ],
  }
}

const render = (config: unknown, grid = ddGrid()) =>
  new MonthlyReportPDFService(fixtureReport(), { pdfLayout: layout(config), payrollGrid: grid }).generate() as any

/** The payroll pages' text, in draw order (the table runs onto a second sheet). */
function payrollText(doc: any): string {
  const out: string[] = []
  for (let p = 2; p <= doc.internal.getNumberOfPages(); p++) out.push((doc.internal.pages[p] as string[]).join('\n'))
  return out.join('\n')
}

/** jsPDF's fill operator for an RGB triple. */
const fillOp = (rgb: [number, number, number]) => `${rgb.map((c) => +(c / 255).toFixed(2)).join(' ')} rg`

describe("Distinct Directions' August payrun, by area", () => {
  it('heads and totals each area in roster order, then all areas: 245,854', () => {
    const doc = render({ ...DD, budget_basis: 'roster' })
    const text = payrollText(doc)
    expect(docText(doc)).not.toContain('Render error')
    const at = (s: string) => text.indexOf(s)
    for (const area of ['Head Office', 'Bathurst', 'Orange', 'Dubbo']) expect(at(`(${area})`)).toBeGreaterThan(-1)
    expect([at('(Head Office)'), at('(Bathurst)'), at('(Orange)'), at('(Dubbo)')]).toEqual(
      [at('(Head Office)'), at('(Bathurst)'), at('(Orange)'), at('(Dubbo)')].sort((a, b) => a - b))
    // The heading comes before the people, and the area's total after them.
    expect(at('(Head Office)')).toBeLessThan(at('(Daniel Jarvis)'))
    expect(at('(Kate Davey)')).toBeLessThan(text.indexOf('Head Office)', at('(Kate Davey)')))
    // Month actual for each area, then all areas.
    for (const total of ['45,962', '123,283', '55,284', '21,325', '245,854']) expect(text).toContain(`(${total})`)
    expect(text).toContain('All Areas')
    // Each run's total over all areas.
    for (const run of ['73,993', '57,130', '58,551', '56,180']) expect(text).toContain(`(${run})`)
  })

  it("prints Calxa's Month budget and Variance beside each person, each area and the total — the roster basis", () => {
    const text = payrollText(render({ ...DD, budget_basis: 'roster' }))
    for (const label of ['(Month actual)', '(Month budget)', '(Variance)']) expect(text).toContain(label)
    // Area month budgets: weekly × 4.
    for (const budget of ['45,916', '121,944', '57,276', '20,448']) expect(text).toContain(`(${budget})`)
    // All areas: 245,584 budget, (270) variance — beside the total and again on the Budget / Difference rows.
    expect(text.match(/\(245,584\)/g)?.length).toBe(2)
    expect(text.match(/\(\\\(270\\\)\)/g)?.length).toBe(2)
    // Adam Davey: 16,299 paid against 10,768.
    expect(text).toContain('(\\(5,531\\))')
    expect(text).not.toContain('Standard')
    expect(text).toContain('weekly salary')
  })

  it('on the approved basis (the default) the Budget row is the P&L wages budget, and the gap to the roster is stated', () => {
    const text = payrollText(render(DD))
    expect(text).toContain('(237,711)')
    expect(text).toContain('(\\(8,143\\))')
    // The employee columns stay the roster's.
    expect(text).toContain('(245,584)')
    expect(docText(render(DD))).toContain('7,873 apart')
  })

  it('shades each pay: green at or under, red over, amber with no budget — and only when asked', () => {
    const shaded = payrollText(render(DD))
    expect(shaded).toContain(fillOp([222, 241, 231]))
    expect(shaded).toContain(fillOp([251, 226, 226]))
    expect(shaded).toContain(fillOp([253, 236, 200]))
    expect(docText(render(DD))).toContain('Each pay is shaded against the roster salary')
    const plain = payrollText(render({ ...DD, pay_fills: false, difference_fills: false }))
    expect(plain).not.toContain(fillOp([251, 226, 226]))
    expect(plain).not.toContain(fillOp([253, 236, 200]))
  })

  it("prints the coach's note under the table", () => {
    expect(docText(render(DD))).toContain('222 hours of annual leave on his final pay')
  })

  it('without month columns and areas, the Payroll Report keeps its shape and takes only the roster basis', () => {
    const roster = DD_ROSTER.map(({ area: _area, ...rest }) => rest)
    const text = payrollText(render({ layout: 'calxa', months: 1, roster, budget_basis: 'roster' }))
    expect(text).not.toContain('(Head Office)')
    expect(text).not.toContain('(Variance)')
    expect(text).toContain('(Standard)')
    expect(text).toContain('(245,584)')
    expect(text).toContain('(\\(270\\))')
  })
})

describe('an IICT-shaped fortnightly roster', () => {
  it("heads the salary column per fortnight and budgets September's three runs as six weeks", () => {
    const runs = ['2026-07-08', '2026-07-22', '2026-08-05', '2026-08-19', '2026-09-02', '2026-09-16', '2026-09-30']
    const period = (d: string) => {
      const end = new Date(`${d}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1)
      const start = new Date(end); start.setUTCDate(start.getUTCDate() - 13)
      return { calendar_type: 'FORTNIGHTLY', period_start: start.toISOString().slice(0, 10), period_end: end.toISOString().slice(0, 10) }
    }
    const grid = buildPayrollGrid(
      runs.flatMap((d) => [
        { employee_id: 'jm', employee_name: 'Jennifer Moore', payment_date: d, wages: 2546, super_amount: 0, ...period(d) },
        { employee_id: 'jb', employee_name: 'Joelson Batista', payment_date: d, wages: 5000, super_amount: 0, ...period(d) },
      ]),
      [{ employee_id: 'jm', start_date: '2019-01-01' }, { employee_id: 'jb', start_date: '2019-01-01' }],
      ['2026-07', '2026-08', '2026-09'],
    )
    const config = {
      layout: 'calxa', months: 3, salary_period: 'fortnight', budget_basis: 'roster',
      roster: [{ name: 'Jennifer Moore', employee_id: 'jm', fortnightly_salary: 2707 }, { name: 'Joelson Batista', employee_id: 'jb', fortnightly_salary: 5352 }],
    }
    const doc = new MonthlyReportPDFService(fixtureReport({ report_month: '2026-09' }), { pdfLayout: layout(config), payrollGrid: grid }).generate() as any
    const text = payrollText(doc)
    expect(text).toContain('(Fortnightly)')
    expect(text).not.toContain('(Weekly)')
    expect(text).toContain('(8,059)') // the column's total: a fortnight's budget
    expect(text.match(/\(16,118\)/g)?.length).toBe(2) // July and August: two runs each
    expect(text).toContain('(24,177)') // September: three runs, six weeks
    expect(docText(doc)).toContain('Sep 2026: 3 fortnightly runs')
  })
})

describe('the grid layout', () => {
  it('takes the roster basis on its Budget row, and prints the notes', () => {
    const roster = DD_ROSTER.map(({ area: _area, ...rest }) => rest)
    const doc = render({ months: 1, roster, budget_basis: 'roster', notes: ['A coach note.'] })
    const text = payrollText(doc)
    expect(text).toContain('(245,584)')
    expect(docText(doc)).toContain('A coach note.')
  })
})
