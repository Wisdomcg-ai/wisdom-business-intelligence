'use client'

import { useEffect, useState } from 'react'
import { Users, Calendar, CheckCircle, TrendingUp, Loader2, BarChart3 } from 'lucide-react'
import SessionFrequencyChart from '@/components/analytics/SessionFrequencyChart'
import ActionCompletionChart from '@/components/analytics/ActionCompletionChart'
import ClientEngagementChart from '@/components/analytics/ClientEngagementChart'

interface CoachAnalytics {
  overview: {
    totalClients: number
    activeClients: number
    totalSessions: number
    totalActions: number
    completedActions: number
    overallCompletionRate: number
    avgResponseTime: number | null
  }
  charts: {
    sessionsOverTime: Array<{ month: string; sessions: number }>
    clientEngagement: Array<{
      clientName: string
      sessions: number
      actions: number
      completionRate: number
      engagement: number
    }>
    actionCompletion: Array<{
      month: string
      total: number
      completed: number
      rate: number
    }>
  }
}

export default function CoachAnalyticsPage() {
  const [analytics, setAnalytics] = useState<CoachAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAnalytics()
  }, [])

  async function loadAnalytics() {
    setLoading(true)

    const res = await fetch('/api/analytics/coach')
    const data = await res.json()

    if (data.success) {
      setAnalytics(data.analytics)
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">No Analytics Yet</h2>
        <p className="text-gray-600">Start coaching clients to see your performance metrics!</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Coach Performance Analytics</h1>
        <p className="text-sm text-gray-600 mt-1">Track your coaching impact and client engagement</p>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Clients */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-teal-100 rounded-lg">
              <Users className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Clients</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalClients}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {analytics.overview.activeClients} active
          </p>
        </div>

        {/* Total Sessions */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalSessions}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">Last 12 months</p>
        </div>

        {/* Action Completion */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Action Completion</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.overallCompletionRate}%</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {analytics.overview.completedActions} of {analytics.overview.totalActions} completed
          </p>
        </div>

        {/* Response Time */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Avg Session Gap</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics.overview.avgResponseTime ? `${analytics.overview.avgResponseTime}d` : 'N/A'}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500">Days between sessions</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Session Frequency */}
        <SessionFrequencyChart data={analytics.charts.sessionsOverTime} />

        {/* Action Completion Over Time */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Action Completion Trend</h3>
          <p className="text-sm text-gray-600 mb-6">Completion rate percentage over time</p>

          {analytics.charts.actionCompletion.length > 0 ? (
            <div className="space-y-3">
              {analytics.charts.actionCompletion.map((item, idx) => {
                const monthLabel = formatMonth(item.month)
                return (
                  <div key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{monthLabel}</span>
                      <span className="font-medium text-gray-900">{item.rate}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          item.rate >= 75 ? 'bg-green-500' :
                          item.rate >= 50 ? 'bg-teal-500' :
                          'bg-orange-500'
                        }`}
                        style={{ width: `${item.rate}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {item.completed} / {item.total} actions
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              No action data available yet
            </div>
          )}
        </div>
      </div>

      {/* Client Engagement */}
      <ClientEngagementChart data={analytics.charts.clientEngagement} />

      {/* Performance Insights */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">Performance Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <p className="text-sm font-medium mb-2">Client Growth</p>
            <p className="text-sm opacity-90">
              {analytics.overview.activeClients >= 5
                ? 'Strong client base! Consider expanding your capacity.'
                : 'Growing your practice. Keep building relationships!'}
            </p>
          </div>

          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <p className="text-sm font-medium mb-2">Session Frequency</p>
            <p className="text-sm opacity-90">
              {analytics.overview.avgResponseTime && analytics.overview.avgResponseTime <= 14
                ? 'Excellent session cadence with clients!'
                : 'Consider more frequent sessions for better outcomes.'}
            </p>
          </div>

          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <p className="text-sm font-medium mb-2">Client Accountability</p>
            <p className="text-sm opacity-90">
              {analytics.overview.overallCompletionRate >= 70
                ? 'Clients are highly engaged and following through!'
                : 'Focus on helping clients with action item accountability.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatMonth(monthStr: string) {
  const [year, month] = monthStr.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
