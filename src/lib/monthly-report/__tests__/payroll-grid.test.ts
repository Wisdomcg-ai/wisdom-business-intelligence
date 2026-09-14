/**
 * The employees, dates and amounts are Urban Road's July–August 2026 payslips:
 * four runs in July and five in August, six employees, $10,503.85 a week.
 */
import { describe, it, expect } from 'vitest'
import { buildPayrollGrid, applyPayrollRoster, cleanEmployeeName, runTotal, type PayslipRow } from '../payroll-grid'

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

// ── Names and the roster ─────────────────────────────────────────────────────

/** Calxa page 15's order and standing figures; Xero's ids for the same people. */
const ROSTER = [
  { name: 'Andrea Shinners', employee_id: 'e1', standard_units: 38, weekly_salary: 2500 },
  { name: 'Deborah Leydon', employee_id: 'e2', standard_units: 38, weekly_salary: 2500 },
  { name: 'Suzanne Atkin', employee_id: 'e5', standard_units: 38, weekly_salary: 1442.31 },
  { name: 'Lara Powell', employee_id: 'e3', standard_units: 38, weekly_salary: 1923.08 },
  { name: 'Thomas White', employee_id: 'e6', standard_units: 20, weekly_salary: 600 },
  { name: 'Cheryl Henderson', employee_id: 'e4', standard_units: 38, weekly_salary: 1538.46 },
]
const CALXA_ORDER = ['Andrea Shinners', 'Deborah Leydon', 'Suzanne Atkin', 'Lara Powell', 'Thomas White', 'Cheryl Henderson']

/** The payslips as Xero actually stores two of the names: first name with a trailing space. */
function asStored(rows: PayslipRow[]): PayslipRow[] {
  const stored: Record<string, string> = { 'Suzanne Atkin': 'Suzanne  Atkin', 'Thomas White': 'Thomas  White' }
  return rows.map((p) => ({ ...p, employee_name: stored[p.employee_name] ?? p.employee_name }))
}

describe('employee names', () => {
  it("prints 'Suzanne  Atkin' as 'Suzanne Atkin'", () => {
    expect(cleanEmployeeName('Suzanne  Atkin')).toBe('Suzanne Atkin')
    expect(cleanEmployeeName(' Thomas \t White ')).toBe('Thomas White')
    expect(cleanEmployeeName(null)).toBe('')
    const grid = buildPayrollGrid(asStored(payslips()), EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)
    expect(grid.employees.map((e) => e.name)).toContain('Suzanne Atkin')
    expect(grid.employees.map((e) => e.name)).toContain('Thomas White')
  })
})

