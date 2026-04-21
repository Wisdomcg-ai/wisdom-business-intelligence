import { describe, it, expect } from 'vitest'
import { crossRate, enumerateMonthDays, lastDayOfMonth } from './oxr'

describe('oxr: lastDayOfMonth', () => {
  it('returns 31 for March', () => {
    expect(lastDayOfMonth(2026, 3)).toBe('2026-03-31')
  })
  it('returns 29 for Feb in a leap year', () => {
    expect(lastDayOfMonth(2024, 2)).toBe('2024-02-29')
  })
  it('returns 28 for Feb in a non-leap year', () => {
    expect(lastDayOfMonth(2026, 2)).toBe('2026-02-28')
  })
  it('returns 30 for April', () => {
    expect(lastDayOfMonth(2026, 4)).toBe('2026-04-30')
  })
})

describe('oxr: enumerateMonthDays', () => {
  it('enumerates all 31 days of a past March', () => {
    const days = enumerateMonthDays(2024, 3)
    expect(days).toHaveLength(31)
    expect(days[0]).toBe('2024-03-01')
    expect(days[30]).toBe('2024-03-31')
  })

  it('caps to today for the current month', () => {
    // Use a date far in the future — function should return zero or cap.
    const days = enumerateMonthDays(2099, 12)
    expect(days).toHaveLength(0)
  })
})

describe('oxr: crossRate', () => {
  it('computes AUD per HKD from a USD snapshot', () => {
    // Realistic-ish: 1 USD = 7.80 HKD, 1 USD = 1.55 AUD
    // → AUD per HKD = 1.55 / 7.80 ≈ 0.1987
    const snap = {
      timestamp: 0,
      base: 'USD',
      rates: { HKD: 7.80, AUD: 1.55 },
    }
    const r = crossRate(snap, 'HKD', 'AUD')
    expect(r).toBeCloseTo(1.55 / 7.80, 6)
  })

  it('returns NaN when the base leg is missing', () => {
    const snap = { timestamp: 0, base: 'USD', rates: { AUD: 1.55 } }
    expect(Number.isNaN(crossRate(snap, 'HKD', 'AUD'))).toBe(true)
  })

  it('returns NaN for non-positive rates', () => {
    const snap = { timestamp: 0, base: 'USD', rates: { HKD: 0, AUD: 1.55 } }
    expect(Number.isNaN(crossRate(snap, 'HKD', 'AUD'))).toBe(true)
  })

  it('is inverse-consistent', () => {
    const snap = { timestamp: 0, base: 'USD', rates: { HKD: 7.80, AUD: 1.55 } }
    const ab = crossRate(snap, 'HKD', 'AUD')
    const ba = crossRate(snap, 'AUD', 'HKD')
    expect(ab * ba).toBeCloseTo(1, 6)
  })
})
