/**
 * Accounts that have nothing to say this year.
 *
 * A Xero chart of accounts accumulates. Urban Road's carries Commercial Sales,
 * Furniture Sales, Canvas Jondo, Commissions Agents, Cost of Goods Sold,
 * Donations, Storage, Stripe Fees, Internal Moving Costs and Interest - ATO —
 * all dormant, all posted to in some earlier year, and every one of them
 * printed a full row of $0 / $0 / $0 / +0.0% in the August pack. Three of the
 * pack's most-read pages were mostly zeros.
 *
 * Calxa never showed them, and that is most of why its packs read like a
 * report and ours read like a database dump.
 *
 * THE RULE, and the reason it is this strict: a line is dropped only when
 * EVERY figure the pack could show for it is zero — this month's actual and
 * budget, the year to date, and the annual budget. Anything else is a real
 * number a reader is entitled to see:
 *
 *   - actual 0 against a budget      → a 100% underspend, the loudest kind
 *   - actual with no budget          → unbudgeted spend, the whole point of the page
 *   - nothing this month but YTD     → dormant now, not dormant this year
 *   - nothing yet but budgeted later → the annual column is the only clue it exists
 *
 * So this suppresses accounts that are silent, never accounts that are merely
 * quiet. It is a display rule and nothing more: the lines stay in the report
 * payload and in the snapshot, so a coach who wants them can still find them
 * and a later change of mind costs nothing.
 */

/** The figures a statement line can carry. All optional — snapshots vary by age. */
export interface MaybeEmptyLine {
  actual?: number | null
  budget?: number | null
  ytd_actual?: number | null
  ytd_budget?: number | null
  budget_annual_total?: number | null
  budget_next_month?: number | null
  /**
   * The same month a year earlier — `prior_year`, the name the generate route
   * writes. This read `prior_year_actual` until Sep 2026, a field nothing has
   * ever emitted, so every account whose only money was last year's was
   * dropped while the section total kept it: Distinct Directions' August pack
   * printed Total Other Income 9,484 under one visible row of 3.
   */
  prior_year?: number | null
}

export interface SilentLineOptions {
  /**
   * Whether the table prints the prior-year column. A figure no column shows
   * cannot earn a row, so with the column off an account whose only money is
   * last year's stays out, exactly as before; with it on, that figure is part
   * of the total beneath and the row must be there for the column to add up.
   * Omitted = the prior year counts.
   */
  priorYear?: boolean
}

/**
 * Rounded to the cent before testing.
 *
 * A dormant account can carry a residue like 4e-14 out of floating-point
 * addition upstream, and `!== 0` would keep the row on the strength of a
 * number that does not exist at any precision the pack prints.
 */
function isZero(v: number | null | undefined): boolean {
  if (v === null || v === undefined) return true
  if (!Number.isFinite(v)) return true
  return Math.round(v * 100) === 0
}

/** True when every figure the pack could print for this line is zero. */
export function isSilentLine(line: MaybeEmptyLine, options: SilentLineOptions = {}): boolean {
  return (
    isZero(line.actual) &&
    isZero(line.budget) &&
    isZero(line.ytd_actual) &&
    isZero(line.ytd_budget) &&
    isZero(line.budget_annual_total) &&
    isZero(line.budget_next_month) &&
    // Prior year earns a row on its own: an account that carried real money
    // last year and none this year is a change worth seeing, and it is the one
    // column that makes "we stopped doing this" visible.
    (options.priorYear === false || isZero(line.prior_year))
  )
}

/**
 * Drop the silent lines, but never drop them all.
 *
 * A section whose every line is silent is itself a finding — a whole revenue
 * or cost category with no activity — and an empty table with a heading over it
 * says that better than a vanished section does. Returning the original array
 * keeps the reader looking at something they can reason about.
 */
export function withoutSilentLines<T extends MaybeEmptyLine>(
  lines: readonly T[],
  options: SilentLineOptions = {},
): T[] {
  const kept = lines.filter(l => !isSilentLine(l, options))
  return kept.length > 0 ? kept : [...lines]
}

/**
 * The same rule for the Full Year page, whose lines are shaped differently.
 *
 * A full-year line carries twelve months plus three totals rather than a single
 * actual and budget, so the generic test cannot read it. The judgement is
 * identical: silent means nothing in any month, nothing projected, and nothing
 * budgeted — by either yardstick. An account budgeted in one month of the year
 * (Urban Road's Art Import: September, December and May only) is NOT silent,
 * which the month scan catches even though eleven of its cells are zero.
 */
export interface MaybeEmptyFullYearLine {
  months?: readonly { actual?: number | null; budget?: number | null; approved_budget?: number | null }[]
  projected_total?: number | null
  annual_budget?: number | null
  approved_annual_budget?: number | null
}

/**
 * @param basis what the page fills an unclosed month with. On the
 *   'approved_budget' basis the forecast is not on the page at all, so a line
 *   only the forecast mentions is silent there: Urban Road's wizard-only
 *   SYS-OTHER-INCOME ("Other Income", $18 a month) printed a row of zeros above
 *   Bank Interest Income on Calxa's Current Year Budget page, which has no such
 *   row. Omitted = every yardstick counts, the rule before the basis existed.
 */
export function isSilentFullYearLine(
  line: MaybeEmptyFullYearLine,
  basis?: 'approved_budget' | 'forecast',
): boolean {
  if (basis === 'approved_budget') {
    for (const m of line.months ?? []) {
      if (!isZero(m?.actual) || !isZero(m?.approved_budget)) return false
    }
    return isZero(line.approved_annual_budget)
  }
  for (const m of line.months ?? []) {
    if (!isZero(m?.actual) || !isZero(m?.budget) || !isZero(m?.approved_budget)) return false
  }
  return (
    isZero(line.projected_total) &&
    isZero(line.annual_budget) &&
    isZero(line.approved_annual_budget)
  )
}

export function withoutSilentFullYearLines<T extends MaybeEmptyFullYearLine>(
  lines: readonly T[],
  basis?: 'approved_budget' | 'forecast',
): T[] {
  const kept = lines.filter(l => !isSilentFullYearLine(l, basis))
  return kept.length > 0 ? kept : [...lines]
}
