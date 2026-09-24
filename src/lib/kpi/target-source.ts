/**
 * Where a KPI's target actually lives.
 *
 * `business_kpis` holds a target in two places: `year1_target`, a numeric
 * column that DEFAULTS TO 0, and `target_value`, a free text column. Precision
 * Electrical Group — the demo account — carries all nine of its targets in
 * `target_value` with `year1_target` sitting at its default, so a reader that
 * takes `year1_target || 0` prints "Target 0" nine times on the page a
 * prospect is shown.
 *
 * Two spellings of the same read both get it wrong:
 *
 *   num(year1_target) ?? num(target_value)   // ?? stops at the 0
 *   year1_target || target_value             // the string "0" is truthy
 *
 * The second is not hypothetical: one production row holds `target_value` as
 * the literal string "0". So a zero in EITHER column means unset, in either
 * spelling, and the answer is a number or nothing at all — never a 0 standing
 * in for "we don't know".
 *
 * Kept here, outside any one page, because the quarterly-review PDF and the
 * One-Page Plan both answer this question about the same KPI and must not
 * answer it differently.
 */

/** A target as stored: a number, a numeric string, or nothing. */
export type StoredTarget = number | string | null | undefined

/**
 * The first of `candidates` that holds a real target, in priority order.
 *
 * Unset means: null, undefined, empty, not a number, or zero. Production has
 * no formatted values in these columns — no "$40,000", no "45 days" — so a
 * value that will not parse is treated as unset rather than guessed at.
 */
export function resolveKpiTarget(...candidates: StoredTarget[]): number | null {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue
    const text = String(candidate).trim()
    if (!text) continue
    const value = Number(text)
    if (!Number.isFinite(value) || value === 0) continue
    return value
  }
  return null
}
