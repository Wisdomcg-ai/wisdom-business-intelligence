/**
 * Phase 73 v2 — the year-end gate decision used by the quarterly-review workshop at
 * the Part 3 → Part 4 transition. Must be timezone-safe (pass under AEST and UTC):
 *   TZ=Australia/Sydney npx vitest run src/__tests__/quarterly-review/annual-reset-gate.test.ts
 */
import { describe, it, expect } from 'vitest'
import { shouldRouteToAnnualReset } from '@/app/quarterly-review/utils/annual-reset-gate'

describe('shouldRouteToAnnualReset', () => {
  const Q1_FY27 = { quarter: 1, year: 2027 }

  it('FY26 client (year1_end 2026-06-30) entering Q1 FY27 → routes to reset', () => {
    expect(shouldRouteToAnnualReset('FY', new Date('2026-06-30'), Q1_FY27)).toBe(true)
  })

  it('Armstrong/Fit2Shine (year1_end 2027-06-29) → does NOT route (never reset)', () => {
    expect(shouldRouteToAnnualReset('FY', new Date('2027-06-29'), Q1_FY27)).toBe(false)
  })

  it('CY client (year1_end 2026-12-31) entering Q1 2027 → routes', () => {
    expect(shouldRouteToAnnualReset('CY', new Date('2026-12-31'), { quarter: 1, year: 2027 })).toBe(true)
  })

  it('still within plan year (mid-year quarter) → does NOT route', () => {
    expect(shouldRouteToAnnualReset('FY', new Date('2027-06-30'), { quarter: 2, year: 2027 })).toBe(false)
  })

  it('no plan dates (null) → does NOT route (initial-setup, not a reset)', () => {
    expect(shouldRouteToAnnualReset('FY', null, Q1_FY27)).toBe(false)
  })

  it('still loading (undefined) → does NOT route (no accidental reset mid-load)', () => {
    expect(shouldRouteToAnnualReset('FY', undefined, Q1_FY27)).toBe(false)
  })
})
