'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'

interface ClientEngagementChartProps {
  data: Array<{
    clientName: string
    sessions: number
    actions: number
    completionRate: number
    engagement: number
  }>
}

export default function ClientEngagementChart({ data }: ClientEngagementChartProps) {
  const getEngagementColor = (engagement: number) => {
    if (engagement >= 80) return '#10B981' // Green
    if (engagement >= 60) return '#3B82F6' // Blue
    if (engagement >= 40) return '#F59E0B' // Orange
    return '#EF4444' // Red
  }

  // Limit to top 10 clients for readability
  const topClients = data.slice(0, 10)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Client Engagement</h3>
      <p className="text-sm text-gray-600 mb-6">Engagement score based on sessions, actions, and completion rates</p>

      {topClients.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={topClients} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                type="number"
                stroke="#6B7280"
                style={{ fontSize: '12px' }}
                domain={[0, 100]}
              />
              <YAxis
                type="category"
                dataKey="clientName"
                stroke="#6B7280"
                style={{ fontSize: '12px' }}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
                formatter={(value: number, name: string, props: any) => {
                  if (name === 'Engagement Score') {
                    return [
                      `${value}/100 (${props.payload.sessions} sessions, ${props.payload.completionRate}% completion)`,
                      'Engagement'
                    ]
                  }
                  return value
                }}
              />
              <Bar
                dataKey="engagement"
                name="Engagement Score"
                radius={[0, 4, 4, 0]}
              >
                {topClients.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getEngagementColor(entry.engagement)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Detailed breakdown */}
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Sessions</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Completion</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {topClients.map((client, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900">{client.clientName}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 text-center">{client.sessions}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 text-center">{client.actions}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 text-center">{client.completionRate}%</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                        client.engagement >= 80 ? 'bg-green-100 text-green-700' :
                        client.engagement >= 60 ? 'bg-teal-100 text-teal-700' :
                        client.engagement >= 40 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {client.engagement}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">
          No client data available yet
        </div>
      )}
    </div>
  )
}
