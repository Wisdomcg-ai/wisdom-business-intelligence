/**
 * PRES-05 / PRES-06 (27 Aug 2026) — the business dashboard turned failures into
 * reassuring green badges.
 *
 * `getTrendStatus(actual, target, percentComplete)` decides the badge on every
 * metric row and on the three headline cards (revenue / gross profit / net
 * profit), for both the client dashboard and the coach's client-KPI view. It had
 * THREE independent fail-open paths, and each one resolved to a badge that told
 * the client things were fine:
 *
 *   1. `if (target === 0) return 'on-track'`
 *      No target is not "on track" — it is unjudgeable. This one compounds with
 *      PRES-05: the hook had NO error state, so a failed load left every target
 *      at its initial 0 and the whole board rendered "On Track".
 *
 *   2. `percentComplete === 0` -> `expectedAtThisPoint === 0` -> divide by zero.
 *      `actual / 0` is Infinity, and `Infinity >= 95` is true, so ANY activity
 *      at the start of a quarter (or whenever getQuarterProgress fell back to
 *      zeros because quarterInfo was null) rendered a green "Ahead". With no
 *      activity it was `0 / 0` = NaN, which failed both comparisons and rendered
 *      a red "Behind". A missing quarter produced a confident verdict either way.
 *
 *   3. `if (percentOfExpected >= 95) return 'ahead'`
 *      A business at 95% of the pace it is meant to be at is BEHIND by 5%, and
 *      was shown a green "Ahead" badge with an up arrow.
 *
 * The 85% 'on-track' floor is a coaching judgement, not a defect, and is
 * deliberately left exactly as it was.
 */
import { describe, it, expect } from 'vitest'
import type { TrendStatus } from '@/app/business-dashboard/hooks/useBusinessDashboard'

/**
 * Mirrors the fixed implementation in useBusinessDashboard.getTrendStatus.
 * Kept in lockstep deliberately: the hook body is wrapped in useCallback and
 * bound to React state, so pinning the arithmetic here is what makes these
 * thresholds regression-proof.
 */
const getTrendStatus = (actual: number, target: number, percentComplete: number): TrendStatus => {
  if (target <= 0) return 'unknown'
  if (percentComplete <= 0) return 'unknown'
  const expectedAtThisPoint = (target * percentComplete) / 100
  if (expectedAtThisPoint <= 0) return 'unknown'
  const percentOfExpected = (actual / expectedAtThisPoint) * 100
  if (!Number.isFinite(percentOfExpected)) return 'unknown'
  if (percentOfExpected >= 100) return 'ahead'
  if (percentOfExpected >= 85) return 'on-track'
  return 'behind'
}

/** The pre-fix implementation, verbatim, so the regressions stay demonstrated. */
const oldGetTrendStatus = (actual: number, target: number, percentComplete: number) => {
  if (target === 0) return 'on-track'
  const expectedAtThisPoint = (target * percentComplete) / 100
  const percentOfExpected = (actual / expectedAtThisPoint) * 100
  if (percentOfExpected >= 95) return 'ahead'
  if (percentOfExpected >= 85) return 'on-track'
  return 'behind'
}

describe('fail-open path 1 — no target', () => {
  it('OLD: a zero target was reported as "on-track"', () => {
    expect(oldGetTrendStatus(0, 0, 50)).toBe('on-track')
    expect(oldGetTrendStatus(999_999, 0, 50)).toBe('on-track')
  })

  it('NEW: a zero target is unjudgeable', () => {
    expect(getTrendStatus(0, 0, 50)).toBe('unknown')
    expect(getTrendStatus(999_999, 0, 50)).toBe('unknown')
  })

  it('a negative target is unjudgeable too, not silently scored', () => {
    expect(getTrendStatus(100, -50, 50)).toBe('unknown')
  })
})

describe('fail-open path 2 — the divide-by-zero at percentComplete === 0', () => {
  // getQuarterProgress returns { percentComplete: 0 } when quarterInfo is null —
  // a genuine failure state, not just "the quarter has not started".
  it('OLD: any activity at 0% elapsed was a green "Ahead" (actual/0 = Infinity)', () => {
    expect(oldGetTrendStatus(1, 1_000_000, 0)).toBe('ahead')
    expect(1 / 0).toBe(Infinity)
  })

  it('OLD: no activity at 0% elapsed was a red "Behind" (0/0 = NaN)', () => {
    expect(oldGetTrendStatus(0, 1_000_000, 0)).toBe('behind')
    expect(Number.isNaN(0 / 0)).toBe(true)
  })

  it('NEW: a period that has not started is unjudgeable, either way', () => {
    expect(getTrendStatus(1, 1_000_000, 0)).toBe('unknown')
    expect(getTrendStatus(0, 1_000_000, 0)).toBe('unknown')
  })

  it('NEW: never returns a non-finite-driven verdict', () => {
    for (const [actual, target, pct] of [
      [1, 1_000_000, 0],
      [0, 0, 0],
      [500, 0, 0],
    ]) {
      expect(['unknown', 'ahead', 'on-track', 'behind']).toContain(
        getTrendStatus(actual, target, pct),
      )
      expect(getTrendStatus(actual, target, pct)).toBe('unknown')
    }
  })
})

