'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ReferenceArea,
} from 'recharts'
import type { FullYearReport } from '../../types'
import { CHART_COLORS } from './chart-colors'
import { fmtCurrency, fmtAxisTick, getMonthLabel, ChartCard } from './chart-utils'

export interface RevenueVsExpensesDataPoint {
  month: string
  monthLabel: string
  revenue: number
  expenses: number
  source: 'actual' | 'forecast'
}

export function transformRevenueVsExpensesData(report: FullYearReport): RevenueVsExpensesDataPoint[] {
  const revSection = report.sections.find(s => s.category === 'Revenue')
  const cogsSection = report.sections.find(s => s.category === 'Cost of Sales')
  const opexSection = report.sections.find(s => s.category === 'Operating Expenses')
  const otherIncSection = report.sections.find(s => s.category === 'Other Income')
  const otherExpSection = report.sections.find(s => s.category === 'Other Expenses')

  return report.gross_profit.months.map((gpMonth, i) => {
    const isActual = gpMonth.source === 'actual'
    const revActual = (revSection?.subtotal.months[i]?.actual || 0) + (otherIncSection?.subtotal.months[i]?.actual || 0)
    const revBudget = (revSection?.subtotal.months[i]?.budget || 0) + (otherIncSection?.subtotal.months[i]?.budget || 0)
    const cogsActual = cogsSection?.subtotal.months[i]?.actual || 0
    const cogsBudget = cogsSection?.subtotal.months[i]?.budget || 0
    const opexActual = (opexSection?.subtotal.months[i]?.actual || 0) + (otherExpSection?.subtotal.months[i]?.actual || 0)
    const opexBudget = (opexSection?.subtotal.months[i]?.budget || 0) + (otherExpSection?.subtotal.months[i]?.budget || 0)

    return {
      month: gpMonth.month,
      monthLabel: getMonthLabel(gpMonth.month),
      revenue: isActual ? revActual : revBudget,
      expenses: isActual ? (cogsActual + opexActual) : (cogsBudget + opexBudget),
      source: gpMonth.source,
    }
  })
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const source = payload[0]?.payload?.source
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-1">
        {label}
        {source === 'forecast' && <span className="ml-1.5 text-gray-400 font-normal">(Forecast)</span>}
      </p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-600">{entry.name}</span>
          </span>
          <span className="font-medium">{fmtCurrency(entry.value ?? 0)}</span>
        </div>
      ))}
      {payload.length === 2 && (
        <div className="border-t border-gray-100 mt-1 pt-1 flex justify-between">
          <span className="text-gray-500">Profit</span>
          <span className="font-medium">{fmtCurrency((payload[0]?.value ?? 0) - (payload[1]?.value ?? 0))}</span>
        </div>
      )}
    </div>
  )
}

interface Props {
  fullYearReport: FullYearReport
}

export default function RevenueVsExpensesTrendChart({ fullYearReport }: Props) {
  const data = transformRevenueVsExpensesData(fullYearReport)
  if (data.length === 0) return null

  // Find the boundary between actual and forecast
  const lastActualIdx = data.reduce((acc, d, i) => d.source === 'actual' ? i : acc, -1)
  const firstForecastLabel = lastActualIdx < data.length - 1 ? data[lastActualIdx + 1]?.monthLabel : null
  const lastForecastLabel = data[data.length - 1]?.monthLabel

  return (
    <ChartCard title="Revenue vs Expenses Trend" subtitle="Monthly revenue and total expenses with profit gap" tooltip="Shows your total income vs total costs each month. The gap between the two lines is your profit. A widening gap means profitability is improving; if the lines cross, you're making a loss that month.">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmtAxisTick} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {firstForecastLabel && lastForecastLabel && (
            <ReferenceArea x1={firstForecastLabel} x2={lastForecastLabel} fill="#f8fafc" fillOpacity={0.8} label={{ value: 'Forecast', position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
          )}
          {firstForecastLabel && (
            <ReferenceLine x={firstForecastLabel} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
          )}
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS.revenue.hex} fill={CHART_COLORS.revenue.hex} fillOpacity={0.3} />
          <Area type="monotone" dataKey="expenses" name="Expenses" stroke={CHART_COLORS.expenses.hex} fill={CHART_COLORS.expenses.hex} fillOpacity={0.3} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
