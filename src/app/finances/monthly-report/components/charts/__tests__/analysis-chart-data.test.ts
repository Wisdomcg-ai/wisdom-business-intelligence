/**
 * WD.1 — the Actual/Budget/Last-Year chart data.
 *
 * The judgement calls worth pinning: actual is NULL past the last completed
 * month (no bar, never a zero bar), each chart is scoped to exactly one
 * section, and an all-zero section produces no chart rather than an empty
 * page.
 */
import { describe, it, expect } from 'vitest'
import {
  transformAnalysisChartData,
  analysisChartAxis,
  analysisChartLegend,
} from '../analysis-chart-data'
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

// ─────────────────────────────────────────────────────────────────────────────
// The chart's furniture, against Calxa's pages 3, 5 and 9.
//
// The maxima are Urban Road's FY2027 full-year report as full-year-load built
// it on 14 Sep 2026: the tallest bar on each page is November's approved income
// budget (800,000), last November's cost of sales (488,262.21) and last July's
// expenses (273,794.29).
// ─────────────────────────────────────────────────────────────────────────────

describe("analysisChartAxis — Calxa's gridlines", () => {
  it('Income: 100,000 steps to 800,000, the frame 10% past the tallest bar', () => {
    const a = analysisChartAxis(0, 800_000)
    expect(a.step).toBe(100_000)
    expect(a.ticks).toEqual([0, 100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 700_000, 800_000])
    expect(a.max).toBeCloseTo(880_000, 6)
  })

  it('COGS: 50,000 steps to 500,000 — the old range/5 step gave 200,000 and three gridlines', () => {
    const a = analysisChartAxis(0, 488_262.21)
    expect(a.step).toBe(50_000)
    expect(a.ticks.length).toBe(11)
    expect(a.ticks[a.ticks.length - 1]).toBe(500_000)
  })

  it('Expenses: 30,000 steps to 300,000', () => {
    const a = analysisChartAxis(0, 273_794.29)
    expect(a.step).toBe(30_000)
    expect(a.ticks[a.ticks.length - 1]).toBe(300_000)
    // 301,174: the top gridline sits just inside the frame, as on Calxa's p9.
    expect(a.max).toBeGreaterThan(300_000)
  })

  it('never prints "-0" at the foot of an all-positive chart', () => {
    expect(Object.is(analysisChartAxis(0, 800_000).ticks[0], -0)).toBe(false)
  })

  it('makes room below zero for a negative month without moving the figures', () => {
    const a = analysisChartAxis(-20_000, 100_000)
    expect(a.min).toBeCloseTo(-22_000, 6)
    expect(a.ticks[0]).toBe(-20_000)
    expect(a.ticks).toContain(0)
  })

  it("picks the step Calxa picked on all fourteen analysis charts in the packs on file", () => {
    // The tallest bar on each chart, read off the vector data of the August
    // 2026 packs (May for JDS, July for IICT) against its own gridlines, and
    // the step Calxa gridded it on. Urban Road's three pages alone fitted a
    // cap of ten intervals with a 2.5 in the ladder; IICT's COGS page runs
    // twelve intervals of 10,000 (a frame at 121,800), which that cap turned
    // into 20,000, and Urban Road's Expenses page passed over 25,000 at 12.0
    // intervals for 30,000 — so there is no 2.5, and the cap sits between
    // IICT's 12.18 and Distinct Directions' rejected 12.96.
    const calxa: Array<[string, number, number]> = [
      ['Urban Road Income', 800_716, 100_000],
      ['Urban Road COGS', 489_294, 50_000],
      ['Urban Road Expenses', 273_538, 30_000],
      ['Distinct Directions Income', 589_028, 100_000],
      ['Distinct Directions Expenses', 438_967, 50_000],
      ['Dragon Income', 1_233_203, 200_000],
      ['Dragon COGS', 770_570, 100_000],
      ['Dragon Expenses', 440_364, 50_000],
      ['JDS Income', 1_867_884, 200_000],
      ['JDS COGS', 1_950_963, 200_000],
      ['JDS Expenses', 790_420, 100_000],
      ['IICT Income', 446_045, 50_000],
      ['IICT COGS', 110_727, 10_000],
      ['IICT Expenses', 281_037, 30_000],
    ]
    for (const [chart, tallest, step] of calxa) {
      expect(analysisChartAxis(0, tallest).step, chart).toBe(step)
    }
    expect(analysisChartAxis(0, 110_727).ticks).toHaveLength(13)
  })

  it('holds between four and twelve intervals at any scale', () => {
    for (const max of [7, 95, 1_234, 48_000, 99_999, 250_000, 3_300_000]) {
      const a = analysisChartAxis(0, max)
      expect(a.ticks.length - 1, `max ${max}`).toBeLessThanOrEqual(12)
      expect(a.ticks.length - 1, `max ${max}`).toBeGreaterThanOrEqual(4)
    }
  })

  it('steps in whole dollars on a chart under $25, so no two gridlines print the same figure', () => {
    // The renderer prints each gridline as a whole-dollar figure. A 2.5 step
    // printed "0 3 5 8 10 13" against gridlines at 0, 2.5, 5, 7.5; a 0.05 step
    // printed "0" seven times. One stray small posting in a section is enough
    // to put a chart on that scale.
    for (const [lo, hi] of [[0, 24], [0, 20], [0, 4], [0, 0.3], [-0.3, 0], [-0.1, 0.2], [-3, 12]]) {
      const a = analysisChartAxis(lo, hi)
      const printed = a.ticks.map((t) => Math.round(t).toLocaleString('en-AU'))
      expect(a.step, `(${lo}, ${hi})`).toBeGreaterThanOrEqual(1)
      expect(a.ticks.every((t) => Number.isInteger(t)), `(${lo}, ${hi}) ${a.ticks}`).toBe(true)
      expect(new Set(printed).size, `(${lo}, ${hi}) ${printed}`).toBe(printed.length)
      // A frame with one gridline says nothing about the bar inside it.
      expect(a.ticks.length, `(${lo}, ${hi})`).toBeGreaterThanOrEqual(2)
      // The bars still fit, and every gridline is inside the frame.
      expect(a.max).toBeGreaterThanOrEqual(hi)
      expect(a.min).toBeLessThanOrEqual(lo)
      expect(a.ticks.every((t) => t >= a.min - 1e-9 && t <= a.max + 1e-9)).toBe(true)
    }
    expect(analysisChartAxis(0, 20).ticks).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22])
  })
})

