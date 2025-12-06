'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar,
  Building2,
  Clock,
  CheckCircle,
  Play,
  Plus,
  Search,
  Filter,
  ChevronRight,
  FileText,
  Star,
  Loader2,
  Upload
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'

interface SessionNote {
  id: string
  business_id: string
  business_name: string
  session_date: string
  status: 'active' | 'completed'
  duration_minutes: number | null
  discussion_points: string | null
  client_rating: number | null
  transcript_name: string | null
  created_at: string
  updated_at: string
}

interface Client {
  id: string
  business_name: string
}

export default function CoachSessionsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<SessionNote[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [showNewSessionModal, setShowNewSessionModal] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/coach/login')
        return
      }

      // Load clients
      const { data: clientsData } = await supabase
        .from('businesses')
        .select('id, business_name')
        .eq('assigned_coach_id', user.id)
        .order('business_name')

      if (clientsData) {
        setClients(clientsData.map(c => ({
          id: c.id,
          business_name: c.business_name || 'Unnamed Business'
        })))
      }

      // Load session notes with business names
      const { data: sessionsData, error } = await supabase
        .from('session_notes')
        .select(`
          id,
          business_id,
          session_date,
          status,
          duration_minutes,
          discussion_points,
          client_rating,
          transcript_name,
          created_at,
          updated_at
        `)
        .eq('coach_id', user.id)
        .order('session_date', { ascending: false })

      if (error) {
        console.error('Error loading sessions:', error)
        // Table might not exist yet
        setSessions([])
      } else if (sessionsData) {
        // Get business names
        const businessIds = [...new Set(sessionsData.map(s => s.business_id))]
        const { data: businessesData } = await supabase
          .from('businesses')
          .select('id, business_name')
          .in('id', businessIds)

        const businessMap = new Map(businessesData?.map(b => [b.id, b.business_name]) || [])

        setSessions(sessionsData.map((s: any) => ({
          id: s.id,
          business_id: s.business_id,
          business_name: businessMap.get(s.business_id) || 'Unknown',
          session_date: s.session_date,
          status: s.status,
          duration_minutes: s.duration_minutes,
          discussion_points: s.discussion_points,
          client_rating: s.client_rating,
          transcript_name: s.transcript_name,
          created_at: s.created_at,
          updated_at: s.updated_at
        })))
      }
    } catch (error) {
      console.error('Error loading sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  async function startNewSession() {
    if (!selectedClientId) return

    setCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const today = new Date().toISOString().split('T')[0]

      // Check if session already exists today for this client
      const { data: existing } = await supabase
        .from('session_notes')
        .select('id')
        .eq('business_id', selectedClientId)
        .eq('session_date', today)
        .maybeSingle()

      if (existing) {
        // Join existing session
        router.push(`/coach/sessions/${existing.id}`)
        return
      }

      // Create new session
      const { data: newSession, error } = await supabase
        .from('session_notes')
        .insert({
          business_id: selectedClientId,
          coach_id: user.id,
          session_date: today,
          status: 'active',
          coach_started_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating session:', error)
        alert('Failed to create session. Make sure the database migration has been run.')
        return
      }

      // Add coach as attendee
      await supabase
        .from('session_attendees')
        .insert({
          session_note_id: newSession.id,
          user_id: user.id,
          user_type: 'coach',
          added_by: user.id
        })

      router.push(`/coach/sessions/${newSession.id}`)
    } catch (error) {
      console.error('Error creating session:', error)
      alert('Failed to create session. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.business_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Group sessions by date
  const groupedSessions = filteredSessions.reduce((groups, session) => {
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

  // Stats
  const activeSessions = sessions.filter(s => s.status === 'active').length
  const completedSessions = sessions.filter(s => s.status === 'completed').length
  const avgRating = sessions.filter(s => s.client_rating).reduce((sum, s) => sum + (s.client_rating || 0), 0) / (sessions.filter(s => s.client_rating).length || 1)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-500">Loading sessions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <PageHeader
          title="Session Notes"
          subtitle="Collaborative notes from coaching sessions"
          icon={FileText}
          variant="simple"
          actions={
            <button
              onClick={() => setShowNewSessionModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-orange text-white rounded-lg shadow-sm hover:bg-brand-orange-600 transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Start Session</span>
              <span className="sm:hidden">Start</span>
            </button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-brand-orange" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{sessions.length}</p>
                <p className="text-sm text-gray-600">Total Sessions</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Play className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{activeSessions}</p>
                <p className="text-sm text-gray-600">Active</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{completedSessions}</p>
                <p className="text-sm text-gray-600">Completed</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Star className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {avgRating > 0 ? avgRating.toFixed(1) : '-'}
                </p>
                <p className="text-sm text-gray-600">Avg Rating</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by client name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full sm:w-auto px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              >
                <option value="all">All Sessions</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sessions List */}
        {filteredSessions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg sm:text-xl font-medium text-gray-900 mb-2">No Sessions Found</h3>
            <p className="text-sm sm:text-base text-gray-500 mb-6">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Start your first coaching session to begin tracking notes'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <button
                onClick={() => setShowNewSessionModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg shadow-sm hover:bg-brand-orange-600 transition-colors"
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
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                  <h2 className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">
                    {formatDate(date)}
                  </h2>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Sessions for this date */}
                <div className="space-y-3">
                  {dateSessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => router.push(`/coach/sessions/${session.id}`)}
                      className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 hover:border-brand-orange-300 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-sm sm:text-base text-gray-900 group-hover:text-brand-orange transition-colors truncate">
                              {session.business_name}
                            </h3>
                            <div className="flex items-center flex-wrap gap-2 sm:gap-3 mt-1 text-xs sm:text-sm text-gray-500">
                              {session.duration_minutes && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                  {session.duration_minutes} min
                                </span>
                              )}
                              {session.client_rating && (
                                <span className="flex items-center gap-1">
                                  <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                                  {session.client_rating}/5
                                </span>
                              )}
                              {session.transcript_name && (
                                <span className="flex items-center gap-1">
                                  <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                  <span className="hidden sm:inline">Transcript</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                          {session.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs sm:text-sm font-medium">
                              <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              <span className="hidden sm:inline">Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs sm:text-sm font-medium">
                              <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              <span className="hidden sm:inline">Completed</span>
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-brand-orange transition-colors" />
                        </div>
                      </div>

                      {/* Preview of discussion points */}
                      {session.discussion_points && (
                        <p className="mt-3 text-xs sm:text-sm text-gray-600 line-clamp-2 pl-0 sm:pl-16">
                          {session.discussion_points}
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

      {/* New Session Modal */}
      {showNewSessionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 sm:p-8">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Start New Session</h2>
            <p className="text-sm sm:text-base text-gray-600 mb-6">
              Select a client to begin a coaching session. If a session already exists for today, you'll join it.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Client
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              >
                <option value="">Choose a client...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.business_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setShowNewSessionModal(false)
                  setSelectedClientId('')
                }}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={startNewSession}
                disabled={!selectedClientId || creating}
                className="flex-1 px-4 py-2.5 bg-brand-orange text-white rounded-lg shadow-sm hover:bg-brand-orange-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="hidden sm:inline">Starting...</span>
                    <span className="sm:hidden">...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Start Session
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
