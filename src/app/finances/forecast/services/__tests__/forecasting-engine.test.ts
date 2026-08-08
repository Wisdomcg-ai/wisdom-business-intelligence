/**
 * Characterization tests for ForecastingEngine — the pure engine that analyses
 * historical P&L lines and projects forward via straight-line / growth-rate /
 * seasonal / driver-based methods. Previously untested; these lock in its
 * CURRENT behaviour so the numbers a coach presents can't silently regress.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { ForecastingEngine } from '../forecasting-engine'
import type { PLLine } from '../../types'

// The engine console.logs each method application; silence it for clean output.
beforeAll(() => vi.spyOn(console, 'log').mockImplementation(() => {}))
afterAll(() => vi.restoreAllMocks())

const pl = (over: Partial<PLLine> = {}): PLLine => ({
  account_name: 'Line',
  actual_months: {},
  forecast_months: {},
  ...over,
})

describe('calculateAnalysis', () => {
  it('computes fy_average_per_month as total ÷ number of month keys', () => {
    const line = pl({ actual_months: { '2024-07': 1200 } })
    const a = ForecastingEngine.calculateAnalysis(line, [line], ['2024-07', '2024-08', '2024-09'])
    expect(a.fy_average_per_month).toBe(400) // 1200 / 3, missing months count as 0
  })

  it('computes a revenue line as a % of total revenue', () => {
    const r1 = pl({ id: 'r1', category: 'Revenue', actual_months: { m: 1000 } })
    const r2 = pl({ id: 'r2', category: 'Revenue', actual_months: { m: 3000 } })
    const a = ForecastingEngine.calculateAnalysis(r1, [r1, r2], ['m'])
    expect(a.pct_of_total_revenue).toBe(25) // 1000 / 4000
  })

  it('computes COGS as % of revenue and an upward trend across the FY', () => {
    const rev = pl({ id: 'rev', category: 'Revenue', actual_months: {
      m1: 1000, m2: 1000, m3: 1000, m4: 1000, m5: 1000, m6: 1000,
    } })
    const cogs = pl({ id: 'cogs', category: 'Cost of Sales', actual_months: {
      m1: 100, m2: 100, m3: 100, m4: 200, m5: 200, m6: 200,
    } })
    const keys = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
    const a = ForecastingEngine.calculateAnalysis(cogs, [rev, cogs], keys)
    expect(a.pct_of_revenue).toBe(15)          // 900 / 6000
    expect(a.trend_percentage).toBe(100)       // (200 − 100) / 100
    expect(a.trend_direction).toBe('up')
  })

  it('flags a flat expense line as a stable trend', () => {
    const rev = pl({ id: 'rev', category: 'Revenue', actual_months: { m1: 1000, m2: 1000 } })
    const opex = pl({ id: 'op', category: 'Operating Expenses', actual_months: { m1: 100, m2: 100 } })
    const a = ForecastingEngine.calculateAnalysis(opex, [rev, opex], ['m1', 'm2'])
    expect(a.trend_direction).toBe('stable')
    expect(a.trend_percentage).toBe(0)
  })
})

describe('applyForecastMethod', () => {
  const fkeys = ['f1', 'f2', 'f3']

  it('with no method configured, fills every month with the FY average', () => {
    const line = pl({ analysis: { fy_average_per_month: 500 } })
    const out = ForecastingEngine.applyForecastMethod(line, [line], fkeys, [])
    expect(out).toEqual({ f1: 500, f2: 500, f3: 500 })
  })

  it("method 'none' zeroes the line out", () => {
    const line = pl({ forecast_method: { method: 'none' }, analysis: { fy_average_per_month: 500 } })
    const out = ForecastingEngine.applyForecastMethod(line, [line], fkeys, [])
    expect(out).toEqual({ f1: 0, f2: 0, f3: 0 })
  })

  it("straight_line applies a percentage increase to the base amount", () => {
    const line = pl({ forecast_method: { method: 'straight_line', base_amount: 1000, percentage_increase: 0.1 } })
    const out = ForecastingEngine.applyForecastMethod(line, [line], fkeys, [])
    expect(out).toEqual({ f1: 1100, f2: 1100, f3: 1100 })
  })

  it("straight_line falls back to the FY average when no base amount is set", () => {
    const line = pl({ forecast_method: { method: 'straight_line' }, analysis: { fy_average_per_month: 800 } })
    const out = ForecastingEngine.applyForecastMethod(line, [line], fkeys, [])
    expect(out).toEqual({ f1: 800, f2: 800, f3: 800 })
  })

  it("growth_rate MoM compounds from the last actual month", () => {
    const line = pl({
      actual_months: { a1: 1000 },
      forecast_method: { method: 'growth_rate', growth_rate: 0.1, growth_type: 'MoM' },
    })
    const out = ForecastingEngine.applyForecastMethod(line, [line], fkeys, ['a1'])
    expect(out.f1).toBeCloseTo(1100, 6)
    expect(out.f2).toBeCloseTo(1210, 6)
    expect(out.f3).toBeCloseTo(1331, 6)
  })

  it("manual returns the pre-existing forecast_months (missing → 0)", () => {
    const line = pl({ forecast_method: { method: 'manual' }, forecast_months: { f1: 777 } })
    const out = ForecastingEngine.applyForecastMethod(line, [line], ['f1', 'f2'], [])
    expect(out).toEqual({ f1: 777, f2: 0 })
  })

  it("driver_based projects as a % of the driver line's forecast", () => {
    const driver = pl({ id: 'rev', forecast_months: { f1: 1000, f2: 2000 } })
    const line = pl({ forecast_method: { method: 'driver_based', driver_line_id: 'rev', driver_percentage: 0.25 } })
    const out = ForecastingEngine.applyForecastMethod(line, [driver, line], ['f1', 'f2'], [])
    expect(out).toEqual({ f1: 250, f2: 500 })
  })

  it("driver_based falls back to zeros when the driver line is missing", () => {
    const line = pl({ forecast_method: { method: 'driver_based', driver_line_id: 'missing', driver_percentage: 0.25 } })
    const out = ForecastingEngine.applyForecastMethod(line, [line], ['f1'], [])
    expect(out).toEqual({ f1: 0 })
  })
})

describe('recalculateAllForecasts (end-to-end, resolves driver dependencies)', () => {
  it('projects revenue straight-line, then COGS as a % of that revenue forecast', () => {
    const rev = pl({
      id: 'rev', account_name: 'Revenue', category: 'Revenue',
      actual_months: { b1: 10000, b2: 10000, b3: 10000 },
      forecast_method: { method: 'straight_line', base_amount: 10000 },
    })
    const cogs = pl({
      id: 'cogs', account_name: 'COGS', category: 'Cost of Sales',
      actual_months: { b1: 3000, b2: 3000, b3: 3000 },
      forecast_method: { method: 'driver_based', driver_line_id: 'rev', driver_percentage: 0.3 },
    })

    const out = ForecastingEngine.recalculateAllForecasts(
      [rev, cogs], ['b1', 'b2', 'b3'], ['f1', 'f2'],
    )

    const outRev = out.find((l) => l.id === 'rev')!
    const outCogs = out.find((l) => l.id === 'cogs')!
    expect(outRev.forecast_months).toEqual({ f1: 10000, f2: 10000 })
    expect(outCogs.forecast_months).toEqual({ f1: 3000, f2: 3000 }) // 30% of 10,000
    // Analysis is computed from the baseline months on the way through.
    expect(outRev.analysis?.fy_average_per_month).toBe(10000)
  })
})
