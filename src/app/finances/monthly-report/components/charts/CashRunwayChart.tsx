'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import { CHART_COLORS } from './chart-colors'
import { ChartCard } from './chart-utils'

export interface CashRunwayDataPoint {
  monthLabel: string
  month: string
  weeksOfCash: number
  source: 'actual' | 'forecast'
}

export function transformCashRunwayData(data: CashflowForecastData): CashRunwayDataPoint[] {
  return data.months.map(m => {
    const weeklyOutflow = m.cash_outflows / 4.33
    const weeksOfCash = weeklyOutflow > 0 ? Math.max(0, m.bank_at_end / weeklyOutflow) : m.bank_at_end > 0 ? 52 : 0
    return {
      monthLabel: m.monthLabel,
      month: m.month,
      weeksOfCash: Math.min(weeksOfCash, 52),
      source: m.source,
    }
  })
}

function getRunwayColor(weeks: number): string {
  if (weeks >= 13) return CHART_COLORS.positive.hex
  if (weeks >= 8) return CHART_COLORS.warning.hex
  return CHART_COLORS.negative.hex
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const weeks = payload[0].value as number
  const source = payload[0]?.payload?.source
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-1">
        {label}
        {source === 'forecast' && <span className="ml-1.5 text-gray-400 font-normal">(Forecast)</span>}
      </p>
      <p style={{ color: getRunwayColor(weeks) }}>
        {weeks.toFixed(1)} weeks of cash
      </p>
    </div>
  )
}

interface Props {
  cashflowForecast: CashflowForecastData
}

export default function CashRunwayChart({ cashflowForecast }: Props) {
  const data = transformCashRunwayData(cashflowForecast)
  if (data.length === 0) return null

  const lastActualIdx = data.reduce((acc, d, i) => d.source === 'actual' ? i : acc, -1)
  const firstForecastLabel = lastActualIdx < data.length - 1 ? data[lastActualIdx + 1]?.monthLabel : null
  const lastForecastLabel = data[data.length - 1]?.monthLabel

  return (
    <ChartCard title="Cash Runway" subtitle="Weeks of cash remaining based on current outflow rate" tooltip="How many weeks your business could keep running if no more money came in, based on your current spending rate. Above 13 weeks (green zone) is healthy. Below 8 weeks (red zone) means cash is getting tight and you should plan ahead.">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="cashRunwayGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.positive.hex} stopOpacity={0.3} />
              <stop offset="95%" stopColor={CHART_COLORS.positive.hex} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} label={{ value: 'Weeks', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
          <Tooltip content={<CustomTooltip />} />
          {firstForecastLabel && lastForecastLabel && (
            <ReferenceArea x1={firstForecastLabel} x2={lastForecastLabel} fill="#f8fafc" fillOpacity={0.8} label={{ value: 'Forecast', position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
          )}
          {firstForecastLabel && (
            <ReferenceLine x={firstForecastLabel} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
          )}
          <ReferenceLine y={13} stroke={CHART_COLORS.positive.hex} strokeDasharray="5 5" label={{ value: '13 weeks', position: 'right', fontSize: 10 }} />
          <ReferenceLine y={8} stroke={CHART_COLORS.warning.hex} strokeDasharray="5 5" label={{ value: '8 weeks', position: 'right', fontSize: 10 }} />
          <Area type="monotone" dataKey="weeksOfCash" name="Weeks of Cash" stroke={CHART_COLORS.positive.hex} fill="url(#cashRunwayGradient)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
