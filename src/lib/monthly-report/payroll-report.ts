/**
 * The Payroll Report as Calxa's payrun pages set it out — the model the PDF
 * lays out when a placement asks for more than the grid (P10).
 *
 * Distinct Directions' pages 12-13 are a hand-built Google Sheet: the team in
 * four roster AREAS (Head Office, Bathurst, Orange, Dubbo) each with a TOTAL,
 * then TOTAL — ALL AREAS; beside every person their month's pay, their month's
 * budget (weekly budget × the pay Fridays) and the variance; every weekly pay
 * shaded against the weekly budget. IICT's is a fortnightly roster over three
 * months, and Dragon's three-month window in August reaches back to June, a
 * month of the year that has closed.
 *
 * Every paid figure is the grid's (payroll-grid): the roster adds the areas,
 * the order and the standing salaries, and the budgets it implies are counted
 * by the one rule the Wages Analysis page also uses (wages-roster-budget) —
 * weekly salary × the weeks of the organisation's pay runs that fell inside
 * the person's employment. A month whose weeks cannot be counted has no roster
 * budget and says why, and neither has one whose roster leaves somebody paid
 * without a salary; nothing is guessed, and no total is added over part of a
 * team.
 *
 * WHICH BUDGET (decision 4). The Budget row is the approved wages budget by
 * default, so the payroll page and the statement print one number. A client
 * whose roster is the yardstick — Calxa's DD basis — sets budget_basis
 * 'roster'. The per-employee Month budget column can only ever be the roster's
 * (nothing splits the approved line by person), so with the approved basis a
 * sentence says how far the roster's total is from the approved line: the two
 * are meant to agree, and a coach should see when they do not.
 *
 * Pure. Numbers in the notes are formatted the way the pack prints figures.
 */
import { applyPayrollRoster, rosterMatcher, cleanEmployeeName, type PayrollGrid, type RosteredEmployee } from './payroll-grid'
import { weeklySalaryOf, type PayrollGridConfig, type PayrollRosterEntry } from './payroll-grid-config'
import { rosterEmployeeBudgets, weeksPerPayPeriod, type RosterBudgetUnavailableReason } from './wages-roster-budget'

/** How a pay compares with the roster salary for its pay period. */
export type PayFill = 'under' | 'over' | 'no_budget'

export interface PayrollReportEmployee {
  employee_id: string | null
  name: string
  /** The roster's area; null when the roster gives none or the person is not on it. */
  area: string | null
  start_date: string | null
  standard_units: number | null
  /** The roster's salary for one week. Null when it states none. */
  weekly_salary: number | null
  /** The salary column's figure: a week's or a fortnight's, as the placement states it. */
  period_salary: number | null
  /** payment_date → paid; null when they were not in that run. */
  cells: Record<string, number | null>
  /** payment_date → shading. Null: no pay, or a run whose pay cycle is not known. */
  fills: Record<string, PayFill | null>
  /** The report month: what was paid, the roster's budget, budget − paid. */
  month_actual: number
  month_budget: number | null
  month_variance: number | null
  /** Rostered and employed in the report month but paid nothing in the window — a row of dashes with a budget. */
  unpaid: boolean
}

export interface PayrollReportTotals {
  /** The salary column's total, only when every employee under it has one. */
  period_salary: number | null
  /** payment_date → the run's total. */
  runs: Record<string, number>
  month_actual: number
  /** The month budgets added; null unless every row under it has one. */
  month_budget: number | null
  month_variance: number | null
}

export interface PayrollReportGroup {
  /** Null: the page has no areas, or these people have none. */
  area: string | null
  employees: PayrollReportEmployee[]
  totals: PayrollReportTotals
}

export interface PayrollReportMonth {
  month: string
  run_dates: string[]
  total: number
  /** What the Budget row prints, by the placement's basis. */
  budget: number | null
  difference: number | null
  budget_source: 'approved' | 'roster' | null
  /** The roster's budget for the month, whether or not the Budget row prints it. */
  roster_budget: number | null
  /** Why roster_budget could not be counted. */
  roster_reason: string | null
  /** Weeks covered by the month's pay runs; null when they could not be counted. */
  weeks: number | null
  pay_cycle: string | null
}

