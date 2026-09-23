/**
 * Step 3 COGS mix % — the denominator must be PINNED.
 *
 * Regression for the Dragon Roofing report of 17 Aug 2026: "i need the cogs to
 * be 60% of revenue and i need to adjust the split % - i have no idea what it
 * is calculating but it is wrong".
 *
 * The old handleCogsMixChange computed
 *   lineTarget = totalCOGS * (newMixPct / 100)
 * and wrote ONLY the edited line. totalCOGS is the sum over lines, so the write
 * moved the very denominator the % had been measured against: the committed
 * value could never equal what the operator typed, and every edit dragged total
 * COGS off the Step-1 GP% target.
 *
 * Reproduced from Dragon's stored forecast (financial_forecasts
 * 7b90633d-466b-46bc-bbfd-fa20b27f98f1), which is why the constants are exact:
 *   revenue goal            $9,030,584
 *   GP goal 40%  => COGS    $5,418,350 (60.00% of revenue)
 *   Tradies Contractors     $3,484,861 (64.32% of COGS)
 *   operator typed          55%
 *   stored result           $2,978,626  — 55% of the OLD total
 *   other ten lines         unchanged
 *   new total               $4,912,115  => Tradies DISPLAYS 60.64%, not 55%
 *                                       => COGS 54.39% of revenue, $506,235 short
 *
 * These tests model the arithmetic of the fix rather than mounting the wizard:
 * the defect was purely in how the targets are computed, and modelling it keeps
 * the invariant legible.
 */
import { describe, it, expect } from 'vitest'

const REVENUE = 9_030_584
const GP_PCT = 40
const COGS_TARGET = Math.round(REVENUE * (1 - GP_PCT / 100)) // 5,418,350

/** The OLD behaviour: scale the edited line by the live total, touch nothing else. */
function applyMixOld(amounts: number[], idx: number, pct: number): number[] {
  const total = amounts.reduce((a, b) => a + b, 0)
  const next = [...amounts]
  next[idx] = Math.round(total * (pct / 100))
  return next
}

/**
 * The NEW behaviour: pin the total, rescale the others pro-rata, and land the
 * rounding residue on the last other line. Mirrors handleCogsMixChange — the
 * residue step matters: independent rounding drifts a dollar per line, which is
 * exactly how a "pinned" total quietly stops being pinned.
 */
function applyMixPinned(amounts: number[], idx: number, pct: number, pinnedTotal: number): number[] {
  const total = Math.round(pinnedTotal)
  const editedTarget = Math.round(total * (pct / 100))
  const remainder = Math.max(0, total - editedTarget)
  const otherIdx = amounts.map((_, i) => i).filter((i) => i !== idx)
  const othersSum = otherIdx.reduce((s, i) => s + amounts[i], 0)

  const out = [...amounts]
  out[idx] = editedTarget
  let running = 0
  otherIdx.forEach((ai, i) => {
    if (i === otherIdx.length - 1) {
      out[ai] = Math.max(0, remainder - running)
      return
    }
    const share = othersSum > 0 ? amounts[ai] / othersSum : 1 / otherIdx.length
    out[ai] = Math.round(remainder * share)
    running += out[ai]
  })
  return out
}

const pctOf = (part: number, whole: number) => Math.round((part / whole) * 10000) / 100

describe('Step 3 COGS mix % — pinned denominator (Dragon Roofing regression)', () => {
  // Dragon's eleven lines, collapsed to the edited line plus the rest. The
  // others' internal split is exercised separately below.
  const TRADIES = 3_484_861
  const OTHERS = COGS_TARGET - TRADIES // 1,933,489
  const TYPED = 55

  it('reproduces the reported defect under the OLD arithmetic', () => {
    const after = applyMixOld([TRADIES, OTHERS], 0, TYPED)
    const total = after[0] + after[1]

    // 55% of the OLD total — matching the $2,978,626 actually stored (the live
    // value differs by ~$1.5k after per-month seasonality rounding).
    expect(after[0]).toBe(2_980_093)
    // The others were never rescaled, so the total collapsed.
    expect(total).toBe(4_913_582)
    // The operator typed 55 and the screen showed ~60.6.
    expect(pctOf(after[0], total)).toBeCloseTo(60.65, 1)
    expect(pctOf(after[0], total)).not.toBeCloseTo(TYPED, 1)
    // And overall COGS slid off the 60% target by ~5.6pp.
    expect(pctOf(total, REVENUE)).toBeCloseTo(54.41, 1)
  })

  it('the edited line ends up at exactly the typed %', () => {
    const after = applyMixPinned([TRADIES, OTHERS], 0, TYPED, COGS_TARGET)
    const total = after.reduce((a, b) => a + b, 0)
    expect(pctOf(after[0], total)).toBeCloseTo(TYPED, 1)
  })

  it('total COGS stays on the 60%-of-revenue target through a mix edit', () => {
    const after = applyMixPinned([TRADIES, OTHERS], 0, TYPED, COGS_TARGET)
    const total = after.reduce((a, b) => a + b, 0)
    expect(total).toBe(COGS_TARGET)
    expect(pctOf(total, REVENUE)).toBeCloseTo(60.0, 2)
  })

  it('holds the target across a sequence of edits — the drift was cumulative', () => {
    let amounts = [TRADIES, OTHERS]
    for (const pct of [55, 62, 48, 51]) {
      amounts = applyMixPinned(amounts, 0, pct, COGS_TARGET)
      const total = amounts.reduce((a, b) => a + b, 0)
      expect(total).toBe(COGS_TARGET)
      expect(pctOf(amounts[0], total)).toBeCloseTo(pct, 1)
    }
  })

  it('preserves the RELATIVE mix among the untouched lines', () => {
    // Three others in 6:3:1 proportion — the operator moved one line, not the
    // balance among the rest.
    const others = [1_200_000, 600_000, 200_000]
    const amounts = [TRADIES, ...others]
    const after = applyMixPinned(amounts, 0, TYPED, COGS_TARGET)
    const rest = after.slice(1)
    const restSum = rest.reduce((a, b) => a + b, 0)

    const before = others.map((o) => o / others.reduce((a, b) => a + b, 0))
    const afterShares = rest.map((o) => o / restSum)
    afterShares.forEach((s, i) => expect(s).toBeCloseTo(before[i], 4))
  })

  it('setting a line to 100% zeroes the others and still hits the target', () => {
    const after = applyMixPinned([TRADIES, OTHERS], 0, 100, COGS_TARGET)
    expect(after[0]).toBe(COGS_TARGET)
    expect(after[1]).toBe(0)
  })

  it('setting a line to 0% keeps the target on the remaining lines', () => {
    const after = applyMixPinned([TRADIES, 1_200_000, 733_489], 0, 0, COGS_TARGET)
    expect(after[0]).toBe(0)
    expect(after.reduce((a, b) => a + b, 0)).toBe(COGS_TARGET)
  })

  it('falls back to an even split when the other lines are all zero', () => {
    const after = applyMixPinned([TRADIES, 0, 0], 0, 50, COGS_TARGET)
    // Within a dollar, not equal: an odd remainder cannot halve exactly, and the
    // residue deliberately lands on the last line so the TOTAL stays exact.
    // Pinning the total is the invariant; a $1 tilt between lines is not.
    expect(Math.abs(after[1] - after[2])).toBeLessThanOrEqual(1)
    expect(after.reduce((a, b) => a + b, 0)).toBe(COGS_TARGET)
  })
})

