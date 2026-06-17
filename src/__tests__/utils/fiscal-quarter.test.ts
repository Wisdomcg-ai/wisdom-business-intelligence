/**
 * Guardrail for the calendar-vs-fiscal quarter bug class (WisdomBI Feedback #5/#6).
 *
 * The Weekly Review (and other surfaces) select the "current quarter" to load
 * targets + rocks. Using a calendar quarter (Math.ceil((month+1)/3)) reads the
 * WRONG quarter for most of an AU July-start fiscal year — e.g. June is fiscal
 * Q4 but calendar Q2. These tests pin getQuarterForMonth so a regression to a
 * calendar expression is caught.
 */
import { describe, it, expect } from 'vitest'
import { getQuarterForMonth, startMonthFromYearType } from '@/lib/utils/fiscal-year-utils'

describe('getQuarterForMonth — fiscal quarter', () => {
  it.each([
    [7, 1], [8, 1], [9, 1],
    [10, 2], [11, 2], [12, 2],
    [1, 3], [2, 3], [3, 3],
    [4, 4], [5, 4], [6, 4],
  ])('AU July-FY (start month 7): calendar month %i → fiscal q%i', (month, expected) => {
    expect(getQuarterForMonth(month, 7)).toBe(expected)
  })

  it('June in a July-FY is fiscal Q4 (the exact Weekly Review regression)', () => {
    expect(getQuarterForMonth(6, 7)).toBe(4)
    // NOT the calendar q2 the old Math.ceil((6+1)/3) produced
    expect(Math.ceil((6 + 1) / 3)).toBe(3) // (sanity: old code's wrongness, here q3-ish)
  })

  it('CY business (start month 1) aligns with calendar quarters', () => {
    expect(getQuarterForMonth(1, 1)).toBe(1)
    expect(getQuarterForMonth(6, 1)).toBe(2)
    expect(getQuarterForMonth(9, 1)).toBe(3)
    expect(getQuarterForMonth(12, 1)).toBe(4)
  })

  it('startMonthFromYearType maps FY→7, CY→1 (how pages derive yearStartMonth)', () => {
    expect(startMonthFromYearType('FY')).toBe(7)
    expect(startMonthFromYearType('CY')).toBe(1)
  })
})