export interface PayrollReport {
  report_month: string
  has_areas: boolean
  groups: PayrollReportGroup[]
  totals: PayrollReportTotals
  months: PayrollReportMonth[]
  /** Paid in the window but not on the roster. */
  not_on_roster: string[]
  /** Sentences for under the table: the basis, and anything that could not be counted. The coach's notes are the config's. */
  notes: string[]
}

const round2 = (n: number): number => Math.round(n * 100) / 100

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

/** A figure as the pack prints it: whole dollars, parentheses for a negative. */
function figure(n: number): string {
  const text = Math.abs(n).toLocaleString('en-AU', { maximumFractionDigits: 0 })
  return Math.round(n) < 0 ? `(${text})` : text
}

const REASONS: Record<RosterBudgetUnavailableReason | 'no_runs' | 'no_salaries', string> = {
  unknown_pay_cycle: 'a pay run carries no pay cycle this page knows',
  mixed_pay_cycles: 'its pay runs are on more than one pay cycle',
  overlapping_pay_periods: 'two of its pay runs cover overlapping periods',
  start_dates_unreadable: 'the employees’ start dates could not be read',
  no_runs: 'nobody was paid, so there are no pay runs to count weeks from',
  no_salaries: 'the roster gives nobody a salary',
}

/** The financial year a month belongs to, as the fiscal-year number (July 2026 → 2027). */
function fiscalYearOf(month: string, yearStartMonth: number): number {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return yearStartMonth === 1 ? y : m >= yearStartMonth ? y + 1 : y
}

/** "A", "A and B", "A, B and C". */
function nameList(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

interface MonthRoster {
  budget: number | null
  /** Why the budget could not be counted, as the page's sentence says it. */
  reason: string | null
  weeks: number | null
  cycle: string | null
  /** Grid employee index → their budget for the month (null: no salary). */
  byEmployee: Map<number, number | null>
  /** Roster index → budget, for someone employed and unpaid. */
  unpaid: Map<number, { name: string; budget: number }>
  unchecked: string[]
}

function rosterForMonth(
  grid: PayrollGrid,
  roster: readonly PayrollRosterEntry[],
  month: string,
  runDates: readonly string[],
): MonthRoster {
  const empty = (reason: keyof typeof REASONS): MonthRoster => ({
    budget: null, reason: REASONS[reason], weeks: null, cycle: null, byEmployee: new Map(), unpaid: new Map(), unchecked: [],
  })
  if (grid.records_unreadable) return empty('start_dates_unreadable')
  const slips = (grid.pay_periods ?? []).filter((p) => p.payment_date.slice(0, 7) === month)
  // A grid read before the pay periods were loaded has runs but no periods: the
  // weeks are not known, which is not the same as a month nobody was paid in.
  if (slips.length === 0) return empty(runDates.length > 0 ? 'unknown_pay_cycle' : 'no_runs')
  if (!roster.some((r) => typeof r.weekly_salary === 'number')) return empty('no_salaries')

  const inMonth = new Set(runDates)
  const paid = grid.employees
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => Object.entries(e.cells).some(([d, v]) => inMonth.has(d) && v !== null))
  const result = rosterEmployeeBudgets({
    roster,
    payslips: slips,
    employees: paid.map(({ e }) => ({ employee_id: e.employee_id, name: e.name, start_date: e.start_date, termination_date: e.termination_date ?? null })),
    records: grid.employee_records,
  })
  if (!result.ok) return empty(result.reason)

  const byEmployee = new Map<number, number | null>()
  paid.forEach(({ index }, i) => byEmployee.set(index, result.employees[i].budget))
  const unpaid = new Map(result.unpaid.map((u) => [u.index, { name: u.name, budget: u.budget }]))
  const total = [...byEmployee.values()].reduce<number>((t, b) => t + (b ?? 0), 0) + result.unpaid.reduce((t, u) => t + u.budget, 0)

  // A roster entry whose salary has not been typed in yet is not a budget of
  // $0. Their own Month budget is a dash, and a month total that quietly left
  // them out would read as an overspend on whatever area they stand in — so
  // the month has no roster budget, and the page says whose figure is missing.
  // Somebody paid who is on no roster entry at all is a different thing:
  // nothing was budgeted for them, which is a real variance, and the page
  // already names them ("listed last").
  const match = rosterMatcher(roster)
  const unsalaried = [...new Set(paid
    .map(({ e }) => match(e))
    .filter((i): i is number => i !== undefined && typeof roster[i].weekly_salary !== 'number'))]
    .sort((a, b) => a - b)
    .map((i) => cleanEmployeeName(roster[i].name))

  // The weeks are the organisation's, the same for everyone employed all month.
  const weeksPer = weeksPerPayPeriod(result.pay_cycle)
  const periods = new Set(slips.map((s) => (s.period_start && s.period_end ? `${s.period_start}|${s.period_end}` : `paid ${s.payment_date}`)))
  return {
    budget: unsalaried.length > 0 ? null : round2(total),
    reason: unsalaried.length > 0 ? `the roster gives no salary for ${nameList(unsalaried)}` : null,
    weeks: weeksPer === null ? null : round2(periods.size * weeksPer),
    cycle: result.pay_cycle,
    byEmployee,
    unpaid,
    unchecked: result.unchecked,
  }
}

