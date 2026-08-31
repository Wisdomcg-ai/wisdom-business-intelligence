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
