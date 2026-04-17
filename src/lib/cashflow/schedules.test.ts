import { describe, it, expect } from 'vitest'
import {
  SYSTEM_SCHEDULES,
  getPaymentMonth,
  isPaymentMonth,
  resolveSystemSchedule,
  isValidBasePeriods,
} from './schedules'
import { daysToDistribution, isValidDistribution } from './distributions'

// ─── daysToDistribution ─────────────────────────────────────────────────

describe('daysToDistribution', () => {
  it('returns [100, 0, ...] for 0 days', () => {
    const d = daysToDistribution(0)
    expect(d[0]).toBe(100)
    expect(d.slice(1).every(v => v === 0)).toBe(true)
    expect(d.length).toBe(12)
  })

  it('returns [100, 0, ...] for negative days (guard)', () => {
    const d = daysToDistribution(-5)
    expect(d[0]).toBe(100)
  })

  it('30 days → [0, 100, 0, ...]  (bucket 1, zero fraction)', () => {
    const d = daysToDistribution(30)
    expect(d[0]).toBe(0)
    expect(d[1]).toBe(100)
    expect(d[2]).toBe(0)
  })

  it('45 days → [0, 50, 50, 0, ...]  (bucket 1, fraction 0.5)', () => {
    const d = daysToDistribution(45)
    expect(d[0]).toBe(0)
    expect(d[1]).toBe(50)
    expect(d[2]).toBe(50)
  })

  it('60 days → [0, 0, 100, 0, ...]  (bucket 2, zero fraction)', () => {
    const d = daysToDistribution(60)
    expect(d[0]).toBe(0)
    expect(d[1]).toBe(0)
    expect(d[2]).toBe(100)
  })

  it('15 days → [50, 50, 0, ...]  (bucket 0, fraction 0.5)', () => {
    const d = daysToDistribution(15)
    expect(d[0]).toBe(50)
    expect(d[1]).toBe(50)
  })

  it('always sums to 100 for many input values', () => {
    for (const days of [0, 5, 10, 15, 20, 29, 30, 31, 45, 60, 75, 90, 120, 150]) {
      const d = daysToDistribution(days)
      const sum = d.reduce((a, b) => a + b, 0)
      expect(sum).toBe(100)
    }
  })

  it('handles very large day values without overflow', () => {
    const d = daysToDistribution(400)
    const sum = d.reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
  })
})

describe('isValidDistribution', () => {
  it('accepts a valid distribution', () => {
    expect(isValidDistribution([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(true)
    expect(isValidDistribution([50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(true)
  })

  it('rejects wrong length', () => {
    expect(isValidDistribution([100, 0])).toBe(false)
    expect(isValidDistribution(Array(13).fill(0))).toBe(false)
  })

  it('rejects sum != 100', () => {
    expect(isValidDistribution([50, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(false)
  })

  it('rejects negative values', () => {
    expect(isValidDistribution([110, -10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(false)
  })

  it('rejects non-array input', () => {
    expect(isValidDistribution(null as any)).toBe(false)
    expect(isValidDistribution({} as any)).toBe(false)
  })
})

// ─── schedules ──────────────────────────────────────────────────────────

describe('SYSTEM_SCHEDULES', () => {
  it('contains all 6 AU standard schedules', () => {
    expect(SYSTEM_SCHEDULES.monthly).toBeDefined()
    expect(SYSTEM_SCHEDULES.quarterly_bas_au).toBeDefined()
    expect(SYSTEM_SCHEDULES.quarterly_super_au).toBeDefined()
    expect(SYSTEM_SCHEDULES.quarterly_payg_instalment).toBeDefined()
    expect(SYSTEM_SCHEDULES.quarterly_feb_may_aug_nov).toBeDefined()
    expect(SYSTEM_SCHEDULES.annual_aug).toBeDefined()
  })

  it('all schedules are valid BasePeriods arrays', () => {
    for (const [, arr] of Object.entries(SYSTEM_SCHEDULES)) {
      expect(isValidBasePeriods(arr)).toBe(true)
    }
  })

  it('quarterly_bas_au pays Q1 (Jan-Mar) in Apr', () => {
    const s = SYSTEM_SCHEDULES.quarterly_bas_au
    // Indices 0-2 = Jan, Feb, Mar accruals → should all pay in month 4 (April)
    expect(s[0]).toBe(4)
    expect(s[1]).toBe(4)
    expect(s[2]).toBe(4)
  })

  it('quarterly_bas_au pays Q4 (Oct-Dec) in Feb of following year', () => {
    const s = SYSTEM_SCHEDULES.quarterly_bas_au
    expect(s[9]).toBe(2)   // Oct → Feb
    expect(s[10]).toBe(2)  // Nov → Feb
    expect(s[11]).toBe(2)  // Dec → Feb
  })

  it('monthly schedule pays each accrual month in same month', () => {
    const s = SYSTEM_SCHEDULES.monthly
    for (let i = 0; i < 12; i++) {
      expect(s[i]).toBe(i + 1)
    }
  })

  it('annual_aug pays all accruals in August', () => {
    const s = SYSTEM_SCHEDULES.annual_aug
    expect(s.every(v => v === 8)).toBe(true)
  })
})

describe('getPaymentMonth', () => {
  it('returns the correct payment month for an accrual month', () => {
    const s = SYSTEM_SCHEDULES.quarterly_bas_au
    expect(getPaymentMonth(1, s)).toBe(4)
    expect(getPaymentMonth(6, s)).toBe(7)
    expect(getPaymentMonth(11, s)).toBe(2)
  })

  it('throws for invalid accrual month', () => {
    expect(() => getPaymentMonth(0, SYSTEM_SCHEDULES.monthly)).toThrow()
    expect(() => getPaymentMonth(13, SYSTEM_SCHEDULES.monthly)).toThrow()
  })
})

describe('isPaymentMonth', () => {
  it('returns true when schedule pays in that month', () => {
    const s = SYSTEM_SCHEDULES.quarterly_bas_au
    expect(isPaymentMonth(4, s)).toBe(true)   // April is a BAS month
    expect(isPaymentMonth(7, s)).toBe(true)   // July
    expect(isPaymentMonth(10, s)).toBe(true)  // October
    expect(isPaymentMonth(2, s)).toBe(true)   // February
  })

  it('returns false for non-payment months', () => {
    const s = SYSTEM_SCHEDULES.quarterly_bas_au
    expect(isPaymentMonth(1, s)).toBe(false)  // Jan — no BAS payment
    expect(isPaymentMonth(5, s)).toBe(false)  // May
  })
})

describe('resolveSystemSchedule', () => {
  it('returns the BasePeriods for a known name', () => {
    expect(resolveSystemSchedule('monthly')).toEqual(SYSTEM_SCHEDULES.monthly)
  })

  it('returns null for an unknown name', () => {
    expect(resolveSystemSchedule('nonexistent')).toBeNull()
  })
})

describe('isValidBasePeriods', () => {
  it('validates a correct BasePeriods array', () => {
    expect(isValidBasePeriods(SYSTEM_SCHEDULES.monthly)).toBe(true)
  })

  it('rejects wrong length', () => {
    expect(isValidBasePeriods([1, 2, 3])).toBe(false)
  })

  it('rejects out-of-range values', () => {
    expect(isValidBasePeriods([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toBe(false)
    expect(isValidBasePeriods([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13])).toBe(false)
  })

  it('rejects non-integer values', () => {
    expect(isValidBasePeriods([1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe(false)
  })
})