function totalsOf(employees: readonly PayrollReportEmployee[], runDates: readonly string[]): PayrollReportTotals {
  const actual = round2(employees.reduce((t, e) => t + e.month_actual, 0))
  // Only when every row under the heading has one — the rule the Weekly Salary
  // (Budget) total beside it already keeps. A sum over the people who happen to
  // have a budget, printed under a column that includes someone with a dash, is
  // a smaller number under the same heading: it reads as an overspend.
  const budget = employees.length > 0 && employees.every((e) => e.month_budget !== null)
    ? round2(employees.reduce((t, e) => t + (e.month_budget as number), 0))
    : null
  return {
    period_salary: employees.length > 0 && employees.every((e) => e.period_salary !== null)
      ? round2(employees.reduce((t, e) => t + (e.period_salary as number), 0))
      : null,
    runs: Object.fromEntries(runDates.map((d) => [d, round2(employees.reduce((t, e) => t + (e.cells[d] ?? 0), 0))])),
    month_actual: actual,
    month_budget: budget,
    month_variance: budget === null ? null : round2(budget - actual),
  }
}

export function buildPayrollReport(
  grid: PayrollGrid,
  config: PayrollGridConfig,
  opts: { yearStartMonth?: number } = {},
): PayrollReport {
  const yearStart = opts.yearStartMonth ?? 7
  // Month columns and shaded pays belong to the Calxa layout; the grid page has
  // its own month columns and shades nothing.
  const monthColumns = config.layout === 'calxa' && config.employee_month_columns
  const payFills = config.layout === 'calxa' && config.pay_fills
  const reportMonth = grid.months[grid.months.length - 1]?.month ?? ''
  const periodWeeks = config.salary_period === 'fortnight' ? 2 : 1
  // One weekly figure per entry, whichever way the roster states it.
  const roster = config.roster.map((r) => ({ ...r, weekly_salary: weeklySalaryOf(r) }))
  const matchRoster = rosterMatcher(roster)

  const monthRosters = new Map(grid.months.map((m) => [m.month, rosterForMonth(grid, roster, m.month, m.run_dates)]))
  const reportRoster = monthRosters.get(reportMonth)
  const reportRuns = new Set(grid.months[grid.months.length - 1]?.run_dates ?? [])

  // The run's pay cycle, when every period paid on that date agrees on one.
  const cycleOn = new Map<string, string | null>()
  for (const p of grid.pay_periods ?? []) {
    const cycle = (p.calendar_type ?? '').trim().toUpperCase() || null
    cycleOn.set(p.payment_date, cycleOn.has(p.payment_date) && cycleOn.get(p.payment_date) !== cycle ? null : cycle)
  }

  const rostered = applyPayrollRoster(grid, roster)

  const toRow = (e: RosteredEmployee, gridIndex: number | undefined, rosterIndex: number | undefined): PayrollReportEmployee => {
    const entry = rosterIndex === undefined ? undefined : roster[rosterIndex]
    const weekly = entry?.weekly_salary ?? null
    const fills: Record<string, PayFill | null> = {}
    for (const d of grid.run_dates) {
      const paid = e.cells[d]
      if (paid === null || paid === undefined || paid === 0) { fills[d] = null; continue }
      if (!weekly) { fills[d] = 'no_budget'; continue }
      const weeks = weeksPerPayPeriod(cycleOn.get(d))
      fills[d] = weeks === null ? null : paid > weekly * weeks + config.fill_tolerance ? 'over' : 'under'
    }
    const monthActual = round2([...reportRuns].reduce((t, d) => t + (e.cells[d] ?? 0), 0))
    const unpaidBudget = rosterIndex === undefined ? undefined : reportRoster?.unpaid.get(rosterIndex)?.budget
    const monthBudget = gridIndex !== undefined && reportRoster?.byEmployee.has(gridIndex)
      ? reportRoster.byEmployee.get(gridIndex) ?? null
      : unpaidBudget ?? null
    return {
      employee_id: e.employee_id,
      name: e.name,
      area: entry?.area ?? null,
      start_date: e.start_date,
      standard_units: e.standard_units,
      weekly_salary: weekly,
      period_salary: weekly === null ? null : round2(weekly * periodWeeks),
      cells: e.cells,
      fills,
      month_actual: monthActual,
      month_budget: monthBudget,
      month_variance: monthBudget === null ? null : round2(monthBudget - monthActual),
      unpaid: false,
    }
  }

  const rows: { row: PayrollReportEmployee; rosterIndex: number | undefined }[] = rostered.employees.map((e) => {
    // The grid keys a person by Xero id, or by name without one, so the pair is unique.
    const gridIndex = grid.employees.findIndex((g) => g.employee_id === e.employee_id && g.name === e.name)
    const rosterIndex = matchRoster(e)
    return { row: toRow(e, gridIndex >= 0 ? gridIndex : undefined, rosterIndex), rosterIndex }
  })

  // Rostered, employed and unpaid in the report month, and nowhere in the
  // window's payslips: a row only where a column prints their budget.
  if (monthColumns && reportRoster) {
    const placed = new Set(rows.map((r) => r.rosterIndex).filter((i): i is number => i !== undefined))
    for (const [rosterIndex] of reportRoster.unpaid) {
      if (placed.has(rosterIndex)) continue
      const entry = roster[rosterIndex]
      const blank: RosteredEmployee = {
        employee_id: entry.employee_id ?? null,
        name: cleanEmployeeName(entry.name),
        start_date: grid.employee_records?.find((r) => r.employee_id === entry.employee_id)?.start_date ?? null,
        weekly: null,
        cells: Object.fromEntries(grid.run_dates.map((d) => [d, null])),
        standard_units: entry.standard_units ?? null,
        weekly_salary: entry.weekly_salary ?? null,
      }
      const at = rows.findIndex((r) => r.rosterIndex === undefined || r.rosterIndex > rosterIndex)
      rows.splice(at < 0 ? rows.length : at, 0, { row: { ...toRow(blank, undefined, rosterIndex), unpaid: true }, rosterIndex })
    }
  }

  // Areas in the order they first appear; anyone without one follows them.
  const hasAreas = roster.some((r) => r.area !== undefined)
  const order: (string | null)[] = []
  for (const { row } of rows) if (!order.includes(row.area)) order.push(row.area)
  const areaOrder = hasAreas ? [...order.filter((a) => a !== null), ...(order.includes(null) ? [null] : [])] : [null]
  const groups: PayrollReportGroup[] = areaOrder.map((area) => {
    const employees = rows.map((r) => r.row).filter((r) => !hasAreas || r.area === area)
    return { area: hasAreas ? area : null, employees, totals: totalsOf(employees, grid.run_dates) }
  })
  const everyone = groups.flatMap((g) => g.employees)

  const reportFy = fiscalYearOf(reportMonth, yearStart)
  const months: PayrollReportMonth[] = grid.months.map((m) => {
    const r = monthRosters.get(m.month)!
    let budget: number | null
    let source: PayrollReportMonth['budget_source']
    if (config.budget_basis === 'roster') {
      budget = r.budget
      source = r.budget === null ? null : 'roster'
    } else if (m.budget === null && config.earlier_months === 'roster' && fiscalYearOf(m.month, yearStart) < reportFy) {
      budget = r.budget
      source = r.budget === null ? null : 'roster'
    } else {
      budget = m.budget
      source = m.budget === null ? null : 'approved'
    }
    return {
      month: m.month,
      run_dates: m.run_dates,
      total: m.total,
      budget,
      difference: budget === null ? null : round2(budget - m.total),
      budget_source: source,
      roster_budget: r.budget,
      roster_reason: r.reason,
      weeks: r.weeks,
      pay_cycle: r.cycle,
    }
  })

  // ── What the page says under the table ──
  const notes: string[] = []
  const cycleWords = (m: PayrollReportMonth) => {
    const runs = m.run_dates.length
    const cycle = (m.pay_cycle ?? '').toLowerCase()
    return `${monthName(m.month)}: ${runs} ${cycle ? `${cycle} ` : ''}run${runs === 1 ? '' : 's'}`
  }
  if (config.budget_basis === 'roster') {
    notes.push(`Budget is each rostered employee’s weekly salary × the weeks of the month’s pay runs (${months.map(cycleWords).join('; ')}).`)
  } else {
    const earlier = months.filter((m) => m.budget_source === 'roster')
    if (earlier.length > 0) {
      const names = earlier.map((m) => monthName(m.month)).join(' and ')
      notes.push(`${names} ${earlier.length === 1 ? 'is' : 'are'} before this financial year, so ${earlier.length === 1 ? 'its' : 'their'} Budget is the roster’s: weekly salary × the weeks of the month’s pay runs.`)
    }
    const reportRow = months[months.length - 1]
    if (monthColumns && reportRow) {
      notes.push('Budget is the approved wages budget. Each employee’s Month budget is the roster’s weekly salary × the weeks of the month’s pay runs.')
      if (reportRow.budget !== null && reportRow.roster_budget !== null && Math.abs(reportRow.roster_budget - reportRow.budget) >= 1) {
        notes.push(`The roster’s budgets for ${monthName(reportRow.month)} total ${figure(reportRow.roster_budget)} against the approved wages budget of ${figure(reportRow.budget)} — ${figure(Math.abs(reportRow.roster_budget - reportRow.budget))} apart.`)
      }
    }
  }

  // A roster budget the page needed and could not count.
  const needed = (m: PayrollReportMonth, i: number) =>
    config.budget_basis === 'roster' ||
    (config.earlier_months === 'roster' && grid.months[i].budget === null && fiscalYearOf(m.month, yearStart) < reportFy) ||
    (monthColumns && m.month === reportMonth)
  months.forEach((m, i) => {
    if (m.roster_reason && needed(m, i)) notes.push(`${monthName(m.month)}’s roster budget could not be counted: ${m.roster_reason}.`)
  })

  if (config.budget_basis === 'roster' || monthColumns) {
    const unpaid = [...(reportRoster?.unpaid.values() ?? [])]
    if (unpaid.length > 0) {
      notes.push(`Budgeted but not paid in ${monthName(reportMonth)}: ${unpaid.map((u) => `${u.name} (${figure(u.budget)})`).join(', ')}.`)
    }
    if (reportRoster && reportRoster.unchecked.length > 0) {
      notes.push(`Not budgeted, because no single Xero record says whether they were employed: ${reportRoster.unchecked.join(', ')}.`)
    }
  }

  if (payFills) {
    const tolerance = config.fill_tolerance > 0 ? ` (within $${figure(config.fill_tolerance)})` : ''
    notes.push(`Each pay is shaded against the roster salary for its pay period: green at or under${tolerance}, red over, amber where the roster carries no salary. A week with no pay is not shaded.`)
  }

  return {
    report_month: reportMonth,
    has_areas: hasAreas,
    groups,
    totals: totalsOf(everyone, grid.run_dates),
    months,
    not_on_roster: rostered.not_on_roster,
    notes,
  }
}