/**
 * Actuals are a FLOOR, not a suggestion.
 *
 * Y1 completed months are Xero facts, and spreadCogsLineToTarget holds them
 * regardless of the requested target. So the allocator must lift every line to
 * its own actuals floor — otherwise asking for less than a line has already
 * spent produced a line bigger than requested while the "pinned" total silently
 * overshot, and (the #375 sharp edge) zeroed every remaining month of that line
 * with no explanation.
 *
 * Dragon's July actuals: Tradies $496,230 — 9.16% of the $5,418,350 target. Ask
 * for less than that and the money is already out the door.
 */
function applyMixWithFloors(
  amounts: number[],
  floors: number[],
  idx: number,
  pct: number,
  pinnedTotal: number,
): number[] {
  const total = Math.round(pinnedTotal)
  const editedTarget = Math.max(floors[idx], Math.round(total * (pct / 100)))
  const remainder = Math.max(0, total - editedTarget)
  const otherIdx = amounts.map((_, i) => i).filter((i) => i !== idx)
  const othersSum = otherIdx.reduce((s, i) => s + amounts[i], 0)

  const out = [...amounts]
  out[idx] = editedTarget
  let running = 0
  otherIdx.forEach((ai, i) => {
    const isLast = i === otherIdx.length - 1
    const raw = isLast
      ? Math.max(0, remainder - running)
      : Math.round(remainder * (othersSum > 0 ? amounts[ai] / othersSum : 1 / otherIdx.length))
    if (!isLast) running += raw
    out[ai] = Math.max(floors[ai], raw)
  })
  return out
}

describe('Step 3 COGS mix % — actuals are a floor', () => {
  const TRADIES = 3_484_861
  const OTHERS = COGS_TARGET - TRADIES
  const TRADIES_JULY = 496_230

  it('never books a line below the actuals already spent', () => {
    // 5% of the target is $270,918 — well under July's $496,230.
    const after = applyMixWithFloors([TRADIES, OTHERS], [TRADIES_JULY, 0], 0, 5, COGS_TARGET)
    expect(after[0]).toBe(TRADIES_JULY)
    expect(after[0]).toBeGreaterThan(Math.round(COGS_TARGET * 0.05))
  })

  it('an untouched line is never dragged below its own actuals', () => {
    // Ask the edited line to take everything; the other still holds its actuals.
    const otherJuly = 268_481
    const after = applyMixWithFloors([TRADIES, OTHERS], [TRADIES_JULY, otherJuly], 0, 100, COGS_TARGET)
    expect(after[1]).toBe(otherJuly)
  })

  it('above the floor the pin still holds exactly', () => {
    const after = applyMixWithFloors([TRADIES, OTHERS], [TRADIES_JULY, 0], 0, 55, COGS_TARGET)
    expect(after.reduce((a, b) => a + b, 0)).toBe(COGS_TARGET)
    expect(pctOf(after[0], COGS_TARGET)).toBeCloseTo(55, 1)
  })

  it('overshoots — and only overshoots — when floors exceed the target', () => {
    // Contrived: floors alone are bigger than the whole COGS target. The total
    // MUST exceed it; pretending otherwise would deny booked cost.
    const floors = [4_000_000, 2_000_000]
    const after = applyMixWithFloors([TRADIES, OTHERS], floors, 0, 50, COGS_TARGET)
    expect(after.reduce((a, b) => a + b, 0)).toBe(6_000_000)
    expect(after[0]).toBe(4_000_000)
    expect(after[1]).toBe(2_000_000)
  })
})
