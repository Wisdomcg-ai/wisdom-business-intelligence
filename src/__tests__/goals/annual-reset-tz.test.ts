/**
 * Phase 73 hotfix regression — timezone-safe annual-reset detection.
 *
 * The bug: `calculateQuarters` builds quarter dates from LOCAL components
 * (`new Date(2026, 6, 1)` = local July 1). `detectAnnualResetState` compares
 * date-only with UTC getters, and `year1_end_date` is parsed UTC-midnight.
 * On a positive-offset machine (AEST = UTC+10) local July 1 is June 30 14:00 UTC,
 * so UTC getters read it back as June 30 — collapsing the FY-boundary
 * `planningQuarterStart (Jul 1) > year1_end (Jun 30)` check to equality →
 * `normal-review` → the reset NEVER fired for AU FY clients in the browser.
 *
 * `toUtcDateOnly` pins the quarter start to UTC-midnight of its LOCAL calendar
 * day, making the comparison correct in every timezone. This test exercises the
 * REAL production path and MUST pass under AEST as well as UTC
 * (run: `TZ=Australia/Sydney npx vitest run src/__tests__/goals/annual-reset-tz.test.ts`).
 */
import { describe, it, expect } from 'vitest'
import { calculateQuarters, toUtcDateOnly } from '@/app/goals/utils/quarters'
import { detectAnnualResetState } from '@/app/quarterly-review/utils/annual-reset-entry'

/** Mirror of the production call sites (goals hook + quarterly-review landing). */
function detectViaProductionPath(
  yearType: 'FY' | 'CY',
  planYear: number,
  quarter: number,
  year1EndDate: Date | null,
) {
  const localStart = calculateQuarters(yearType, planYear).find((q) => q.id === `q${quarter}`)?.startDate ?? null
  const planningQuarterStart = localStart ? toUtcDateOnly(localStart) : null
  return planningQuarterStart ? detectAnnualResetState({ planningQuarterStart, year1EndDate }) : 'no-start'
}

describe('toUtcDateOnly', () => {
  it('pins a LOCAL-built date to UTC-midnight of the same calendar day', () => {
    const utc = toUtcDateOnly(new Date(2026, 6, 1)) // local July 1
    expect(utc.getUTCFullYear()).toBe(2026)
    expect(utc.getUTCMonth()).toBe(6) // July
    expect(utc.getUTCDate()).toBe(1) // <-- the bug made this read as 30 in AEST
  })
})

describe('annual-reset detection via the real production path (TZ-safe)', () => {
  it('FY26 client (year1_end 2026-06-30, planning Q1 FY27) → needs-reset', () => {
    expect(detectViaProductionPath('FY', 2027, 1, new Date('2026-06-30'))).toBe('needs-reset')
  })

  it('Armstrong/Fit2Shine (year1_end 2027-06-29, planning Q1 FY27) → normal-review (never reset)', () => {
    expect(detectViaProductionPath('FY', 2027, 1, new Date('2027-06-29'))).toBe('normal-review')
  })

  it('CY client (year1_end 2026-12-31, planning Q1 2027) → needs-reset', () => {
    expect(detectViaProductionPath('CY', 2027, 1, new Date('2026-12-31'))).toBe('needs-reset')
  })

  it('still within plan year (mid-year quarter) → normal-review', () => {
    expect(detectViaProductionPath('FY', 2027, 2, new Date('2027-06-30'))).toBe('normal-review')
  })

  it('no plan dates → initial-setup', () => {
    expect(detectViaProductionPath('FY', 2027, 1, null)).toBe('initial-setup')
  })
})
