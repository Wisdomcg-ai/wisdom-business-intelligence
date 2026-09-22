/**
 * Pure bucketing logic for the CFO production board's reconciliation counts.
 *
 * Source (see sweep.ts): unreconciled account transactions from the
 * Accounting API, reduced to per-month buckets of item count + gross
 * (absolute) value, keyed 'YYYY-MM' by transaction date.
 */

/**
 * Lookback window (months). Deliberately 12: widening it stresses the
 * BankTransactions page cap (a full final page makes the count a floor), and
 * uncoded bank-feed lines — the population Xero's banner counts — are
 * invisible to this API at ANY window (see sweep.ts). Client-importable
 * (this module is pure) so UI copy can name the bound it is asserting.
 */
export const SWEEP_WINDOW_MONTHS = 12

export interface UnreconciledItem {
  /** ISO date (yyyy-MM-dd or full timestamp) of the statement line / transaction */
  date: string
  amount: number
}

export interface MonthBucket {
  /** 'YYYY-MM' */
  month: string
  count: number
  /** Sum of absolute amounts, rounded to cents — gross value of items to clear */
  value: number
}

/**
 * Xero Accounting API dates arrive either as ISO strings ("2026-08-14" /
 * "2026-08-14T00:00:00") or as .NET JSON dates ("/Date(1755129600000+0000)/").
 * Returns 'YYYY-MM' or null when unparseable.
 */
export function xeroDateToMonthKey(raw: string | undefined | null): string | null {
  if (!raw) return null
  const iso = /^(\d{4})-(\d{2})/.exec(raw)
  if (iso) {
    const m = Number(iso[2])
    if (m >= 1 && m <= 12) return `${iso[1]}-${iso[2]}`
    return null
  }
  const dotNet = /\/Date\((-?\d+)/.exec(raw)
  if (dotNet) {
    const d = new Date(Number(dotNet[1]))
    if (Number.isNaN(d.getTime())) return null
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  return null
}

/** Reduce items to sorted per-month buckets. Items with unparseable dates are dropped. */
export function bucketByMonth(items: UnreconciledItem[]): MonthBucket[] {
  const map = new Map<string, { count: number; value: number }>()
  for (const item of items) {
    const key = xeroDateToMonthKey(item.date)
    if (!key) continue
    const bucket = map.get(key) ?? { count: 0, value: 0 }
    bucket.count += 1
    bucket.value += Math.abs(item.amount ?? 0)
    map.set(key, bucket)
  }
  return Array.from(map.entries())
    .map(([month, b]) => ({ month, count: b.count, value: Math.round(b.value * 100) / 100 }))
    .sort((a, b) => a.month.localeCompare(b.month))
}
