'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  Plus,
  ChevronRight,
  FileText,
  CheckCircle,
  PlayCircle,
  User
} from 'lucide-react'

export interface Session {
  id: string
  scheduledAt: string
  durationMinutes: number
  type: 'video' | 'phone' | 'in-person'
  status: 'scheduled' | 'completed' | 'cancelled'
  notes?: string
  prepCompleted?: boolean
}

interface SessionsTabProps {
  clientId: string
  businessName: string
  sessions: Session[]
  onScheduleSession?: () => void
  onViewSession?: (sessionId: string) => void
}

export function SessionsTab({
  clientId,
  businessName,
  sessions,
  onScheduleSession,
  onViewSession
}: SessionsTabProps) {
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('all')

  const now = new Date()
  const upcomingSessions = sessions.filter(s =>
    s.status === 'scheduled' && new Date(s.scheduledAt) > now
  ).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())

  const pastSessions = sessions.filter(s =>
    s.status === 'completed' || new Date(s.scheduledAt) <= now
  ).sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())

  const filteredSessions = filter === 'all'
    ? [...upcomingSessions, ...pastSessions]
    : filter === 'upcoming'
      ? upcomingSessions
      : pastSessions

  const getTypeIcon = (type: Session['type']) => {
    switch (type) {
      case 'video': return Video
      case 'phone': return Phone
      case 'in-person': return MapPin
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const isToday = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isFuture = (dateString: string) => {
    return new Date(dateString) > now
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sessions</h2>
          <p className="text-sm text-gray-500">
            {upcomingSessions.length} upcoming &middot; {pastSessions.length} completed
          </p>
        </div>
        <button
          onClick={onScheduleSession}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Schedule Session
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        {(['all', 'upcoming', 'completed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === f
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Next Session Highlight */}
      {upcomingSessions.length > 0 && filter !== 'completed' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-indigo-600 mb-1">Next Session</p>
              <h3 className="text-lg font-semibold text-gray-900">
                {formatDate(upcomingSessions[0].scheduledAt)}
              </h3>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatTime(upcomingSessions[0].scheduledAt)}
                </span>
                <span className="flex items-center gap-1">
                  {(() => {
                    const Icon = getTypeIcon(upcomingSessions[0].type)
                    return <Icon className="w-4 h-4" />
                  })()}
                  {upcomingSessions[0].type.charAt(0).toUpperCase() + upcomingSessions[0].type.slice(1)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {upcomingSessions[0].durationMinutes} min
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors">
                <FileText className="w-4 h-4 inline mr-1" />
                Prep
              </button>
              <button className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors">
                <PlayCircle className="w-4 h-4 inline mr-1" />
                Start
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sessions List */}
      <div className="space-y-3">
        {filteredSessions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No sessions found</h3>
            <p className="text-gray-500 mb-4">
              {filter === 'upcoming'
                ? 'No upcoming sessions scheduled.'
                : filter === 'completed'
                  ? 'No completed sessions yet.'
                  : 'No sessions have been scheduled yet.'}
            </p>
            <button
              onClick={onScheduleSession}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              Schedule First Session
            </button>
          </div>
        ) : (
          filteredSessions.map((session) => {
            const Icon = getTypeIcon(session.type)
            const upcoming = isFuture(session.scheduledAt)
            const today = isToday(session.scheduledAt)

            return (
              <div
                key={session.id}
                className={`bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 transition-colors ${
                  today ? 'ring-2 ring-indigo-500' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {/* Date Badge */}
                    <div className={`w-14 text-center ${
                      upcoming ? 'text-indigo-600' : 'text-gray-500'
                    }`}>
                      <p className="text-2xl font-bold">
                        {new Date(session.scheduledAt).getDate()}
                      </p>
                      <p className="text-xs uppercase">
                        {new Date(session.scheduledAt).toLocaleDateString('en-AU', { month: 'short' })}
                      </p>
                    </div>

                    {/* Session Details */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900">
                          {formatTime(session.scheduledAt)}
                        </h4>
                        {today && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full">
                            Today
                          </span>
                        )}
                        {session.status === 'completed' && (
                          <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            Completed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Icon className="w-4 h-4" />
                          {session.type.charAt(0).toUpperCase() + session.type.slice(1)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {session.durationMinutes} min
                        </span>
                      </div>
                      {session.notes && (
                        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{session.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => onViewSession?.(session.id)}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default SessionsTab
