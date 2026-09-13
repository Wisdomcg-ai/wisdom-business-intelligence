/**
 * The order accounts print in on a statement page.
 *
 * Both statement routes (monthly-report/generate and monthly-report/full-year)
 * sorted each section A-Z by account name. The reference pack does not: it
 * lists accounts in Xero ACCOUNT CODE order. Urban Road's income in the August
 * pack runs 200, 41000, 41130, 41140, 41150, 41200, 41300, 41600, 41700, 41750,
 * 42010, 43000, 44000, 44250, 48000 — which no ordering by name reproduces, so
 * a reader holding the two side by side had to hunt for every row.
 *
 * THE RULE:
 *   1. Lines that carry a real Xero code come first, ordered by that code
 *      compared as TEXT, ties broken by name.
 *   2. Lines with no code follow, A-Z by name.
 *
 * WHY TEXT, not numeric. Xero codes are strings ("51400.2" is one of Urban
 * Road's), and the pack orders them as strings. The evidence is in the pack
 * itself: Stripe Fees (code 100000) prints BEFORE Bank Revaluations (497) and
 * Bank Fees (60550), and on the balance sheet Net Wage Payable (804) and
 * Rounding (860) print AFTER 23005. Plain string comparison gives
 * "100000" < "497" < "60550" and "23005" < "804"; numeric comparison gives the
 * opposite in both places. Do not "fix" this into a numeric sort.
 *
 * Plain `<`, not localeCompare, for the codes: localeCompare with numeric
 * collation on would reintroduce the numeric order, and without it is still
 * locale-dependent. The pack's order is byte order.
 *
 * WHICH CODES COUNT. forecast_pl_lines.account_code is NOT always a Xero code.
 * The forecast wizard writes its own there — SYS-TEAM-WAGES, SYS-SUBSCRIPTIONS,
 * opex-N, revenue-N, cogs-N, ACCT-MISSING-<uuid>, and timestamp codes like
 * '1779341224375-5rkezjw0y'. Urban Road's own forecast carries 'opex-28' on
 * Foreign Currency Gains and Losses. Sorted as a code, 'opex-28' lands after
 * every numeric account in the section, in a position that means nothing. So a
 * code is only used for ordering when this business's own Xero data vouches
 * for it (realStatementCodes / statementAccountCode below); everything else is
 * treated as having no code at all.
 */

/** The two fields ordering reads. Optional code — snapshots predate it. */
export interface StatementOrderable {
  account_name: string
  account_code?: string | null
}

function cleanCode(code: string | null | undefined): string | null {
  if (code === null || code === undefined) return null
  const trimmed = String(code).trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The comparator for statement lines. Pure; use with Array.prototype.sort.
 *
 * It trusts `account_code` — deciding whether a code is real is the job of
 * statementAccountCode, at the point the line is built, where the business's
 * actuals and mappings are in hand.
 */
export function compareStatementLines(a: StatementOrderable, b: StatementOrderable): number {
  const ac = cleanCode(a.account_code)
  const bc = cleanCode(b.account_code)
  if (ac !== null && bc !== null) {
    if (ac < bc) return -1
    if (ac > bc) return 1
    return a.account_name.localeCompare(b.account_name)
  }
  if (ac !== null) return -1
  if (bc !== null) return 1
  return a.account_name.localeCompare(b.account_name)
}

/**
 * The set of codes this business's Xero data actually uses — keyed on the
 * lower-cased code, valued with the code as Xero spells it.
 *
 * Built from the actuals rows (what Xero posted) and account_mappings'
 * xero_account_code (a copy taken from the Xero chart). A wizard code never
 * appears in either, which is what lets it be rejected without a pattern
 * list that the next wizard code would slip past.
 */
export function realStatementCodes(
  codes: Iterable<string | null | undefined>,
): Map<string, string> {
  const out = new Map<string, string>()
  for (const raw of codes) {
    const code = cleanCode(raw)
    if (code === null) continue
    const key = code.toLowerCase()
    if (!out.has(key)) out.set(key, code)
  }
  return out
}

/**
 * Is this the shape of a code the forecast wizard invents rather than one Xero
 * issued?
 *
 * Used ONLY to filter a source that is Xero-issued by construction but not
 * guaranteed forever: the budget store. budget_lines is imported from Xero's
 * Budgets API and every code in prod today is a real one — this is the second
 * lock on that door, not the first. It is deliberately NOT used as the test of
 * a code in general: a real Xero chart can use lettered codes ("SC", "BT009"),
 * so no pattern can prove a code real; only the business's own data can.
 */
export function looksLikeWizardCode(code: string | null | undefined): boolean {
  const c = cleanCode(code)
  if (c === null) return false
  return (
    /^SYS-/i.test(c) ||
    /^ACCT-MISSING-/i.test(c) ||
    /^(opex|revenue|cogs)-\d+$/i.test(c) ||
    /^\d{13}-/.test(c)
  )
}

/**
 * The code a statement line should carry, or null.
 *
 * Candidates in priority order — for an actuals row, its own code and then
 * the mapping's; for a forecast-only or budget-only row, the line's own code
 * and then the mapping found by its name. The first candidate this business's
 * Xero data vouches for wins. A candidate it does not recognise is skipped,
 * not trusted: a wrong code misplaces the row, and no code merely sends it to
 * the A-Z tail.
 */
export function statementAccountCode(
  candidates: Array<string | null | undefined>,
  realCodes: Map<string, string>,
): string | null {
  for (const raw of candidates) {
    const code = cleanCode(raw)
    if (code === null) continue
    const canonical = realCodes.get(code.toLowerCase())
    if (canonical !== undefined) return canonical
  }
  return null
}
