'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  X,
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  Building2,
  FileText,
  CheckCircle,
  Play,
  Edit2,
  Trash2,
  MessageSquare,
  ListChecks,
  ChevronRight,
  AlertTriangle,
  Loader2
} from 'lucide-react'
import type { CalendarSession } from './CalendarView'

interface SessionDetailModalProps {
  session: CalendarSession
  isOpen: boolean
  onClose: () => void
  onStartSession?: (sessionId: string) => void
  onCompleteSession?: (sessionId: string) => void
  onCancelSession?: (sessionId: string) => void
  onReschedule?: (sessionId: string) => void
}

export function SessionDetailModal({
  session,
  isOpen,
  onClose,
  onStartSession,
  onCompleteSession,
  onCancelSession,
  onReschedule
}: SessionDetailModalProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  if (!isOpen) return null

  const sessionDate = new Date(session.scheduledAt)
  const isPast = sessionDate < new Date()
  const isUpcoming = !isPast && session.status === 'scheduled'

  const getTypeIcon = () => {
    switch (session.type) {
      case 'video': return Video
      case 'phone': return Phone
      case 'in-person': return MapPin
    }
  }

  const TypeIcon = getTypeIcon()

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const getEndTime = () => {
    const endTime = new Date(sessionDate)
    endTime.setMinutes(endTime.getMinutes() + session.durationMinutes)
    return formatTime(endTime)
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await onCancelSession?.(session.id)
      onClose()
    } catch (error) {
      console.error('Error cancelling session:', error)
    } finally {
      setCancelling(false)
      setShowCancelConfirm(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                session.status === 'completed'
                  ? 'bg-green-100'
                  : session.status === 'cancelled'
                    ? 'bg-gray-100'
                    : 'bg-indigo-100'
              }`}>
                <TypeIcon className={`w-5 h-5 ${
                  session.status === 'completed'
                    ? 'text-green-600'
                    : session.status === 'cancelled'
                      ? 'text-gray-500'
                      : 'text-indigo-600'
                }`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Session Details</h2>
                <span className={`text-sm ${
                  session.status === 'completed'
                    ? 'text-green-600'
                    : session.status === 'cancelled'
                      ? 'text-gray-500'
                      : 'text-indigo-600'
                }`}>
                  {session.status === 'completed' && 'Completed'}
                  {session.status === 'cancelled' && 'Cancelled'}
                  {session.status === 'scheduled' && (isPast ? 'Past Due' : 'Scheduled')}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Client Info */}
            <Link
              href={`/coach/clients/${session.businessId}`}
              className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <div className="w-12 h-12 bg-slate-200 rounded-xl flex items-center justify-center">
                <Building2 className="w-6 h-6 text-slate-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{session.businessName}</h3>
                <p className="text-sm text-gray-500">View client profile</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </Link>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 text-gray-600 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">Date</span>
                </div>
                <p className="font-medium text-gray-900">{formatDate(sessionDate)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 text-gray-600 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Time</span>
                </div>
                <p className="font-medium text-gray-900">
                  {formatTime(sessionDate)} - {getEndTime()}
                </p>
                <p className="text-xs text-gray-500">{session.durationMinutes} minutes</p>
              </div>
            </div>

            {/* Session Type */}
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
              <TypeIcon className="w-5 h-5 text-gray-600" />
              <div>
                <p className="text-sm text-gray-600">Session Type</p>
                <p className="font-medium text-gray-900">
                  {session.type === 'video' && 'Video Call'}
                  {session.type === 'phone' && 'Phone Call'}
                  {session.type === 'in-person' && 'In-Person Meeting'}
                </p>
              </div>
            </div>

            {/* Notes */}
            {session.notes && (
              <div>
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <FileText className="w-4 h-4" />
                  <span className="text-sm font-medium">Notes</span>
                </div>
                <p className="text-gray-700 bg-gray-50 rounded-xl p-4">{session.notes}</p>
              </div>
            )}

            {/* Prep Status */}
            {isUpcoming && (
              <div className={`flex items-center gap-3 p-4 rounded-xl ${
                session.prepCompleted ? 'bg-green-50' : 'bg-amber-50'
              }`}>
                {session.prepCompleted ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-green-700 font-medium">Prep completed</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <span className="text-amber-700 font-medium">Prep not completed</span>
                    <button className="ml-auto text-sm text-amber-700 hover:text-amber-800 font-medium">
                      Complete Prep
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Quick Actions */}
            {session.status === 'scheduled' && (
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href={`/coach/clients/${session.businessId}?tab=messages`}
                  className="flex items-center justify-center gap-2 p-3 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-sm font-medium">Message</span>
                </Link>
                <Link
                  href={`/coach/clients/${session.businessId}?tab=actions`}
                  className="flex items-center justify-center gap-2 p-3 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ListChecks className="w-4 h-4" />
                  <span className="text-sm font-medium">Actions</span>
                </Link>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          {session.status === 'scheduled' && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              {showCancelConfirm ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Are you sure you want to cancel this session?</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-white transition-colors"
                    >
                      Keep Session
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {cancelling ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      ) : (
                        'Cancel Session'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg transition-colors"
                    title="Cancel session"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => onReschedule?.(session.id)}
                    className="p-2 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors"
                    title="Reschedule"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <div className="flex-1" />
                  {isPast ? (
                    <button
                      onClick={() => onCompleteSession?.(session.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Mark Complete
                    </button>
                  ) : (
                    <button
                      onClick={() => onStartSession?.(session.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Start Session
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Completed/Cancelled Footer */}
          {session.status !== 'scheduled' && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {session.status === 'completed' && 'Session completed'}
                  {session.status === 'cancelled' && 'Session was cancelled'}
                </span>
                <Link
                  href={`/coach/clients/${session.businessId}?tab=sessions`}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  View All Sessions
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SessionDetailModal
