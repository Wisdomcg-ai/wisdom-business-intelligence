/**
 * budgeted-line.ts — the single projection behind the "As budgeted" OpEx
 * behaviour. Pinned here because both the wizard summary and the materialiser
 * call it; if this drifts, the screen and the stored P&L drift together, and
 * summary-parity is the only thing left to notice.
 */
import { describe, it, expect } from 'vitest'
import {
  shiftMonthKey,
  projectBudgetedMonths,
  budgetedTotal,
  scaleBudgetedMonths,
  spreadTotalByPattern,
} from '@/lib/forecast/budgeted-line'

const FY27 = ['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06']
const FY28 = FY27.map((k) => shiftMonthKey(k, 12))
const FY29 = FY27.map((k) => shiftMonthKey(k, 24))

function months(keys: string[], values: number[]): Record<string, number> {
  const out: Record<string, number> = {}
  keys.forEach((k, i) => { out[k] = values[i] })
  return out
}

describe('shiftMonthKey', () => {
  it('moves across year boundaries in both directions', () => {
    expect(shiftMonthKey('2026-07', 12)).toBe('2027-07')
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
    expect(shiftMonthKey('2027-03', -24)).toBe('2025-03')
  })
  it('passes non-month-keys through untouched', () => {
    expect(shiftMonthKey('total', 12)).toBe('total')
  })
})

describe('projectBudgetedMonths', () => {
  const y1 = months(FY27, [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200])

  it('uses explicit budgeted values verbatim (rounded to cents)', () => {
    const out = projectBudgetedMonths({ budgetedMonthly: { ...y1, '2026-07': 100.005 } }, FY27, 3)
    expect(out['2026-07']).toBe(100.01)
    expect(out['2027-06']).toBe(1200)
  })

  it('rolls a 12-month budget into Y2/Y3 by calendar month with compounding growth', () => {
    const out2 = projectBudgetedMonths({ budgetedMonthly: y1 }, FY28, 10)
    expect(out2['2027-07']).toBe(110)      // 100 × 1.10
    expect(out2['2028-06']).toBe(1320)     // 1200 × 1.10
    const out3 = projectBudgetedMonths({ budgetedMonthly: y1 }, FY29, 10)
    expect(out3['2028-07']).toBe(121)      // 100 × 1.10²
  })

  it('prefers an explicit later-year value over the rolled-forward one', () => {
    const budget = { ...y1, '2027-07': 999 }
    const out = projectBudgetedMonths({ budgetedMonthly: budget }, FY28, 10)
    expect(out['2027-07']).toBe(999)
    expect(out['2027-08']).toBe(220)
  })

  it('rolls forward from the MOST RECENT earlier year that has the month', () => {
    // Y1 and Y2 both budgeted; Y3 should grow from Y2, one year of growth.
    const budget = { ...y1, ...months(FY28, Array(12).fill(50)) }
    const out = projectBudgetedMonths({ budgetedMonthly: budget }, FY29, 10)
    expect(out['2028-07']).toBe(55)
  })

  it('never guesses: a month with no value and no earlier-year value is 0', () => {
    const partial = months(FY27.slice(0, 6), [1, 2, 3, 4, 5, 6]) // Jul–Dec only
    const out = projectBudgetedMonths({ budgetedMonthly: partial }, FY27, 3)
    expect(out['2026-12']).toBe(6)
    expect(out['2027-01']).toBe(0)
    expect(out['2027-06']).toBe(0)
  })

  it('treats a missing/empty budget as all zeros and ignores non-finite values', () => {
    expect(projectBudgetedMonths({}, FY27, 3)['2026-07']).toBe(0)
    expect(projectBudgetedMonths({ budgetedMonthly: null }, FY27, 3)['2026-07']).toBe(0)
    expect(projectBudgetedMonths({ budgetedMonthly: { '2026-07': NaN } }, FY27, 3)['2026-07']).toBe(0)
    // growth NaN → no growth, not NaN output
    expect(projectBudgetedMonths({ budgetedMonthly: y1 }, FY28, NaN)['2027-07']).toBe(100)
  })
})

describe('budgetedTotal', () => {
  it('is the sum of the projection for the given year', () => {
    const y1 = months(FY27, Array(12).fill(1000))
    expect(budgetedTotal({ budgetedMonthly: y1 }, FY27, 3)).toBe(12_000)
    expect(budgetedTotal({ budgetedMonthly: y1 }, FY28, 10)).toBe(13_200)
  })
})

describe('scaleBudgetedMonths', () => {
  it('keeps the monthly shape and hits the new total exactly, residue in the last month', () => {
    const shape = months(FY27, [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2]) // sums to 18
    const out = scaleBudgetedMonths(shape, FY27, 1000)
    const sum = FY27.reduce((s, k) => s + out[k], 0)
    expect(Math.round(sum * 100) / 100).toBe(1000)
    expect(out['2026-07']).toBeCloseTo(1000 / 18, 2)
    expect(out['2027-01']).toBeCloseTo(2000 / 18, 2)
  })
  it('spreads flat when the current months sum to zero, and leaves other years untouched', () => {
    const budget = { ...months(FY27, Array(12).fill(0)), '2027-07': 777 }
    const out = scaleBudgetedMonths(budget, FY27, 1200)
    expect(out['2026-07']).toBe(100)
    expect(out['2027-06']).toBe(100)
    expect(out['2027-07']).toBe(777)
  })
  it('handles an empty starting budget', () => {
    const out = scaleBudgetedMonths(undefined, FY27, 120)
    expect(out['2026-08']).toBe(10)
  })
})

describe('spreadTotalByPattern', () => {
  it('follows a prior-year pattern by calendar month', () => {
    // Prior FY (2025-07..2026-06): all 1s except December = 13 → weights 1..1,13,1..
    const prior = months(FY27.map((k) => shiftMonthKey(k, -12)), [1, 1, 1, 1, 1, 13, 1, 1, 1, 1, 1, 1])
    const out = spreadTotalByPattern(2400, FY27, prior)
    expect(out['2026-12']).toBe(1300)    // 13/24 of 2400
    expect(out['2026-07']).toBe(100)
    expect(FY27.reduce((s, k) => s + out[k], 0)).toBe(2400)
  })
  it('falls back to flat when the pattern is empty or all zero', () => {
    expect(spreadTotalByPattern(1200, FY27, undefined)['2026-07']).toBe(100)
    expect(spreadTotalByPattern(1200, FY27, months(FY27, Array(12).fill(0)))['2027-06']).toBe(100)
  })
})
