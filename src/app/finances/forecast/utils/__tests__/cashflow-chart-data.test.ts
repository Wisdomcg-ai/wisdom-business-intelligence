/**
 * The in-app cashflow chart's bars, against the month's own Net Movement.
 *
 * The monthly report's Cashflow tab feeds this chart from the pack's forecast,
 * which carries expense lines SIGNED (a credit is a negative payment). Bars
 * drawn from absolute values drew a net-credit month as a cost, and a liability
 * that brought cash in (a loan drawdown, a GST refund) as cash going out.
 */
import { describe, it, expect } from 'vitest'
import { transformCashflowToChartData } from '../cashflow-chart-data'
import type { CashflowForecastData, CashflowForecastMonth } from '../../types'

const month = (over: Partial<CashflowForecastMonth>): CashflowForecastMonth => ({
  month: '2026-07', monthLabel: 'Jul 2026', source: 'actual', bank_at_beginning: 0,
  income_lines: [], cash_inflows: 0, cogs_lines: [], expense_groups: [], cash_outflows: 0,
  asset_lines: [], movement_in_assets: 0, liability_lines: [], movement_in_liabilities: 0,
  other_income_lines: [], other_inflows: 0, net_movement: 0, bank_at_end: 0,
  ...over,
})

const data = (m: CashflowForecastMonth) => ({ months: [m] } as unknown as CashflowForecastData)
const barsSum = (p: ReturnType<typeof transformCashflowToChartData>[number]) =>
  p.income + p.otherIncome + p.costOfSales + p.expenses + p.liabilities

describe('transformCashflowToChartData', () => {
  it('draws ordinary payments below zero, and the bars add up to Net Movement', () => {
    const m = month({
      cash_inflows: 10_000,
      cogs_lines: [{ label: 'Freight', value: 2_000 }],
      expense_groups: [{ group: 'Rent', lines: [{ label: 'Rent', value: 3_000 }], subtotal: 3_000 }],
      cash_outflows: 5_000,
      movement_in_liabilities: -1_000,
      net_movement: 4_000,
    })
    const [p] = transformCashflowToChartData(data(m))
    expect(p.costOfSales).toBe(-2_000)
    expect(p.expenses).toBe(-3_000)
    expect(p.liabilities).toBe(-1_000)
    expect(barsSum(p)).toBe(m.net_movement)
  })

  it('draws a net-credit month and a liability inflow above zero, not as costs', () => {
    const m = month({
      cash_inflows: 0,
      cogs_lines: [{ label: 'Freight rebate', value: -400 }],
      expense_groups: [{ group: 'Repairs', lines: [{ label: 'Repairs & Maintenance Warehouse', value: -543 }], subtotal: -543 }],
      cash_outflows: -943,
      movement_in_liabilities: 2_500,
      net_movement: 3_443,
    })
    const [p] = transformCashflowToChartData(data(m))
    expect(p.costOfSales).toBe(400)
    expect(p.expenses).toBe(543)
    expect(p.liabilities).toBe(2_500)
    expect(barsSum(p)).toBe(m.net_movement)
  })
})
