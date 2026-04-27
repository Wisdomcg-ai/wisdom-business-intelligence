import { describe, it, expect } from 'vitest'
import { suggestPlanPeriod } from '@/app/goals/utils/suggest-plan-period'

// Local-TZ safe formatter — avoids UTC drift on test runners that run in non-UTC.
// `new Date(2026, 3, 15)` constructs LOCAL April 15. We compare the LOCAL fields,
// not toISOString() (which can roll the date back to 2026-04-14 in negative offsets).
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('suggestPlanPeriod', () => {
  describe('FY (yearStartMonth=7)', () => {
    it('returns extended period when within 3 months of FY end (Fit2Shine repro: Apr 15)', () => {
      // FY end is June 30, 2026. April 15 is 2 months before FY end.
      const today = new Date(2026, 3, 15) // 2026-04-15 local
      const result = suggestPlanPeriod(today, 7)

      expect(fmt(result.planStartDate)).toBe('2026-04-01')
      expect(fmt(result.year1EndDate)).toBe('2027-06-30')
      expect(result.year1Months).toBe(14) // monthsLeft (2) + 12
      expect(fmt(result.planEndDate)).toBe('2029-06-30')
      expect(result.rationale).toContain('within')
    })

    it('returns standard 12-month period in mid-FY (September)', () => {
      // September 15 is 9 months before FY end — not near year end.
      const today = new Date(2026, 8, 15) // 2026-09-15
      const result = suggestPlanPeriod(today, 7)

      expect(fmt(result.planStartDate)).toBe('2026-07-01')
      expect(fmt(result.year1EndDate)).toBe('2027-06-30')
      expect(result.year1Months).toBe(12)
      expect(fmt(result.planEndDate)).toBe('2029-06-30')
      expect(result.rationale).toContain('current fiscal year')
    })

    it('handles last day of FY (monthsLeft=0) — extended branch with year1Months=12', () => {
      const today = new Date(2026, 5, 30) // 2026-06-30 (last day of FY2026)
      const result = suggestPlanPeriod(today, 7)
      expect(result.year1Months).toBe(12) // 0 monthsLeft + 12
      expect(fmt(result.planStartDate)).toBe('2026-06-01')
      expect(fmt(result.year1EndDate)).toBe('2027-06-30')
    })

    it('returns 15-month maximum when 3 months before FY end', () => {
      // March 15 → 3 months until June 30 → year1Months = 3 + 12 = 15
      const today = new Date(2026, 2, 15) // 2026-03-15
      const result = suggestPlanPeriod(today, 7)
      expect(result.year1Months).toBe(15)
      expect(fmt(result.planStartDate)).toBe('2026-03-01')
    })
  })

  describe('CY (yearStartMonth=1)', () => {
    it('returns extended period when within 3 months of CY end (Oct 15)', () => {
      // Oct 15 → CY end Dec 31 → monthsLeft = 2 → year1Months = 14
      const today = new Date(2026, 9, 15) // 2026-10-15
      const result = suggestPlanPeriod(today, 1)

      expect(fmt(result.planStartDate)).toBe('2026-10-01')
      expect(fmt(result.year1EndDate)).toBe('2027-12-31')
      expect(result.year1Months).toBe(14) // 2 monthsLeft + 12
      expect(fmt(result.planEndDate)).toBe('2029-12-31')
    })

    it('returns standard 12-month period in mid-CY', () => {
      const today = new Date(2026, 2, 15) // 2026-03-15
      const result = suggestPlanPeriod(today, 1)

      expect(fmt(result.planStartDate)).toBe('2026-01-01')
      expect(fmt(result.year1EndDate)).toBe('2026-12-31')
      expect(result.year1Months).toBe(12)
      expect(fmt(result.planEndDate)).toBe('2028-12-31')
    })

    it('returns extended period when 1 month before CY end (year1Months=13)', () => {
      // Nov 15 → Dec end → monthsLeft = 1 → year1Months = 13
      const today = new Date(2026, 10, 15) // 2026-11-15
      const result = suggestPlanPeriod(today, 1)
      expect(result.year1Months).toBe(13)
      expect(fmt(result.planStartDate)).toBe('2026-11-01')
    })
  })

  describe('rationale strings', () => {
    it('extended branch rationale references "month" plural correctly', () => {
      const today = new Date(2026, 3, 15) // 2 months left
      const result = suggestPlanPeriod(today, 7)
      expect(result.rationale).toContain('2 months')
    })

    it('extended branch rationale singular form for monthsLeft=1', () => {
      const today = new Date(2026, 4, 15) // 2026-05-15 — 1 month until June 30
      const result = suggestPlanPeriod(today, 7)
      expect(result.rationale).toMatch(/within 1 month\b/)
    })

    it('standard branch rationale is non-empty', () => {
      const today = new Date(2026, 8, 15)
      const result = suggestPlanPeriod(today, 7)
      expect(result.rationale.length).toBeGreaterThan(0)
    })
  })
})
