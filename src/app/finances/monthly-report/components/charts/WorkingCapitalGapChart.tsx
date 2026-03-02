'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import { CHART_COLORS } from './chart-colors'
import { ChartCard } from './chart-utils'

export interface WorkingCapitalDataPoint {
  monthLabel: string
  month: string
  dsoDays: number
  dpoDays: number
  gap: number
}

export function transformWorkingCapitalData(data: CashflowForecastData): WorkingCapitalDataPoint[] {
  const dsoDays = data.assumptions.dso_days
  const dpoDays = data.assumptions.dpo_days

  return data.months.map(m => ({
    monthLabel: m.monthLabel,
    month: m.month,
    dsoDays,
    dpoDays,
    gap: dsoDays - dpoDays,
  }))
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-600">{entry.name}</span>
          </span>
          <span className="font-medium">{entry.value} days</span>
        </div>
      ))}
    </div>
  )
}

interface Props {
  cashflowForecast: CashflowForecastData
}

export default function WorkingCapitalGapChart({ cashflowForecast }: Props) {
  const data = transformWorkingCapitalData(cashflowForecast)
  if (data.length === 0) return null

  const gap = data[0]?.gap || 0

  return (
    <ChartCard
      title="Working Capital Gap"
      subtitle={`DSO ${data[0]?.dsoDays || 0} days vs DPO ${data[0]?.dpoDays || 0} days = ${gap >= 0 ? '+' : ''}${gap} day gap`}
      tooltip="Compares how quickly you get paid by customers (DSO) vs how quickly you pay suppliers (DPO). If DSO is higher than DPO, you're paying out before money comes in — that gap needs to be funded from your cash reserves. A smaller or negative gap is better for cash flow."
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} label={{ value: 'Days', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="dsoDays" name="DSO (Days Sales Outstanding)" fill={CHART_COLORS.wages.hex} barSize={20} radius={[2, 2, 0, 0]} />
          <Bar dataKey="dpoDays" name="DPO (Days Payable Outstanding)" fill={CHART_COLORS.warning.hex} barSize={20} radius={[2, 2, 0, 0]} />
          <Line type="monotone" dataKey="gap" name="Gap (DSO - DPO)" stroke={CHART_COLORS.negative.hex} strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
