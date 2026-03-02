import type { CashflowForecastData, CashflowForecastMonth } from '../types'

export interface CashflowChartDataPoint {
  monthLabel: string
  month: string
  source: 'actual' | 'forecast'
  income: number
  otherIncome: number
  costOfSales: number
  expenses: number
  liabilities: number
  bankAtEnd: number
}

export const CASHFLOW_CHART_COLORS = {
  income:      { hex: '#4ade80', rgb: [74, 222, 128] as [number, number, number] },
  otherIncome: { hex: '#fb923c', rgb: [251, 146, 60] as [number, number, number] },
  costOfSales: { hex: '#fbbf24', rgb: [251, 191, 36] as [number, number, number] },
  expenses:    { hex: '#60a5fa', rgb: [96, 165, 250] as [number, number, number] },
  liabilities: { hex: '#f87171', rgb: [248, 113, 113] as [number, number, number] },
  bankAtEnd:   { hex: '#1e293b', rgb: [30, 41, 59] as [number, number, number] },
}

export const CASHFLOW_CHART_SERIES = [
  { key: 'income',      label: 'Income',        color: CASHFLOW_CHART_COLORS.income.hex },
  { key: 'otherIncome', label: 'Other Income',   color: CASHFLOW_CHART_COLORS.otherIncome.hex },
  { key: 'costOfSales', label: 'Cost of Sales',  color: CASHFLOW_CHART_COLORS.costOfSales.hex },
  { key: 'expenses',    label: 'Expenses',       color: CASHFLOW_CHART_COLORS.expenses.hex },
  { key: 'liabilities', label: 'Liabilities',    color: CASHFLOW_CHART_COLORS.liabilities.hex },
] as const

function sumExpenseGroups(m: CashflowForecastMonth): number {
  let total = 0
  for (const g of m.expense_groups) {
    total += g.subtotal
  }
  return total
}

function sumCogsLines(m: CashflowForecastMonth): number {
  let total = 0
  for (const l of m.cogs_lines) {
    total += l.value
  }
  return total
}

export function transformCashflowToChartData(data: CashflowForecastData): CashflowChartDataPoint[] {
  return data.months.map((m) => ({
    monthLabel: m.monthLabel,
    month: m.month,
    source: m.source,
    income: m.cash_inflows,
    otherIncome: m.other_inflows,
    costOfSales: -Math.abs(sumCogsLines(m)),
    expenses: -Math.abs(sumExpenseGroups(m)),
    liabilities: -Math.abs(m.movement_in_liabilities),
    bankAtEnd: m.bank_at_end,
  }))
}
