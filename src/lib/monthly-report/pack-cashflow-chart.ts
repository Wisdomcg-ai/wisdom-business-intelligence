/**
 * The series of the pack's Cashflow Forecast chart, in Calxa's order and
 * colours.
 *
 * Not the forecast module's transformCashflowToChartData. That one serves the
 * on-screen chart and forces every outflow negative with -Math.abs, so a GST
 * refund month drew as a BAS payment and a credited expense as a cost; it has
 * no Assets series, so a stock purchase moved the bank line with no bar to
 * show why. Here each series is the engine's own signed cash figure, and the
 * nine legend entries are Calxa's, printed even when a series is empty all
 * year so the legend reads the same every month.
 */

import type { CashflowForecastData } from '@/app/finances/forecast/types'

type RGB = [number, number, number]

export type PackCashflowSeriesKey =
  | 'income' | 'costOfSales' | 'expenses' | 'otherIncome' | 'otherExpenses'
  | 'assets' | 'liabilities' | 'equities'

export interface PackCashflowChartPoint {
  month: string
  /** 'Sep 2026' */
  monthLabel: string
  /** Signed cash: money in positive, money out negative. */
  values: Record<PackCashflowSeriesKey, number>
  bankAtEnd: number
}

/** Sampled off Urban Road's August 2026 Calxa pack, page 22. */
export const PACK_CASHFLOW_SERIES: readonly { key: PackCashflowSeriesKey; label: string; rgb: RGB }[] = [
  { key: 'income', label: 'Income', rgb: [96, 226, 148] },
  { key: 'costOfSales', label: 'Cost of Sales', rgb: [255, 213, 113] },
  { key: 'expenses', label: 'Expenses', rgb: [88, 176, 227] },
  { key: 'otherIncome', label: 'Other Income', rgb: [255, 164, 118] },
  { key: 'otherExpenses', label: 'Other Expenses', rgb: [158, 158, 242] },
  { key: 'assets', label: 'Assets', rgb: [122, 221, 226] },
  { key: 'liabilities', label: 'Liabilities', rgb: [249, 120, 120] },
  { key: 'equities', label: 'Equities', rgb: [240, 179, 255] },
]

export const PACK_CASHFLOW_BANK = { label: 'Bank At End', rgb: [102, 102, 102] as RGB }

export function packCashflowChartData(cf: CashflowForecastData): PackCashflowChartPoint[] {
  return cf.months.map((m) => {
    const cogs = m.cogs_lines.reduce((s, l) => s + l.value, 0)
    const expenses = m.expense_groups.reduce((s, g) => s + g.subtotal, 0)
    return {
      month: m.month,
      monthLabel: m.monthLabel,
      values: {
        income: m.cash_inflows,
        costOfSales: -cogs,
        expenses: -expenses,
        otherIncome: m.other_inflows,
        // The engine has no Other Expenses or equity cash rows. Zero, stated,
        // rather than an absent series: the legend is Calxa's either way.
        // Cash model v2's actual months do carry equity (capital in, drawings).
        // Its unreconciled rows are not stacked: they are what the bars could
        // not explain, and the bank line still shows the real balance.
        otherExpenses: 0,
        assets: m.movement_in_assets,
        liabilities: m.movement_in_liabilities,
        equities: m.movement_in_equity ?? 0,
      },
      bankAtEnd: m.bank_at_end,
    }
  })
}

/**
 * Where a month's bars start and end, stacked Calxa's way: positive values
 * upward from zero and negative values downward, each in legend order, so
 * Cost of Sales sits nearest the axis and Liabilities furthest below it.
 */
export function stackPackCashflowBars(point: PackCashflowChartPoint): { key: PackCashflowSeriesKey; from: number; to: number }[] {
  let up = 0
  let down = 0
  const bars: { key: PackCashflowSeriesKey; from: number; to: number }[] = []
  for (const { key } of PACK_CASHFLOW_SERIES) {
    const v = point.values[key]
    if (v > 0) { bars.push({ key, from: up, to: up + v }); up += v }
    else if (v < 0) { bars.push({ key, from: down, to: down + v }); down += v }
  }
  return bars
}

/** Axis bounds on whole steps of `step`, covering every stack and the bank line. */
export function packCashflowAxis(points: PackCashflowChartPoint[], step: number): { min: number; max: number } {
  let max = 0
  let min = 0
  for (const p of points) {
    for (const b of stackPackCashflowBars(p)) {
      max = Math.max(max, b.to)
      min = Math.min(min, b.to)
    }
    max = Math.max(max, p.bankAtEnd)
    min = Math.min(min, p.bankAtEnd)
  }
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step }
}
