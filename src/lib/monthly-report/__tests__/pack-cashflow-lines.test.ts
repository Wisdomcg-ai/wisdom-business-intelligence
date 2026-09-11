/**
 * Urban Road's August pack showed July's Canvas Sales at $371,142 on the
 * cashflow page and $337,402 on the income page — the same month, in the same
 * pack, because the cashflow projected a month that had already happened.
 */
import { describe, it, expect } from 'vitest'
import { buildPackCashflowLines, packCashflowBasis } from '../pack-cashflow-lines'
import type { FullYearReport } from '@/app/finances/monthly-report/types'

const MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10']

function line(name: string, category: string, per: Record<string, { a?: number; b?: number; ap?: number | null }>) {
  return {
    account_name: name,
    category,
    months: MONTHS.map(m => ({
      month: m,
      actual: per[m]?.a ?? 0,
      budget: per[m]?.b ?? 0,
      approved_budget: per[m]?.ap === undefined ? 0 : per[m]!.ap,
      prior_year: 0,
      source: 'actual' as const,
    })),
    projected_total: 0, annual_budget: 0, approved_annual_budget: 0,
    variance_amount: 0, variance_percent: 0,
  }
}

const report = (lines: ReturnType<typeof line>[]): FullYearReport =>
  ({ sections: [{ category: 'Revenue', lines }] } as unknown as FullYearReport)

const CANVAS = line('Canvas Sales', 'Revenue', {
  '2026-07': { a: 337402, b: 371142, ap: 279320 },
  '2026-08': { a: 295827, b: 371142, ap: 279320 },
  '2026-09': { a: 0, b: 384251, ap: 279320 },
  '2026-10': { a: 0, b: 307252, ap: 279320 },
})

describe('buildPackCashflowLines', () => {
  it('puts the banked months in actual_months, where the engine prefers them', () => {
    const { lines } = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(lines[0].actual_months).toEqual({ '2026-07': 337402, '2026-08': 295827 })
  })

  it('drives the remaining months off the APPROVED budget', () => {
    const { lines, approvedThroughout } = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(lines[0].forecast_months).toEqual({ '2026-09': 279320, '2026-10': 279320 })
    expect(approvedThroughout).toBe(true)
  })

  it('writes a zero actual rather than omitting it', () => {
    // A missing key makes the engine fall through to forecast_months, putting a
    // projection back into a month that has already happened.
    const quiet = line('Materialised', 'Revenue', { '2026-07': { a: 0, b: 450 } })
    const { lines } = buildPackCashflowLines(report([quiet]), '2026-07')
    expect(lines[0].actual_months['2026-07']).toBe(0)
    expect('2026-07' in lines[0].actual_months).toBe(true)
  })

  it('falls back to the forecast and SAYS so when there is no approved budget', () => {
    const noBudget = line('Services', 'Revenue', {
      '2026-08': { a: 4200, ap: null },
      '2026-09': { b: 5000, ap: null },
    })
    const built = buildPackCashflowLines(report([noBudget]), '2026-08')
    expect(built.lines[0].forecast_months['2026-09']).toBe(5000)
    expect(built.approvedThroughout).toBe(false)
  })

  it('one account without an approved budget is enough to change the label', () => {
    const built = buildPackCashflowLines(
      report([CANVAS, line('Services', 'Revenue', { '2026-09': { b: 5000, ap: null } })]),
      '2026-08',
    )
    expect(built.approvedThroughout).toBe(false)
  })

  it('reports the split it made', () => {
    const built = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(built.actualMonths).toEqual(['2026-07', '2026-08'])
    expect(built.budgetMonths).toEqual(['2026-09', '2026-10'])
  })

  it('treats the report month itself as an actual, never as a forecast', () => {
    const built = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(built.actualMonths).toContain('2026-08')
    expect(built.budgetMonths).not.toContain('2026-08')
  })

  it('returns nothing, safely, when there is no full-year report', () => {
    expect(buildPackCashflowLines(null, '2026-08').lines).toEqual([])
    expect(buildPackCashflowLines(undefined, '2026-08').lines).toEqual([])
    expect(buildPackCashflowLines(report([CANVAS]), '').lines).toEqual([])
  })

  it('is not vacuously "approved" when nothing is forecast at all', () => {
    // Every month banked: the page has nothing to say about whose numbers the
    // forecast used, and must not claim the approved budget.
    const built = buildPackCashflowLines(report([CANVAS]), '2026-12')
    expect(built.budgetMonths).toEqual([])
    expect(built.approvedThroughout).toBe(false)
  })
})

describe('packCashflowBasis', () => {
  const fmt = (m: string) => ({ '2026-07': 'Jul 2026', '2026-08': 'Aug 2026', '2026-09': 'Sep 2026', '2026-10': 'Oct 2026' }[m] ?? m)

  it('names both halves of the row', () => {
    const built = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(packCashflowBasis(built, fmt))
      .toBe('Actuals Jul 2026 to Aug 2026 · approved budget Sep 2026 to Oct 2026')
  })

  it('says forecast when that is what it used', () => {
    const built = buildPackCashflowLines(
      report([line('Services', 'Revenue', { '2026-08': { a: 1 }, '2026-09': { b: 2, ap: null } })]),
      '2026-08',
    )
    expect(packCashflowBasis(built, fmt)).toContain('forecast Sep 2026')
  })

  it('does not say "to" when a half is a single month', () => {
    // A two-month line, so each half really is one month.
    const short = {
      account_name: 'X', category: 'Revenue',
      months: [
        { month: '2026-07', actual: 1, budget: 0, approved_budget: 0, prior_year: 0, source: 'actual' as const },
        { month: '2026-08', actual: 0, budget: 0, approved_budget: 2, prior_year: 0, source: 'forecast' as const },
      ],
      projected_total: 0, annual_budget: 0, approved_annual_budget: 0,
      variance_amount: 0, variance_percent: 0,
    }
    const built = buildPackCashflowLines(report([short as never]), '2026-07')
    expect(packCashflowBasis(built, fmt)).toBe('Actuals for Jul 2026 · approved budget for Aug 2026')
  })

  it('says nothing when there is nothing to say', () => {
    expect(packCashflowBasis(buildPackCashflowLines(null, '2026-08'), fmt)).toBeNull()
  })
})
