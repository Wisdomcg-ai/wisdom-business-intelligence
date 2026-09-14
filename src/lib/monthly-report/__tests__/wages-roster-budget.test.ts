/**
 * The Wages Analysis page's per-employee Budget, from the Payroll Report
 * roster: each employee's standing weekly salary times the weeks the month's
 * pay runs covered.
 *
 * Urban Road is on the approved budget, which is not split by employee, so
 * until now the column printed "No per-employee plan exists for this month"
 * over six dashes. Its roster's weekly salaries × August's five weekly runs are
 * $52,519.25 — the approved wages line to the dollar.
 */
import { describe, it, expect } from 'vitest'
import {
  weeksPerPayPeriod,
  budgetRosterFromLayout,
  rosterEmployeeBudgets,
  type RosterPayslip,
} from '../wages-roster-budget'
import {
  UR_EMPLOYEES,
  UR_AUGUST_RUNS,
  urLayout,
  urRosterWithSalaries,
  urRosterWithoutSalaries,
  daysBefore,
} from './urban-road-wages-fixture'

const run = (payment_date: string, calendar_type: string | null = 'WEEKLY', periodDays = 7): RosterPayslip => ({
  payment_date,
  calendar_type,
  period_start: daysBefore(payment_date, periodDays - 1),
  period_end: payment_date,
})

const augustRuns = () => UR_EMPLOYEES.flatMap(() => UR_AUGUST_RUNS.map((d) => run(d)))
const urPaid = () => UR_EMPLOYEES.map((e) => ({ employee_id: e.id, name: e.payslip, start_date: e.start }))

describe('weeks per pay period, by Xero calendar type', () => {
  it('counts each cycle in weeks, and knows no others', () => {
    expect(weeksPerPayPeriod('WEEKLY')).toBe(1)
    expect(weeksPerPayPeriod('FORTNIGHTLY')).toBe(2)
    expect(weeksPerPayPeriod('FOURWEEKLY')).toBe(4)
    expect(weeksPerPayPeriod('TWICEMONTHLY')).toBeCloseTo(52 / 24, 10)
    expect(weeksPerPayPeriod('MONTHLY')).toBeCloseTo(52 / 12, 10)
    expect(weeksPerPayPeriod('QUARTERLY')).toBe(13)
    expect(weeksPerPayPeriod('weekly')).toBe(1)
    expect(weeksPerPayPeriod('UNKNOWN')).toBeNull()
    expect(weeksPerPayPeriod(null)).toBeNull()
  })
})

describe('which roster sets the budget', () => {
  it("is the Payroll Report placement's, once it carries weekly salaries", () => {
    expect(budgetRosterFromLayout(urLayout(urRosterWithSalaries()))?.map((r) => r.weekly_salary)).toEqual([2500, 2500, 1442.31, 1923.08, 600, 1538.46])
  })

  it('is nobody when no roster has a weekly salary — the stored layout today', () => {
    expect(budgetRosterFromLayout(urLayout(urRosterWithoutSalaries()))).toBeNull()
    expect(budgetRosterFromLayout(null)).toBeNull()
    expect(budgetRosterFromLayout({ version: 1, pages: [] })).toBeNull()
    expect(budgetRosterFromLayout('not a layout')).toBeNull()
  })

  it('is the FIRST placement in print order that has any weekly salary', () => {
    const blank = { id: 'a', type: 'payroll_grid', config: { roster: [{ name: 'Andrea Shinners' }] } }
    const first = { id: 'b', type: 'payroll_grid', config: { roster: [{ name: 'Andrea Shinners', weekly_salary: 2500 }] } }
    const second = { id: 'c', type: 'payroll_grid', config: { roster: [{ name: 'Andrea Shinners', weekly_salary: 9999 }] } }
    const layout = {
      version: 1,
      pages: [
        { id: 'p1', orientation: 'portrait', widgets: [{ id: 'w', type: 'wages_detail' }, blank] },
        { id: 'p2', orientation: 'landscape', widgets: [first, second] },
      ],
    }
    expect(budgetRosterFromLayout(layout)?.[0].weekly_salary).toBe(2500)
  })

  it('skips a placement whose config does not parse — its page prints the reason', () => {
    const broken = { id: 'x', type: 'payroll_grid', config: { roster: [{ name: 'Andrea Shinners', weekly_salary: -5 }] } }
    const good = { id: 'y', type: 'payroll_grid', config: { roster: [{ name: 'Andrea Shinners', weekly_salary: 2500 }] } }
    expect(budgetRosterFromLayout({ version: 1, pages: [{ id: 'p', widgets: [broken, good] }] })?.[0].weekly_salary).toBe(2500)
  })
})

