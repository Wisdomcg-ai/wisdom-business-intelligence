/**
 * The two-month payroll grid — every employee against every pay run.
 *
 * Calxa's page 15 is the third hand-rolled Google Sheet tab: copy the last
 * five-week block across, retype the week-date headers (in US m/d/yyyy, because
 * that sheet parses them that way), retype each employee's weekly amount into
 * columns that skip hidden rows, then hide the oldest month so the visible view
 * stays "last three months". The client's own skill file spends a paragraph on
 * how to avoid corrupting a formula with an arrow key while doing it.
 *
 * None of it was ever a judgement. Xero posts a payslip per employee per pay
 * run, and `xero_payslip_lines` has held them all along: for Urban Road's
 * August, five runs on the 3rd, 10th, 17th, 24th and 31st, six employees,
 * $10,503.85 a week — the exact grid the sheet reproduces by hand.
 *
 * This module turns those rows into the grid. It reads no API: every figure is
 * already synced.
 */

export interface PayslipRow {
  employee_id: string | null
  employee_name: string
  /** ISO date of the pay run's payment. */
  payment_date: string
  wages: number | null
  super_amount: number | null
}

export interface EmployeeRow {
  employee_id: string | null
  start_date: string | null
}

export interface PayrollGridEmployee {
  /** Xero's EmployeeID; null for a payslip Xero did not tie to one. */
  employee_id: string | null
  name: string
  start_date: string | null
  /**
   * The standing weekly amount, when every run in the window paid the same.
   *
   * Calxa's column is headed "Weekly Salary (Budget)" and is maintained by
   * hand. Deriving it from actuals and calling it a budget would be a
   * fabrication, so it is derived and NOT called one: when an employee's runs
   * all agree, that figure is a fact about their pay; when they vary — a
   * starter, a leaver, leave without pay, a bonus run — it is null and the
   * column shows a dash rather than picking one of the amounts.
   */
  weekly: number | null
  /** payment_date → amount. Absent (not zero) when they were not in that run. */
  cells: Record<string, number | null>
}

export interface PayrollGridMonth {
  month: string
  run_dates: string[]
  total: number
  /** The month's wages budget, or null when the client has none. */
  budget: number | null
  /** Budget − paid. Null when there is no budget to difference against. */
  difference: number | null
}

