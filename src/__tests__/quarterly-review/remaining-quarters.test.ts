/**
 * NFM-06 (27 Aug 2026) — the quarterly review contradicted itself on how many
 * quarters had elapsed.
 *
 * `review.quarter` is the quarter being PLANNED. Four independent sources agree:
 *   page.tsx:35            "quarter/year = the quarter being PLANNED
 *                           (the review is named after it)" + getPlanningQuarter()
 *   workshop/page.tsx:347  "The review is keyed by the PLANNING quarter"
 *   ConfidenceRealignmentStep:107 "Anchor to the quarter being PLANNED"
 *   getPlanningQuarter()   returns the NEXT quarter once you are 2 months into
 *                          the current one — i.e. the one you are about to plan
 *
 * Given that, the two derived quantities must reconcile:
 *   completed  = quarter - 1   (YTD covers the quarters BEFORE the planned one)
 *   remaining  = 4 - quarter + 1   (the planned quarter has not happened yet,
 *                                   so it is itself remaining)
 *   completed + remaining === 4
 *
 * The code used `completed = quarter - 1` (correct — the basis for the YTD
 * run-rate average) alongside `remaining = 4 - quarter` (wrong — it counted only
 * the quarters AFTER the one being planned). They cannot both be right, and the
 * pair failed the reconciliation for every quarter of the year.
 *
 * NOTE: the audit that surfaced this concluded the OPPOSITE side was defective
 * (it read `nextQuarter = quarter + 1` in QuarterlyTargetsStep as proof that
 * `quarter` meant the COMPLETED quarter). The four sources above settle it the
 * other way, so the run-rate divisor was correct all along and `remainingQuarters`
 * was the bug. These tests encode the reconciliation so the question cannot be
 * re-litigated by inspection alone.
 */
import { describe, it, expect } from 'vitest'

/** Quarters whose actuals are already in YTD. */
const completedQuarters = (planningQuarter: number) => planningQuarter - 1
/** Quarters left to earn in, INCLUDING the one being planned. */
const remainingQuarters = (planningQuarter: number) => 4 - planningQuarter + 1

describe('the reconciliation invariant', () => {
  it.each([1, 2, 3, 4])('completed + remaining === 4 when planning Q%i', (q) => {
    expect(completedQuarters(q) + remainingQuarters(q)).toBe(4)
  })

  it('the OLD formula broke the invariant in every quarter', () => {
    const oldRemaining = (q: number) => 4 - q
    for (const q of [1, 2, 3, 4]) {
      expect(completedQuarters(q) + oldRemaining(q)).toBe(3) // always one short
    }
  })
})

describe('remaining quarters, including the one being planned', () => {
  it.each([
    [1, 4], // planning Q1 — the whole year is ahead
    [2, 3],
    [3, 2],
    [4, 1], // planning Q4 — the final quarter still counts
  ])('planning Q%i leaves %i quarters', (q, expected) => {
    expect(remainingQuarters(q)).toBe(expected)
  })
})

describe('the run-rate divisor was always correct', () => {
  it.each([
    [2, 1], // planning Q2 -> Q1 completed
    [3, 2],
    [4, 3],
  ])('planning Q%i averages YTD over %i completed quarters', (q, expected) => {
    expect(completedQuarters(q)).toBe(expected)
  })

  it('planning Q1 has no completed quarters, so no run rate is shown', () => {
    expect(completedQuarters(1)).toBe(0) // guarded by `currentQuarter <= 1` in the component
  })
})

