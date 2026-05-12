/**
 * Unit tests for projectRemainingMonths — the hybrid extrapolation helper
 * that fills May–Jun of a current-FY P&L line when no forecast is saved.
 *
 * Rule order under test:
 *   1. Prior-FY seasonality reweight (≥3 prior-FY non-zero months, positive
 *      totals, positive prior-FY-at-YTD-months share)
 *   2. Last-3-month average (≥3 YTD months, no usable prior FY)
 *   3. Straight-line run-rate (≤2 YTD months and no prior FY)
 *
 * Fiscal-year context for these tests: AU FY, fiscalYear=2026 means
 * Jul-2025 → Jun-2026; prior FY = Jul-2024 → Jun-2025.
 */

import { describe, it, expect, vi } from 'vitest'

// forecast-service.ts is a 'use client' module that calls createClient()
// at the class's static initializer. The pure helper under test doesn't
// touch Supabase, but importing the module would crash without env vars,
// so stub the client out.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}))

import { projectRemainingMonths } from '../forecast-service'

const FY26_KEYS = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
]
const FY25_KEYS = [
  '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12',
  '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
]

describe('projectRemainingMonths', () => {
  describe('Rule 1 — prior-FY seasonality', () => {
    it('seasonality reweights remaining months by prior-FY share when prior FY has ≥3 non-zero months', () => {
      // FY25: highly seasonal — $90k in May/Jun, $10k elsewhere monthly
      // (10 months × $10k + 2 months × $45k = $190k; share May = 45/190 = 0.237)
      const priorFY: Record<string, number> = {}
      for (const k of FY25_KEYS.slice(0, 10)) priorFY[k] = 10_000
      priorFY['2025-05'] = 45_000
      priorFY['2025-06'] = 45_000

      // FY26 YTD: 10 months × $11k each (slight growth on prior). $110k YTD.
      const ytd: Record<string, number> = {}
      for (const k of FY26_KEYS.slice(0, 10)) ytd[k] = 11_000

      const out = projectRemainingMonths(ytd, FY26_KEYS, { keys: FY25_KEYS, actuals: priorFY })

      // Only May/Jun get projections.
      expect(Object.keys(out).sort()).toEqual(['2026-05', '2026-06'])
      // FY25 YTD share = 100_000 / 190_000 ≈ 0.526
      // FY26 annualized = 110_000 / 0.526 ≈ 209_000
      // May share = 45_000 / 190_000 ≈ 0.237; projection ≈ 209k × 0.237 ≈ $49.5k
      expect(out['2026-05']).toBeGreaterThan(40_000)
      expect(out['2026-05']).toBeLessThan(55_000)
      expect(out['2026-06']).toBeGreaterThan(40_000)
      expect(out['2026-06']).toBeLessThan(55_000)
      // Seasonal months > the YTD monthly average ($11k) — proves reweighting fired.
      expect(out['2026-05']).toBeGreaterThan(11_000)
    })

    it('preserves seasonality direction — a low-priorFY month stays low', () => {
      // FY25: $100k in May, $5k in Jun, $10k other 10 months → seasonal but inverse for Jun.
      const priorFY: Record<string, number> = {}
      for (const k of FY25_KEYS.slice(0, 10)) priorFY[k] = 10_000
      priorFY['2025-05'] = 100_000
      priorFY['2025-06'] = 5_000

      const ytd: Record<string, number> = {}
      for (const k of FY26_KEYS.slice(0, 10)) ytd[k] = 10_000

      const out = projectRemainingMonths(ytd, FY26_KEYS, { keys: FY25_KEYS, actuals: priorFY })

      // May should project much higher than Jun.
      expect(out['2026-05']).toBeGreaterThan(out['2026-06'] * 10)
    })
  })

  describe('Rule 2 — last-3-month average', () => {
    it('falls back to last-3 average when prior-FY is all zero', () => {
      const priorFY: Record<string, number> = {}
      for (const k of FY25_KEYS) priorFY[k] = 0

      // FY26 YTD with growing trend: $1k, $2k, $3k, ... $10k. Last 3 = $8k, $9k, $10k → avg $9k
      const ytd: Record<string, number> = {}
      for (let i = 0; i < 10; i++) ytd[FY26_KEYS[i]] = (i + 1) * 1_000

      const out = projectRemainingMonths(ytd, FY26_KEYS, { keys: FY25_KEYS, actuals: priorFY })

      expect(Object.keys(out).sort()).toEqual(['2026-05', '2026-06'])
      expect(out['2026-05']).toBeCloseTo(9_000, 0)
      expect(out['2026-06']).toBeCloseTo(9_000, 0)
    })

    it('falls back to last-3 when prior-FY has <3 non-zero months', () => {
      const priorFY: Record<string, number> = {}
      // only 2 prior FY months populated — below the threshold for seasonality
      priorFY['2024-12'] = 5_000
      priorFY['2025-03'] = 7_000

      const ytd: Record<string, number> = {}
      for (let i = 0; i < 10; i++) ytd[FY26_KEYS[i]] = 1_000 * (i + 1)
      // last-3 avg of YTD: (8000+9000+10000)/3 = 9000

      const out = projectRemainingMonths(ytd, FY26_KEYS, { keys: FY25_KEYS, actuals: priorFY })
      expect(out['2026-05']).toBeCloseTo(9_000, 0)
      expect(out['2026-06']).toBeCloseTo(9_000, 0)
    })

    it('falls back to last-3 when prior-FY total ≤ 0 (refunds dominate)', () => {
      const priorFY: Record<string, number> = {}
      for (const k of FY25_KEYS.slice(0, 6)) priorFY[k] = -1_000
      for (const k of FY25_KEYS.slice(6, 12)) priorFY[k] = 500
      // Total = -6000 + 3000 = -3000 → no seasonality

      const ytd: Record<string, number> = {}
      for (let i = 0; i < 10; i++) ytd[FY26_KEYS[i]] = 1_000 // flat $1k/mo
      // last-3 avg = 1000

      const out = projectRemainingMonths(ytd, FY26_KEYS, { keys: FY25_KEYS, actuals: priorFY })
      expect(out['2026-05']).toBeCloseTo(1_000, 0)
    })
  })

  describe('Rule 3 — straight-line run-rate', () => {
    it('uses run-rate when <3 YTD months and no usable prior FY', () => {
      const priorFY: Record<string, number> = {} // empty

      // Only 2 YTD months: $4k, $6k — avg $5k
      const ytd: Record<string, number> = {
        '2025-07': 4_000,
        '2025-08': 6_000,
      }

      const out = projectRemainingMonths(ytd, FY26_KEYS, { keys: FY25_KEYS, actuals: priorFY })

      // Remaining 10 months should each be the YTD avg ($5k)
      const remaining = FY26_KEYS.slice(2)
      for (const k of remaining) {
        expect(out[k]).toBeCloseTo(5_000, 0)
      }
    })

    it('returns 0 for empty YTD with no prior-FY', () => {
      const out = projectRemainingMonths({}, FY26_KEYS, { keys: FY25_KEYS, actuals: {} })
      for (const k of FY26_KEYS) {
        expect(out[k]).toBe(0)
      }
    })
  })

  describe('lastCompleteMonth cutoff (partial-current-month handling)', () => {
    it('projects the partial current month even if YTD has a non-zero entry for it', () => {
      // FY26 YTD: 10 months × $10k complete (Jul–Apr) PLUS $4k of partial May
      // (today is May 12). Without the cutoff, May would lock in at $4k.
      const ytd: Record<string, number> = {}
      for (const k of FY26_KEYS.slice(0, 10)) ytd[k] = 10_000
      ytd['2026-05'] = 4_000

      const priorFY: Record<string, number> = {}
      for (const k of FY25_KEYS) priorFY[k] = 10_000 // flat, no seasonality

      const out = projectRemainingMonths(
        ytd,
        FY26_KEYS,
        { keys: FY25_KEYS, actuals: priorFY },
        '2026-04' // last complete month
      )

      // May (partial) AND June (future) get projections. Both should be the
      // full-month projection (~$10k from flat prior FY), NOT the $4k partial.
      expect(out['2026-05']).toBeDefined()
      expect(out['2026-06']).toBeDefined()
      expect(out['2026-05']).toBeGreaterThan(8_000)
      expect(out['2026-05']).toBeLessThan(13_000)
      // The partial entry must NOT be overwritten in the caller's input map.
      expect(ytd['2026-05']).toBe(4_000)
    })

    it('excludes the partial month from the seasonality math (annualization)', () => {
      // FY25 prior: flat $10k each month, total $120k.
      const priorFY: Record<string, number> = {}
      for (const k of FY25_KEYS) priorFY[k] = 10_000

      // FY26 YTD: 10 complete months × $10k (Jul–Apr) = $100k complete.
      // Partial May = $20k (huge spike — would distort annualization if treated
      // as a complete month covering 11/12 of the year).
      const ytd: Record<string, number> = {}
      for (const k of FY26_KEYS.slice(0, 10)) ytd[k] = 10_000
      ytd['2026-05'] = 20_000

      const out = projectRemainingMonths(
        ytd,
        FY26_KEYS,
        { keys: FY25_KEYS, actuals: priorFY },
        '2026-04'
      )

      // With the cutoff: complete YTD = $100k over 10/12 months → annualized
      // = $120k → May/Jun ≈ $10k each.
      // Without the cutoff: YTD = $120k over 11/12 → annualized = $130.9k →
      // May/Jun ≈ $10.9k each. The cutoff version should be LOWER (~$10k).
      expect(out['2026-05']).toBeCloseTo(10_000, -2)
      expect(out['2026-06']).toBeCloseTo(10_000, -2)
    })
  })

  describe('General behavior', () => {
    it('never overwrites a non-zero YTD month', () => {
      const ytd: Record<string, number> = {}
      for (const k of FY26_KEYS.slice(0, 10)) ytd[k] = 5_000
      ytd['2026-04'] = 5_000

      const out = projectRemainingMonths(ytd, FY26_KEYS, { keys: FY25_KEYS, actuals: {} })

      expect(out['2026-04']).toBeUndefined()
      expect(out['2026-05']).toBeDefined()
      expect(out['2026-06']).toBeDefined()
    })

    it('returns empty object when all FY months are already in YTD', () => {
      const ytd: Record<string, number> = {}
      for (const k of FY26_KEYS) ytd[k] = 1_000

      const out = projectRemainingMonths(ytd, FY26_KEYS, { keys: FY25_KEYS, actuals: {} })
      expect(out).toEqual({})
    })
  })
})
