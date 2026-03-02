'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { WagesDetailData } from '../../types'
import { CHART_COLORS } from './chart-colors'
import { fmtCurrency, fmtAxisTick, ChartCard } from './chart-utils'

export interface CostPerEmployeeDataPoint {
  name: string
  total: number
}

export function transformCostPerEmployeeData(data: WagesDetailData): { employees: CostPerEmployeeDataPoint[]; average: number } {
  const employees = data.employees
    .filter(e => e.actual_total > 0)
    .map(e => ({
      name: e.name,
      total: e.actual_total,
    }))
    .sort((a, b) => b.total - a.total)

  const average = employees.length > 0
    ? employees.reduce((sum, e) => sum + e.total, 0) / employees.length
    : 0

  return { employees, average }
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-1">{payload[0]?.payload?.name}</p>
      <p className="text-gray-600">{fmtCurrency(payload[0]?.value)}</p>
    </div>
  )
}

interface Props {
  wagesDetail: WagesDetailData
}

export default function CostPerEmployeeChart({ wagesDetail }: Props) {
  const { employees, average } = transformCostPerEmployeeData(wagesDetail)
  if (employees.length === 0) return null

  return (
    <ChartCard title="Cost per Employee" subtitle={`Average: ${fmtCurrency(average)} per employee this month`} tooltip="Compares the total cost of each team member side by side. The dashed line shows the average. This helps you spot if any individual is significantly over or under budget, or if costs are evenly distributed across the team.">
      <ResponsiveContainer width="100%" height={Math.max(200, employees.length * 36 + 40)}>
        <BarChart data={employees} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" tickFormatter={fmtAxisTick} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine x={average} stroke={CHART_COLORS.negative.hex} strokeDasharray="5 5" label={{ value: 'Avg', position: 'top', fontSize: 10 }} />
          <Bar dataKey="total" name="Total Paid" fill={CHART_COLORS.wages.hex} barSize={18} radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
