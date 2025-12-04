'use client'

import Link from 'next/link'
import {
  TrendingUp,
  TrendingDown,
  Target,
  Calendar,
  ListChecks,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Activity,
  Lightbulb
} from 'lucide-react'

interface RecentActivity {
  id: string
  type: 'session' | 'action' | 'message' | 'goal'
  title: string
  timestamp: string
}

interface IdeasStats {
  total: number
  captured: number
  underReview: number
  approved: number
}

interface OverviewTabProps {
  clientId: string
  businessName: string
  healthScore?: number
  healthTrend?: number
  goalsProgress?: number
  activeGoals?: number
  completedGoals?: number
  upcomingSessions?: number
  lastSessionDate?: string
  nextSessionDate?: string
  pendingActions?: number
  overdueActions?: number
  unreadMessages?: number
  recentActivity?: RecentActivity[]
  ideasStats?: IdeasStats
}

export function OverviewTab({
  clientId,
  businessName,
  healthScore,
  healthTrend,
  goalsProgress,
  activeGoals = 0,
  completedGoals = 0,
  upcomingSessions = 0,
  lastSessionDate,
  nextSessionDate,
  pendingActions = 0,
  overdueActions = 0,
  unreadMessages = 0,
  recentActivity = [],
  ideasStats
}: OverviewTabProps) {

  const getHealthColor = (score?: number) => {
    if (score === undefined) return 'text-gray-400'
    if (score >= 70) return 'text-green-600'
    if (score >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return formatDate(timestamp)
  }

  const getActivityIcon = (type: RecentActivity['type']) => {
    switch (type) {
      case 'session': return Calendar
      case 'action': return ListChecks
      case 'message': return MessageSquare
      case 'goal': return Target
      default: return Activity
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Health Score Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Client Health</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className={`text-5xl font-bold ${getHealthColor(healthScore)}`}>
                {healthScore !== undefined ? `${healthScore}%` : '--'}
              </span>
              {healthTrend !== undefined && (
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  healthTrend >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {healthTrend >= 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  <span>{Math.abs(healthTrend)}%</span>
                </div>
              )}
            </div>
            <p className="text-gray-500 mt-1">Overall health score</p>
          </div>
          <div className="w-24 h-24 relative">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                className="fill-none stroke-gray-200"
                strokeWidth="8"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                className={`fill-none ${
                  (healthScore ?? 0) >= 70 ? 'stroke-green-500' :
                  (healthScore ?? 0) >= 50 ? 'stroke-yellow-500' : 'stroke-red-500'
                }`}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${((healthScore ?? 0) / 100) * 251} 251`}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Goals Progress */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <Target className="w-5 h-5 text-purple-500" />
            <span className="text-xs text-gray-500">{completedGoals}/{activeGoals + completedGoals} complete</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {goalsProgress !== undefined ? `${goalsProgress}%` : '--'}
          </p>
          <p className="text-sm text-gray-500">Goals Progress</p>
        </div>

        {/* Sessions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <Calendar className="w-5 h-5 text-indigo-500" />
            {nextSessionDate && (
              <span className="text-xs text-indigo-600">Next: {formatDate(nextSessionDate)}</span>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900">{upcomingSessions}</p>
          <p className="text-sm text-gray-500">Upcoming Sessions</p>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <ListChecks className="w-5 h-5 text-amber-500" />
            {overdueActions > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle className="w-3 h-3" />
                {overdueActions} overdue
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900">{pendingActions}</p>
          <p className="text-sm text-gray-500">Pending Actions</p>
        </div>

        {/* Messages */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <MessageSquare className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{unreadMessages}</p>
          <p className="text-sm text-gray-500">Unread Messages</p>
        </div>
      </div>

      {/* Ideas Section */}
      {ideasStats && ideasStats.total > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Lightbulb className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Ideas Journal</h3>
            </div>
            <Link
              href={`/coach/clients/${clientId}/view/ideas`}
              className="text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              View All
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{ideasStats.total}</p>
              <p className="text-sm text-gray-500">Total Ideas</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-slate-600">{ideasStats.captured}</p>
              <p className="text-sm text-gray-500">Captured</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg">
              <p className="text-2xl font-bold text-amber-600">{ideasStats.underReview}</p>
              <p className="text-sm text-gray-500">Under Review</p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-lg">
              <p className="text-2xl font-bold text-emerald-600">{ideasStats.approved}</p>
              <p className="text-sm text-gray-500">Approved</p>
            </div>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Recent Activity</h3>
            <Link
              href={`/coach/clients/${clientId}?tab=notes`}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentActivity.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-500">
                <Activity className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No recent activity</p>
              </div>
            ) : (
              recentActivity.slice(0, 5).map((activity) => {
                const Icon = getActivityIcon(activity.type)
                return (
                  <div key={activity.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Icon className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{activity.title}</p>
                      <p className="text-xs text-gray-500">{formatTimestamp(activity.timestamp)}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Quick Actions</h3>
          </div>
          <div className="p-5 space-y-3">
            <button className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <span className="font-medium text-gray-900">Schedule Session</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
            <button className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <ListChecks className="w-5 h-5 text-amber-600" />
                <span className="font-medium text-gray-900">Create Action Item</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
            <button className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900">Send Message</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OverviewTab
