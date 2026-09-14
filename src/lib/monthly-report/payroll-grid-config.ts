/**
 * A placed payroll page's settings: which layout it prints, how many months it
 * covers, and the client's roster.
 *
 * Every default is the page as it printed before any of this existed — two
 * months, the grid with its per-employee month columns, highest paid first — so
 * a placement with no config prints exactly what it did. Urban Road turns the
 * rest on in its own layout row.
 *
 * WHY A ROSTER IS TYPED IN. Calxa's page 15 carries two columns nothing in Xero
 * that WisdomBI syncs can fill: "Standard Units" (38 hours, 20 for Thomas) and
 * "Weekly Salary (Budget)". The payslip sync stores summary figures only —
 * wages, tax, super, net — and the employee sync stores dates and a group, not
 * the pay template. Deriving the weekly figure from what was paid and heading it
 * "Budget" would be a fabrication: in March 2026 Deborah Leydon was paid $3,850
 * a week for a leave cash-out against a $2,500 budget, and the whole point of
 * the column is that it does NOT move with the payslip. So the roster is the
 * coach's statement of it, and a blank prints as a dash.
 *
 * The roster's order is the page's order. Calxa's is a standing roster — not by
 * pay, start date or name (Andrea, Deborah, Suzanne, Lara, Thomas, Cheryl) — so
 * there is no rule to derive it from either.
 */
import { z } from 'zod'

const rosterEntrySchema = z.strictObject({
  /** As the coach knows them. Matched ignoring case and repeated spaces. */
  name: z.string().trim().min(1).max(120),
  /**
   * Xero's EmployeeID, when known. Wins over the name: a name can be retyped in
   * Xero ("Suzanne  Atkin" with two spaces is how it is stored today) and a
   * roster keyed on it would then drop her to the bottom of the page.
   */
  employee_id: z.string().trim().min(1).optional(),
  /** Ordinary hours a week. Null or absent prints a dash. */
  standard_units: z.number().min(0).max(168).nullable().optional(),
  /**
   * The standing weekly salary budget, in dollars. Null or absent prints a dash.
   * For a client with no forecast employee plan it is also the Wages Analysis
   * page's per-employee Budget, × the month's pay runs (wages-roster-budget).
   */
  weekly_salary: z.number().min(0).nullable().optional(),
})

const configSchema = z.strictObject({
  /**
   * 'grid' — the page as it has always printed: per-employee month columns and
   * the Budget and Difference under them.
   * 'calxa' — Calxa's Payroll Report: Standard Units and Weekly Salary (Budget)
   * down the side, a Total per run, the month totals, Budget and Difference
   * merged across each month's runs, and no month columns.
   */
  layout: z.enum(['grid', 'calxa']).default('grid'),
  /**
   * 'fixed' — always `months` months, ending at the report month.
   * 'fy_to_date' — the financial year's months to date, capped at `months`:
   * Calxa prints "Last 2 Months" in August and "Last Three Months" in March.
   * A fixed two would show Aug–Sep in September where Calxa shows Jul–Sep.
   */
  window: z.enum(['fixed', 'fy_to_date']).default('fixed'),
  months: z.number().int().min(1).max(6).default(2),
  roster: z.array(rosterEntrySchema).max(200).default([]),
  /**
   * Fill the Difference cells green (on or under budget) or red (over). The
   * plan's recommended insert style; off by default, because the statement
   * pages deliberately put no block of colour behind a figure.
   */
  difference_fills: z.boolean().default(false),
})

export type PayrollRosterEntry = z.infer<typeof rosterEntrySchema>
export type PayrollGridConfig = z.infer<typeof configSchema>

export type ParsedPayrollGridConfig =
  | { ok: true; config: PayrollGridConfig }
  /** Still carries a config — the defaults — so the page prints, with the reason above it. */
  | { ok: false; reason: string; config: PayrollGridConfig }

export const DEFAULT_PAYROLL_GRID_CONFIG: PayrollGridConfig = configSchema.parse({})

/**
 * A bad config is a sentence on the page, not an exception and not a silent
 * fallback: a roster with a typo that quietly reverted to the default order
 * would look like the coach's settings had been lost.
 */
export function parsePayrollGridConfig(config: unknown): ParsedPayrollGridConfig {
  const result = configSchema.safeParse(config ?? {})
  if (result.success) return { ok: true, config: result.data }
  const reason = result.error.issues
    .slice(0, 3)
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ')
  return { ok: false, reason, config: DEFAULT_PAYROLL_GRID_CONFIG }
}

/**
 * How many months the page covers for a report month.
 *
 * `yearStartMonth` is July, as every other date in the monthly report assumes.
 * In July a financial-year window is one month — the page says so rather than
 * reaching back into the year that has closed.
 */
export function payrollWindowSize(config: PayrollGridConfig, reportMonth: string, yearStartMonth = 7): number {
  if (config.window !== 'fy_to_date') return config.months
  const m = Number(reportMonth.slice(5, 7))
  if (!Number.isInteger(m) || m < 1 || m > 12) return config.months
  const elapsed = ((m - yearStartMonth + 12) % 12) + 1
  return Math.min(config.months, elapsed)
}

/**
 * The window every placed payroll page needs, fetched once. One load serves
 * the pack, so where two placements disagree the wider window is loaded and
 * the page prints what was loaded.
 */
export function payrollWindowForLayout(
  widgets: readonly { type: string; config?: unknown }[],
  reportMonth: string,
): number {
  const sizes = widgets
    .filter((w) => w.type === 'payroll_grid')
    .map((w) => payrollWindowSize(parsePayrollGridConfig(w.config).config, reportMonth))
  return sizes.length > 0 ? Math.max(...sizes) : DEFAULT_PAYROLL_GRID_CONFIG.months
}