describe('Urban Road, August 2026 — five weekly runs', () => {
  it('budgets each employee at weekly salary × 5', () => {
    const res = rosterEmployeeBudgets({ roster: urRosterWithSalaries(), payslips: augustRuns(), employees: urPaid() })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.employees.map((e) => e.budget)).toEqual([12500, 12500, 7211.55, 9615.4, 3000, 7692.3])
    expect(res.employees.every((e) => e.weeks === 5)).toBe(true)
    const total = res.employees.reduce((t, e) => t + (e.budget ?? 0), 0)
    expect(Math.round(total * 100) / 100).toBe(52519.25)
  })

  it('matches by Xero id first, then by the cleaned name — double spaces and case ignored', () => {
    const roster = [
      { name: 'suzanne atkin', weekly_salary: 1442.31 },
      { name: 'Lara Powell', employee_id: 'a1534c56-2619-4b41-b177-7a58c3b7e1e5', weekly_salary: 1923.08 },
    ]
    const res = rosterEmployeeBudgets({
      roster,
      payslips: UR_AUGUST_RUNS.map((d) => run(d)),
      employees: [
        { employee_id: 'c8c1153c-3d2b-4661-b1f6-ef5e92d46f0e', name: 'Suzanne  Atkin', start_date: '2020-03-01' },
        // Renamed in Xero, same record: the id still finds her entry.
        { employee_id: 'a1534c56-2619-4b41-b177-7a58c3b7e1e5', name: 'Lara  Powell-Smith', start_date: '2022-05-09' },
      ],
    })
    expect(res.ok && res.employees.map((e) => e.budget)).toEqual([7211.55, 9615.4])
  })

  it('does not hand an id-keyed entry to a different record that shares the name', () => {
    const res = rosterEmployeeBudgets({
      roster: [{ name: 'Thomas White', employee_id: 'd2224afe-842c-458f-b851-05b6de773d47', weekly_salary: 600 }],
      payslips: UR_AUGUST_RUNS.map((d) => run(d)),
      employees: [{ employee_id: 'rehire-new-record', name: 'Thomas White', start_date: '2026-01-01' }],
    })
    expect(res.ok && res.employees[0]).toEqual({ weekly_salary: null, weeks: 5, budget: null })
  })

  it('an entry with no weekly salary, or no entry at all, is no budget — not $0', () => {
    const roster = urRosterWithSalaries().map((r) => (r.name === 'Thomas White' ? { ...r, weekly_salary: null } : r))
    const res = rosterEmployeeBudgets({
      roster,
      payslips: augustRuns(),
      employees: [...urPaid(), { employee_id: 'casual-1', name: 'Casual Person', start_date: null }],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.employees[4]).toEqual({ weekly_salary: null, weeks: 5, budget: null })
    expect(res.employees[6]).toEqual({ weekly_salary: null, weeks: 5, budget: null })
    expect(res.employees[0].budget).toBe(12500)
  })
})

