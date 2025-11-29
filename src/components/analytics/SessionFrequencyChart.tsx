'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface SessionFrequencyChartProps {
  data: Array<{
    month: string
    sessions: number
  }>
}

export default function SessionFrequencyChart({ data }: SessionFrequencyChartProps) {
  // Format month for display (2024-01 -> Jan '24)
  const formattedData = data.map(item => ({
    ...item,
    monthLabel: formatMonth(item.month)
  }))

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Frequency</h3>
      <p className="text-sm text-gray-600 mb-6">Number of coaching sessions per month</p>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={formattedData}>
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
          />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
          />
          <Line
            type="monotone"
            dataKey="sessions"
            name="Sessions"
            stroke="#2563EB"
            strokeWidth={2}
            dot={{ fill: '#2563EB', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {data.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No session data available yet
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
