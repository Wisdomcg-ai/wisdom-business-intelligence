'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ClientLayout from '@/components/client/ClientLayout'
import {
  Calendar,
  Clock,
  Video,
  FileText,
  ChevronRight,
  Plus,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import { useBusinessContext } from '@/hooks/useBusinessContext'

interface Session {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  status: string
  notes: string | null
  summary: string | null
}

export default function SessionsPage() {
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!contextLoading) {
      loadSessions()
    }
  }, [contextLoading, activeBusiness?.id])

  async function loadSessions() {
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

    // Get sessions from API
    const res = await fetch(`/api/sessions?business_id=${bizId}`)
    const data = await res.json()

    if (data.success) {
      setSessions(data.sessions || [])
    } else {
      console.error('Error loading sessions:', data.error)
    }

    setLoading(false)
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      scheduled: 'bg-teal-100 text-teal-800 border-teal-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      cancelled: 'bg-gray-100 text-gray-800 border-gray-200'
    }

    const icons = {
      scheduled: <Clock className="w-3 h-3" />,
      completed: <CheckCircle className="w-3 h-3" />,
      cancelled: <AlertCircle className="w-3 h-3" />
    }

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles] || styles.scheduled}`}>
        {icons[status as keyof typeof icons]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const upcomingSessions = sessions.filter(s => s.status === 'scheduled' && new Date(s.scheduled_at) > new Date())
  const pastSessions = sessions.filter(s => s.status === 'completed' || new Date(s.scheduled_at) <= new Date())

  return (
    <ClientLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Coaching Sessions</h1>
            <p className="text-sm text-gray-600 mt-1">View your past and upcoming coaching sessions</p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
            <p className="text-gray-600">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Sessions Yet</h3>
            <p className="text-gray-600 mb-6">
              Your coaching sessions will appear here once scheduled by your coach.
            </p>
          </div>
        ) : (
          <>
            {/* Upcoming Sessions */}
            {upcomingSessions.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Sessions</h2>
                <div className="space-y-4">
                  {upcomingSessions.map((session) => (
                    <div
                      key={session.id}
                      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                            {getStatusBadge(session.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(session.scheduled_at).toLocaleDateString('en-AU', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {new Date(session.scheduled_at).toLocaleTimeString('en-AU', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                            <span className="flex items-center gap-1">
                              <Video className="w-4 h-4" />
                              {session.duration_minutes} minutes
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Past Sessions */}
            {pastSessions.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Past Sessions</h2>
                <div className="space-y-4">
                  {pastSessions.map((session) => (
                    <div
                      key={session.id}
                      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                            {getStatusBadge(session.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(session.scheduled_at).toLocaleDateString('en-AU', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {new Date(session.scheduled_at).toLocaleTimeString('en-AU', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          {session.summary && (
                            <div className="bg-gray-50 rounded-lg p-4 mt-3">
                              <div className="flex items-start gap-2">
                                <FileText className="w-4 h-4 text-gray-600 mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900 mb-1">Session Summary</p>
                                  <p className="text-sm text-gray-700">{session.summary}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ClientLayout>
  )
}