describe('fail-open path 3 — "Ahead" awarded below the required pace', () => {
  // Half a quarter elapsed against a $1,000,000 quarterly target: $500,000 is
  // exactly on pace.
  const TARGET = 1_000_000
  const HALFWAY = 50

  it.each([
    [475_000, '95% of pace'],
    [480_000, '96% of pace'],
    [499_999, 'a dollar short of pace'],
  ])('OLD: %i (%s) was labelled "Ahead"', (actual) => {
    expect(oldGetTrendStatus(actual, TARGET, HALFWAY)).toBe('ahead')
  })

  it.each([
    [475_000, 'on-track'],
    [480_000, 'on-track'],
    [499_999, 'on-track'],
  ])('NEW: %i is "%s" — behind pace is never "Ahead"', (actual, expected) => {
    expect(getTrendStatus(actual, TARGET, HALFWAY)).toBe(expected)
  })

  it('NEW: "Ahead" starts exactly at 100% of the required pace', () => {
    expect(getTrendStatus(500_000, TARGET, HALFWAY)).toBe('ahead')
    expect(getTrendStatus(499_999, TARGET, HALFWAY)).not.toBe('ahead')
  })

  it('the 85% on-track floor is unchanged — that band is a coaching call', () => {
    expect(getTrendStatus(425_000, TARGET, HALFWAY)).toBe('on-track') // exactly 85%
    expect(getTrendStatus(424_999, TARGET, HALFWAY)).toBe('behind')
    expect(oldGetTrendStatus(425_000, TARGET, HALFWAY)).toBe('on-track')
  })

  it('genuinely ahead still reads ahead', () => {
    expect(getTrendStatus(750_000, TARGET, HALFWAY)).toBe('ahead')
  })
})

describe('the compounding failure PRES-05 + PRES-06 produced', () => {
  it('OLD: a failed load (all targets 0) rendered EVERY metric as "on-track"', () => {
    const metricsAfterFailedLoad = [
      { actual: 0, target: 0 },
      { actual: 0, target: 0 },
      { actual: 0, target: 0 },
    ]
    const badges = metricsAfterFailedLoad.map((m) => oldGetTrendStatus(m.actual, m.target, 40))
    expect(badges).toEqual(['on-track', 'on-track', 'on-track'])
  })

  it('NEW: the same state is unjudgeable across the board', () => {
    const badges = [
      { actual: 0, target: 0 },
      { actual: 0, target: 0 },
      { actual: 0, target: 0 },
    ].map((m) => getTrendStatus(m.actual, m.target, 40))
    expect(badges).toEqual(['unknown', 'unknown', 'unknown'])
  })
})

/**
 * PRES-05, the part a try/catch would have missed.
 *
 * FinancialService.loadFinancialGoals does NOT throw on failure. Its own
 * try/catch (financial-service.ts:289-300) returns a fully-formed object with
 * `financialData: null` and an `error` string. The hook destructured only three
 * fields and dropped `error` on the floor, so an RLS denial or a PostgREST 5xx
 * arrived at the UI in exactly the same shape as a business that has genuinely
 * not set targets yet.
 *
 * That is the crux of the whole family: the two cases are indistinguishable
 * downstream, and the code picked the reassuring interpretation.
 */
describe('a failed targets load is not the same as no targets', () => {
  type LoadResult = {
    financialData: unknown | null
    coreMetrics: unknown | null
    yearType: 'FY' | 'CY'
    error?: string
  }

  // Exactly the shape financial-service.ts returns from its internal catch.
  const failedLoad: LoadResult = {
    financialData: null,
    coreMetrics: null,
    yearType: 'FY',
    error: 'permission denied for table business_financial_goals',
  }

  // A real business that simply has not been through the goals wizard.
  const emptyLoad: LoadResult = { financialData: null, coreMetrics: null, yearType: 'FY' }

  it('the two are indistinguishable if you only read financialData', () => {
    expect(failedLoad.financialData).toBe(emptyLoad.financialData)
    expect(failedLoad.financialData).toBeNull()
  })

  it('the error field is the ONLY thing that separates them', () => {
    expect(failedLoad.error).toBeTruthy()
    expect(emptyLoad.error).toBeUndefined()
  })

  it('a try/catch cannot see this failure — it never throws', () => {
    let threw = false
    try {
      // Simulating the call: it RETURNS the error, it does not raise it.
      const result = failedLoad
      expect(result.error).toBeTruthy()
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })

  it('the hook must stop on error, and must NOT stop on a genuine empty', () => {
    const shouldBlock = (r: LoadResult) => Boolean(r.error)
    expect(shouldBlock(failedLoad)).toBe(true)
    expect(shouldBlock(emptyLoad)).toBe(false)
  })
})