describe('the size of the error in the per-quarter requirement', () => {
  // The divisor spreads the remaining annual gap over the quarters left, so
  // understating it overstates every per-quarter target the client is shown.
  const GAP = 1_200_000
  const oldDivisor = (q: number) => (4 - q > 0 ? 4 - q : 1) // incl. the guard
  const newDivisor = (q: number) => remainingQuarters(q)

  it.each([
    [1, 4 / 3], // 3 vs 4  -> 33% overstated
    [2, 3 / 2], // 2 vs 3  -> 50%
    [3, 2 / 1], // 1 vs 2  -> 100%
  ])('planning Q%i overstated the per-quarter requirement by a factor of %f', (q, factor) => {
    expect(GAP / oldDivisor(q) / (GAP / newDivisor(q))).toBeCloseTo(factor, 6)
  })

  it('Q4 was right by accident — the >0 guard landed on the correct divisor', () => {
    expect(oldDivisor(4)).toBe(1) // 4-4=0 -> guard -> 1
    expect(newDivisor(4)).toBe(1) // genuinely 1
  })
})

/**
 * Second wave (27 Aug 2026): #406 fixed the WRITER, but the live consumer
 * (QuarterlyPlanStep, workshop step 4.2) reads the PERSISTED
 * annual_plan_snapshot.remainingQuarters and never recomputes it. The snapshot
 * is only rewritten by mounting step 4.1, and workshop/page.tsx renders exactly
 * one step at a time — so any path that skips 4.1 consumed the pre-#406 value
 * forever. 7 live prod rows carry it.
 *
 * The fix derives the count from `review.quarter` at the point of use, via the
 * shared helpers below, so a stale stored copy cannot rescale client targets.
 */
import {
  remainingQuartersFor,
  completedQuartersFor,
  runRateForRemaining,
} from '@/app/quarterly-review/types'

describe('the shared helpers are the single definition', () => {
  it.each([1, 2, 3, 4])('completed + remaining === 4 when planning Q%i', (q) => {
    expect(completedQuartersFor(q) + remainingQuartersFor(q)).toBe(4)
  })

  it.each([
    [1, 4],
    [2, 3],
    [3, 2],
    [4, 1],
  ])('remainingQuartersFor(%i) === %i', (q, expected) => {
    expect(remainingQuartersFor(q)).toBe(expected)
  })

  it('never returns 0, so the `|| 1` masking that hid the Q4 case is unreachable', () => {
    for (const q of [1, 2, 3, 4]) expect(remainingQuartersFor(q)).toBeGreaterThan(0)
  })
})

describe('run rate is recomputed from the gap, not the stored quotient', () => {
  // Real prod rows. `stored` is what the pre-#406 build persisted.
  it.each([
    // [business, planningQ, remainingGap, storedRunRate, correctRunRate]
    ['Just Digital Signage', 3, 10_800_000, 10_800_000, 5_400_000],
    ['Sydney Pressed Metal', 3, 2_500_000, 2_500_000, 1_250_000],
    ['Efficient Living', 3, 2_150_000, 2_150_000, 1_075_000],
    ['Envisage FY26 Q3', 3, 1_200_000, 1_200_000, 600_000],
    ['Digital Bond FY27 Q1', 1, 1_500_000, 500_000, 375_000],
    ['Precision Electrical FY27 Q1', 1, 1_080_000, 360_000, 270_000],
  ])('%s: stored %i is rebuilt as %i', (_name, q, gap, stored, correct) => {
    expect(runRateForRemaining(gap, q as number)).toBe(correct)
    expect(runRateForRemaining(gap, q as number)).not.toBe(stored)
  })

  it('Envisage FY26 Q4 was right by accident and stays right', () => {
    expect(runRateForRemaining(900_000, 4)).toBe(900_000)
  })
})

describe('the projection identity survives the fix', () => {
  // ytd + runRate * remaining === annualTarget, for any quarter. This identity
  // held under the OLD code too (the R cancels), which is exactly why it could
  // never have caught the bug — pinned here so nobody "simplifies" back to the
  // stored quotient believing the identity is the safeguard.
  it.each([1, 2, 3, 4])('holds when planning Q%i', (q) => {
    const annual = 4_000_000
    const ytd = 900_000
    const rr = runRateForRemaining(annual - ytd, q)
    const projected = ytd + rr * remainingQuartersFor(q)
    expect(Math.abs(projected - annual)).toBeLessThanOrEqual(remainingQuartersFor(q))
  })
})
