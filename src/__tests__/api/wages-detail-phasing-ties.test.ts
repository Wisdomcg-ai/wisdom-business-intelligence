/**
 * WB.4 / WB.5 — payroll phasing detection and the PAY-TIES comparison.
 *
 * Both rules are lifted from the client skills that build the Calxa packs by
 * hand; these tests pin the judgement calls, not just the arithmetic.
 */
import { describe, it, expect } from 'vitest'
import {
  computePayrollPhasing,
  computePayrollTies,
  PAY_TIES_TOLERANCE,
} from '@/app/api/monthly-report/wages-detail/_helpers'

const typicalRunsFor = (f: string) =>
  ({ WEEKLY: 4, FORTNIGHTLY: 2, FOURWEEKLY: 1, MONTHLY: 1, TWICEMONTHLY: 2, QUARTERLY: 0 })[f] ?? 2

const weekly = (n: number) => Array(n).fill('WEEKLY')

describe('computePayrollPhasing', () => {
  it('flags the five-Friday month for a weekly cycle', () => {
    const p = computePayrollPhasing({
      payRunDates: ['2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26', '2026-06-29'],
      calendarTypes: weekly(17),
      typicalRunsFor,
    })
    expect(p).toMatchObject({ pay_runs_in_month: 5, typical_runs: 4, extra_run: true })
  })

  it('a normal four-run month is not flagged', () => {
    const p = computePayrollPhasing({
      payRunDates: ['2026-07-03', '2026-07-10', '2026-07-17', '2026-07-24'],
      calendarTypes: weekly(10),
      typicalRunsFor,
    })
    expect(p?.extra_run).toBe(false)
  })

  it('three fortnightly runs in one month is flagged', () => {
    const p = computePayrollPhasing({
      payRunDates: ['2026-07-01', '2026-07-15', '2026-07-29'],
      calendarTypes: ['FORTNIGHTLY', 'FORTNIGHTLY'],
      typicalRunsFor,
    })
    expect(p).toMatchObject({ typical_runs: 2, extra_run: true, calendar_type: 'FORTNIGHTLY' })
  })

  it('the dominant calendar wins a mixed roster', () => {
    const p = computePayrollPhasing({
      payRunDates: ['2026-07-06', '2026-07-20'],
      calendarTypes: ['MONTHLY', 'FORTNIGHTLY', 'FORTNIGHTLY', 'FORTNIGHTLY'],
      typicalRunsFor,
    })
    expect(p?.calendar_type).toBe('FORTNIGHTLY')
    expect(p?.extra_run).toBe(false)
  })

  it('QUARTERLY (typical 0) never flags — no meaningful monthly expectation', () => {
    const p = computePayrollPhasing({
      payRunDates: ['2026-07-01'],
      calendarTypes: ['QUARTERLY'],
      typicalRunsFor,
    })
    expect(p?.extra_run).toBe(false)
  })

  it('returns null with no runs or no paid employees', () => {
    expect(
      computePayrollPhasing({ payRunDates: [], calendarTypes: weekly(3), typicalRunsFor }),
    ).toBeNull()
    expect(
      computePayrollPhasing({ payRunDates: ['2026-07-03'], calendarTypes: [], typicalRunsFor }),
    ).toBeNull()
  })
})

describe('computePayrollTies', () => {
  it('super joins the payroll side only when the account list carries a super account', () => {
    const withSuper = computePayrollTies({
      payrollGross: 10_000,
      payrollSuper: 1_200,
      accountsActual: 11_200,
      wagesAccountNames: ['Wages and Salaries', 'Superannuation'],
    })
    expect(withSuper.includes_super_account).toBe(true)
    expect(withSuper.payroll_side).toBe(11_200)
    expect(withSuper.within_tolerance).toBe(true)

    const withoutSuper = computePayrollTies({
      payrollGross: 10_000,
      payrollSuper: 1_200,
      accountsActual: 10_000,
      wagesAccountNames: ['Wages and Salaries'],
    })
    expect(withoutSuper.includes_super_account).toBe(false)
    expect(withoutSuper.payroll_side).toBe(10_000)
    expect(withoutSuper.within_tolerance).toBe(true)
  })

  it("cent-level rounding is inside the $1 tolerance — Daniel's rule", () => {
    const t = computePayrollTies({
      payrollGross: 10_000.47,
      payrollSuper: 0,
      accountsActual: 10_000,
      wagesAccountNames: ['Wages'],
    })
    expect(Math.abs(t.delta)).toBeLessThanOrEqual(PAY_TIES_TOLERANCE)
    expect(t.within_tolerance).toBe(true)
  })

  it('a real break is reported with its signed delta', () => {
    const t = computePayrollTies({
      payrollGross: 10_000,
      payrollSuper: 0,
      accountsActual: 12_500, // e.g. wages posted to an account not in payroll
      wagesAccountNames: ['Wages'],
    })
    expect(t.within_tolerance).toBe(false)
    expect(t.delta).toBe(2_500)
  })

  it('not comparable when the P&L side is empty (the backfill would be circular)', () => {
    // The route copies the payroll total into accounts[0] when the P&L has no
    // wage actuals; comparing after that always "ties" and proves nothing.
    const t = computePayrollTies({
      payrollGross: 10_000,
      payrollSuper: 0,
      accountsActual: 0,
      wagesAccountNames: ['Wages'],
    })
    expect(t.comparable).toBe(false)
  })

  it('not comparable with no payroll data', () => {
    const t = computePayrollTies({
      payrollGross: 0,
      payrollSuper: 0,
      accountsActual: 5_000,
      wagesAccountNames: ['Wages'],
    })
    expect(t.comparable).toBe(false)
  })
})
