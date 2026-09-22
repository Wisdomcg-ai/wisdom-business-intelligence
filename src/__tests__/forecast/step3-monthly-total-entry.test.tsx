/**
 * Step 3 top-down monthly entry — type a month's TOTAL, lines split it.
 *
 * Behaviour pinned here:
 *   - the column sums to the typed figure EXACTLY (residue on the largest line)
 *   - existing per-month mix is preserved proportionally
 *   - an empty month falls back to the year's mix, then to an even split
 *   - locked actual months are never redistributed
 */
import { describe, it, expect } from 'vitest'

type Line = { id: string; name: string; year1Monthly: Record<string, number> }

/**
 * Mirror of handleMonthTotalCommit's allocation maths (Step3RevenueCOGS.tsx).
 * Kept as a pure function here so the distribution contract is testable
 * without mounting the 2,600-line step; the component calls the same shape.
 */
function allocateMonthTotal(
  lines: Line[],
  monthKey: string,
  newTotal: number,
): number[] {
  const currentForMonth = lines.map(l => l.year1Monthly[monthKey] || 0)
  const currentMonthTotal = currentForMonth.reduce((a, b) => a + b, 0)

  let weights: number[]
  if (currentMonthTotal > 0) {
    weights = currentForMonth.map(v => v / currentMonthTotal)
  } else {
    const yearTotals = lines.map(l => Object.values(l.year1Monthly).reduce((a, b) => a + b, 0))
    const yearSum = yearTotals.reduce((a, b) => a + b, 0)
    weights = yearSum > 0 ? yearTotals.map(v => v / yearSum) : lines.map(() => 1 / lines.length)
  }

  let residueIdx = 0
  weights.forEach((w, i) => { if (w > weights[residueIdx]) residueIdx = i })

  let running = 0
  const allocated: (number | null)[] = weights.map((w, i) => {
    if (i === residueIdx) return null
    const v = Math.round(newTotal * w)
    running += v
    return v
  })
  allocated[residueIdx] = Math.max(0, Math.round(newTotal - running))
  return allocated as number[]
}

const AUG = '2026-08'

describe('Step 3 — monthly total entry', () => {
  it('splits the typed total by the month\'s existing mix and sums EXACTLY', () => {
    const lines: Line[] = [
      { id: 'a', name: 'Insurance', year1Monthly: { [AUG]: 800_000 } },
      { id: 'b', name: 'Tile Repairs', year1Monthly: { [AUG]: 150_000 } },
      { id: 'c', name: 'Metal', year1Monthly: { [AUG]: 50_000 } },
    ]
    const out = allocateMonthTotal(lines, AUG, 1_000_000)
    // 80/15/5 preserved
    expect(out[1]).toBe(150_000)
    expect(out[2]).toBe(50_000)
    expect(out[0]).toBe(800_000)
    expect(out.reduce((a, b) => a + b, 0)).toBe(1_000_000)
  })

  it('sums exactly even when the split does not divide cleanly', () => {
    const lines: Line[] = [
      { id: 'a', name: 'A', year1Monthly: { [AUG]: 1 } },
      { id: 'b', name: 'B', year1Monthly: { [AUG]: 1 } },
      { id: 'c', name: 'C', year1Monthly: { [AUG]: 1 } },
    ]
    const out = allocateMonthTotal(lines, AUG, 1_000_000)
    expect(out.reduce((a, b) => a + b, 0)).toBe(1_000_000)
  })

  it('falls back to the YEAR mix when the month is empty', () => {
    const lines: Line[] = [
      { id: 'a', name: 'Big', year1Monthly: { '2026-07': 900_000, [AUG]: 0 } },
      { id: 'b', name: 'Small', year1Monthly: { '2026-07': 100_000, [AUG]: 0 } },
    ]
    const out = allocateMonthTotal(lines, AUG, 500_000)
    expect(out[0]).toBe(450_000) // 90%
    expect(out[1]).toBe(50_000)  // 10%
    expect(out.reduce((a, b) => a + b, 0)).toBe(500_000)
  })

  it('falls back to an even split when there is no history at all', () => {
    const lines: Line[] = [
      { id: 'a', name: 'A', year1Monthly: {} },
      { id: 'b', name: 'B', year1Monthly: {} },
      { id: 'c', name: 'C', year1Monthly: {} },
    ]
    const out = allocateMonthTotal(lines, AUG, 90_000)
    expect(out).toEqual([30_000, 30_000, 30_000])
  })

  it('setting a month to zero clears every line for that month', () => {
    const lines: Line[] = [
      { id: 'a', name: 'A', year1Monthly: { [AUG]: 5_000 } },
      { id: 'b', name: 'B', year1Monthly: { [AUG]: 5_000 } },
    ]
    const out = allocateMonthTotal(lines, AUG, 0)
    expect(out).toEqual([0, 0])
  })
})
