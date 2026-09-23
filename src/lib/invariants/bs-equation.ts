/**
 * bs_equation over the Path-A balance-sheet mirror (xero_bs_lines).
 *
 * Until 2 Sep 2026 the daily invariant read the OTHER mirror
 * (xero_balance_sheet_lines, the nightly wide table that serves consolidation)
 * while every report page, the money-flow gate and the fleet repair read
 * xero_bs_lines. The check was therefore watching a table the reports don't
 * use — it reported Armstrong-only for weeks while six tenants sat out of
 * balance in the mirror that actually renders. This is the evaluation over
 * the right mirror, pure and testable.
 *
 * Month choice: the newest COMPLETED month-end (≤ asOf). The cron also stores
 * forward-dated balances for the current month (the "as of now" snapshot that
 * keeps the cash position fresh); those are legitimately in flux and are not
 * the month a pack would report on.
 *
 * Equity rows carry section NULL by construction (the parser resets the
 * sub-section on entering a top-level classifier) — so "uncategorised" on
 * this mirror means an account_type outside asset/liability/equity, not a
 * missing section.
 */

export interface PathABsRow {
  tenant_id: string | null
  account_name: string
  account_type: string | null
  section: string | null
  /** 'YYYY-MM-DD' month-end → balance (liabilities + equity stored POSITIVE). */
  balances_by_date: Record<string, number | string | null> | null
}

export interface BsEquationResult {
  /** The month-end evaluated, or null when the tenant has no completed month-end. */
  balance_date: string | null
  assets: number
  liabilities: number
  equity: number
  /** assets − liabilities − equity, rounded to cents. */
  delta: number
  /** False when every value at that date is zero — "no data" must never read as a pass. */
  hasData: boolean
  /** Rows whose account_type is not asset/liability/equity — must net to nothing. */
  uncategorised_total: number
  uncategorised_count: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Newest 'YYYY-MM-DD' key ≤ asOf across the rows. */
export function newestCompletedMonthEnd(rows: PathABsRow[], asOf: Date): string | null {
  const cutoff = asOf.toISOString().slice(0, 10)
  let newest: string | null = null
  for (const r of rows) {
    for (const k of Object.keys(r.balances_by_date ?? {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue
      if (k > cutoff) continue
      if (newest === null || k > newest) newest = k
    }
  }
  return newest
}

export function evaluateBsEquation(rows: PathABsRow[], asOf: Date): BsEquationResult {
  const balance_date = newestCompletedMonthEnd(rows, asOf)
  if (!balance_date) {
    return { balance_date: null, assets: 0, liabilities: 0, equity: 0, delta: 0, hasData: false, uncategorised_total: 0, uncategorised_count: 0 }
  }
  let assets = 0, liabilities = 0, equity = 0, gross = 0
  let uncategorised_total = 0, uncategorised_count = 0
  for (const r of rows) {
    const raw = r.balances_by_date?.[balance_date]
    if (raw === undefined) continue
    const v = num(raw)
    gross += Math.abs(v)
    if (r.account_type === 'asset') assets += v
    else if (r.account_type === 'liability') liabilities += v
    else if (r.account_type === 'equity') equity += v
    else if (v !== 0) {
      uncategorised_total += Math.abs(v)
      uncategorised_count++
    }
  }
  return {
    balance_date,
    assets: round2(assets),
    liabilities: round2(liabilities),
    equity: round2(equity),
    delta: round2(assets - liabilities - equity),
    hasData: gross > 0,
    uncategorised_total: round2(uncategorised_total),
    uncategorised_count,
  }
}
