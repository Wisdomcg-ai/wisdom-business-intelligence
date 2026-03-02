'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import type { GeneratedReport } from '../../types'
import { CHART_COLORS } from './chart-colors'
import { fmtCurrency, fmtAxisTick, ChartCard } from './chart-utils'

export interface WaterfallStep {
  name: string
  start: number
  end: number
  value: number
  type: 'increase' | 'decrease' | 'total'
}

export function transformWaterfallData(report: GeneratedReport): WaterfallStep[] {
  const s = report.summary
  const otherIncomeSection = report.sections.find(sec => sec.category === 'Other Income')
  const otherExpensesSection = report.sections.find(sec => sec.category === 'Other Expenses')

  const otherIncome = otherIncomeSection?.subtotal.actual || 0
  const otherExpenses = otherExpensesSection?.subtotal.actual || 0
  const opActual = s.gross_profit.actual - s.opex.actual

  const steps: WaterfallStep[] = []
  let running = 0

  // Revenue
  steps.push({ name: 'Revenue', start: 0, end: s.revenue.actual, value: s.revenue.actual, type: 'increase' })
  running = s.revenue.actual

  // COGS
  steps.push({ name: 'COGS', start: running, end: running - s.cogs.actual, value: -s.cogs.actual, type: 'decrease' })
  running -= s.cogs.actual

  // Gross Profit (subtotal)
  steps.push({ name: 'Gross Profit', start: 0, end: s.gross_profit.actual, value: s.gross_profit.actual, type: 'total' })

  // OpEx
  steps.push({ name: 'OpEx', start: running, end: running - s.opex.actual, value: -s.opex.actual, type: 'decrease' })
  running -= s.opex.actual

  // Operating Profit (subtotal)
  steps.push({ name: 'Op. Profit', start: 0, end: opActual, value: opActual, type: 'total' })

  // Other Income (if exists)
  if (otherIncome !== 0) {
    steps.push({ name: 'Other Inc', start: running, end: running + otherIncome, value: otherIncome, type: 'increase' })
    running += otherIncome
  }

  // Other Expenses (if exists)
  if (otherExpenses !== 0) {
    steps.push({ name: 'Other Exp', start: running, end: running - otherExpenses, value: -otherExpenses, type: 'decrease' })
    running -= otherExpenses
  }

  // Net Profit (subtotal)
  steps.push({ name: 'Net Profit', start: 0, end: s.net_profit.actual, value: s.net_profit.actual, type: 'total' })

  return steps
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload as WaterfallStep
  if (!data) return null
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-1">{data.name}</p>
      <p className={data.value >= 0 ? 'text-green-600' : 'text-red-600'}>
        {fmtCurrency(data.value)}
      </p>
    </div>
  )
}

interface Props {
  report: GeneratedReport
}

export default function ExpenseWaterfallChart({ report }: Props) {
  const data = transformWaterfallData(report)
  if (data.length === 0) return null

  // Transform for Recharts: invisible base + visible bar
  const chartData = data.map(step => ({
    name: step.name,
    base: Math.min(step.start, step.end),
    value: Math.abs(step.end - step.start),
    type: step.type,
    rawValue: step.value,
  }))

  const getColor = (type: string, rawValue: number) => {
    if (type === 'total') return CHART_COLORS.subtotal.hex
    return rawValue >= 0 ? CHART_COLORS.positive.hex : CHART_COLORS.negative.hex
  }

  return (
    <ChartCard title="Expense Waterfall" subtitle="How revenue flows to net profit" tooltip="Traces the path from revenue to net profit step by step. Green bars add money (income), red bars take it away (costs), and blue bars show subtotals. This helps you see which cost categories have the biggest impact on your bottom line.">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={fmtAxisTick} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#9ca3af" />
          <Bar dataKey="base" stackId="waterfall" fill="transparent" />
          <Bar dataKey="value" stackId="waterfall" radius={[2, 2, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry.type, entry.rawValue)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 justify-center mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.positive.hex }} /> Increase</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.negative.hex }} /> Decrease</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.subtotal.hex }} /> Subtotal</span>
      </div>
    </ChartCard>
  )
}
