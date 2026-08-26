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
