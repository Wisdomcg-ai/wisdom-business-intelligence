/**
 * Three forward-looking charts, and the year they have no forecast for.
 *
 * BreakEvenChart, RevenueVsExpensesTrendChart and TeamCostPctChart all fall
 * back to `subtotal.months[i].budget` for every month the fiscal year has not
 * reached, with no availability guard. With no effective forecast that value is
 * 0 — an absence, not a plan — so the pack plotted revenue, expenses and wages
 * all collapsing to zero from the first open month and drew a break-even line
 * derived from the same zeros. Live for Distinct Directions, Attaquer, IICT,
 * Precision and Sydney Pressed Metal.
 *
 * The call: plot actuals through the last closed month and stop, say on the
 * page that there is no forecast, and do NOT withhold the page — actuals to
 * date are still a real comparison. Same shape as what the analysis charts do
 * when their middle series is absent.
 */
import { describe, it, expect } from 'vitest'
import { transformBreakEvenData } from '../BreakEvenChart'
import { transformRevenueVsExpensesData } from '../RevenueVsExpensesTrendChart'
import { transformTeamCostData } from '../TeamCostPctChart'
import { forwardSeriesAbsentNote } from '../../../utils/full-year-approved'
import { fixtureFullYear } from '../../../services/__tests__/pdf-pack-fixture'

/** Two closed months (Jul, Aug 2026) and no forecast for the remaining ten. */
const noForecast = () => fixtureFullYear({ lastActualMonth: '2026-08', forecastMonthly: 0 })
/** The same year with a real forecast behind the open months. */
const withForecast = () => fixtureFullYear({ lastActualMonth: '2026-08', forecastMonthly: 90_000 })

describe('with no forecast for the year, the series stops at the last closed month', () => {
  it('break-even plots two months, not twelve with ten at zero', () => {
    const { data, forwardAbsentNote } = transformBreakEvenData(noForecast())
    expect(data).toHaveLength(2)
    expect(data.every((d) => d.source === 'actual')).toBe(true)
    expect(data.some((d) => d.revenue === 0)).toBe(false)
    expect(forwardAbsentNote).toContain('FY2027')
    expect(forwardAbsentNote).toContain('no forward series')
  })

  it('break-even counts months profitable out of the months it actually has', () => {
    const { summary } = transformBreakEvenData(noForecast())
    expect(summary.totalMonths).toBe(2)
  })

  it('revenue vs expenses stops too, instead of both lines falling to zero', () => {
    const data = transformRevenueVsExpensesData(noForecast())
    expect(data).toHaveLength(2)
    expect(data.every((d) => d.revenue > 0 && d.expenses > 0)).toBe(true)
  })

  it('team cost stops too, instead of charting a team that costs nothing', () => {
    const data = transformTeamCostData(noForecast(), ['Wages & Salaries'])
    expect(data).toHaveLength(2)
    expect(data.every((d) => d.wages > 0)).toBe(true)
  })

  it('the page is NOT withheld — actuals to date are a real comparison', () => {
    expect(transformBreakEvenData(noForecast()).data.length).toBeGreaterThan(0)
    expect(transformRevenueVsExpensesData(noForecast()).length).toBeGreaterThan(0)
  })
})

describe('a client WITH a forecast is unchanged', () => {
  it('still plots all twelve months on every one of the three', () => {
    expect(transformBreakEvenData(withForecast()).data).toHaveLength(12)
    expect(transformRevenueVsExpensesData(withForecast())).toHaveLength(12)
    expect(transformTeamCostData(withForecast(), ['Wages & Salaries'])).toHaveLength(12)
  })

  it('says nothing about a missing forecast', () => {
    expect(forwardSeriesAbsentNote(withForecast())).toBeNull()
    expect(transformBreakEvenData(withForecast()).forwardAbsentNote).toBeNull()
  })

  it('reads the route’s own flag when it is there, not the evidence', () => {
    // forecast_available: false with non-zero budgets is the shape a report
    // takes when the route knows the forecast is gone but the numbers linger.
    const contradictory = fixtureFullYear({ forecastMonthly: 90_000, forecastAvailable: false })
    expect(forwardSeriesAbsentNote(contradictory)).not.toBeNull()
    expect(transformBreakEvenData(contradictory).data).toHaveLength(2)
  })
})

describe('the months keep their own figures when the tail is dropped', () => {
  it('does not shift a month onto another month’s numbers', () => {
    // The transforms index the section month arrays by position, so filtering
    // before the map would misalign them.
    const data = transformRevenueVsExpensesData(noForecast())
    expect(data[0].month).toBe('2026-07')
    expect(data[1].month).toBe('2026-08')
    expect(data[0].revenue).toBe(data[1].revenue)
  })
})
