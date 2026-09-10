/**
 * WD.1 — the Actual/Budget/Last-Year chart data.
 *
 * The judgement calls worth pinning: actual is NULL past the last completed
 * month (no bar, never a zero bar), each chart is scoped to exactly one
 * section, and an all-zero section produces no chart rather than an empty
 * page.
 */
import { describe, it, expect } from 'vitest'
import { transformAnalysisChartData } from '../analysis-chart-data'
import type { FullYearReport } from '../../../types'

function fyReport(): FullYearReport {
  const months = (vals: Array<[number, number, number, 'actual' | 'forecast']>) =>
    vals.map(([actual, budget, prior], i) => ({
      month: `2026-${String(i + 7).padStart(2, '0')}`,
      actual,
      budget,
      prior_year: prior,
      source: vals[i][3],
    }))
  const section = (category: string, vals: Array<[number, number, number, 'actual' | 'forecast']>) => ({
    category,
    lines: [],
    subtotal: { account_name: `Total ${category}`, category, months: months(vals), projected_total: 0, annual_budget: 0, variance_amount: 0, variance_percent: 0 },
  })
  return {
    business_id: 'b1',
    fiscal_year: 2027,
    last_actual_month: '2026-08',
    sections: [
      section('Revenue', [
        [100, 90, 80, 'actual'],
        [110, 95, 85, 'actual'],
        [0, 100, 90, 'forecast'],
      ]),
      section('Cost of Sales', [
        [40, 35, 30, 'actual'],
        [45, 36, 32, 'actual'],
        [0, 38, 33, 'forecast'],
      ]),
      section('Operating Expenses', [
        [0, 0, 0, 'actual'],
        [0, 0, 0, 'actual'],
        [0, 0, 0, 'forecast'],
      ]),
    ],
  } as unknown as FullYearReport
}

describe('transformAnalysisChartData', () => {
  it('scopes to exactly one section', () => {
    const d = transformAnalysisChartData(fyReport(), 'income')!
    expect(d.title).toBe('Income Analysis')
    expect(d.months.map((m) => m.budget)).toEqual([90, 95, 100])
  })

  it('actual is null for forecast months — no bar, never a zero bar', () => {
    const d = transformAnalysisChartData(fyReport(), 'income')!
    expect(d.months.map((m) => m.actual)).toEqual([100, 110, null])
  })

  it('budget and prior-year run the full year regardless', () => {
    const d = transformAnalysisChartData(fyReport(), 'cogs')!
    expect(d.months.map((m) => m.priorYear)).toEqual([30, 32, 33])
    expect(d.months[2].budget).toBe(38)
  })

  it('an all-zero section yields null — no empty chart page', () => {
    expect(transformAnalysisChartData(fyReport(), 'expense')).toBeNull()
  })

  it('a missing section yields null', () => {
    const report = { ...fyReport(), sections: [] } as unknown as FullYearReport
    expect(transformAnalysisChartData(report, 'income')).toBeNull()
  })

  it('maxValue spans all three series for shared axis scaling', () => {
    const d = transformAnalysisChartData(fyReport(), 'income')!
    expect(d.maxValue).toBe(110)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Which yardstick the middle series is.
//
// These three pages sit at 3, 5 and 9 of the Calxa pack, each one directly
// above the Budget-vs-Actual table for the same section. The table is measured
// against the approved budget the moment a client moves to the budget store, so
// a chart above it plotting the forecast under a legend saying "Budget" holds
// the reader to two different numbers under one word — and for a client with an
// approved budget and no active forecast it plots nothing at all while a real
// budget is printed a few pages later.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `approved` null = not on the budget store. `forecast` false = no active
 * forecast for the year, which is Distinct Directions' state today.
 */
function fyWithYardsticks(approved: number | null, forecast: boolean): FullYearReport {
  const months = [0, 1, 2].map((i) => ({
    month: `2026-${String(i + 7).padStart(2, '0')}`,
    actual: 100 + i,
    budget: forecast ? 90 + i : 0,
    approved_budget: approved === null ? null : approved + i,
    prior_year: 80 + i,
    source: (i < 2 ? 'actual' : 'forecast') as 'actual' | 'forecast',
  }))
  const line = {
    account_name: 'Total Revenue',
    category: 'Revenue',
    months,
    projected_total: 0,
    annual_budget: forecast ? 270 : 0,
    approved_annual_budget: approved === null ? null : approved * 3,
    variance_amount: 0,
    variance_percent: 0,
  }
  return {
    business_id: 'c6c741db-6c09-45be-974c-5e6ca2cadf84',
    fiscal_year: 2027,
    last_actual_month: '2026-08',
    sections: [{ category: 'Revenue', lines: [line], subtotal: line }],
    gross_profit: line,
    net_profit: line,
    forecast_available: forecast,
  } as unknown as FullYearReport
}

describe('transformAnalysisChartData — the series names its yardstick', () => {
  it('plots the approved budget, and says so, for a client on the budget store', () => {
    const d = transformAnalysisChartData(fyWithYardsticks(500, true), 'income')!
    expect(d.budgetLabel).toBe('Approved Budget')
    expect(d.months.map((m) => m.budget)).toEqual([500, 501, 502])
    expect(d.budgetAbsentNote).toBeNull()
  })

  it('leaves the other ten clients exactly as they were', () => {
    const d = transformAnalysisChartData(fyWithYardsticks(null, true), 'income')!
    expect(d.budgetLabel).toBe('Budget')
    expect(d.months.map((m) => m.budget)).toEqual([90, 91, 92])
  })

  it('still plots the approved budget when there is no forecast at all', () => {
    // Distinct Directions. Before this, every m.budget was 0, maxValue stayed
    // non-zero on the actuals, and the page printed with its Budget series
    // silently missing — beside a real approved budget in the same pack.
    const d = transformAnalysisChartData(fyWithYardsticks(500, false), 'income')!
    expect(d.budgetLabel).toBe('Approved Budget')
    expect(d.months.map((m) => m.budget)).toEqual([500, 501, 502])
  })

  it('drops the series and states why when neither yardstick exists', () => {
    const d = transformAnalysisChartData(fyWithYardsticks(null, false), 'income')!
    expect(d.budgetLabel).toBeNull()
    expect(d.months.every((m) => m.budget === null)).toBe(true)
    // Not a run of zero bars, and not an unexplained gap in the legend.
    expect(d.budgetAbsentNote).toContain('No forecast exists for FY2027')
    // The page is still worth printing: actuals against last year is real.
    // 101 is the last closed month's actual — the axis scales off the two
    // series that exist, not off a yardstick that does not.
    expect(d.maxValue).toBe(101)
  })

  it('draws no bar for a month the approved budget does not answer for', () => {
    const report = fyWithYardsticks(500, true)
    report.sections[0].subtotal.months[1].approved_budget = null
    const d = transformAnalysisChartData(report, 'income')!
    expect(d.months.map((m) => m.budget)).toEqual([500, null, 502])
  })
})
