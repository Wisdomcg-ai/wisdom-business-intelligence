/**
 * Editing a line's % must NOT move the monthly totals the operator typed.
 *
 * Reported 13 Aug: "when I put the total revenue goals in and then try and
 * adjust the percentages it overrides the total income." Cause: the % editor
 * re-derived the line from the ANNUAL goal and re-spread it by seasonality,
 * so every month's total changed. Once the operator owns the monthly shape
 * (pattern 'manual'), a % edit re-splits WITHIN each month instead.
 */
import { describe, it, expect } from 'vitest'

type Line = { id: string; name: string; isLocked?: boolean; year1Monthly: Record<string, number> }

/** Mirrors redistributeMixWithinMonths (Step3RevenueCOGS.tsx). */
function mixWithinMonths(
  lines: Line[],
  lineId: string,
  newPct: number,
  months: string[],
  actualMonths: Set<string> = new Set(),
): Line[] {
  const next: Record<string, Record<string, number>> = {}
  for (const l of lines) next[l.id] = { ...l.year1Monthly }

  for (const mk of months) {
    if (actualMonths.has(mk)) continue
    const monthTotal = lines.reduce((s, l) => s + (l.year1Monthly[mk] || 0), 0)
    if (monthTotal <= 0) continue

    const others = lines.filter(l => l.id !== lineId && l.isLocked !== true)
    const lockedOthersTotal = lines
      .filter(l => l.id !== lineId && l.isLocked === true)
      .reduce((s, l) => s + (l.year1Monthly[mk] || 0), 0)
    if (others.length === 0) continue

    const desired = Math.round(monthTotal * (newPct / 100))
    const editedValue = Math.max(0, Math.min(desired, monthTotal - lockedOthersTotal))
    const remainder = Math.max(0, monthTotal - lockedOthersTotal - editedValue)

    const othersTotal = others.reduce((s, l) => s + (l.year1Monthly[mk] || 0), 0)
    const weights = othersTotal > 0
      ? others.map(l => (l.year1Monthly[mk] || 0) / othersTotal)
      : others.map(() => 1 / others.length)

    let residuePos = 0
    weights.forEach((w, i) => { if (w > weights[residuePos]) residuePos = i })
    let running = 0
    others.forEach((l, i) => {
      if (i === residuePos) return
      const v = Math.round(remainder * weights[i])
      next[l.id][mk] = v
      running += v
    })
    next[others[residuePos].id][mk] = Math.max(0, remainder - running)
    next[lineId][mk] = editedValue
  }

  return lines.map(l => ({ ...l, year1Monthly: next[l.id] }))
}

const AUG = '2026-08'
const SEP = '2026-09'
const MONTHS = [AUG, SEP]

const monthTotal = (lines: Line[], mk: string) =>
  lines.reduce((s, l) => s + (l.year1Monthly[mk] || 0), 0)

describe('% edit preserves typed monthly totals', () => {
  const base = (): Line[] => [
    { id: 'a', name: 'Insurance', year1Monthly: { [AUG]: 800_000, [SEP]: 960_000 } },
    { id: 'b', name: 'Tile Repairs', year1Monthly: { [AUG]: 150_000, [SEP]: 180_000 } },
    { id: 'c', name: 'Metal', year1Monthly: { [AUG]: 50_000, [SEP]: 60_000 } },
  ]

  it('holds each month total exactly while changing the line share', () => {
    const before = base()
    expect(monthTotal(before, AUG)).toBe(1_000_000)
    expect(monthTotal(before, SEP)).toBe(1_200_000)

    const after = mixWithinMonths(before, 'a', 60, MONTHS)

    // The operator's typed monthly totals are untouched — the bug.
    expect(monthTotal(after, AUG)).toBe(1_000_000)
    expect(monthTotal(after, SEP)).toBe(1_200_000)

    // And the edited line really is 60% of each month now.
    expect(after[0].year1Monthly[AUG]).toBe(600_000)
    expect(after[0].year1Monthly[SEP]).toBe(720_000)
  })

  it('the other lines absorb the change in proportion to each other', () => {
    const after = mixWithinMonths(base(), 'a', 60, MONTHS)
    // August: $400k left for B and C, previously 150k:50k → 3:1.
    expect(after[1].year1Monthly[AUG]).toBe(300_000)
    expect(after[2].year1Monthly[AUG]).toBe(100_000)
  })

  it('a pinned line is not touched and still counts against the month total', () => {
    const lines = base()
    lines[2].isLocked = true // Metal pinned at 50k / 60k
    const after = mixWithinMonths(lines, 'a', 50, MONTHS)

    expect(after[2].year1Monthly[AUG]).toBe(50_000) // pin held
    expect(monthTotal(after, AUG)).toBe(1_000_000)  // total held
    expect(after[0].year1Monthly[AUG]).toBe(500_000)
    expect(after[1].year1Monthly[AUG]).toBe(450_000) // absorbs the rest
  })

  it('locked ACTUAL months are never redistributed', () => {
    const after = mixWithinMonths(base(), 'a', 10, MONTHS, new Set([AUG]))
    // August untouched despite the % change.
    expect(after[0].year1Monthly[AUG]).toBe(800_000)
    // September re-split.
    expect(after[0].year1Monthly[SEP]).toBe(120_000)
    expect(monthTotal(after, SEP)).toBe(1_200_000)
  })

  it('a % above what the pins leave is clamped, never negative', () => {
    const lines = base()
    lines[1].isLocked = true // 150k pinned in Aug
    lines[2].isLocked = true // 50k pinned in Aug
    const after = mixWithinMonths(lines, 'a', 100, MONTHS)
    // Only $800k is available to the edited line in August.
    expect(after[0].year1Monthly[AUG]).toBe(800_000)
    expect(monthTotal(after, AUG)).toBe(1_000_000)
  })
})
