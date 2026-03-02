'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import { CHART_COLORS } from './chart-colors'
import { fmtCurrency, fmtAxisTick, ChartCard } from './chart-utils'

export interface CumulativeNetCashDataPoint {
  monthLabel: string
  month: string
  cumulative: number
  source: 'actual' | 'forecast'
}

export function transformCumulativeNetCashData(data: CashflowForecastData): CumulativeNetCashDataPoint[] {
  let running = 0
  return data.months.map(m => {
    running += m.net_movement
    return {
      monthLabel: m.monthLabel,
      month: m.month,
      cumulative: running,
      source: m.source,
    }
  })
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const value = payload[0].value as number
  const source = payload[0]?.payload?.source
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-1">
        {label}
        {source === 'forecast' && <span className="ml-1.5 text-gray-400 font-normal">(Forecast)</span>}
      </p>
      <p style={{ color: value >= 0 ? CHART_COLORS.positive.hex : CHART_COLORS.negative.hex }}>
        {fmtCurrency(value)}
      </p>
    </div>
  )
}

interface Props {
  cashflowForecast: CashflowForecastData
}

export default function CumulativeNetCashChart({ cashflowForecast }: Props) {
  const data = transformCumulativeNetCashData(cashflowForecast)
  if (data.length === 0) return null

  const hasNegative = data.some(d => d.cumulative < 0)

  const lastActualIdx = data.reduce((acc, d, i) => d.source === 'actual' ? i : acc, -1)
  const firstForecastLabel = lastActualIdx < data.length - 1 ? data[lastActualIdx + 1]?.monthLabel : null
  const lastForecastLabel = data[data.length - 1]?.monthLabel

  return (
    <ChartCard title="Cumulative Net Cash" subtitle="Running total of net cash movement over the forecast period" tooltip="Tracks whether your business is generating more cash than it spends over time. When the line is rising, you're building cash. When it dips below zero, you've spent more than you've earned cumulatively — a sign to review spending or boost income.">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="cumNetCashPos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.positive.hex} stopOpacity={0.3} />
              <stop offset="95%" stopColor={CHART_COLORS.positive.hex} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="cumNetCashNeg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.negative.hex} stopOpacity={0.05} />
              <stop offset="95%" stopColor={CHART_COLORS.negative.hex} stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmtAxisTick} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          {firstForecastLabel && lastForecastLabel && (
            <ReferenceArea x1={firstForecastLabel} x2={lastForecastLabel} fill="#f8fafc" fillOpacity={0.8} label={{ value: 'Forecast', position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
          )}
          {firstForecastLabel && (
            <ReferenceLine x={firstForecastLabel} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
          )}
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
          <Area
            type="monotone"
            dataKey="cumulative"
            name="Cumulative Net Cash"
            stroke={hasNegative ? CHART_COLORS.negative.hex : CHART_COLORS.positive.hex}
            fill={hasNegative ? 'url(#cumNetCashNeg)' : 'url(#cumNetCashPos)'}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
