'use client'

import Link from 'next/link'
import {
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  Building2,
  ChevronRight,
  CheckCircle,
  AlertTriangle
} from 'lucide-react'
import type { CalendarSession } from './CalendarView'

interface UpcomingSessionsProps {
  sessions: CalendarSession[]
  onSessionClick: (session: CalendarSession) => void
}

export function UpcomingSessions({ sessions, onSessionClick }: UpcomingSessionsProps) {
  const now = new Date()

  // Get upcoming sessions (scheduled, not in the past)
  const upcomingSessions = sessions
    .filter(s => s.status === 'scheduled' && new Date(s.scheduledAt) >= now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 5)

  // Group by date
  const groupedByDate = upcomingSessions.reduce((acc, session) => {
    const dateKey = new Date(session.scheduledAt).toDateString()
    if (!acc[dateKey]) {
      acc[dateKey] = []
    }
    acc[dateKey].push(session)
    return acc
  }, {} as Record<string, CalendarSession[]>)

  const getTypeIcon = (type: CalendarSession['type']) => {
    switch (type) {
      case 'video': return Video
      case 'phone': return Phone
      case 'in-person': return MapPin
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow'
    } else {
      return date.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })
    }
  }

  const isToday = (dateString: string) => {
    return new Date(dateString).toDateString() === new Date().toDateString()
  }

  if (upcomingSessions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Upcoming Sessions</h3>
        <div className="text-center py-8">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No upcoming sessions</p>
          <p className="text-sm text-gray-400 mt-1">Schedule a session to get started</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Upcoming Sessions</h3>
      </div>

      <div className="divide-y divide-gray-100">
        {Object.entries(groupedByDate).map(([dateKey, dateSessions]) => (
          <div key={dateKey}>
            {/* Date Header */}
            <div className={`px-5 py-2 text-sm font-medium ${
              isToday(dateKey) ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-50 text-gray-600'
            }`}>
              {formatDateHeader(dateKey)}
            </div>

            {/* Sessions for this date */}
            {dateSessions.map(session => {
              const TypeIcon = getTypeIcon(session.type)
              return (
                <div
                  key={session.id}
                  onClick={() => onSessionClick(session)}
                  className="px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <TypeIcon className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900 truncate">{session.businessName}</p>
                        <span className="text-sm text-gray-500 flex-shrink-0 ml-2">
                          {formatTime(session.scheduledAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {session.durationMinutes} min
                        </span>
                        {session.prepCompleted ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Prepped
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-600">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Needs prep
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* View All Link */}
      <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
        <Link
          href="/coach/schedule?view=week"
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          View all sessions
        </Link>
      </div>
    </div>
  )
}

export default UpcomingSessions
