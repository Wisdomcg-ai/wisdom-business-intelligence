'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ClientLayout from '@/components/client/ClientLayout'
import SessionFrequencyChart from '@/components/analytics/SessionFrequencyChart'
import ActionCompletionChart from '@/components/analytics/ActionCompletionChart'
import FinancialProgressChart from '@/components/analytics/FinancialProgressChart'
import HealthScoreGauge from '@/components/analytics/HealthScoreGauge'
import { TrendingUp, Calendar, CheckCircle, Target, Loader2 } from 'lucide-react'
import { useBusinessContext } from '@/hooks/useBusinessContext'

interface Analytics {
  overview: {
    totalSessions: number
    completedSessions: number
    totalActions: number
    completedActions: number
    actionCompletionRate: number
    avgSessionGap: number | null
    healthScore: number
  }
  charts: {
    sessionsByMonth: Array<{ month: string; sessions: number }>
    actionCompletionData: Array<{ month: string; total: number; completed: number; completionRate: number }>
    financialProgress: Array<{ goal: string; target: number; current: number; progress: number }>
  }
}

export default function ClientAnalyticsPage() {
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [businessId, setBusinessId] = useState<string | null>(null)

  useEffect(() => {
    if (!contextLoading) {
      loadAnalytics()
    }
  }, [contextLoading, activeBusiness?.id])

  async function loadAnalytics() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Use activeBusiness if viewing as coach, otherwise get user's own business
    let bizId: string | null = null
    if (activeBusiness?.id) {
      bizId = activeBusiness.id
    } else {
      const { data: businessData } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      bizId = businessData?.id || null
    }

    if (!bizId) {
      setLoading(false)
      return
    }

    setBusinessId(bizId)

    // Get analytics data
    const res = await fetch(`/api/analytics/client/${bizId}`)
    const data = await res.json()

    if (data.success) {
      setAnalytics(data.analytics)
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading analytics...</p>
          </div>
        </div>
      </ClientLayout>
    )
  }

  if (!analytics) {
    return (
      <ClientLayout>
        <div className="text-center py-12">
          <Target className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Analytics Yet</h2>
          <p className="text-gray-600">Complete some sessions and actions to see your progress!</p>
        </div>
      </ClientLayout>
    )
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics & Insights</h1>
          <p className="text-sm text-gray-600 mt-1">Track your progress and measure your success</p>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Sessions */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-teal-100 rounded-lg">
                <Calendar className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Sessions</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalSessions}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              {analytics.overview.completedSessions} completed
            </p>
          </div>

          {/* Action Completion */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Completion Rate</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.overview.actionCompletionRate}%</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              {analytics.overview.completedActions} of {analytics.overview.totalActions} actions
            </p>
          </div>

          {/* Average Session Gap */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Session Frequency</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analytics.overview.avgSessionGap ? `${analytics.overview.avgSessionGap}d` : 'N/A'}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500">Average days between sessions</p>
          </div>

          {/* Health Score */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Target className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Health Score</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.overview.healthScore}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">Overall progress indicator</p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Health Score Gauge */}
          <div className="lg:col-span-1">
            <HealthScoreGauge score={analytics.overview.healthScore} />
          </div>

          {/* Session Frequency */}
          <div className="lg:col-span-2">
            <SessionFrequencyChart data={analytics.charts.sessionsByMonth} />
          </div>
        </div>

        {/* Action Completion Chart */}
        <ActionCompletionChart data={analytics.charts.actionCompletionData} />

        {/* Financial Progress */}
        {analytics.charts.financialProgress.length > 0 && (
          <FinancialProgressChart data={analytics.charts.financialProgress} />
        )}

        {/* Insights Section */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg p-6 text-white">
          <h3 className="text-lg font-semibold mb-4">Key Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
              <p className="text-sm font-medium mb-2">Session Consistency</p>
              <p className="text-sm opacity-90">
                {analytics.overview.avgSessionGap
                  ? analytics.overview.avgSessionGap <= 14
                    ? 'Great job maintaining regular sessions!'
                    : 'Consider booking more frequent sessions for better results.'
                  : 'Book more sessions to track consistency.'}
              </p>
            </div>

            <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
              <p className="text-sm font-medium mb-2">Action Follow-Through</p>
              <p className="text-sm opacity-90">
                {analytics.overview.actionCompletionRate >= 75
                  ? 'Excellent! You\'re crushing your action items.'
                  : analytics.overview.actionCompletionRate >= 50
                  ? 'Good progress! Keep completing those actions.'
                  : 'Focus on completing your action items for better results.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  )
}
