/**
 * COGS actual months must survive a % edit.
 *
 * Reported 17 Aug (Dragon): "the COGS for July which should be locked is
 * updating as I update the budget."
 *
 * `handleCogsMixChange` rebuilt the ENTIRE 12-month grid from seasonality:
 *
 *     yearMKeys.forEach((key, idx) => {
 *       monthly[key] = Math.round(lineTarget * (seasonality[idx] / totalSeason))
 *     })
 *
 * No actual-month guard, so adjusting any COGS percentage silently overwrote
 * July's real Xero cost with a seasonality-spread projection. Revenue has
 * guarded this since #349 (redistributeYearForActiveTab keeps actual months and
 * spreads only the remainder); COGS never got the same treatment.
 *
 * Dragon's July COGS is real money — Tradies Contractors alone is $496,230.
 */
import { describe, it, expect } from 'vitest'

type Line = { id: string; year1Monthly: Record<string, number> }

const MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
]
/** July is closed; the rest of FY27 is open. */
const ACTUALS = new Set(['2026-07'])

/** Mirrors the FIXED handleCogsMixChange in Step3RevenueCOGS.tsx. */
function cogsMixChange(
  line: Line,
  totalCOGS: number,
  newMixPct: number,
  actuals: Set<string> = ACTUALS,
  seasonality: number[] = Array(12).fill(100 / 12),
): Record<string, number> {
  const lineTarget = Math.round(totalCOGS * (newMixPct / 100))
  const existing = line.year1Monthly

  let actualsTotal = 0
  let openSeasonality = 0
  MONTHS.forEach((key, idx) => {
    if (actuals.has(key)) actualsTotal += existing[key] || 0
    else openSeasonality += seasonality[idx] ?? 8.33
  })

  const projectedTarget = Math.max(0, lineTarget - actualsTotal)
  const monthly: Record<string, number> = {}
  MONTHS.forEach((key, idx) => {
    if (actuals.has(key)) {
      monthly[key] = existing[key] || 0
      return
    }
    monthly[key] = openSeasonality > 0
      ? Math.round(projectedTarget * ((seasonality[idx] ?? 8.33) / openSeasonality))
      : 0
  })
  return monthly
}

/** Dragon's largest COGS line, with July as the locked Xero actual. */
const tradies = (): Line => ({
  id: 'cogs-tradies',
  year1Monthly: {
    '2026-07': 496_230, // ACTUAL
    ...Object.fromEntries(MONTHS.slice(1).map(m => [m, 400_000])),
  },
})

describe('editing a COGS percentage', () => {
  it('leaves July untouched — it already happened', () => {
    const before = tradies().year1Monthly['2026-07']
    const after = cogsMixChange(tradies(), 5_000_000, 38)
    expect(after['2026-07']).toBe(before)
    expect(after['2026-07']).toBe(496_230)
  })

  it('holds July across a whole range of percentages', () => {
    for (const pct of [5, 20, 38, 60, 95]) {
      expect(cogsMixChange(tradies(), 5_000_000, pct)['2026-07']).toBe(496_230)
    }
  })

  it('still moves the open months', () => {
    const low = cogsMixChange(tradies(), 5_000_000, 10)
    const high = cogsMixChange(tradies(), 5_000_000, 60)
    expect(high['2026-08']).toBeGreaterThan(low['2026-08'])
  })
})

describe('the percentage target accounts for what already happened', () => {
  it('spreads only the REMAINDER over open months', () => {
    // 38% of $5M = $1.9M target. July already spent $496,230, so the nine…
    // eleven open months share $1,403,770.
    const after = cogsMixChange(tradies(), 5_000_000, 38)
    const openTotal = MONTHS.slice(1).reduce((s, m) => s + after[m], 0)
    // Within rounding: 11 open months each Math.round to the nearest dollar, so
    // the total can drift up to ~$5.50 from the exact remainder. Immaterial on
    // $1.4M, and the same per-month rounding COGS has always used.
    expect(Math.abs(openTotal - (1_900_000 - 496_230))).toBeLessThanOrEqual(10)
  })

  it('never goes negative when actuals already exceed the target', () => {
    // July alone ($496,230) blows past a 5% ($250k) target.
    const after = cogsMixChange(tradies(), 5_000_000, 5)
    expect(after['2026-07']).toBe(496_230)
    for (const m of MONTHS.slice(1)) expect(after[m]).toBe(0)
  })
})

describe('the bug this replaces', () => {
  it('the OLD formula would have overwritten July — proof the guard matters', () => {
    // Verbatim pre-fix behaviour: rebuild every month from seasonality.
    const lineTarget = Math.round(5_000_000 * (38 / 100))
    const seasonality = Array(12).fill(100 / 12)
    const totalSeason = seasonality.reduce((a, b) => a + b, 0)
    const oldJuly = Math.round(lineTarget * (seasonality[0] / totalSeason))

    expect(oldJuly).not.toBe(496_230)
    expect(cogsMixChange(tradies(), 5_000_000, 38)['2026-07']).toBe(496_230)
  })
})

describe('when nothing is locked yet', () => {
  it('a forecast with no completed months spreads across all twelve', () => {
    const after = cogsMixChange(tradies(), 5_000_000, 38, new Set())
    const total = MONTHS.reduce((s, m) => s + after[m], 0)
    expect(Math.abs(total - 1_900_000)).toBeLessThanOrEqual(10)
  })
})
