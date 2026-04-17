/**
 * Distribution conversion — Phase 28.3
 *
 * Calxa's days-to-distribution formula. Takes a DSO/DPO days value and
 * produces a 12-element distribution array that sums to 100 (percent).
 *
 * This is how Calxa converts a "days" number into a month-by-month spread.
 * Example: 30 days → [100, 0, 0, ...] (all in next month, bucket 1)
 * Example: 45 days → [0, 50, 50, 0, ...] (bucket 1 and 2, 50/50 split)
 */

export function daysToDistribution(days: number): number[] {
  const dist = new Array(12).fill(0)
  if (days <= 0) {
    dist[0] = 100
    return dist
  }

  const bucket = Math.min(11, Math.floor(days / 30))
  const fraction = (days % 30) / 30

  dist[bucket] = Math.round((1 - fraction) * 100)
  if (bucket + 1 < 12 && fraction > 0) {
    dist[bucket + 1] = Math.round(fraction * 100)
  }

  // Normalise to exactly 100 (guard against rounding drift)
  const sum = dist.reduce((a, b) => a + b, 0)
  if (sum !== 100) {
    dist[bucket] += (100 - sum)
  }

  return dist
}

/**
 * Validate that a distribution array is well-formed:
 * - Length 12
 * - Sums to 100 (± small tolerance)
 * - All non-negative
 */
export function isValidDistribution(dist: number[]): boolean {
  if (!Array.isArray(dist) || dist.length !== 12) return false
  let sum = 0
  for (const v of dist) {
    if (v < 0 || typeof v !== 'number' || !Number.isFinite(v)) return false
    sum += v
  }
  return Math.abs(sum - 100) < 0.5
}
