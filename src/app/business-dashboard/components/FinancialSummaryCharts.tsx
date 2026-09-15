'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertTriangle, BarChart3 } from 'lucide-react'
import { useXeroActuals } from '../hooks/useXeroActuals'
import type { MonthlyChartPoint } from '../hooks/useXeroActuals'
import type { XeroBusinessDataClock } from '@/lib/xero/connection-status'

interface FinancialSummaryChartsProps {
  businessId: string | undefined
  refreshTrigger?: number
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

function formatSyncDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * The "Last synced" line under the charts, or null when there is no Xero
 * connection to speak of.
 *
 * The date is the stalest org's (businessDataClock), because the charts add up
 * every org. When the orgs would print different dates, the line says whose date
 * it is — "(IICT Group Pty Ltd)" or "(2 of 3 orgs)" — so a sync that reached
 * every org but one does not look as though it did nothing. A failed check says
 * so and is never shown as a date or as "not yet".
 */
function describeLastSync(clock: XeroBusinessDataClock): { text: string; checkFailed: boolean } | null {
  if (clock.status === 'none') return null
  if (clock.status === 'unknown') return { text: "Last synced: couldn't check", checkFailed: true }

  const shown = (at: string | null) => (at === null ? 'not yet' : formatSyncDate(at))
  const headline = clock.status === 'synced' ? shown(clock.lastSyncAt) : shown(null)
  const sharing = clock.orgs.filter((org) => shown(org.lastSyncAt) === headline)
  let scope: string | null = null
  if (sharing.length > 0 && sharing.length < clock.orgs.length) {
    scope =
      sharing.length === 1 && sharing[0].tenantName
        ? sharing[0].tenantName
        : `${sharing.length} of ${clock.orgs.length} orgs`
  }
  return { text: `Last synced: ${headline}${scope ? ` (${scope})` : ''}`, checkFailed: false }
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-[220px]">
      <div className="h-4 w-20 bg-gray-200 rounded mb-4" />
      <div className="h-full bg-gray-100 rounded" />
    </div>
  )
}

export function FinancialSummaryCharts({ businessId, refreshTrigger }: FinancialSummaryChartsProps) {
  const { chartData, lastSync, isLoading, hasData, loadFailed } = useXeroActuals(businessId, refreshTrigger)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  // A failed load is not "no data yet": that message tells the owner to go and
  // set something up, which is wrong when the figures simply did not load.
  if (loadFailed) {
    return (
      <div role="alert" className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-amber-800">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
        <p className="text-sm">Couldn&apos;t load the financial charts just now. Refresh the page to try again.</p>
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

  const syncLine = lastSync ? describeLastSync(lastSync) : null

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
      {syncLine && (
        <p
          className={`text-xs text-right mt-2 ${syncLine.checkFailed ? 'text-amber-700' : 'text-gray-400'}`}
          title={
            syncLine.checkFailed
              ? "We couldn't check when Xero last updated these figures. This is not a confirmation that they are current."
              : undefined
          }
        >
          {syncLine.text}
        </p>
      )}
    </div>
  )
}
