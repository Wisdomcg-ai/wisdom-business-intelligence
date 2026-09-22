/**
 * Break-Even and Revenue vs Expenses, for a client held to an approved budget.
 *
 * Distinct Directions has a locked FY2027 budget version and no active
 * forecast. Both charts read only `months[].budget` — the forecast — so their
 * August pages said "No forecast exists for FY2027, so this chart stops at the
 * last closed month" two pages after an Income Analysis chart that plotted the
 * same approved budget month by month. The analysis charts were fixed to read
 * the approved budget first; these two were not.
 *
 * The rule is the Full Year page's (fullYearBasis): the approved budget fills
 * the open months whenever the report carries one that covers them, else the
 * forecast, else the series stops at the last closed month and says why.
 */
import { describe, it, expect } from 'vitest'
import { transformBreakEvenData } from '../BreakEvenChart'
import { transformRevenueVsExpensesData } from '../RevenueVsExpensesTrendChart'
import { forwardSeriesBasis, forwardSeriesBasisNote, forwardSeriesLabel } from '../../../utils/full-year-basis'
import { fixtureFullYear, fixtureReport, docText } from '../../../services/__tests__/pdf-pack-fixture'
import { MonthlyReportPDFService } from '../../../services/monthly-report-pdf-service'

/** DD: two closed months, an approved budget, no forecast. */
const approvedOnly = () => fixtureFullYear({ lastActualMonth: '2026-08', forecastMonthly: 0, approvedMonthly: 110_000 })
/** Urban Road: both yardsticks, differing. */
const both = () => fixtureFullYear({ lastActualMonth: '2026-08', forecastMonthly: 90_000, approvedMonthly: 110_000 })
/** A forecast-only client: the path ten of eleven clients take. */
const forecastOnly = () => fixtureFullYear({ lastActualMonth: '2026-08', forecastMonthly: 90_000 })

describe('an approved budget with no forecast plots the approved budget forward', () => {
  it('break-even runs the whole year on the approved budget and says nothing about a forecast', () => {
    const { data, forwardAbsentNote } = transformBreakEvenData(approvedOnly())
    expect(data).toHaveLength(12)
    const sep = data.find((d) => d.month === '2026-09')!
    expect(sep.source).toBe('forecast')
    expect(sep.revenue).toBe(110_000)
    // Fixed costs are the approved Operating Expenses (0.3 of the fixture's scale).
    expect(sep.fixedCosts).toBe(33_000)
    expect(forwardAbsentNote).toBeNull()
  })

  it('revenue vs expenses runs the whole year on the approved budget', () => {
    const data = transformRevenueVsExpensesData(approvedOnly())
    expect(data).toHaveLength(12)
    const sep = data.find((d) => d.month === '2026-09')!
    expect(sep.revenue).toBe(110_000)
    // Cost of Sales 0.4 + Operating Expenses 0.3 of the approved 110,000.
    expect(sep.expenses).toBeCloseTo(77_000, 6)
  })

  it('the closed months are still the actuals', () => {
    const jul = transformRevenueVsExpensesData(approvedOnly()).find((d) => d.month === '2026-07')!
    expect(jul.source).toBe('actual')
    expect(jul.revenue).toBe(100_000)
  })
})

describe('a client with both yardsticks is held to the approved budget, as the analysis charts are', () => {
  it('plots the approved budget, not the forecast', () => {
    expect(forwardSeriesBasis(both())).toBe('approved_budget')
    expect(transformBreakEvenData(both()).data.find((d) => d.month === '2026-10')!.revenue).toBe(110_000)
    expect(transformRevenueVsExpensesData(both()).find((d) => d.month === '2026-10')!.revenue).toBe(110_000)
  })

  it('calls the open months Budget on the tab, and Forecast only where the forecast fills them', () => {
    expect(forwardSeriesLabel(both())).toBe('Budget')
    expect(forwardSeriesLabel(approvedOnly())).toBe('Budget')
    expect(forwardSeriesLabel(forecastOnly())).toBe('Forecast')
  })
})

describe('a forecast-only client is unchanged', () => {
  it('plots the forecast forward', () => {
    expect(forwardSeriesBasis(forecastOnly())).toBe('forecast')
    expect(transformBreakEvenData(forecastOnly()).data.find((d) => d.month === '2026-10')!.revenue).toBe(90_000)
    expect(transformRevenueVsExpensesData(forecastOnly()).find((d) => d.month === '2026-10')!.revenue).toBe(90_000)
    expect(transformBreakEvenData(forecastOnly()).forwardAbsentNote).toBeNull()
  })
})

describe('an approved budget that does not cover the open months is not plotted', () => {
  // A version covering Jul–Dec only: January onwards would plot as $0.
  const partial = (forecastMonthly: number) => ({
    ...fixtureFullYear({ lastActualMonth: '2026-08', forecastMonthly, approvedMonthly: 110_000 }),
    approved_months_covered: ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'],
  })

  it('falls back to the forecast when there is one', () => {
    expect(forwardSeriesBasis(partial(90_000))).toBe('forecast')
    expect(transformRevenueVsExpensesData(partial(90_000))).toHaveLength(12)
  })

  it('stops at the last closed month when there is not, and names the gap rather than a missing forecast alone', () => {
    expect(forwardSeriesBasis(partial(0))).toBeNull()
    const { data, forwardAbsentNote } = transformBreakEvenData(partial(0))
    expect(data).toHaveLength(2)
    expect(forwardAbsentNote).toContain('approved budget')
    expect(forwardSeriesBasisNote(partial(0))).toBe(forwardAbsentNote)
  })
})

describe('the pack pages', () => {
  it("DD's Break-Even and Revenue vs Expenses pages no longer say no forecast exists", () => {
    const report = fixtureReport()
    const sections = { ...report.settings.sections, chart_break_even: true, chart_revenue_vs_expenses: true }
    const doc: any = new MonthlyReportPDFService(report, { sections, fullYearReport: approvedOnly() }).generate()
    const text = docText(doc)
    expect(text).toContain('Break-Even Analysis')
    expect(text).toContain('Revenue vs Expenses Trend')
    expect(text).not.toContain('No forecast exists')
  })
})
