'use client'

import Link from 'next/link'
import {
  Activity,
  CheckCircle,
  MessageSquare,
  Calendar,
  Target,
  FileText,
  AlertCircle,
  TrendingUp,
  User,
  ChevronRight
} from 'lucide-react'

export interface ActivityItem {
  id: string
  type: 'action_completed' | 'message_received' | 'session_completed' | 'goal_achieved' | 'document_uploaded' | 'assessment_completed' | 'client_added' | 'action_overdue'
  clientId: string
  clientName: string
  description: string
  timestamp: string
  metadata?: Record<string, any>
}

interface ActivityFeedProps {
  activities: ActivityItem[]
  maxItems?: number
}

export function ActivityFeed({ activities, maxItems = 10 }: ActivityFeedProps) {
  const displayActivities = activities.slice(0, maxItems)

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'action_completed':
        return { icon: CheckCircle, bg: 'bg-green-100', color: 'text-green-600' }
      case 'message_received':
        return { icon: MessageSquare, bg: 'bg-blue-100', color: 'text-blue-600' }
      case 'session_completed':
        return { icon: Calendar, bg: 'bg-indigo-100', color: 'text-indigo-600' }
      case 'goal_achieved':
        return { icon: Target, bg: 'bg-purple-100', color: 'text-purple-600' }
      case 'document_uploaded':
        return { icon: FileText, bg: 'bg-cyan-100', color: 'text-cyan-600' }
      case 'assessment_completed':
        return { icon: TrendingUp, bg: 'bg-teal-100', color: 'text-teal-600' }
      case 'client_added':
        return { icon: User, bg: 'bg-indigo-100', color: 'text-indigo-600' }
      case 'action_overdue':
        return { icon: AlertCircle, bg: 'bg-red-100', color: 'text-red-600' }
      default:
        return { icon: Activity, bg: 'bg-gray-100', color: 'text-gray-600' }
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Recent Activity</h3>
            <p className="text-sm text-gray-500">Latest updates from clients</p>
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
        {displayActivities.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No recent activity</p>
          </div>
        ) : (
          displayActivities.map((activity) => {
            const { icon: Icon, bg, color } = getActivityIcon(activity.type)

            return (
              <div
                key={activity.id}
                className="px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`${bg} p-2 rounded-lg flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/coach/clients/${activity.clientId}`}
                          className="font-medium text-gray-900 hover:text-indigo-600"
                        >
                          {activity.clientName}
                        </Link>
                        <p className="text-sm text-gray-600 mt-0.5">
                          {activity.description}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                        {formatTimestamp(activity.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      {activities.length > maxItems && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center justify-center gap-1 w-full">
            View all activity
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export default ActivityFeed
