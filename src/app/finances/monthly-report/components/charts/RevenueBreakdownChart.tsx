'use client'

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { GeneratedReport } from '../../types'
import { CHART_COLORS } from './chart-colors'
import { fmtCurrency, ChartCard } from './chart-utils'

export interface RevenueBreakdownSlice {
  name: string
  value: number
  pctOfRevenue: number
  color: string
}

const SLICE_COLORS = [
  CHART_COLORS.cogs.hex,
  CHART_COLORS.opex.hex,
  CHART_COLORS.otherExpenses.hex,
  CHART_COLORS.positive.hex,
]

export function transformRevenueBreakdownData(report: GeneratedReport): RevenueBreakdownSlice[] {
  const s = report.summary
  const revenue = s.revenue.actual
  if (revenue <= 0) return []

  const otherIncSection = report.sections.find(sec => sec.category === 'Other Income')
  const otherExpSection = report.sections.find(sec => sec.category === 'Other Expenses')
  const otherIncome = otherIncSection?.subtotal.actual || 0
  const otherExpenses = otherExpSection?.subtotal.actual || 0

  const totalIncome = revenue + otherIncome
  if (totalIncome <= 0) return []

  const cogs = s.cogs.actual
  const opex = s.opex.actual
  const profitSlice = totalIncome - cogs - opex - otherExpenses

  const slices: RevenueBreakdownSlice[] = []

  if (cogs > 0) {
    slices.push({
      name: 'Cost of Sales',
      value: cogs,
      pctOfRevenue: (cogs / totalIncome) * 100,
      color: SLICE_COLORS[0],
    })
  }

  if (opex > 0) {
    slices.push({
      name: 'Operating Expenses',
      value: opex,
      pctOfRevenue: (opex / totalIncome) * 100,
      color: SLICE_COLORS[1],
    })
  }

  if (otherExpenses > 0) {
    slices.push({
      name: 'Other Expenses',
      value: otherExpenses,
      pctOfRevenue: (otherExpenses / totalIncome) * 100,
      color: SLICE_COLORS[2],
    })
  }

  slices.push({
    name: profitSlice >= 0 ? 'Profit' : 'Loss',
    value: Math.abs(profitSlice),
    pctOfRevenue: (profitSlice / totalIncome) * 100,
    color: profitSlice >= 0 ? SLICE_COLORS[3] : CHART_COLORS.negative.hex,
  })

  return slices
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload as RevenueBreakdownSlice
  if (!data) return null
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-1">{data.name}</p>
      <p className="text-gray-600">{fmtCurrency(data.value)}</p>
      <p className="text-gray-500">{data.pctOfRevenue.toFixed(1)}% of revenue</p>
    </div>
  )
}

function CustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, pctOfRevenue, name }: any) {
  if (pctOfRevenue < 5) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${pctOfRevenue.toFixed(0)}%`}
    </text>
  )
}

interface Props {
  report: GeneratedReport
}

export default function RevenueBreakdownChart({ report }: Props) {
  const data = transformRevenueBreakdownData(report)
  if (data.length === 0) return null

  return (
    <ChartCard title="Where Your Revenue Goes" subtitle="Breakdown of every dollar earned" tooltip="Shows how each dollar of revenue is split across your cost categories and profit. A larger profit slice means better margins. If one cost area dominates the chart, that's where to focus your cost control efforts.">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data as any[]}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={110}
            paddingAngle={2}
            dataKey="value"
            labelLine={false}
            label={CustomLabel}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value: string, entry: any) => {
              const slice = data.find(d => d.name === value)
              return `${value} (${slice?.pctOfRevenue.toFixed(0)}%)`
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