describe('analysis chart labels', () => {
  it('carries the axis months as the title period, "Sep 2026" never en-AU\'s "Sept"', () => {
    const d = transformAnalysisChartData(fyWithYardsticks(500, true), 'income')!
    expect(d.period).toBe('Jul 2026 - Sep 2026')
    expect(d.months.map((m) => m.label)).toEqual(['Jul 2026', 'Aug 2026', 'Sep 2026'])
  })

  it("prefixes the legend with the section, in Calxa's words", () => {
    const d = transformAnalysisChartData(fyWithYardsticks(500, true), 'income')!
    // Calxa's word whichever yardstick the series is — the label still records which.
    expect(d.budgetLabel).toBe('Approved Budget')
    expect(analysisChartLegend(d)).toEqual(['Income Actuals', 'Income Budgets', 'Income LastYear Actuals'])
    expect(analysisChartLegend({ noun: 'Cost of Sales', budgetLabel: 'Budget' })).toEqual([
      'Cost of Sales Actuals', 'Cost of Sales Budgets', 'Cost of Sales LastYear Actuals',
    ])
  })

  it('names Expense the way the statements do, and drops an entry with no series', () => {
    expect(analysisChartLegend({ noun: 'Expense', budgetLabel: null })).toEqual(['Expense Actuals', 'Expense LastYear Actuals'])
    expect(transformAnalysisChartData(fyReport(), 'cogs')!.noun).toBe('Cost of Sales')
  })
})
