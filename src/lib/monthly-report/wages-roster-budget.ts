/**
 * The Wages Analysis page's per-employee Budget, for a client with no forecast
 * employee plan: the Payroll Report roster's standing weekly salary times the
 * weeks the month's pay runs covered.
 *
 * Urban Road is held to its approved budget, which Xero does not split by
 * employee, so the column printed "No per-employee plan exists for this month"
 * over six dashes. The roster on its Payroll Report placement already states
 * each person's Weekly Salary (Budget) — the coach's figure, not one derived
 * from pay (see payroll-grid-config) — and August's five weekly runs turn
 * those into $52,519.25, the approved wages line to the dollar.
 *
 * Pure: the loader reads the layout, payslips and start dates and hands them in.
 */
import { parsePayrollGridConfig, type PayrollRosterEntry } from './payroll-grid-config'
import { rosterMatcher } from './payroll-grid'

/** Weeks in one pay period, by Xero calendar type. */
const WEEKS_PER_PAY_PERIOD: Readonly<Record<string, number>> = {
  WEEKLY: 1,
  FORTNIGHTLY: 2,
  FOURWEEKLY: 4,
  TWICEMONTHLY: 52 / 24,
  MONTHLY: 52 / 12,
  QUARTERLY: 13,
}

/** Null for a calendar type Xero did not give or this table does not know. */
export function weeksPerPayPeriod(calendarType: string | null | undefined): number | null {
  return WEEKS_PER_PAY_PERIOD[(calendarType ?? '').trim().toUpperCase()] ?? null
}

/**
 * The roster that sets per-employee budgets, from a pack layout.
 *
 * The FIRST payroll_grid placement, in the order the pack prints them (pages in
 * order, widgets in order on the page), whose roster gives anyone a weekly
 * salary. Several placements can carry a roster — a three-month and a
 * two-month Payroll Report, say — and the pack prints them in that order, so
 * the first one a reader meets is the one the Wages page agrees with. A
 * placement whose config does not parse has an empty roster (its own page
 * prints why) and is passed over.
 *
 * Null when no placement gives anyone a weekly salary: the page is then
 * exactly what it was before rosters were read.
 */
export function budgetRosterFromLayout(layout: unknown): PayrollRosterEntry[] | null {
  const pages = (layout as { pages?: unknown } | null)?.pages
  if (!Array.isArray(pages)) return null
  for (const page of pages) {
    const widgets = (page as { widgets?: unknown } | null)?.widgets
    if (!Array.isArray(widgets)) continue
    for (const widget of widgets as { type?: unknown; config?: unknown }[]) {
      if (widget?.type !== 'payroll_grid') continue
      const { roster } = parsePayrollGridConfig(widget.config).config
      if (roster.some((r) => typeof r.weekly_salary === 'number')) return roster
    }
  }
  return null
}

/** One payslip line, as far as the weeks are concerned. */
export interface RosterPayslip {
  payment_date: string
  calendar_type: string | null
  period_start: string | null
  period_end: string | null
}

export interface RosterPaidEmployee {
  employee_id: string | null
  name: string
  /** Xero's start date; null when no employee record is stored. */
  start_date: string | null
}

export interface RosterEmployeeBudget {
  /** Null when the roster gives this employee no weekly salary. */
  weekly_salary: number | null
  /** Weeks covered by the month's pay runs that fell on or after their start date. */
  weeks: number
  /** weekly_salary × weeks, to the cent. Null — not $0 — when there is no weekly salary. */
  budget: number | null
}

/**
 * Why the roster could not be turned into this month's budget. Every one is a
 * month in which counting weeks would mean guessing, so none is guessed.
 *
 * unknown_pay_cycle        a pay run carries no calendar type, or one not in the table above
 * mixed_pay_cycles         the month's runs are on more than one pay cycle
 * overlapping_pay_periods  two runs of one cycle cover overlapping periods (two schedules)
 * start_dates_unreadable   the employees' start dates could not be read (set by the loader)
 */
export type RosterBudgetUnavailableReason =
  | 'unknown_pay_cycle'
  | 'mixed_pay_cycles'
  | 'overlapping_pay_periods'
  | 'start_dates_unreadable'

export type RosterBudgets =
  /** One entry per employee passed in, in the same order. */
  | { ok: true; employees: RosterEmployeeBudget[] }
  | { ok: false; reason: RosterBudgetUnavailableReason }

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Each paid employee's budget for the month: weekly salary × the weeks covered
 * by the ORGANISATION's pay runs in the month — not the runs that happened to
 * pay them, or a week of unpaid leave would lower their budget with their pay.
 *
 * A pay run is its pay period. Two runs paying the same period (an off-cycle
 * run for a week already paid) cover it once; a run whose period Xero did not
 * record counts by its payment date. A run paid before an employee's Xero start
 * date is not theirs.
 */
export function rosterEmployeeBudgets(input: {
  roster: readonly PayrollRosterEntry[]
  payslips: readonly RosterPayslip[]
  employees: readonly RosterPaidEmployee[]
}): RosterBudgets {
  const periods = new Map<string, { cycle: string; start: string | null; end: string | null; lastPaid: string }>()
  for (const slip of input.payslips) {
    const cycle = (slip.calendar_type ?? '').trim().toUpperCase()
    if (weeksPerPayPeriod(cycle) === null) return { ok: false, reason: 'unknown_pay_cycle' }
    const known = !!(slip.period_start && slip.period_end)
    const key = known ? `${cycle}|${slip.period_start}|${slip.period_end}` : `${cycle}|paid ${slip.payment_date}`
    const period = periods.get(key)
    if (!period) {
      periods.set(key, { cycle, start: known ? slip.period_start : null, end: known ? slip.period_end : null, lastPaid: slip.payment_date })
    } else if (slip.payment_date > period.lastPaid) {
      period.lastPaid = slip.payment_date
    }
  }

  const all = [...periods.values()]
  if (new Set(all.map((p) => p.cycle)).size > 1) return { ok: false, reason: 'mixed_pay_cycles' }

  // Distinct periods of one cycle that overlap are two schedules — a Monday
  // and a Thursday payroll — and adding their weeks would budget everyone twice.
  const dated = all.filter((p) => p.start && p.end).sort((a, b) => a.start!.localeCompare(b.start!))
  for (let i = 1; i < dated.length; i++) {
    if (dated[i].start! <= dated[i - 1].end!) return { ok: false, reason: 'overlapping_pay_periods' }
  }

  const matchRoster = rosterMatcher(input.roster)
  return {
    ok: true,
    employees: input.employees.map((employee) => {
      const index = matchRoster(employee)
      const weekly = index === undefined ? null : input.roster[index].weekly_salary ?? null
      const weeks = all
        .filter((p) => !employee.start_date || employee.start_date <= p.lastPaid)
        .reduce((total, p) => total + (weeksPerPayPeriod(p.cycle) as number), 0)
      return { weekly_salary: weekly, weeks, budget: weekly === null ? null : round2(weekly * weeks) }
    }),
  }
}
