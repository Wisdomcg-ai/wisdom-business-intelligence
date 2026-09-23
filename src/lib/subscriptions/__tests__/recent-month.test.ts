import { describe, it, expect } from 'vitest'
import { lastChargedMonthTotal } from '../recent-month'

const tx = (date: string, amount: number) => ({ date, amount })

describe('lastChargedMonthTotal', () => {
  it('takes the latest month that has a charge', () => {
    // Anthropic: $390 in July, $599 in August. The average is $494 and the
    // answer is $599 — August is what next month will look like.
    expect(lastChargedMonthTotal([
      tx('2026-07-14', 390), tx('2026-08-14', 599),
    ])).toBe(599)
  })

  it('sums several charges landing in the same month', () => {
    expect(lastChargedMonthTotal([
      tx('2026-08-03', 200), tx('2026-08-28', 253),
    ])).toBe(453)
  })

  it('ignores a later month with nothing in it', () => {
    // A vendor billing on the 28th, an extract cut on the 3rd.
    expect(lastChargedMonthTotal([tx('2026-08-28', 1445)])).toBe(1445)
  })

  it('skips back past a month that nets to zero', () => {
    // A charge and its credit note say nothing about the price.
    expect(lastChargedMonthTotal([
      tx('2026-07-14', 1256), tx('2026-08-14', 1256), tx('2026-08-20', -1256),
    ])).toBe(1256)
  })

  it('keeps a genuinely negative month rather than pretending it is zero', () => {
    expect(lastChargedMonthTotal([tx('2026-08-20', -500)])).toBe(-500)
  })

  it('returns null when there is nothing to go on', () => {
    expect(lastChargedMonthTotal([])).toBeNull()
    expect(lastChargedMonthTotal(null)).toBeNull()
    expect(lastChargedMonthTotal(undefined)).toBeNull()
    expect(lastChargedMonthTotal([{ date: null, amount: 100 }])).toBeNull()
  })

  it('tolerates a date format other than ISO', () => {
    expect(lastChargedMonthTotal([
      tx('2026-07-14', 100), { date: 'August 14, 2026', amount: 250 },
    ])).toBe(250)
  })

  it('ignores an unparseable date rather than throwing', () => {
    expect(lastChargedMonthTotal([
      { date: 'n/a', amount: 999 }, tx('2026-08-01', 50),
    ])).toBe(50)
  })
})
