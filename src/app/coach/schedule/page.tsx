'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CalendarView, type CalendarSession } from '@/components/coach/schedule/CalendarView'
import { SessionDetailModal } from '@/components/coach/schedule/SessionDetailModal'
import { ScheduleSessionModal } from '@/components/coach/schedule/ScheduleSessionModal'
import { UpcomingSessions } from '@/components/coach/schedule/UpcomingSessions'
import {
  Plus,
  Loader2,
  Settings
} from 'lucide-react'

type ViewMode = 'month' | 'week' | 'day'

interface ClientOption {
  id: string
  businessName: string
  industry?: string
}

function ScheduleContent() {
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<CalendarSession[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>(
    (searchParams?.get('view') as ViewMode) || 'week'
  )
  const [selectedDate, setSelectedDate] = useState(new Date())

  // Modal states
  const [selectedSession, setSelectedSession] = useState<CalendarSession | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleInitialDate, setScheduleInitialDate] = useState<Date | undefined>()
  const [scheduleInitialHour, setScheduleInitialHour] = useState<number | undefined>()

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadData() {
    try {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load sessions
      const { data: sessionsData } = await supabase
        .from('coaching_sessions')
        .select(`
          id,
          business_id,
          scheduled_at,
          duration_minutes,
          session_type,
          status,
          prep_completed,
          notes,
          businesses (
            business_name
          )
        `)
        .eq('coach_id', user.id)
        .order('scheduled_at', { ascending: true })

      if (sessionsData) {
        setSessions(sessionsData.map(s => {
          // Handle both single object and array returns from Supabase
          const businessData = s.businesses as unknown
          const business = Array.isArray(businessData)
            ? businessData[0] as { business_name: string } | undefined
            : businessData as { business_name: string } | null
          return {
          id: s.id,
          businessId: s.business_id,
          businessName: business?.business_name || 'Unknown',
          scheduledAt: s.scheduled_at,
          durationMinutes: s.duration_minutes || 60,
          type: (s.session_type as CalendarSession['type']) || 'video',
          status: (s.status as CalendarSession['status']) || 'scheduled',
          prepCompleted: s.prep_completed || false,
          notes: s.notes || undefined
        }}))
      }

      // Load clients for scheduling
      const { data: clientsData } = await supabase
        .from('businesses')
        .select('id, business_name, industry')
        .eq('assigned_coach_id', user.id)
        .order('business_name')

      if (clientsData) {
        setClients(clientsData.map(c => ({
          id: c.id,
          businessName: c.business_name || 'Unnamed',
          industry: c.industry || undefined
        })))
      }

    } catch (error) {
      console.error('Error loading schedule data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTimeSlotClick = (date: Date, hour: number) => {
    setScheduleInitialDate(date)
    setScheduleInitialHour(hour)
    setShowScheduleModal(true)
  }

  const handleScheduleSession = async (data: {
    businessId: string
    date: string
    time: string
    duration: number
    type: 'video' | 'phone' | 'in-person'
    notes?: string
  }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const scheduledAt = `${data.date}T${data.time}:00`

    const { error } = await supabase
      .from('coaching_sessions')
      .insert({
        coach_id: user.id,
        business_id: data.businessId,
        scheduled_at: scheduledAt,
        duration_minutes: data.duration,
        session_type: data.type,
        status: 'scheduled',
        notes: data.notes
      })

    if (error) {
      console.error('Error scheduling session:', error)
      throw error
    }

    // Reload data
    await loadData()
  }

  const handleStartSession = async (sessionId: string) => {
    // Navigate to session view or start session flow
    console.log('Start session:', sessionId)
    // Could open a session notes modal or navigate to a session page
  }

  const handleCompleteSession = async (sessionId: string) => {
    const { error } = await supabase
      .from('coaching_sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId)

    if (error) {
      console.error('Error completing session:', error)
      return
    }

    // Update local state
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, status: 'completed' } : s
    ))
    setSelectedSession(null)
  }

  const handleCancelSession = async (sessionId: string) => {
    const { error } = await supabase
      .from('coaching_sessions')
      .update({ status: 'cancelled' })
      .eq('id', sessionId)

    if (error) {
      console.error('Error cancelling session:', error)
      return
    }

    // Update local state
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, status: 'cancelled' } : s
    ))
    setSelectedSession(null)
  }

  const handleReschedule = (_sessionId: string) => {
    // For now, close detail modal and open schedule modal
    // In a full implementation, this would open a reschedule-specific modal
    setSelectedSession(null)
    setShowScheduleModal(true)
  }

  // Stats
  const today = new Date()
  const todaysSessions = sessions.filter(s =>
    new Date(s.scheduledAt).toDateString() === today.toDateString() &&
    s.status === 'scheduled'
  )

  const thisWeekSessions = sessions.filter(s => {
    const sessionDate = new Date(s.scheduledAt)
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    return sessionDate >= weekStart && sessionDate < weekEnd && s.status === 'scheduled'
  })

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading schedule...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-gray-500 mt-1">
            {todaysSessions.length} sessions today &middot; {thisWeekSessions.length} this week
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Settings className="w-4 h-4" />
            Availability
          </button>
          <button
            onClick={() => {
              setScheduleInitialDate(undefined)
              setScheduleInitialHour(undefined)
              setShowScheduleModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Schedule Session
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-3">
          <CalendarView
            sessions={sessions}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onSessionClick={setSelectedSession}
            onTimeSlotClick={handleTimeSlotClick}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <UpcomingSessions
            sessions={sessions}
            onSessionClick={setSelectedSession}
          />

          {/* Quick Stats */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">This Month</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Scheduled</span>
                <span className="font-semibold text-gray-900">
                  {sessions.filter(s => {
                    const sessionDate = new Date(s.scheduledAt)
                    return sessionDate.getMonth() === today.getMonth() &&
                      sessionDate.getFullYear() === today.getFullYear() &&
                      s.status === 'scheduled'
                  }).length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Completed</span>
                <span className="font-semibold text-green-600">
                  {sessions.filter(s => {
                    const sessionDate = new Date(s.scheduledAt)
                    return sessionDate.getMonth() === today.getMonth() &&
                      sessionDate.getFullYear() === today.getFullYear() &&
                      s.status === 'completed'
                  }).length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Cancelled</span>
                <span className="font-semibold text-gray-500">
                  {sessions.filter(s => {
                    const sessionDate = new Date(s.scheduledAt)
                    return sessionDate.getMonth() === today.getMonth() &&
                      sessionDate.getFullYear() === today.getFullYear() &&
                      s.status === 'cancelled'
                  }).length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Session Detail Modal */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          isOpen={true}
          onClose={() => setSelectedSession(null)}
          onStartSession={handleStartSession}
          onCompleteSession={handleCompleteSession}
          onCancelSession={handleCancelSession}
          onReschedule={handleReschedule}
        />
      )}

      {/* Schedule Session Modal */}
      <ScheduleSessionModal
        isOpen={showScheduleModal}
        onClose={() => {
          setShowScheduleModal(false)
          setScheduleInitialDate(undefined)
          setScheduleInitialHour(undefined)
        }}
        onSchedule={handleScheduleSession}
        clients={clients}
        initialDate={scheduleInitialDate}
        initialHour={scheduleInitialHour}
      />
    </div>
  )
}

export default function SchedulePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    }>
      <ScheduleContent />
    </Suspense>
  )
}
