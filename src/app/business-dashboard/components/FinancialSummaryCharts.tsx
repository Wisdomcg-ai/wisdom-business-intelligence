'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { useXeroActuals } from '../hooks/useXeroActuals'
import type { MonthlyChartPoint } from '../hooks/useXeroActuals'

interface FinancialSummaryChartsProps {
  businessId: string | undefined
}

function formatAxisTick(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function formatTooltipValue(v: number): string {
  return `$${v.toLocaleString()}`
}

interface ChartCardProps {
  title: string
  data: MonthlyChartPoint[]
  actualKey: keyof MonthlyChartPoint
  forecastKey: keyof MonthlyChartPoint
}

function ChartCard({ title, data, actualKey, forecastKey }: ChartCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={formatAxisTick}
            width={55}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number) => [formatTooltipValue(value), '']}
            contentStyle={{ fontSize: 12, borderRadius: '8px', border: '1px solid #e5e7eb' }}
          />
          {/* Forecast area rendered first so actual overlays on top */}
          <Area
            type="monotone"
            dataKey={forecastKey as string}
            name="Forecast"
            stroke="#94a3b8"
            fill="#f1f5f9"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey={actualKey as string}
            name="Actual"
            stroke="#f97316"
            fill="#fed7aa"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      {/* Inline legend */}
      <div className="flex items-center gap-4 mt-2 justify-end">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" />
          <span className="text-xs text-gray-500">Actual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" />
          <span className="text-xs text-gray-500">Forecast</span>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-[220px]">
      <div className="h-4 w-20 bg-gray-200 rounded mb-4" />
      <div className="h-full bg-gray-100 rounded" />
    </div>
  )
}

export function FinancialSummaryCharts({ businessId }: FinancialSummaryChartsProps) {
  const { chartData, lastSyncedAt, isLoading, hasData } = useXeroActuals(businessId)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (!hasData || !chartData) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p className="text-sm">
          No Xero data yet &mdash; complete your forecast wizard and sync Xero to see financial charts.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="Revenue"
          data={chartData}
          actualKey="revenueActual"
          forecastKey="revenueForecast"
        />
        <ChartCard
          title="Gross Profit"
          data={chartData}
          actualKey="gpActual"
          forecastKey="gpForecast"
        />
        <ChartCard
          title="Net Profit"
          data={chartData}
          actualKey="npActual"
          forecastKey="npForecast"
        />
      </div>
      {lastSyncedAt && (
        <p className="text-xs text-gray-400 text-right mt-2">
          Last synced: {new Date(lastSyncedAt).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </p>
      )}
    </div>
  )
}
