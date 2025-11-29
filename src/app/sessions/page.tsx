'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar,
  Clock,
  CheckCircle,
  Play,
  Plus,
  ChevronRight,
  FileText,
  Star,
  Loader2,
  Upload
} from 'lucide-react'

interface SessionNote {
  id: string
  session_date: string
  status: 'active' | 'completed'
  duration_minutes: number | null
  discussion_points: string | null
  client_commitments: string | null
  client_rating: number | null
  transcript_name: string | null
  created_at: string
}

export default function ClientSessionsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<SessionNote[]>([])
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get user's business
      const { data: businessUser } = await supabase
        .from('business_users')
        .select('business_id')
        .eq('user_id', user.id)
        .maybeSingle()

      let bizId = businessUser?.business_id

      if (!bizId) {
        // Fallback: direct owner lookup
        const { data: business } = await supabase
          .from('businesses')
          .select('id, assigned_coach_id')
          .eq('owner_id', user.id)
          .maybeSingle()

        if (business) {
          bizId = business.id
          setCoachId(business.assigned_coach_id)
        }
      } else {
        // Get coach ID
        const { data: business } = await supabase
          .from('businesses')
          .select('assigned_coach_id')
          .eq('id', bizId)
          .single()

        if (business) {
          setCoachId(business.assigned_coach_id)
        }
      }

      if (!bizId) {
        setLoading(false)
        return
      }

      setBusinessId(bizId)

      // Load sessions for this business
      const { data: sessionsData, error } = await supabase
        .from('session_notes')
        .select(`
          id,
          session_date,
          status,
          duration_minutes,
          discussion_points,
          client_commitments,
          client_rating,
          transcript_name,
          created_at
        `)
        .eq('business_id', bizId)
        .order('session_date', { ascending: false })

      if (error) {
        console.error('Error loading sessions:', error)
        setSessions([])
      } else {
        setSessions(sessionsData || [])
      }
    } catch (error) {
      console.error('Error loading sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  async function startNewSession() {
    if (!businessId || !coachId) return

    setCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const today = new Date().toISOString().split('T')[0]

      // Check if session already exists today
      const { data: existing } = await supabase
        .from('session_notes')
        .select('id')
        .eq('business_id', businessId)
        .eq('session_date', today)
        .maybeSingle()

      if (existing) {
        // Join existing session
        router.push(`/sessions/${existing.id}`)
        return
      }

      // Create new session
      const { data: newSession, error } = await supabase
        .from('session_notes')
        .insert({
          business_id: businessId,
          coach_id: coachId,
          session_date: today,
          status: 'active',
          client_started_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating session:', error)
        alert('Failed to create session. Please try again.')
        return
      }

      // Add client as attendee
      await supabase
        .from('session_attendees')
        .insert({
          session_note_id: newSession.id,
          user_id: user.id,
          user_type: 'client',
          added_by: user.id
        })

      router.push(`/sessions/${newSession.id}`)
    } catch (error) {
      console.error('Error creating session:', error)
      alert('Failed to create session. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  // Group sessions by date
  const groupedSessions = sessions.reduce((groups, session) => {
    const date = session.session_date
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(session)
    return groups
  }, {} as Record<string, SessionNote[]>)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00')
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading sessions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Session Notes</h1>
            <p className="text-gray-600 mt-1">
              Notes from your coaching sessions
            </p>
          </div>
          {coachId && (
            <button
              onClick={startNewSession}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
              Start Session
            </button>
          )}
        </div>

        {/* Sessions List */}
        {sessions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Sessions Yet</h3>
            <p className="text-gray-500 mb-6">
              {coachId
                ? 'Start your first session to begin tracking notes with your coach.'
                : 'You need a coach assigned to start recording sessions.'}
            </p>
            {coachId && (
              <button
                onClick={startNewSession}
                disabled={creating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Start First Session
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedSessions).map(([date, dateSessions]) => (
              <div key={date}>
                {/* Date Header */}
                <div className="flex items-center gap-3 mb-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                    {formatDate(date)}
                  </h2>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Sessions for this date */}
                <div className="space-y-3">
                  {dateSessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => router.push(`/sessions/${session.id}`)}
                      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-teal-300 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            session.status === 'active'
                              ? 'bg-green-100'
                              : 'bg-gray-100'
                          }`}>
                            {session.status === 'active' ? (
                              <Play className="w-6 h-6 text-green-600" />
                            ) : (
                              <CheckCircle className="w-6 h-6 text-gray-600" />
                            )}
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 group-hover:text-teal-600 transition-colors">
                              Coaching Session
                            </h3>
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                              {session.duration_minutes && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  {session.duration_minutes} min
                                </span>
                              )}
                              {session.client_rating && (
                                <span className="flex items-center gap-1">
                                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                  {session.client_rating}/5
                                </span>
                              )}
                              {session.transcript_name && (
                                <span className="flex items-center gap-1">
                                  <Upload className="w-4 h-4" />
                                  Transcript
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {session.status === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                              <Play className="w-3.5 h-3.5" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Completed
                            </span>
                          )}
                          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-teal-600 transition-colors" />
                        </div>
                      </div>

                      {/* Preview */}
                      {(session.discussion_points || session.client_commitments) && (
                        <p className="mt-3 text-sm text-gray-600 line-clamp-2 pl-16">
                          {session.discussion_points || session.client_commitments}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
