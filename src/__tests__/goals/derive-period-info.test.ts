import { describe, it, expect } from 'vitest'
import { derivePeriodInfo } from '@/app/goals/utils/derive-period-info'

describe('derivePeriodInfo', () => {
  it('classifies a 12-month standard FY plan as not extended', () => {
    const result = derivePeriodInfo({
      planStartDate: new Date(2026, 6, 1), // 2026-07-01
      year1EndDate: new Date(2027, 5, 30), // 2027-06-30
      planEndDate: new Date(2029, 5, 30), // 2029-06-30
    })
    expect(result.isExtendedPeriod).toBe(false)
    expect(result.year1Months).toBe(12)
    expect(result.currentYearRemainingMonths).toBe(0)
  })

  it('classifies the Fit2Shine extended plan (Apr 2026 → Jun 2027) as extended', () => {
    // year1Months uses an INCLUSIVE month diff:
    // (2027-2026)*12 + (5-3) + 1 = 12 + 2 + 1 = 15
    // The plan note acknowledges this: helper returns 15 even though the
    // narrative description says "14 months". The CONTRACT is what matters.
    const result = derivePeriodInfo({
      planStartDate: new Date(2026, 3, 1), // 2026-04-01
      year1EndDate: new Date(2027, 5, 30), // 2027-06-30
      planEndDate: new Date(2029, 5, 30),
    })
    expect(result.isExtendedPeriod).toBe(true)
    expect(result.year1Months).toBe(15)
    // currentYearRemainingMonths = max(0, year1Months - 12) when extended
    expect(result.currentYearRemainingMonths).toBe(3)
  })

  it('keeps a standard FY (~365 days) as NOT extended (threshold is days > 366)', () => {
    // 2023-07-01 to 2024-06-30 spans a leap year (Feb 29 2024 is in range)
    // but is still ~365 calendar days inclusive — NOT > 366.
    const result = derivePeriodInfo({
      planStartDate: new Date(2023, 6, 1), // 2023-07-01
      year1EndDate: new Date(2024, 5, 30), // 2024-06-30
      planEndDate: new Date(2026, 5, 30),
    })
    expect(result.isExtendedPeriod).toBe(false)
  })

  it('classifies a May-start 14-month extended plan as extended', () => {
    // (2027-2026)*12 + (5-4) + 1 = 12 + 1 + 1 = 14
    const result = derivePeriodInfo({
      planStartDate: new Date(2026, 4, 1), // 2026-05-01
      year1EndDate: new Date(2027, 5, 30), // 2027-06-30
      planEndDate: new Date(2029, 5, 30),
    })
    expect(result.isExtendedPeriod).toBe(true)
    expect(result.year1Months).toBe(14)
    expect(result.currentYearRemainingMonths).toBe(2)
  })

  it('returns deterministic year1Months for the same month-pair across years', () => {
    const a = derivePeriodInfo({
      planStartDate: new Date(2025, 3, 1),
      year1EndDate: new Date(2026, 5, 30),
      planEndDate: new Date(2028, 5, 30),
    })
    const b = derivePeriodInfo({
      planStartDate: new Date(2030, 3, 1),
      year1EndDate: new Date(2031, 5, 30),
      planEndDate: new Date(2033, 5, 30),
    })
    expect(a.year1Months).toBe(b.year1Months)
    expect(a.isExtendedPeriod).toBe(b.isExtendedPeriod)
  })

  it('CY 12-month plan: Jan 1 to Dec 31 stays standard (year1Months=12)', () => {
    const result = derivePeriodInfo({
      planStartDate: new Date(2026, 0, 1), // 2026-01-01
      year1EndDate: new Date(2026, 11, 31), // 2026-12-31
      planEndDate: new Date(2028, 11, 31),
    })
    expect(result.isExtendedPeriod).toBe(false)
    expect(result.year1Months).toBe(12)
    expect(result.currentYearRemainingMonths).toBe(0)
  })

  it('CY 14-month extended plan (Nov 2026 to Dec 2027) is extended', () => {
    // (2027-2026)*12 + (11-10) + 1 = 12 + 1 + 1 = 14
    const result = derivePeriodInfo({
      planStartDate: new Date(2026, 10, 1), // 2026-11-01
      year1EndDate: new Date(2027, 11, 31), // 2027-12-31
      planEndDate: new Date(2029, 11, 31),
    })
    expect(result.isExtendedPeriod).toBe(true)
    expect(result.year1Months).toBe(14)
    expect(result.currentYearRemainingMonths).toBe(2)
  })
})
