'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  ChevronRight,
  CalendarPlus
} from 'lucide-react'

interface NextSession {
  id: string
  title: string
  scheduledAt: string
  duration: number
  type: 'video' | 'in-person' | 'phone'
  location?: string
  coachName: string
  agenda?: string[]
}

interface SessionCountdownProps {
  session?: NextSession
  onRequestSession?: () => void
}

export function SessionCountdown({ session, onRequestSession }: SessionCountdownProps) {
  const [countdown, setCountdown] = useState({
    days: 0,
    hours: 0,
    minutes: 0
  })

  useEffect(() => {
    if (!session) return

    const updateCountdown = () => {
      const now = new Date()
      const sessionDate = new Date(session.scheduledAt)
      const diff = sessionDate.getTime() - now.getTime()

      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0 })
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

      setCountdown({ days, hours, minutes })
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 60000)
    return () => clearInterval(interval)
  }, [session])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-AU', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const getSessionIcon = (type: NextSession['type']) => {
    switch (type) {
      case 'video':
        return <Video className="w-5 h-5" />
      case 'in-person':
        return <MapPin className="w-5 h-5" />
      default:
        return <Calendar className="w-5 h-5" />
    }
  }

  if (!session) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-brand-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-brand-orange" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">No Upcoming Sessions</h3>
          <p className="text-sm text-gray-500 mb-4">
            Schedule your next coaching session to keep your momentum going.
          </p>
          <button
            onClick={onRequestSession}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
          >
            <CalendarPlus className="w-4 h-4" />
            Request Session
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Next Session</h3>
        <Link
          href="/sessions"
          className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium flex items-center gap-1"
        >
          View all
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Countdown */}
      <div className="px-6 py-6 bg-gradient-to-br from-brand-orange-50 to-cyan-50">
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center mb-2">
              <span className="text-2xl font-bold text-brand-orange-700">{countdown.days}</span>
            </div>
            <span className="text-xs text-gray-500 uppercase tracking-wider">Days</span>
          </div>
          <span className="text-2xl text-brand-orange-300 font-light">:</span>
          <div className="text-center">
            <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center mb-2">
              <span className="text-2xl font-bold text-brand-orange-700">{countdown.hours}</span>
            </div>
            <span className="text-xs text-gray-500 uppercase tracking-wider">Hours</span>
          </div>
          <span className="text-2xl text-brand-orange-300 font-light">:</span>
          <div className="text-center">
            <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center mb-2">
              <span className="text-2xl font-bold text-brand-orange-700">{countdown.minutes}</span>
            </div>
            <span className="text-xs text-gray-500 uppercase tracking-wider">Minutes</span>
          </div>
        </div>
      </div>

      {/* Session Details */}
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            session.type === 'video' ? 'bg-brand-orange-100 text-brand-orange' :
            session.type === 'in-person' ? 'bg-amber-100 text-amber-600' :
            'bg-gray-100 text-gray-600'
          }`}>
            {getSessionIcon(session.type)}
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900">{session.title}</h4>
            <p className="text-sm text-gray-500">with {session.coachName}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDate(session.scheduledAt)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatTime(session.scheduledAt)}
              </span>
            </div>
            {session.location && (
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {session.location}
              </p>
            )}
          </div>
        </div>

        {/* Agenda Preview */}
        {session.agenda && session.agenda.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Session Agenda</p>
            <ul className="space-y-1">
              {session.agenda.slice(0, 3).map((item, index) => (
                <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="w-5 h-5 bg-brand-orange-100 text-brand-orange-700 rounded text-xs flex items-center justify-center flex-shrink-0">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
              {session.agenda.length > 3 && (
                <li className="text-sm text-gray-400">
                  +{session.agenda.length - 3} more items
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Actions */}
        {session.type === 'video' && (
          <div className="mt-4">
            <button className="w-full py-2.5 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors font-medium flex items-center justify-center gap-2">
              <Video className="w-4 h-4" />
              Join Session
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default SessionCountdown
