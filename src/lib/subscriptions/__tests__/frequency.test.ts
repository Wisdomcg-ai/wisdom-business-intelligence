import { describe, it, expect } from 'vitest'
import {
  FREQUENCY_OPTIONS, monthsPerPeriod, monthlyFromPeriod,
  periodFromMonthly, periodSuffix, isLumpy,
} from '../frequency'

describe('frequency', () => {
  it('offers every rhythm a vendor actually bills on', () => {
    expect(FREQUENCY_OPTIONS.map(o => o.value))
      .toEqual(['monthly', 'quarterly', 'bi-annual', 'annual', 'ad-hoc'])
  })

  it('says "every 6 months" rather than leaving "bi-annual" to be guessed', () => {
    // The word can mean twice a year or every two years. The label settles it.
    expect(FREQUENCY_OPTIONS.find(o => o.value === 'bi-annual')!.label)
      .toBe('Every 6 months')
  })

  it('converts a period amount to the monthly figure the P&L carries', () => {
    expect(monthlyFromPeriod(1200, 'annual')).toBe(100)
    expect(monthlyFromPeriod(1200, 'bi-annual')).toBe(200)
    expect(monthlyFromPeriod(1200, 'quarterly')).toBe(400)
    expect(monthlyFromPeriod(1200, 'monthly')).toBe(1200)
    expect(monthlyFromPeriod(1200, 'ad-hoc')).toBe(1200)
  })

  it('converts back to what the operator sees on the invoice', () => {
    expect(periodFromMonthly(200, 'bi-annual')).toBe(1200)
    expect(periodFromMonthly(100, 'annual')).toBe(1200)
  })

  it('round-trips', () => {
    for (const f of ['monthly', 'quarterly', 'bi-annual', 'annual', 'ad-hoc'] as const) {
      expect(periodFromMonthly(monthlyFromPeriod(6000, f), f)).toBeCloseTo(6000, 6)
    }
  })

  it('labels the unit', () => {
    expect(periodSuffix('bi-annual')).toBe('/6mo')
    expect(periodSuffix('annual')).toBe('/yr')
    expect(periodSuffix('quarterly')).toBe('/qtr')
    expect(periodSuffix('monthly')).toBe('/mo')
  })

  it('treats six-monthly as lumpy, like annual', () => {
    // A $14,000 charge landing in one month is a cashflow fact that a
    // smoothed $1,167 hides — so it gets a renewal month too.
    expect(isLumpy('bi-annual')).toBe(true)
    expect(isLumpy('annual')).toBe(true)
    expect(isLumpy('quarterly')).toBe(false)
    expect(isLumpy('monthly')).toBe(false)
  })

  it('falls back to monthly for an unknown or missing rhythm', () => {
    expect(monthsPerPeriod(null)).toBe(1)
    expect(monthsPerPeriod(undefined)).toBe(1)
    expect(monthsPerPeriod('weekly' as never)).toBe(1)
  })
})

// ── the renewal rule, which the leakage report reads ───────────────────────
import { expectedMonthlyBudget } from '../variance'

describe('expectedMonthlyBudget for a six-monthly vendor', () => {
  const row = (frequency: 'annual' | 'bi-annual', renewal: number) => ({
    vendor_key: 'v', vendor_name: 'V', monthly_budget: 1000,
    frequency, renewal_month: renewal,
  })

  it('charges an annual vendor only in its renewal month', () => {
    expect(expectedMonthlyBudget(row('annual', 3), '2026-03')).toBe(12000)
    expect(expectedMonthlyBudget(row('annual', 3), '2026-09')).toBe(0)
  })

  it('charges a six-monthly vendor TWICE a year, six months apart', () => {
    expect(expectedMonthlyBudget(row('bi-annual', 3), '2026-03')).toBe(6000)
    expect(expectedMonthlyBudget(row('bi-annual', 3), '2026-09')).toBe(6000)
    expect(expectedMonthlyBudget(row('bi-annual', 3), '2026-06')).toBe(0)
  })

  it('wraps across the year end', () => {
    // Renews in November; the other renewal is May.
    expect(expectedMonthlyBudget(row('bi-annual', 11), '2026-05')).toBe(6000)
    expect(expectedMonthlyBudget(row('bi-annual', 11), '2026-11')).toBe(6000)
    expect(expectedMonthlyBudget(row('bi-annual', 11), '2026-02')).toBe(0)
  })

  it('falls back to the smoothed figure when no renewal month is known', () => {
    expect(expectedMonthlyBudget(
      { vendor_key: 'v', vendor_name: 'V', monthly_budget: 1000, frequency: 'bi-annual', renewal_month: null },
      '2026-03',
    )).toBe(1000)
  })
})
