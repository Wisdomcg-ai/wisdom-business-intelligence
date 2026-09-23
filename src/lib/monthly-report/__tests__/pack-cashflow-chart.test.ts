/**
 * The pack's cashflow chart series, against Calxa's page 22: nine legend
 * entries in its order, and each bar the engine's signed cash rather than the
 * forecast module's -Math.abs.
 */
import { describe, it, expect } from 'vitest'
import {
  PACK_CASHFLOW_BANK, PACK_CASHFLOW_SERIES, packCashflowAxis, packCashflowChartData, stackPackCashflowBars,
} from '../pack-cashflow-chart'
import { buildPackCashflowForecast } from '../pack-cashflow'
import { urbanRoadFullYear } from './urban-road-full-year-fixture'
import type { CashflowForecastData, FinancialForecast } from '@/app/finances/forecast/types'

const FY2027 = {
  id: 'f', business_id: 'b', user_id: 'u', name: 'FY2027', fiscal_year: 2027, year_type: 'FY',
  actual_start_month: '2026-07', actual_end_month: '2026-08', forecast_start_month: '2026-09', forecast_end_month: '2027-06',
} as FinancialForecast

const urbanRoad = (): CashflowForecastData => buildPackCashflowForecast({
  fullYear: urbanRoadFullYear(), reportMonth: '2026-08', forecast: FY2027, forecastLines: [], savedAssumptions: null,
  opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' },
})!

describe('pack cashflow chart', () => {
  it("has Calxa's nine legend entries, in Calxa's order", () => {
    expect([...PACK_CASHFLOW_SERIES.map((s) => s.label), PACK_CASHFLOW_BANK.label]).toEqual([
      'Income', 'Cost of Sales', 'Expenses', 'Other Income', 'Other Expenses', 'Assets', 'Liabilities', 'Equities', 'Bank At End',
    ])
  })

  it("is the table's cash, month by month, on Urban Road's August figures", () => {
    const cf = urbanRoad()
    const points = packCashflowChartData(cf)
    expect(points).toHaveLength(12)
    points.forEach((p, i) => {
      const m = cf.months[i]
      const sum = Object.values(p.values).reduce((s, v) => s + v, 0)
      // The bars add up to the month's net movement, so the bank line and the
      // bars can never tell two stories.
      expect(sum).toBeCloseTo(m.net_movement, 1)
      expect(p.bankAtEnd).toBe(m.bank_at_end)
    })
    expect(Math.round(points[0].values.income)).toBe(544_739)
    expect(Math.round(points[0].values.costOfSales)).toBe(-349_373)
    expect(Math.round(points[3].values.liabilities)).toBe(-39_366)
  })

  it('keeps a refund positive and draws an asset movement', () => {
    const cf = urbanRoad()
    const month = { ...cf.months[0], movement_in_liabilities: 1_200, movement_in_assets: -7_459 }
    const [p] = packCashflowChartData({ ...cf, months: [month] })
    expect(p.values.liabilities).toBe(1_200)
    expect(p.values.assets).toBe(-7_459)
  })

  it('stacks money in upward and money out downward, in legend order', () => {
    const bars = stackPackCashflowBars({
      month: '2026-09', monthLabel: 'Sep 2026', bankAtEnd: 0,
      values: { income: 500, costOfSales: -300, expenses: -100, otherIncome: 10, otherExpenses: 0, assets: -5, liabilities: -20, equities: 0 },
    })
    expect(bars).toEqual([
      { key: 'income', from: 0, to: 500 },
      { key: 'costOfSales', from: 0, to: -300 },
      { key: 'expenses', from: -300, to: -400 },
      { key: 'otherIncome', from: 500, to: 510 },
      { key: 'assets', from: -400, to: -405 },
      { key: 'liabilities', from: -405, to: -425 },
    ])
  })

  it('puts the axis on whole steps that cover every stack and the bank line', () => {
    const points = packCashflowChartData(urbanRoad())
    const axis = packCashflowAxis(points, 200_000)
    expect(axis).toEqual({ min: -800_000, max: 1_000_000 })
  })
})
