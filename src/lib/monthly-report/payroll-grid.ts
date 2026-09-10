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
      row = { name: (p.employee_name ?? '').trim(), id: p.employee_id ?? null, cells: new Map() }
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
