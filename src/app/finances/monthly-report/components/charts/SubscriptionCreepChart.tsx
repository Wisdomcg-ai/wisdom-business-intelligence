'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import type { SubscriptionDetailData } from '../../types'
import { CHART_COLORS } from './chart-colors'
import { fmtCurrency, fmtAxisTick, ChartCard } from './chart-utils'

export interface SubscriptionCreepDataPoint {
  vendor: string
  prior: number
  current: number
  change: number
}

export function transformSubscriptionCreepData(data: SubscriptionDetailData): SubscriptionCreepDataPoint[] {
  const vendorMap = new Map<string, { prior: number; current: number }>()

  for (const account of data.accounts) {
    for (const vendor of account.vendors) {
      const existing = vendorMap.get(vendor.vendor_name) || { prior: 0, current: 0 }
      existing.prior += vendor.prior_month_actual
      existing.current += vendor.actual
      vendorMap.set(vendor.vendor_name, existing)
    }
  }

  const result: SubscriptionCreepDataPoint[] = []
  for (const [vendor, { prior, current }] of vendorMap) {
    result.push({
      vendor,
      prior,
      current,
      change: current - prior,
    })
  }

  // Sort by largest absolute change, take top 10
  result.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  return result.slice(0, 10)
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload as SubscriptionCreepDataPoint
  if (!data) return null
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-1">{data.vendor}</p>
      <div className="space-y-0.5">
        <p className="text-gray-500">Prior: {fmtCurrency(data.prior)}</p>
        <p className="text-gray-500">Current: {fmtCurrency(data.current)}</p>
        <p className={data.change > 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
          Change: {data.change >= 0 ? '+' : ''}{fmtCurrency(data.change)}
        </p>
      </div>
    </div>
  )
}

interface Props {
  subscriptionDetail: SubscriptionDetailData
}

export default function SubscriptionCreepChart({ subscriptionDetail }: Props) {
  const data = transformSubscriptionCreepData(subscriptionDetail)
  if (data.length === 0) return null

  return (
    <ChartCard title="Subscription Creep" subtitle="Top vendors by month-over-month change" tooltip="Highlights which subscriptions and software costs have changed the most since last month. Red bars flag vendors where spending increased. Small increases across many vendors can quietly add up — this chart makes that visible.">
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" tickFormatter={fmtAxisTick} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="vendor" tick={{ fontSize: 10 }} width={95} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="prior" name="Prior Month" fill={CHART_COLORS.prior.hex} barSize={14} radius={[0, 2, 2, 0]} />
          <Bar dataKey="current" name="Current Month" barSize={14} radius={[0, 2, 2, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.change > 0 ? CHART_COLORS.negative.hex : CHART_COLORS.current.hex} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
