/**
 * The Full Year page's actual/forecast boundary must come from the REPORT's
 * month, not from today. Re-exporting August in October would otherwise promote
 * September and October to actuals — restating a month the client had already
 * been sent, and moving the Projected Total with it.
 *
 * The route computes the boundary inline, so this pins the rule itself against
 * the same inputs the route uses.
 */
import { describe, it, expect } from 'vitest'

/** The rule as the route applies it. */
function lastActualMonth(reportMonth: string | undefined, fyEnd: string, now: Date): string {
  if (typeof reportMonth === 'string' && /^\d{4}-\d{2}$/.test(reportMonth)) {
    return reportMonth <= fyEnd ? reportMonth : fyEnd
  }
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth()
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const previousMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
  return previousMonth <= fyEnd ? previousMonth : fyEnd
}

const FY27_END = '2027-06'

describe('the actual/forecast boundary', () => {
  it('is the report month, whatever the date of the export', () => {
    // Urban Road's August pack, exported in September and again in October.
    expect(lastActualMonth('2026-08', FY27_END, new Date('2026-09-11'))).toBe('2026-08')
    expect(lastActualMonth('2026-08', FY27_END, new Date('2026-10-31'))).toBe('2026-08')
    expect(lastActualMonth('2026-08', FY27_END, new Date('2027-03-01'))).toBe('2026-08')
  })

  it('never runs past the end of the fiscal year', () => {
    expect(lastActualMonth('2027-11', FY27_END, new Date('2027-12-01'))).toBe(FY27_END)
  })

  it('falls back to the clock when the caller names no month', () => {
    // The old behaviour, kept so an older client cannot break.
    expect(lastActualMonth(undefined, FY27_END, new Date('2026-09-11'))).toBe('2026-08')
  })

  it('handles January on the clock path without going to month zero', () => {
    expect(lastActualMonth(undefined, '2027-06', new Date('2027-01-15'))).toBe('2026-12')
  })

  it('ignores a malformed month rather than trusting it', () => {
    expect(lastActualMonth('August', FY27_END, new Date('2026-09-11'))).toBe('2026-08')
    expect(lastActualMonth('2026-8', FY27_END, new Date('2026-09-11'))).toBe('2026-08')
  })
})
