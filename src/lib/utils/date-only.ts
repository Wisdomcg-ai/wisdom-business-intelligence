/**
 * Calendar dates with no time of day ("2026-07-01") — B2, 22 Sep 2026.
 *
 * `date.toISOString().slice(0, 10)` is the UTC date, not the date the user
 * sees. A Date built at local midnight (suggestPlanPeriod, fiscal-year helpers,
 * a date input) is still the previous day in UTC anywhere east of Greenwich —
 * so in Australia 1 July 2026 became "2026-06-30" on display AND on save. Three
 * businesses' plans were stored ending 29 June.
 *
 * The pair below round-trips exactly in every timezone: format from the local
 * calendar fields, parse to local midnight.
 */

/** "YYYY-MM-DD" from the date's LOCAL calendar fields. */
export function toDateOnly(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Local midnight of a "YYYY-MM-DD" string. Also accepts a full ISO timestamp
 * (only its date part is used), since Supabase returns `date` columns as plain
 * strings and some callers hold timestamps. Returns null when unparseable.
 */
export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  // Reject impossible dates ("2026-02-31") instead of silently rolling over.
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) {
    return null
  }
  return date
}
