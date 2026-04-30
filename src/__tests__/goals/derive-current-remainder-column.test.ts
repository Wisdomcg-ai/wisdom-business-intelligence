/**
 * Tests for deriveCurrentRemainderColumn — the date-driven visibility rule
 * for the annual plan's "Current FY remainder" pseudo-column.
 *
 * The column appears in Step 4 (annual plan) only during planning season,
 * bridging today through the end of the current FY when the user is planning
 * the NEXT fiscal year. Outside that window, returns null.
 */
import { describe, it, expect } from 'vitest'
import { deriveCurrentRemainderColumn } from '@/app/goals/utils/quarters'

const FY_START = 7 // Australian Financial Year (Jul 1 → Jun 30)
const CY_START = 1 // Calendar Year

describe('deriveCurrentRemainderColumn — AU FY (yearStart=7)', () => {
  // ── Planning season (last 3 months of current FY: Apr / May / Jun) ──

  it('Apr 30 2026 planning FY27: shows remainder Apr-Jun 2026', () => {
    // Today is 2 months from FY26 end (Jun 30 2026). Planning FY27 (= currentFY+1).
    // Both rules satisfied → column shown.
    const result = deriveCurrentRemainderColumn(new Date(2026, 3, 30), 2027, FY_START)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('current_remainder')
    expect(result!.title).toBe('Remaining 3mo') // Apr, May, Jun inclusive
    expect(result!.months).toBe('Apr-Jun 2026')
    expect(result!.startMonth).toBe(4)
    expect(result!.endMonth).toBe(6)
  })

  it('Jun 15 2026 planning FY27: shows remainder Jun 2026 (1 month)', () => {
    // Last month of FY26. Single-month label (no range).
    const result = deriveCurrentRemainderColumn(new Date(2026, 5, 15), 2027, FY_START)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Remaining 1mo')
    expect(result!.months).toBe('Jun 2026')
  })

  it('May 1 2026 planning FY27: shows remainder May-Jun 2026 (2 months)', () => {
    const result = deriveCurrentRemainderColumn(new Date(2026, 4, 1), 2027, FY_START)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Remaining 2mo')
    expect(result!.months).toBe('May-Jun 2026')
  })

  // ── Outside planning season ──

  it('Jul 1 2026 planning FY27: column DISAPPEARS — FY27 has begun', () => {
    // First day of FY27. currentFY is now 2027, planYear matches → not currentFY+1.
    const result = deriveCurrentRemainderColumn(new Date(2026, 6, 1), 2027, FY_START)
    expect(result).toBeNull()
  })

  it('Aug 15 2026 planning FY27: no remainder column (mid-FY27)', () => {
    const result = deriveCurrentRemainderColumn(new Date(2026, 7, 15), 2027, FY_START)
    expect(result).toBeNull()
  })

  it('Mar 31 2026 planning FY27: no remainder column (4 months from FY26 end — outside threshold)', () => {
    // March is more than 3 months from June. Outside planning season.
    const result = deriveCurrentRemainderColumn(new Date(2026, 2, 31), 2027, FY_START)
    expect(result).toBeNull()
  })

  it('Apr 1 2027 planning FY28: column REAPPEARS for the new planning season', () => {
    // The user-described annual cycle: column drops 1 Jul 2026, reappears Apr 2027.
    const result = deriveCurrentRemainderColumn(new Date(2027, 3, 1), 2028, FY_START)
    expect(result).not.toBeNull()
    expect(result!.months).toBe('Apr-Jun 2027')
  })

  // ── Wrong plan year (defensive) ──

  it('Apr 30 2026 planning FY26 (current FY): no remainder — already in FY26', () => {
    // planYear === currentFY (not currentFY + 1) → not "planning next year".
    const result = deriveCurrentRemainderColumn(new Date(2026, 3, 30), 2026, FY_START)
    expect(result).toBeNull()
  })

  it('Apr 30 2026 planning FY28 (two FYs ahead): no remainder — gap too large', () => {
    // planYear === currentFY + 2. Remainder of FY26 doesn't directly bridge to FY28.
    const result = deriveCurrentRemainderColumn(new Date(2026, 3, 30), 2028, FY_START)
    expect(result).toBeNull()
  })
})

describe('deriveCurrentRemainderColumn — Calendar Year (yearStart=1)', () => {
  it('Oct 15 2026 planning CY 2027: shows remainder Oct-Dec 2026', () => {
    // CY ends Dec 31. Oct is 2 months from end → planning season.
    const result = deriveCurrentRemainderColumn(new Date(2026, 9, 15), 2027, CY_START)
    expect(result).not.toBeNull()
    expect(result!.months).toBe('Oct-Dec 2026')
    expect(result!.title).toBe('Remaining 3mo')
  })

  it('Sep 30 2026 planning CY 2027: no remainder (4 months from CY end)', () => {
    const result = deriveCurrentRemainderColumn(new Date(2026, 8, 30), 2027, CY_START)
    expect(result).toBeNull()
  })

  it('Jan 1 2027 planning CY 2027: no remainder (now in CY 2027)', () => {
    const result = deriveCurrentRemainderColumn(new Date(2027, 0, 1), 2027, CY_START)
    expect(result).toBeNull()
  })
})

describe('deriveCurrentRemainderColumn — custom threshold', () => {
  it('respects a non-default threshold of 6 months', () => {
    // Jan 31 2026 is 5 months from Jun 30 2026. With threshold=3 → null. With threshold=6 → shows.
    expect(deriveCurrentRemainderColumn(new Date(2026, 0, 31), 2027, FY_START, 3)).toBeNull()
    const wider = deriveCurrentRemainderColumn(new Date(2026, 0, 31), 2027, FY_START, 6)
    expect(wider).not.toBeNull()
    expect(wider!.months).toBe('Jan-Jun 2026')
    expect(wider!.title).toBe('Remaining 6mo')
  })
})
