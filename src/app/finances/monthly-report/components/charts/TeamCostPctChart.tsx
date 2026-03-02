'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ReferenceArea,
} from 'recharts'
import type { FullYearReport } from '../../types'
import { CHART_COLORS } from './chart-colors'
import { fmtCurrency, fmtAxisTick, getMonthLabel, ChartCard } from './chart-utils'

export interface TeamCostDataPoint {
  monthLabel: string
  month: string
  wages: number
  revenue: number
  pctOfRevenue: number
  source: 'actual' | 'forecast'
}

export function transformTeamCostData(report: FullYearReport, wagesAccountNames: string[]): TeamCostDataPoint[] {
  const revSection = report.sections.find(s => s.category === 'Revenue')
  if (!revSection) return []

  // Find wage lines across all sections
  const wageNames = new Set(wagesAccountNames.map(n => n.toLowerCase()))

  return report.gross_profit.months.map((gpMonth, i) => {
    const isActual = gpMonth.source === 'actual'
    const revenue = isActual
      ? (revSection.subtotal.months[i]?.actual || 0)
      : (revSection.subtotal.months[i]?.budget || 0)

    let wages = 0
    for (const section of report.sections) {
      for (const line of section.lines) {
        if (wageNames.has(line.account_name.toLowerCase())) {
          wages += isActual
            ? (line.months[i]?.actual || 0)
            : (line.months[i]?.budget || 0)
        }
      }
    }

    const pctOfRevenue = revenue !== 0 ? (wages / revenue) * 100 : 0

    return {
      monthLabel: getMonthLabel(gpMonth.month),
      month: gpMonth.month,
      wages,
      revenue,
      pctOfRevenue,
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
          <span className="font-medium">
            {entry.dataKey === 'pctOfRevenue' ? `${(entry.value as number).toFixed(1)}%` : fmtCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

interface Props {
  fullYearReport: FullYearReport
  wagesAccountNames: string[]
}

export default function TeamCostPctChart({ fullYearReport, wagesAccountNames }: Props) {
  const data = transformTeamCostData(fullYearReport, wagesAccountNames)
  if (data.length === 0 || wagesAccountNames.length === 0) return null

  const lastActualIdx = data.reduce((acc, d, i) => d.source === 'actual' ? i : acc, -1)
  const firstForecastLabel = lastActualIdx < data.length - 1 ? data[lastActualIdx + 1]?.monthLabel : null
  const lastForecastLabel = data[data.length - 1]?.monthLabel

  return (
    <ChartCard title="Team Cost as % of Revenue" subtitle="Monthly wages spend vs percentage of revenue" tooltip="Shows how much of your revenue goes to paying your team. The bars show the dollar amount, and the line shows the percentage. If the percentage is climbing while revenue is flat, your team costs are growing faster than your income — worth investigating.">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tickFormatter={fmtAxisTick} tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip content={<CustomTooltip />} />
          {firstForecastLabel && lastForecastLabel && (
            <ReferenceArea x1={firstForecastLabel} x2={lastForecastLabel} fill="#f8fafc" fillOpacity={0.8} label={{ value: 'Forecast', position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
          )}
          {firstForecastLabel && (
            <ReferenceLine x={firstForecastLabel} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
          )}
          <Legend />
          <Bar yAxisId="left" dataKey="wages" name="Wages" fill={CHART_COLORS.wages.hex} barSize={20} radius={[2, 2, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="pctOfRevenue" name="% of Revenue" stroke={CHART_COLORS.ratio.hex} strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
