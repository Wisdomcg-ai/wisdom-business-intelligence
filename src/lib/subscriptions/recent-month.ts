/**
 * What a vendor actually charged in the month it last charged.
 *
 * The wizard suggested a monthly budget from the twelve-month average, which
 * answers a question nobody asked: a vendor whose seat count doubled in March
 * is budgeted at the mean of the old price and the new one, and is wrong in
 * every remaining month of the year. The most recent month a vendor billed is
 * the best single estimate of what it will bill next month — it carries every
 * price rise and seat change the average dilutes.
 *
 * Only for vendors that bill EVERY month. For a quarterly or annual vendor the
 * "most recent month" is one lump, and calling that the monthly figure would
 * multiply their budget by three or twelve. Those keep their period amount
 * divided across the period, which is already the right answer.
 */

export interface VendorTransactionLike {
  /** ISO date, or anything Date can parse. Rows without one are ignored. */
  date?: string | null
  amount?: number | null
}

/** "2026-08-31" → "2026-08". Returns null for anything unparseable. */
function monthOf(date: string | null | undefined): string | null {
  if (!date) return null
  const m = /^(\d{4})-(\d{2})/.exec(date.trim())
  if (m) return `${m[1]}-${m[2]}`
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * The total charged in the latest calendar month that has any charge at all,
 * or null when there is nothing to go on.
 *
 * The latest month WITH a charge, not the latest month in the range: a vendor
 * that bills on the 28th and an extract cut on the 3rd would otherwise be
 * budgeted at zero.
 */
export function lastChargedMonthTotal(
  transactions: readonly VendorTransactionLike[] | null | undefined,
): number | null {
  const byMonth = new Map<string, number>()
  for (const t of transactions ?? []) {
    const month = monthOf(t?.date)
    if (!month) continue
    const amount = typeof t?.amount === 'number' ? t.amount : Number(t?.amount ?? 0)
    if (!Number.isFinite(amount)) continue
    byMonth.set(month, (byMonth.get(month) ?? 0) + amount)
  }
  if (byMonth.size === 0) return null

  // A month whose charges net to zero — a charge and its credit note — is not
  // evidence of a price; skip back to one that is.
  const months = [...byMonth.keys()].sort().reverse()
  for (const m of months) {
    const total = byMonth.get(m)!
    if (Math.round(total * 100) !== 0) return Math.round(total * 100) / 100
  }
  return null
}