describe('the weeks the month covered', () => {
  it('a fortnightly calendar counts two weeks a run', () => {
    const res = rosterEmployeeBudgets({
      roster: [{ name: 'Lara Powell', weekly_salary: 1923.08 }],
      payslips: [run('2026-08-07', 'FORTNIGHTLY', 14), run('2026-08-21', 'FORTNIGHTLY', 14)],
      employees: [{ employee_id: 'e1', name: 'Lara Powell', start_date: null }],
    })
    expect(res.ok && res.employees[0]).toEqual({ weekly_salary: 1923.08, weeks: 4, budget: 7692.32 })
  })

  it('twice-monthly and monthly cycles count 52/24 and 52/12 weeks a run', () => {
    const twice = rosterEmployeeBudgets({
      roster: [{ name: 'A', weekly_salary: 2400 }],
      payslips: [
        { payment_date: '2026-08-15', calendar_type: 'TWICEMONTHLY', period_start: '2026-08-01', period_end: '2026-08-15' },
        { payment_date: '2026-08-31', calendar_type: 'TWICEMONTHLY', period_start: '2026-08-16', period_end: '2026-08-31' },
      ],
      employees: [{ employee_id: 'e1', name: 'A', start_date: null }],
    })
    expect(twice.ok && twice.employees[0].budget).toBe(10400)
    const monthly = rosterEmployeeBudgets({
      roster: [{ name: 'A', weekly_salary: 1200 }],
      payslips: [{ payment_date: '2026-08-28', calendar_type: 'MONTHLY', period_start: '2026-08-01', period_end: '2026-08-31' }],
      employees: [{ employee_id: 'e1', name: 'A', start_date: null }],
    })
    expect(monthly.ok && monthly.employees[0].budget).toBe(5200)
  })

  it('a mid-month starter is budgeted only for the runs paid on or after their start date', () => {
    const res = rosterEmployeeBudgets({
      roster: [
        { name: 'Andrea Shinners', weekly_salary: 2500 },
        { name: 'New Starter', weekly_salary: 1500 },
      ],
      payslips: [...UR_AUGUST_RUNS.map((d) => run(d)), ...['2026-08-17', '2026-08-24', '2026-08-31'].map((d) => run(d))],
      employees: [
        { employee_id: 'e1', name: 'Andrea Shinners', start_date: '2020-03-05' },
        // Started on the 12th: the 3rd and 10th runs were before them.
        { employee_id: 'e2', name: 'New Starter', start_date: '2026-08-12' },
      ],
    })
    expect(res.ok && res.employees.map((e) => [e.weeks, e.budget])).toEqual([[5, 12500], [3, 4500]])
  })

  it('a start date ON a pay date counts that run', () => {
    const res = rosterEmployeeBudgets({
      roster: [{ name: 'A', weekly_salary: 1000 }],
      payslips: UR_AUGUST_RUNS.map((d) => run(d)),
      employees: [{ employee_id: 'e1', name: 'A', start_date: '2026-08-24' }],
    })
    expect(res.ok && res.employees[0].weeks).toBe(2)
  })

  it('a second run paying a period already paid does not add a week', () => {
    // An off-cycle run on the 20th for the week the 17th paid.
    const offCycle = { payment_date: '2026-08-20', calendar_type: 'WEEKLY', period_start: '2026-08-11', period_end: '2026-08-17' }
    const res = rosterEmployeeBudgets({
      roster: [{ name: 'A', weekly_salary: 2500 }],
      payslips: [...UR_AUGUST_RUNS.map((d) => run(d)), offCycle],
      employees: [{ employee_id: 'e1', name: 'A', start_date: null }],
    })
    expect(res.ok && res.employees[0].budget).toBe(12500)
  })

  it('a run with no recorded period counts by its payment date', () => {
    const res = rosterEmployeeBudgets({
      roster: [{ name: 'A', weekly_salary: 100 }],
      payslips: [
        { payment_date: '2026-08-07', calendar_type: 'FORTNIGHTLY', period_start: null, period_end: null },
        { payment_date: '2026-08-21', calendar_type: 'FORTNIGHTLY', period_start: null, period_end: null },
      ],
      employees: [{ employee_id: 'e1', name: 'A', start_date: null }],
    })
    expect(res.ok && res.employees[0].budget).toBe(400)
  })
})

describe('no roster budget for the month — stated, never guessed', () => {
  const employees = [{ employee_id: 'e1', name: 'A', start_date: null }]
  const roster = [{ name: 'A', weekly_salary: 1000 }]

  it('when a run has no recognised pay cycle', () => {
    expect(rosterEmployeeBudgets({ roster, employees, payslips: [run('2026-08-03'), run('2026-08-10', null)] }))
      .toEqual({ ok: false, reason: 'unknown_pay_cycle' })
    expect(rosterEmployeeBudgets({ roster, employees, payslips: [run('2026-08-03', 'UNKNOWN')] }))
      .toEqual({ ok: false, reason: 'unknown_pay_cycle' })
  })

  it('when the month runs on more than one pay cycle', () => {
    expect(rosterEmployeeBudgets({ roster, employees, payslips: [run('2026-08-03'), run('2026-08-14', 'FORTNIGHTLY', 14)] }))
      .toEqual({ ok: false, reason: 'mixed_pay_cycles' })
  })

  it('when two schedules of one cycle cover overlapping periods', () => {
    // A Monday payroll and a Thursday payroll: ten weekly runs in a month would
    // otherwise budget every employee for ten weeks.
    expect(rosterEmployeeBudgets({ roster, employees, payslips: [run('2026-08-03'), run('2026-08-06')] }))
      .toEqual({ ok: false, reason: 'overlapping_pay_periods' })
  })
})
