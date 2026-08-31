/**
 * WA.4 — the month/fiscal-year pairing, pinned at the failure date.
 *
 * The page used to initialise `fiscalYear` from the clock ("FY of today") and
 * `selectedMonth` as "last completed month" — two different anchors that
 * disagree for the whole of July. On 1 Jul 2026 the page opened on Jun 2026
 * (FY2026) against fiscalYear 2027: `getMonthRange('2026-07','2026-06')` is
 * empty so YTD silently zeroed, the FY2027 budget has no June column, and the
 * month dropdown didn't even list the selected month.
 *
 * These tests run against a fixed clock — the bug is invisible for eleven
 * months of the year, which is exactly how it survived.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getDefaultReportMonth,
  getCurrentFiscalYear,
  getFiscalYearForMonth,
  fiscalYearBounds,
  defaultMonthForFiscalYear,
} from '../monthly-report-service'

afterEach(() => vi.useRealTimers())

describe('getFiscalYearForMonth', () => {
  it.each([
    ['2026-07', 2027], // FY named for the year it ends in
    ['2026-06', 2026],
    ['2027-01', 2027],
    ['2025-12', 2026],
  ])('%s -> FY%i', (month, fy) => {
    expect(getFiscalYearForMonth(month)).toBe(fy)
  })

  it('falls back to the current FY on an unparseable key', () => {
    expect(getFiscalYearForMonth('nope')).toBe(getCurrentFiscalYear())
  })
})

describe('the July pairing (fixed clock: 1 Jul 2026)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 1)) // 1 July 2026
  })

  it('the two old anchors disagree — this is the bug', () => {
    expect(getDefaultReportMonth()).toBe('2026-06')
    expect(getCurrentFiscalYear()).toBe(2027)
  })

  it('deriving FY from the default month restores consistency', () => {
    const month = getDefaultReportMonth()
    const fy = getFiscalYearForMonth(month)
    expect(fy).toBe(2026) // June 2026 belongs to FY2026, not FY2027
    // …and the month sits inside that FY's bounds, so YTD is non-empty and
    // the month dropdown contains the selection.
    const { start, end } = fiscalYearBounds(fy)
    expect(month >= start && month <= end).toBe(true)
  })

  it('switching to the new FY2027 lands on July (its first, in-progress month)', () => {
    // No completed month exists in FY2027 yet — landing anywhere else would
    // put the selection outside the FY, recreating the bug by hand.
    expect(defaultMonthForFiscalYear(2027)).toBe('2026-07')
  })

  it('switching to a finished FY lands on its final month', () => {
    expect(defaultMonthForFiscalYear(2026)).toBe('2026-06')
    expect(defaultMonthForFiscalYear(2025)).toBe('2025-06')
  })
})

describe('mid-year pairing (fixed clock: 31 Aug 2026)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 31))
  })

  it('month and FY agree without any special-casing', () => {
    const month = getDefaultReportMonth()
    expect(month).toBe('2026-07')
    expect(getFiscalYearForMonth(month)).toBe(getCurrentFiscalYear())
  })

  it('current FY lands on the last completed month, not the FY end', () => {
    expect(defaultMonthForFiscalYear(2027)).toBe('2026-07')
  })
})

describe('fiscalYearBounds', () => {
  it('FY2027 spans Jul 2026 – Jun 2027', () => {
    expect(fiscalYearBounds(2027)).toEqual({ start: '2026-07', end: '2027-06' })
  })
})