describe('applyPayrollRoster', () => {
  const grid = () => buildPayrollGrid(asStored(payslips()), EMPLOYEES, ['2026-07', '2026-08'], BUDGETS)

  it("puts Urban Road's employees in Calxa's roster order, not by pay", () => {
    const r = applyPayrollRoster(grid(), ROSTER)
    expect(r.employees.map((e) => e.name)).toEqual(CALXA_ORDER)
    expect(r.employees.map((e) => e.standard_units)).toEqual([38, 38, 38, 38, 20, 38])
    expect(r.not_on_roster).toEqual([])
  })

  it('keeps every figure the grid had — the roster reorders, it does not re-add', () => {
    const g = grid()
    const r = applyPayrollRoster(g, ROSTER)
    // $10,503.85 a run, $42,015 in July's four and $52,519 in August's five.
    expect(runTotal(g, '2026-08-31')).toBeCloseTo(10503.85, 2)
    expect(g.months.map((m) => Math.round(m.total))).toEqual([42015, 52519])
    // Against the budget's whole dollars: under a dollar over in each month.
    expect(g.months.map((m) => Math.abs(m.difference!) < 1)).toEqual([true, true])
    const paid = r.employees.reduce((t, e) => t + Object.values(e.cells).reduce<number>((s, v) => s + (v ?? 0), 0), 0)
    expect(paid).toBeCloseTo(g.grand_total, 2)
  })

  it('totals the Weekly Salary (Budget) column at $10,504 — only when every row has one', () => {
    expect(applyPayrollRoster(grid(), ROSTER).weekly_salary_total).toBeCloseTo(10503.85, 2)
    const oneBlank = ROSTER.map((r) => (r.name === 'Thomas White' ? { ...r, weekly_salary: null } : r))
    expect(applyPayrollRoster(grid(), oneBlank).weekly_salary_total).toBeNull()
  })

  it('matches by name, ignoring case and spacing, when the roster has no ids', () => {
    const byName = ROSTER.map(({ employee_id: _id, ...r }) => ({ ...r, name: r.name.toUpperCase().replace(' ', '   ') }))
    expect(applyPayrollRoster(grid(), byName).employees.map((e) => e.name)).toEqual(CALXA_ORDER)
  })

  it('an id wins over a name that has since been retyped', () => {
    const renamed = ROSTER.map((r) => (r.employee_id === 'e5' ? { ...r, name: 'Sue Atkin' } : r))
    const r = applyPayrollRoster(grid(), renamed)
    expect(r.employees[2].name).toBe('Suzanne Atkin')
    expect(r.employees[2].weekly_salary).toBe(1442.31)
  })

  it('an entry that names an id never matches a different id with the same name — a re-hire on a new record', () => {
    // Two Xero records for one name, both paid in the window; the roster names
    // the first. Matching the second by name would give it the same Weekly
    // Salary (Budget), count that figure twice in the column total, and keep it
    // out of not_on_roster.
    const slips: PayslipRow[] = [
      { employee_id: 'A', employee_name: 'Sam Lee', payment_date: '2026-08-03', wages: 1000, super_amount: 120 },
      { employee_id: 'B', employee_name: 'Sam Lee', payment_date: '2026-08-10', wages: 900, super_amount: 108 },
    ]
    const g = buildPayrollGrid(slips, [], ['2026-08'])
    const r = applyPayrollRoster(g, [{ name: 'Sam Lee', employee_id: 'A', standard_units: 38, weekly_salary: 1000 }])
    expect(r.employees.map((e) => [e.employee_id, e.weekly_salary])).toEqual([['A', 1000], ['B', null]])
    expect(r.weekly_salary_total).toBeNull()
    expect(r.not_on_roster).toEqual(['Sam Lee'])
  })

  it('a payslip with no employee id still finds its entry by name, even when the entry carries an id', () => {
    const slips: PayslipRow[] = [
      { employee_id: null, employee_name: 'Sam Lee', payment_date: '2026-08-03', wages: 1000, super_amount: 120 },
    ]
    const r = applyPayrollRoster(buildPayrollGrid(slips, [], ['2026-08']), [{ name: 'Sam Lee', employee_id: 'A', weekly_salary: 1000 }])
    expect(r.employees[0].weekly_salary).toBe(1000)
    expect(r.not_on_roster).toEqual([])
  })

  it('somebody paid but not on the roster is kept, listed last, and named', () => {
    const r = applyPayrollRoster(grid(), ROSTER.filter((x) => x.name !== 'Deborah Leydon'))
    expect(r.employees.map((e) => e.name)).toEqual([...CALXA_ORDER.filter((n) => n !== 'Deborah Leydon'), 'Deborah Leydon'])
    expect(r.employees[5].weekly_salary).toBeNull()
    expect(r.not_on_roster).toEqual(['Deborah Leydon'])
  })

  it('a rostered leaver who was not paid in the window is not printed', () => {
    const r = applyPayrollRoster(grid(), [...ROSTER.slice(0, 3), { name: 'Sarah Diana Firth', employee_id: 'e7' }, ...ROSTER.slice(3)])
    expect(r.employees.map((e) => e.name)).toEqual(CALXA_ORDER)
  })

  it('with no roster, the grid order stands and nobody is flagged', () => {
    const g = grid()
    const r = applyPayrollRoster(g, [])
    expect(r.employees.map((e) => e.name)).toEqual(g.employees.map((e) => e.name))
    expect(r.not_on_roster).toEqual([])
    expect(r.weekly_salary_total).toBeNull()
  })

  it("the budget column is the roster's, not what was paid — March 2026's leave cash-out", () => {
    // Deborah Leydon was paid $3,850 every run in March 2026 against a $2,500
    // weekly budget. A column derived from payslips would have printed $3,850
    // under "Budget".
    const MAR = ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30']
    const march: PayslipRow[] = MAR.map((d) => ({
      employee_id: 'e2', employee_name: 'Deborah Leydon', payment_date: d, wages: 3850, super_amount: 462,
    }))
    const g = buildPayrollGrid(march, EMPLOYEES, ['2026-03'])
    expect(g.employees[0].weekly).toBe(3850)
    const r = applyPayrollRoster(g, ROSTER)
    expect(r.employees[0].weekly_salary).toBe(2500)
    expect(r.weekly_salary_total).toBe(2500)
  })
})
