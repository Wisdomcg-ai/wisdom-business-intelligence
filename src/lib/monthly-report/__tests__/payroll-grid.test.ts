/**
 * The employees, dates and amounts are Urban Road's July–August 2026 payslips:
 * four runs in July and five in August, six employees, $10,503.85 a week.
 */
import { describe, it, expect } from 'vitest'
import { buildPayrollGrid, type PayslipRow } from '../payroll-grid'

const JUL = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27']
const AUG = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']

const STAFF: [string, string, number][] = [
  ['e1', 'Andrea Shinners', 2500],
  ['e2', 'Deborah Leydon', 2500],
  ['e3', 'Lara Powell', 1923.08],
  ['e4', 'Cheryl Henderson', 1538.46],
  ['e5', 'Suzanne Atkin', 1442.31],
  ['e6', 'Thomas White', 600],
]

function payslips(dates: string[] = [...JUL, ...AUG]): PayslipRow[] {
  const out: PayslipRow[] = []
  for (const d of dates) {
    for (const [id, name, wages] of STAFF) {
      out.push({ employee_id: id, employee_name: name, payment_date: d, wages, super_amount: wages * 0.12 })
    }
  }
  return out
}

const EMPLOYEES = [
  { employee_id: 'e1', start_date: '2020-03-05' },
  { employee_id: 'e2', start_date: '2018-01-22' },
  { employee_id: 'e3', start_date: '2022-05-09' },
  { employee_id: 'e4', start_date: '2025-06-09' },
  { employee_id: 'e5', start_date: '2020-03-01' },
  { employee_id: 'e6', start_date: '2018-02-12' },
]

const BUDGETS = { '2026-07': 42015, '2026-08': 52519 }

describe('buildPayrollGrid', () => {
  it('gives a month as many columns as it had pay runs', () => {
    // Four Mondays in July, five in August. This is the whole reason the wages
    // line moves month to month, and the sheet this replaces gets it by hand.
    const grid = buildPayrollGrid(payslips(), EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    expect(grid.months[0].run_dates).toEqual(JUL)
    expect(grid.months[1].run_dates).toEqual(AUG)
    expect(grid.run_dates).toHaveLength(9)
  })

  it('totals each month and differences it against the budget', () => {
    const grid = buildPayrollGrid(payslips(), EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    expect(grid.months[0].total).toBeCloseTo(42015.4, 2)
    expect(grid.months[1].total).toBeCloseTo(52519.25, 2)
    expect(grid.months[0].budget).toBe(42015)
    // Budget − paid, the pack's convention: an overrun is negative.
    expect(grid.months[0].difference).toBeCloseTo(-0.4, 2)
    expect(grid.grand_total).toBeCloseTo(94534.65, 2)
  })

  it('shows a dash, not a zero, for a run an employee was not in', () => {
    // Cheryl started 9 Jun 2025 — but a starter mid-window is the general case,
    // and "paid nothing" and "not employed" are different facts.
    const rows = payslips().filter(p => !(p.employee_id === 'e4' && p.payment_date === '2026-07-06'))
    const grid = buildPayrollGrid(rows, EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    const cheryl = grid.employees.find(e => e.name === 'Cheryl Henderson')!
    expect(cheryl.cells['2026-07-06']).toBeNull()
    expect(cheryl.cells['2026-07-13']).toBeCloseTo(1538.46, 2)
  })

  it('states a weekly figure only when every run agrees', () => {
    const grid = buildPayrollGrid(payslips(), EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    expect(grid.employees.find(e => e.name === 'Andrea Shinners')!.weekly).toBe(2500)

    // One bonus run and the figure is no longer a standing weekly amount.
    const varied = payslips().map(p =>
      p.employee_id === 'e1' && p.payment_date === '2026-08-31' ? { ...p, wages: 4000 } : p)
    const grid2 = buildPayrollGrid(varied, EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    expect(grid2.employees.find(e => e.name === 'Andrea Shinners')!.weekly).toBeNull()
  })

  it('carries the start date Xero holds on the employee, not the payslip', () => {
    const grid = buildPayrollGrid(payslips(), EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    expect(grid.employees.find(e => e.name === 'Deborah Leydon')!.start_date).toBe('2018-01-22')
  })

  it('orders employees by what they were paid, ties by name', () => {
    const grid = buildPayrollGrid(payslips(), EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    expect(grid.employees.map(e => e.name)).toEqual([
      'Andrea Shinners', 'Deborah Leydon', 'Lara Powell',
      'Cheryl Henderson', 'Suzanne Atkin', 'Thomas White',
    ])
  })

  it('adds two payslips posted on the same date rather than losing one', () => {
    const extra: PayslipRow = {
      employee_id: 'e6', employee_name: 'Thomas White',
      payment_date: '2026-08-31', wages: 250, super_amount: 30,
    }
    const grid = buildPayrollGrid([...payslips(), extra], EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    expect(grid.employees.find(e => e.name === 'Thomas White')!.cells['2026-08-31']).toBe(850)
  })

  it('ignores payslips outside the requested months', () => {
    const stray: PayslipRow = {
      employee_id: 'e1', employee_name: 'Andrea Shinners',
      payment_date: '2026-06-29', wages: 2500, super_amount: 300,
    }
    const grid = buildPayrollGrid([...payslips(), stray], EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    expect(grid.run_dates).not.toContain('2026-06-29')
    expect(grid.grand_total).toBeCloseTo(94534.65, 2)
  })

  it('shows a dash rather than a zero difference when there is no budget', () => {
    const grid = buildPayrollGrid(payslips(), EMPLOYEES, ['2026-07', '2026-08'], {})
    expect(grid.months[0].budget).toBeNull()
    expect(grid.months[0].difference).toBeNull()
  })

  it('survives a month with no pay runs at all', () => {
    const grid = buildPayrollGrid(payslips(AUG), EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    expect(grid.months[0].run_dates).toEqual([])
    expect(grid.months[0].total).toBe(0)
    // A month budgeted and unpaid is a finding, not an absence.
    expect(grid.months[0].difference).toBe(42015)
  })

  it('keeps a payslip whose employee Xero did not identify', () => {
    const orphan: PayslipRow = {
      employee_id: null, employee_name: 'Casual Hand',
      payment_date: '2026-08-31', wages: 400, super_amount: 48,
    }
    const grid = buildPayrollGrid([...payslips(), orphan], EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    const row = grid.employees.find(e => e.name === 'Casual Hand')!
    expect(row.cells['2026-08-31']).toBe(400)
    expect(row.start_date).toBeNull()
  })
})
