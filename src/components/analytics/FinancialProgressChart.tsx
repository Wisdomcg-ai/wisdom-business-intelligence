'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'

interface FinancialProgressChartProps {
  data: Array<{
    goal: string
    target: number
    current: number
    progress: number
  }>
}

export default function FinancialProgressChart({ data }: FinancialProgressChartProps) {
  const getBarColor = (progress: number) => {
    if (progress >= 100) return '#10B981' // Green
    if (progress >= 75) return '#3B82F6' // Blue
    if (progress >= 50) return '#F59E0B' // Orange
    return '#EF4444' // Red
  }

  const formattedData = data.map(item => ({
    ...item,
    targetLabel: formatCurrency(item.target),
    currentLabel: formatCurrency(item.current)
  }))

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Goal Progress</h3>
      <p className="text-sm text-gray-600 mb-6">Current performance vs targets</p>

      {data.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={formattedData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                type="number"
                stroke="#6B7280"
                style={{ fontSize: '12px' }}
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
              />
              <YAxis
                type="category"
                dataKey="goal"
                stroke="#6B7280"
                style={{ fontSize: '12px' }}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
                formatter={(value: number, name: string, props: any) => {
                  if (name === 'Progress') {
                    return [
                      `${value}% (${props.payload.currentLabel} / ${props.payload.targetLabel})`,
                      'Progress'
                    ]
                  }
                  return value
                }}
              />
              <Bar
                dataKey="progress"
                name="Progress"
                radius={[0, 4, 4, 0]}
              >
                {formattedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.progress)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.map((item, idx) => (
              <div key={idx} className="text-sm">
                <div className="font-medium text-gray-900">{item.goal}</div>
                <div className="text-gray-600">
                  {formatCurrency(item.current)} / {formatCurrency(item.target)}
                </div>
                <div className={`font-semibold ${item.progress >= 75 ? 'text-green-600' : 'text-brand-orange-600'}`}>
                  {item.progress}%
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">
          No financial goals set yet
        </div>
      )}
    </div>
  )
}

function formatCurrency(value: number) {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`
  }
  return `$${value.toFixed(0)}`
}
