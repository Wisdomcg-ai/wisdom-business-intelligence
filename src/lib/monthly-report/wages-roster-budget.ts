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
import { parsePayrollGridConfig, weeklySalaryOf, type PayrollRosterEntry } from './payroll-grid-config'
import { cleanEmployeeName, rosterMatcher } from './payroll-grid'

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
      // A fortnightly roster (IICT-40) is read as its weekly equivalent, so this
      // page and the Payroll Report budget a person the same. An entry stated
      // weekly is handed on exactly as it was stored.
      if (roster.some((r) => weeklySalaryOf(r) !== null)) {
        return roster.map((r) =>
          r.fortnightly_salary === undefined ? r : { ...r, weekly_salary: weeklySalaryOf(r) })
      }
    }
  }
  return null
}

/**
 * All of a pack layout the wages loader reads — its budget roster — as a string.
 * Wages data built from one layout is stale for another with a different key;
 * the page compares them so a saved roster is never printed beside wages
 * budgeted from the last one.
 */
export function wagesLayoutKey(layout: unknown): string {
  return JSON.stringify(budgetRosterFromLayout(layout))
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
  /** Xero's termination date; null or absent when they have not left, or no record is stored. */
  termination_date?: string | null
}

/** A stored Xero employee record (xero_employees), paid this month or not. */
export interface RosterEmployeeRecord {
  employee_id: string
  /** First and last name. */
  name: string
  start_date: string | null
  termination_date: string | null
}

export interface RosterEmployeeBudget {
  /** Null when the roster gives this employee no weekly salary. */
  weekly_salary: number | null
  /** Weeks covered by the month's pay runs that fell inside their employment (start to termination). */
  weeks: number
  /** weekly_salary × weeks, to the cent. Null — not $0 — when there is no weekly salary. */
  budget: number | null
}

/** A roster entry with a weekly salary that no payslip this month matched. */
export interface RosterUnpaidBudget {
  /** The roster's name for them. */
  name: string
  /** Their roster entry's position. */
  index: number
  weekly_salary: number
  weeks: number
  budget: number
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
  | {
      ok: true
      /** One entry per employee passed in, in the same order. */
      employees: RosterEmployeeBudget[]
      /** Rostered with a weekly salary, not paid this month, and employed for at least one of its runs. */
      unpaid: RosterUnpaidBudget[]
      /**
       * Rostered with a weekly salary and not paid this month, but with no one
       * Xero employee record to say whether they were employed — cleaned names.
       * Not budgeted, and not a guess either way.
       */
      unchecked: string[]
      /** The month's one pay cycle; null when it had no runs. */
      pay_cycle: string | null
    }
  | { ok: false; reason: RosterBudgetUnavailableReason }

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Each rostered employee's budget for the month: weekly salary × the weeks
 * covered by the ORGANISATION's pay runs in the month — not the runs that
 * happened to pay them, or a week of unpaid leave would lower their budget with
 * their pay.
 *
 * A pay run is its pay period. Two runs paying the same period (an off-cycle
 * run for a week already paid) cover it once; a run whose period Xero did not
 * record counts by its payment date. A run paid before an employee's Xero start
 * date is not theirs, nor is one whose period began after their termination
 * date.
 *
 * Someone the roster gives a weekly salary who was not paid at all this month
 * is still budgeted (`unpaid`) — unpaid leave is a real variance, and leaving
 * them out would total the column over part of the team. Their dates come from
 * their Xero record (`records`), matched by the roster's own rule: a leaver has
 * no weeks and is left out; with no record to check, they are `unchecked`.
 */
export function rosterEmployeeBudgets(input: {
  roster: readonly PayrollRosterEntry[]
  payslips: readonly RosterPayslip[]
  employees: readonly RosterPaidEmployee[]
  records?: readonly RosterEmployeeRecord[]
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

  const weeksEmployed = (start: string | null | undefined, termination: string | null | undefined) =>
    all
      .filter((p) => (!start || start <= p.lastPaid) && (!termination || termination >= (p.start ?? p.lastPaid)))
      .reduce((total, p) => total + (weeksPerPayPeriod(p.cycle) as number), 0)

  const matchRoster = rosterMatcher(input.roster)
  const paidEntries = new Set<number>()
  const employees = input.employees.map((employee) => {
    const index = matchRoster(employee)
    if (index !== undefined) paidEntries.add(index)
    const weekly = index === undefined ? null : input.roster[index].weekly_salary ?? null
    const weeks = weeksEmployed(employee.start_date, employee.termination_date)
    return { weekly_salary: weekly, weeks, budget: weekly === null ? null : round2(weekly * weeks) }
  })

  const recordsFor = new Map<number, RosterEmployeeRecord[]>()
  for (const record of input.records ?? []) {
    const index = matchRoster(record)
    if (index !== undefined) recordsFor.set(index, [...(recordsFor.get(index) ?? []), record])
  }

  const unpaid: RosterUnpaidBudget[] = []
  const unchecked: string[] = []
  input.roster.forEach((entry, index) => {
    const weekly = entry.weekly_salary
    if (typeof weekly !== 'number' || paidEntries.has(index) || all.length === 0) return
    const found = recordsFor.get(index) ?? []
    // Two records under one name (a name-only entry, two orgs) could be two people.
    if (found.length !== 1) {
      unchecked.push(cleanEmployeeName(entry.name))
      return
    }
    const weeks = weeksEmployed(found[0].start_date, found[0].termination_date)
    if (weeks > 0) unpaid.push({ name: cleanEmployeeName(entry.name), index, weekly_salary: weekly, weeks, budget: round2(weekly * weeks) })
  })

  return { ok: true, employees, unpaid, unchecked, pay_cycle: all[0]?.cycle ?? null }
}
