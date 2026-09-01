/**
 * Shared Xero where-clause fragments for counting unreconciled bank
 * transactions. Every counting site MUST compose from these — the clause
 * shape is pinned by unit tests because two silent traps live here:
 *
 * THE DELETED TRAP: a deleted Xero bank transaction keeps IsReconciled=false
 * FOREVER. It appears in no reconciliation report and no reconcile badge, so
 * without `Status=="AUTHORISED"` every deleted duplicate haunts the count
 * permanently — a business whose bank rec reports tie to the cent can still
 * show "4 unreconciled" from ghosts. (Sibling-platform incident, Sep 2026.)
 *
 * TRANSACTIONS ≠ STATEMENT LINES: this counts transactions RECORDED in Xero
 * that aren't matched to a statement line. Xero's per-account "Reconcile N
 * items" badge counts imported bank-feed STATEMENT LINES, which the open API
 * cannot see (Bank Statement report requires the addendum-gated scope). Label
 * every surface "unreconciled transactions"; never imply it equals the badge.
 */

export const UNRECONCILED_AUTHORISED = 'Status=="AUTHORISED" AND IsReconciled==false'

/** Date >= fromDate ('YYYY-MM-DD'), for lookback-window sweeps. */
export function sinceWhere(fromDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromDate)
  if (!match) return null
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return `Date>=DateTime(${y},${m},${d})`
}

/** Whole-calendar-month range for 'YYYY-MM', or null for a malformed key. */
export function monthRangeWhere(month: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  if (m < 1 || m > 12) return null
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `Date>=DateTime(${y},${m},1) AND Date<=DateTime(${y},${m},${lastDay})`
}