export interface PayrollGrid {
  months: PayrollGridMonth[]
  run_dates: string[]
  employees: PayrollGridEmployee[]
  grand_total: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * "Suzanne  Atkin" → "Suzanne Atkin". Xero stores the payslip's name as first
 * name + ' ' + last name, and Urban Road's first names carry a trailing space,
 * so two of its six employees printed with a visible gap.
 */
export function cleanEmployeeName(name: string | null | undefined): string {
  return (name ?? '').replace(/\s+/g, ' ').trim()
}

/** "2026-08-31" → "2026-08". */
function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/**
 * @param payslips  every posted payslip line in the window
 * @param employees master rows, for the start date Xero holds and payslips do not
 * @param months    the months to show, oldest first
 * @param budgets   month → wages budget; omit a month to show a dash
 */
export function buildPayrollGrid(
  payslips: readonly PayslipRow[],
  employees: readonly EmployeeRow[],
  months: readonly string[],
  budgets: Readonly<Record<string, number>> = {},
): PayrollGrid {
  const wanted = new Set(months)
  const inWindow = payslips.filter((p) => p.payment_date && wanted.has(monthOf(p.payment_date)))

  // Run dates, chronological. Derived from the payslips rather than assumed
  // weekly: a month with five Mondays has five columns and a month with four
  // has four, which is the whole reason the wages line moves month to month.
  const runDates = [...new Set(inWindow.map((p) => p.payment_date))].sort()

  const startDateOf = new Map<string, string | null>()
  for (const e of employees) {
    if (e.employee_id) startDateOf.set(e.employee_id, e.start_date ?? null)
  }

  // Keyed by employee_id where Xero gives one, by name otherwise — a payslip
  // with no employee id still belongs to somebody.
  const byEmployee = new Map<string, { name: string; id: string | null; cells: Map<string, number> }>()
  for (const p of inWindow) {
    const key = p.employee_id ?? `name:${p.employee_name}`
    let row = byEmployee.get(key)
    if (!row) {
      row = { name: cleanEmployeeName(p.employee_name), id: p.employee_id ?? null, cells: new Map() }
      byEmployee.set(key, row)
    }
    // Two payslips in the same run (an adjustment run posted the same day) add.
    row.cells.set(p.payment_date, round2((row.cells.get(p.payment_date) ?? 0) + (p.wages ?? 0)))
  }

  const employeeRows: PayrollGridEmployee[] = [...byEmployee.values()]
    .map((row) => {
      const paid = [...row.cells.values()]
      const first = paid[0]
      const allAgree = paid.length > 0 && paid.every((v) => Math.abs(v - first) < 0.005)
      const cells: Record<string, number | null> = {}
      for (const d of runDates) cells[d] = row.cells.has(d) ? row.cells.get(d)! : null
      return {
        employee_id: row.id,
        name: row.name,
        start_date: row.id ? startDateOf.get(row.id) ?? null : null,
        weekly: allAgree ? round2(first) : null,
        cells,
      }
    })
    // Highest paid first, the way the reference grid runs. Ties fall back to
    // the name so the order cannot shuffle between months.
    .sort((a, b) => {
      const at = Object.values(a.cells).reduce<number>((t, v) => t + (v ?? 0), 0)
      const bt = Object.values(b.cells).reduce<number>((t, v) => t + (v ?? 0), 0)
      return bt - at || a.name.localeCompare(b.name)
    })

  const monthRows: PayrollGridMonth[] = months.map((month) => {
    const dates = runDates.filter((d) => monthOf(d) === month)
    const total = round2(
      inWindow
        .filter((p) => monthOf(p.payment_date) === month)
        .reduce((t, p) => t + (p.wages ?? 0), 0),
    )
    const budget = Object.prototype.hasOwnProperty.call(budgets, month) ? round2(budgets[month]) : null
    return {
      month,
      run_dates: dates,
      total,
      budget,
      difference: budget === null ? null : round2(budget - total),
    }
  })

  return {
    months: monthRows,
    run_dates: runDates,
    employees: employeeRows,
    grand_total: round2(monthRows.reduce((t, m) => t + m.total, 0)),
  }
}

// ── The roster ───────────────────────────────────────────────────────────────

export interface RosteredEmployee extends PayrollGridEmployee {
  /** Ordinary hours a week, from the roster. Null = not stated. */
  standard_units: number | null
  /** The standing weekly salary budget, from the roster. Null = not stated. */
  weekly_salary: number | null
}

export interface RosterEntry {
  name: string
  employee_id?: string
  standard_units?: number | null
  weekly_salary?: number | null
}

export interface RosteredPayroll {
  employees: RosteredEmployee[]
  /**
   * The Weekly Salary (Budget) column's total — only when every printed
   * employee has one. A total over the four that were typed in, printed under a
   * column of six, is a smaller number under the same heading.
   */
  weekly_salary_total: number | null
  /** Paid in the window but not on the roster — printed after it, and worth telling the coach. */
  not_on_roster: string[]
}

/**
 * Which roster entry a paid employee is, by index — Xero's id first, then the
 * name ignoring case and repeated spaces. One rule for every page that reads
 * the roster, so the Payroll Report and the Wages Analysis page cannot place
 * the same person differently.
 */
export function rosterMatcher(
  roster: readonly RosterEntry[],
): (employee: { employee_id: string | null; name: string }) => number | undefined {
  const key = (name: string) => cleanEmployeeName(name).toLowerCase()
  const byId = new Map<string, number>()
  const byName = new Map<string, number[]>()
  roster.forEach((r, i) => {
    if (r.employee_id && !byId.has(r.employee_id)) byId.set(r.employee_id, i)
    byName.set(key(r.name), [...(byName.get(key(r.name)) ?? []), i])
  })

  // A name only stands in for a missing id. An entry that names an id belongs
  // to that Xero record alone: a re-hire on a new record, paid in the same
  // window under the same name, is somebody the roster has not placed — matched
  // by name it would take the entry's Weekly Salary (Budget), count it twice in
  // the column total, and never be listed as not on the roster.
  const nameMatch = (e: { employee_id: string | null; name: string }): number | undefined =>
    (byName.get(key(e.name)) ?? []).find((i) => !roster[i].employee_id || !e.employee_id)

  return (e) => (e.employee_id ? byId.get(e.employee_id) : undefined) ?? nameMatch(e)
}

/**
 * Put the grid's employees in roster order and give each the roster's standing
 * figures.
 *
 * An employee on the roster who was not paid in the window is not printed: the
 * grid is what was paid, and a row of dashes for a leaver is noise. Anyone
 * paid but not on the roster is kept — dropping a person from a payroll page
 * because a list was out of date would under-state wages against a Total that
 * still includes them — and follows the roster in the grid's own order.
 *
 * With an empty roster the grid's order stands, unchanged.
 */
export function applyPayrollRoster(grid: PayrollGrid, roster: readonly RosterEntry[]): RosteredPayroll {
  const matchRoster = rosterMatcher(roster)

  const placed = grid.employees.map((e, gridIndex) => {
    const rosterIndex = matchRoster(e)
    const entry = rosterIndex === undefined ? undefined : roster[rosterIndex]
    return {
      gridIndex,
      rosterIndex,
      row: {
        ...e,
        standard_units: entry?.standard_units ?? null,
        weekly_salary: entry?.weekly_salary ?? null,
      } as RosteredEmployee,
    }
  })

  placed.sort((a, b) => {
    const ar = a.rosterIndex ?? Number.POSITIVE_INFINITY
    const br = b.rosterIndex ?? Number.POSITIVE_INFINITY
    return ar === br ? a.gridIndex - b.gridIndex : ar - br
  })

  const employees = placed.map((p) => p.row)
  const allStated = employees.length > 0 && employees.every((e) => e.weekly_salary !== null)
  return {
    employees,
    weekly_salary_total: allStated
      ? round2(employees.reduce((t, e) => t + (e.weekly_salary as number), 0))
      : null,
    not_on_roster: roster.length === 0 ? [] : placed.filter((p) => p.rosterIndex === undefined).map((p) => p.row.name),
  }
}

/** Every employee's pay in one run — the Total row's cell. */
export function runTotal(grid: PayrollGrid, runDate: string): number {
  return round2(grid.employees.reduce((t, e) => t + (e.cells[runDate] ?? 0), 0))
}
