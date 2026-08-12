/**
 * Step 3 stage two — pinned (locked) revenue lines.
 *
 * A pinned line holds its value; top-down monthly entry and annual-goal
 * redistribution both work AROUND it. "Management Services is $18k a month,
 * fit everything else around that."
 */
import { describe, it, expect } from 'vitest'

type Line = { id: string; name: string; isLocked?: boolean; year1Monthly: Record<string, number> }

/** Mirrors handleMonthTotalCommit's allocation (Step3RevenueCOGS.tsx). */
function allocateMonthTotal(lines: Line[], monthKey: string, newTotal: number): number[] {
  const current = lines.map(l => l.year1Monthly[monthKey] || 0)
  const locked = lines.map(l => l.isLocked === true)
  const lockedTotal = lines.reduce((s, l, i) => (locked[i] ? s + (l.year1Monthly[monthKey] || 0) : s), 0)
  const unlocked = lines.map((_, i) => i).filter(i => !locked[i])
  if (unlocked.length === 0) return current // nothing movable — grid untouched
  const remainder = Math.max(0, newTotal - lockedTotal)

  const unlockedMonthTotal = unlocked.reduce((s, i) => s + current[i], 0)
  let weights: number[]
  if (unlockedMonthTotal > 0) {
    weights = unlocked.map(i => current[i] / unlockedMonthTotal)
  } else {
    const yearTotals = unlocked.map(i => Object.values(lines[i].year1Monthly).reduce((a, b) => a + b, 0))
    const yearSum = yearTotals.reduce((a, b) => a + b, 0)
    weights = yearSum > 0 ? yearTotals.map(v => v / yearSum) : unlocked.map(() => 1 / unlocked.length)
  }

  let residuePos = 0
  weights.forEach((w, i) => { if (w > weights[residuePos]) residuePos = i })
  let running = 0
  const share: (number | null)[] = weights.map((w, i) => {
    if (i === residuePos) return null
    const v = Math.round(remainder * w)
    running += v
    return v
  })
  share[residuePos] = Math.max(0, Math.round(remainder - running))

  const out = [...current]
  unlocked.forEach((lineIdx, pos) => { out[lineIdx] = share[pos] as number })
  return out
}

const AUG = '2026-08'

describe('pinned revenue lines', () => {
  it('holds the pinned line and spreads the remainder across the others', () => {
    const lines: Line[] = [
      { id: 'a', name: 'Insurance', year1Monthly: { [AUG]: 600_000 } },
      { id: 'b', name: 'Tile Repairs', year1Monthly: { [AUG]: 200_000 } },
      { id: 'c', name: 'Management Services', isLocked: true, year1Monthly: { [AUG]: 18_000 } },
    ]
    const out = allocateMonthTotal(lines, AUG, 1_000_000)

    // Pinned line untouched.
    expect(out[2]).toBe(18_000)
    // Remainder ($982,000) split 75/25 by the unlocked lines' existing mix.
    expect(out[0]).toBe(736_500)
    expect(out[1]).toBe(245_500)
    // Column still sums to the typed figure exactly.
    expect(out.reduce((a, b) => a + b, 0)).toBe(1_000_000)
  })

  it('does nothing when EVERY line is pinned (rather than ignoring the locks)', () => {
    const lines: Line[] = [
      { id: 'a', name: 'A', isLocked: true, year1Monthly: { [AUG]: 5_000 } },
      { id: 'b', name: 'B', isLocked: true, year1Monthly: { [AUG]: 5_000 } },
    ]
    expect(allocateMonthTotal(lines, AUG, 999_999)).toEqual([5_000, 5_000])
  })

  it('a pinned line worth more than the typed total leaves the others at zero', () => {
    const lines: Line[] = [
      { id: 'a', name: 'Big pinned', isLocked: true, year1Monthly: { [AUG]: 50_000 } },
      { id: 'b', name: 'Other', year1Monthly: { [AUG]: 10_000 } },
    ]
    const out = allocateMonthTotal(lines, AUG, 30_000)
    expect(out[0]).toBe(50_000) // pin wins
    expect(out[1]).toBe(0)      // nothing left to allocate, never negative
  })

  it('falls back to the year mix for unlocked lines when the month is empty', () => {
    const lines: Line[] = [
      { id: 'a', name: 'Big', year1Monthly: { '2026-07': 900_000, [AUG]: 0 } },
      { id: 'b', name: 'Small', year1Monthly: { '2026-07': 100_000, [AUG]: 0 } },
      { id: 'c', name: 'Pinned', isLocked: true, year1Monthly: { '2026-07': 5_000, [AUG]: 20_000 } },
    ]
    const out = allocateMonthTotal(lines, AUG, 520_000)
    expect(out[2]).toBe(20_000)
    expect(out[0]).toBe(450_000)
    expect(out[1]).toBe(50_000)
    expect(out.reduce((a, b) => a + b, 0)).toBe(520_000)
  })
})
