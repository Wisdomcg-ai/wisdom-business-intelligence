'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface ActionCompletionChartProps {
  data: Array<{
    month: string
    total: number
    completed: number
    completionRate: number
  }>
}

export default function ActionCompletionChart({ data }: ActionCompletionChartProps) {
  const formattedData = data.map(item => ({
    ...item,
    monthLabel: formatMonth(item.month),
    pending: item.total - item.completed
  }))

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Action Item Completion</h3>
      <p className="text-sm text-gray-600 mb-6">Completed vs pending action items per month</p>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="monthLabel"
            stroke="#6B7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="#6B7280"
            style={{ fontSize: '12px' }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              fontSize: '12px'
            }}
            formatter={(value: number, name: string) => {
              if (name === 'Completion Rate') return `${value}%`
              return value
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
          />
          <Bar
            dataKey="completed"
            name="Completed"
            fill="#10B981"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="pending"
            name="Pending"
            fill="#F59E0B"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      {data.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No action data available yet
        </div>
      )}
    </div>
  )
}

function formatMonth(monthStr: string) {
  const [year, month] = monthStr.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
