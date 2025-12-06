'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  User,
  ChevronRight,
  CheckCircle,
  PlayCircle,
  FileText
} from 'lucide-react'

export interface Session {
  id: string
  clientName: string
  clientId: string
  time: string
  endTime: string
  type: 'video' | 'phone' | 'in-person'
  status: 'upcoming' | 'in-progress' | 'completed'
  prepCompleted: boolean
  notes?: string
}

interface TodayScheduleProps {
  sessions: Session[]
  onStartSession?: (sessionId: string) => void
  onViewPrep?: (sessionId: string) => void
}

export function TodaySchedule({ sessions, onStartSession, onViewPrep }: TodayScheduleProps) {
  const [expandedSession, setExpandedSession] = useState<string | null>(null)

  const getTypeIcon = (type: Session['type']) => {
    switch (type) {
      case 'video':
        return <Video className="w-4 h-4" />
      case 'phone':
        return <Phone className="w-4 h-4" />
      case 'in-person':
        return <MapPin className="w-4 h-4" />
    }
  }

  const getStatusStyles = (status: Session['status']) => {
    switch (status) {
      case 'in-progress':
        return 'bg-green-100 text-green-700 border-green-200'
      case 'completed':
        return 'bg-gray-100 text-gray-600 border-gray-200'
      default:
        return 'bg-brand-orange-100 text-brand-orange-700 border-brand-orange-200'
    }
  }

  const getNextSession = () => {
    const upcoming = sessions.find(s => s.status === 'upcoming')
    if (!upcoming) return null

    const now = new Date()
    const sessionTime = new Date()
    const [hours, minutes] = upcoming.time.split(':').map(Number)
    sessionTime.setHours(hours, minutes, 0, 0)

    const diffMs = sessionTime.getTime() - now.getTime()
    if (diffMs < 0) return null

    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 60) {
      return `${diffMins} min`
    }
    const diffHours = Math.floor(diffMins / 60)
    return `${diffHours}h ${diffMins % 60}m`
  }

  const nextSessionCountdown = getNextSession()

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-brand-orange p-2 rounded-lg">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Today&apos;s Schedule</h3>
            <p className="text-sm text-gray-500">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} today
            </p>
          </div>
        </div>
        {nextSessionCountdown && (
          <div className="text-right">
            <p className="text-xs text-gray-500">Next session in</p>
            <p className="text-lg font-bold text-brand-orange">{nextSessionCountdown}</p>
          </div>
        )}
      </div>

      {/* Sessions List */}
      <div className="divide-y divide-gray-100">
        {sessions.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No sessions scheduled for today</p>
            <Link
              href="/coach/schedule"
              className="text-brand-orange hover:text-brand-orange-700 text-sm font-medium mt-2 inline-block"
            >
              View full schedule
            </Link>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`px-5 py-4 ${
                session.status === 'in-progress' ? 'bg-green-50' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {/* Time */}
                  <div className="text-center min-w-[60px]">
                    <p className="text-lg font-bold text-gray-900">{session.time}</p>
                    <p className="text-xs text-gray-500">{session.endTime}</p>
                  </div>

                  {/* Session Info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/coach/clients/${session.clientId}`}
                        className="font-medium text-gray-900 hover:text-brand-orange"
                      >
                        {session.clientName}
                      </Link>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusStyles(session.status)}`}>
                        {session.status === 'in-progress' && <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />}
                        {session.status.replace('-', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        {getTypeIcon(session.type)}
                        {session.type.charAt(0).toUpperCase() + session.type.slice(1)}
                      </span>
                      {session.prepCompleted ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Prep done
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600">
                          <FileText className="w-3.5 h-3.5" />
                          Prep needed
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {session.status === 'upcoming' && (
                    <>
                      <button
                        onClick={() => onViewPrep?.(session.id)}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        Prep
                      </button>
                      <button
                        onClick={() => onStartSession?.(session.id)}
                        className="px-3 py-1.5 text-sm font-medium bg-brand-orange text-white hover:bg-brand-orange-600 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <PlayCircle className="w-4 h-4" />
                        Start
                      </button>
                    </>
                  )}
                  {session.status === 'in-progress' && (
                    <Link
                      href={`/coach/sessions/${session.id}`}
                      className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Video className="w-4 h-4" />
                      Join
                    </Link>
                  )}
                  {session.status === 'completed' && (
                    <Link
                      href={`/coach/sessions/${session.id}`}
                      className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      View Notes
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {sessions.length > 0 && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <Link
            href="/coach/schedule"
            className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium flex items-center justify-center gap-1"
          >
            View full schedule
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}

export default TodaySchedule
