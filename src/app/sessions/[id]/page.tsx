'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/ui/PageHeader'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Save,
  CheckCircle,
  Play,
  FileText,
  Star,
  Loader2,
  AlertCircle,
  Eye,
  Target,
  Plus,
  CheckCircle2,
  User,
  UserCircle,
  MessageSquare
} from 'lucide-react'

interface SessionAction {
  id: string
  action_number: number
  description: string
  due_date: string | null
  status: 'pending' | 'completed' | 'missed' | 'carried_over'
  completed_at: string | null
  created_by: string
  created_at: string
}

interface SessionNote {
  id: string
  business_id: string
  coach_id: string
  session_date: string
  status: 'active' | 'completed'
  duration_minutes: number | null

  // Visible to client
  discussion_points: string | null
  client_commitments: string | null
  transcript_url: string | null
  transcript_name: string | null

  // Client fields
  client_takeaways: string | null
  client_notes: string | null
  client_rating: number | null
  client_feedback: string | null

  // Timestamps
  created_at: string
  updated_at: string
  completed_at: string | null
}

export default function ClientSessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const sessionId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [session, setSession] = useState<SessionNote | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [isCoach, setIsCoach] = useState(false)

  // Client editable fields
  const [clientTakeaways, setClientTakeaways] = useState('')
  const [clientNotes, setClientNotes] = useState('')
  const [clientRating, setClientRating] = useState<number | null>(null)
  const [clientFeedback, setClientFeedback] = useState('')

  // Actions
  const [actions, setActions] = useState<SessionAction[]>([])
  const [newActionText, setNewActionText] = useState('')
  const [newActionDueDate, setNewActionDueDate] = useState('')
  const [addingAction, setAddingAction] = useState(false)

  // Autosave
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const initialLoadRef = useRef(true)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const loadSession = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setCurrentUserId(user.id)

      // Load session
      const { data: sessionData, error } = await supabase
        .from('session_notes')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (error || !sessionData) {
        console.error('Error loading session:', error)
        return
      }

      setSession(sessionData)
      setClientTakeaways(sessionData.client_takeaways || '')
      setClientNotes(sessionData.client_notes || '')
      setClientRating(sessionData.client_rating)
      setClientFeedback(sessionData.client_feedback || '')

      // Check if current user is the coach
      setIsCoach(sessionData.coach_id === user.id)

      // Load actions for this session
      const { data: actionsData } = await supabase
        .from('session_actions')
        .select('*')
        .eq('session_note_id', sessionId)
        .order('action_number')

      if (actionsData) {
        setActions(actionsData)
      }

      // Mark client as having started if not already
      if (!sessionData.client_started_at) {
        await supabase
          .from('session_notes')
          .update({ client_started_at: new Date().toISOString() })
          .eq('id', sessionId)

        // Add as attendee if not already
        const { data: existingAttendee } = await supabase
          .from('session_attendees')
          .select('id')
          .eq('session_note_id', sessionId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (!existingAttendee) {
          await supabase
            .from('session_attendees')
            .insert({
              session_note_id: sessionId,
              user_id: user.id,
              user_type: 'client',
              added_by: user.id
            })
        }
      }
    } catch (error) {
      console.error('Error loading session:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, sessionId, router])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  // Autosave effect - debounced save when fields change
  useEffect(() => {
    // Skip on initial load
    if (initialLoadRef.current) {
      initialLoadRef.current = false
      return
    }

    // Don't save if no session loaded yet
    if (!session) return

    setHasUnsavedChanges(true)

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new timeout to save after 1 second of no changes
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const { error } = await supabase
          .from('session_notes')
          .update({
            client_takeaways: clientTakeaways || null,
            client_notes: clientNotes || null,
            client_rating: clientRating,
            client_feedback: clientFeedback || null
          })
          .eq('id', sessionId)

        if (!error) {
          setLastSaved(new Date())
          setHasUnsavedChanges(false)
        }
      } catch (error) {
        console.error('Autosave error:', error)
      } finally {
        setSaving(false)
      }
    }, 1000)

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [clientTakeaways, clientNotes, clientRating, clientFeedback, session, sessionId, supabase])

  async function saveSession() {
    if (!session) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('session_notes')
        .update({
          client_takeaways: clientTakeaways || null,
          client_notes: clientNotes || null,
          client_rating: clientRating,
          client_feedback: clientFeedback || null
        })
        .eq('id', sessionId)

      if (error) throw error

      await loadSession()
    } catch (error) {
      console.error('Error saving session:', error)
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function addAction() {
    if (!newActionText.trim() || !session) return

    setAddingAction(true)
    try {
      const { error } = await supabase
        .from('session_actions')
        .insert({
          session_note_id: sessionId,
          business_id: session.business_id,
          action_number: actions.length + 1,
          description: newActionText.trim(),
          due_date: newActionDueDate || null,
          status: 'pending',
          created_by: currentUserId
        })

      if (error) throw error

      setNewActionText('')
      setNewActionDueDate('')
      await loadSession()
    } catch (error) {
      console.error('Error adding action:', error)
      alert('Failed to add action. Please try again.')
    } finally {
      setAddingAction(false)
    }
  }

  async function toggleActionComplete(actionId: string, currentStatus: string) {
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
      const { error } = await supabase
        .from('session_actions')
        .update({
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null
        })
        .eq('id', actionId)

      if (error) throw error

      await loadSession()
    } catch (error) {
      console.error('Error updating action:', error)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatShortDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  }

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate + 'T00:00:00')
    return due < today
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-500">Loading session...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Session Not Found</h2>
          <p className="text-gray-600 mb-4">This session may have been deleted or you don't have access.</p>
          <Link
            href="/sessions"
            className="text-brand-orange hover:text-brand-orange-700 font-medium"
          >
            Back to Sessions
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <PageHeader
          title="Coaching Session"
          subtitle={`${formatDate(session.session_date)}${session.duration_minutes ? ` • ${session.duration_minutes} min` : ''}`}
          icon={MessageSquare}
          backLink={{ href: '/sessions', label: 'Back to Sessions' }}
          badge={session.status === 'active' ? 'Active' : 'Completed'}
          badgeColor={session.status === 'active' ? 'teal' : 'gray'}
          actions={
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : hasUnsavedChanges ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="hidden sm:inline">Unsaved changes</span>
                </>
              ) : lastSaved ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="hidden sm:inline">Saved</span>
                </>
              ) : null}
            </div>
          }
          variant="simple"
        />
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Column - Coach's Notes (Read-only) */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Discussion Points from Coach */}
            {session.discussion_points && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-4 h-4 text-gray-400" />
                  <label className="block text-sm font-semibold text-gray-900">
                    Discussion Points
                  </label>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                  <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap">{session.discussion_points}</p>
                </div>
                <p className="text-xs text-gray-500 mt-2">From your coach</p>
              </div>
            )}

            {/* Client Commitments from Coach */}
            {session.client_commitments && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-gray-400" />
                  <label className="block text-sm font-semibold text-gray-900">
                    Your Commitments
                  </label>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                  <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap">{session.client_commitments}</p>
                </div>
                <p className="text-xs text-gray-500 mt-2">Action items from your coach</p>
              </div>
            )}

            {/* Session Actions */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Target className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Session Actions</h3>
                  <p className="text-xs sm:text-sm text-gray-500">Commitments from this session</p>
                </div>
              </div>

              {/* Existing Actions */}
              {actions.length > 0 && (
                <div className="space-y-2 mb-4">
                  {actions.map((action) => {
                    const overdue = isOverdue(action.due_date)
                    const isCreator = action.created_by === currentUserId
                    const createdByCoach = action.created_by === session.coach_id

                    return (
                      <div
                        key={action.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          action.status === 'completed'
                            ? 'bg-gray-50 border-gray-200'
                            : overdue
                            ? 'bg-red-50 border-red-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <button
                          onClick={() => toggleActionComplete(action.id, action.status)}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                            action.status === 'completed'
                              ? 'border-green-500 bg-green-100 hover:bg-green-200'
                              : overdue
                              ? 'border-red-400 hover:bg-red-100'
                              : 'border-gray-400 hover:bg-gray-200'
                          }`}
                          title={action.status === 'completed' ? 'Mark as incomplete' : 'Mark as complete'}
                        >
                          <CheckCircle2 className={`w-4 h-4 ${
                            action.status === 'completed'
                              ? 'text-green-600'
                              : 'opacity-0 hover:opacity-100 ' + (overdue ? 'text-red-500' : 'text-gray-600')
                          }`} />
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${
                            action.status === 'completed'
                              ? 'text-gray-500 line-through'
                              : overdue
                              ? 'text-red-900 font-medium'
                              : 'text-gray-900'
                          }`}>
                            {action.description}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            {action.due_date && (
                              <span className={`text-xs ${
                                action.status === 'completed'
                                  ? 'text-gray-400'
                                  : overdue
                                  ? 'text-red-600 font-medium'
                                  : 'text-gray-500'
                              }`}>
                                Due: {formatShortDate(action.due_date)}
                                {overdue && action.status === 'pending' && ' (Overdue)'}
                              </span>
                            )}
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              {createdByCoach ? (
                                <>
                                  <UserCircle className="w-3 h-3" />
                                  Coach
                                </>
                              ) : (
                                <>
                                  <User className="w-3 h-3" />
                                  {isCreator ? 'You' : 'Client'}
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {actions.length === 0 && (
                <div className="text-center py-4 mb-4">
                  <Target className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No actions set for this session yet</p>
                </div>
              )}

              {/* Add New Action */}
              <div className="border-t border-gray-200 pt-4">
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Add an Action
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newActionText}
                    onChange={(e) => setNewActionText(e.target.value)}
                    placeholder="What will you commit to?"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newActionText.trim()) {
                        addAction()
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={newActionDueDate}
                      onChange={(e) => setNewActionDueDate(e.target.value)}
                      className="flex-1 sm:w-36 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                    />
                    <button
                      onClick={addAction}
                      disabled={!newActionText.trim() || addingAction}
                      className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {addingAction ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      <span className="hidden sm:inline">Add</span>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Both you and your coach can add actions
                </p>
              </div>
            </div>

            {/* Your Input Section */}
            <div className="bg-brand-orange-50 rounded-xl border border-brand-orange-200 p-4 sm:p-6">
              <h3 className="text-sm sm:text-base font-semibold text-brand-navy mb-4">Your Input</h3>

              {/* Rating */}
              <div className="mb-4 sm:mb-6">
                <label className="block text-xs sm:text-sm font-medium text-brand-orange-800 mb-2">
                  How would you rate this session?
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setClientRating(star)}
                      className="focus:outline-none transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-7 h-7 sm:w-8 sm:h-8 ${
                          clientRating && star <= clientRating
                            ? 'text-yellow-500 fill-yellow-500'
                            : 'text-gray-300 hover:text-yellow-400'
                        }`}
                      />
                    </button>
                  ))}
                  {clientRating && (
                    <span className="ml-2 text-sm text-brand-orange-700">{clientRating}/5</span>
                  )}
                </div>
              </div>

              {/* Takeaways */}
              <div className="mb-4">
                <label className="block text-xs sm:text-sm font-medium text-brand-orange-800 mb-2">
                  Key Takeaways
                </label>
                <textarea
                  value={clientTakeaways}
                  onChange={(e) => setClientTakeaways(e.target.value)}
                  placeholder="What were your main takeaways from this session?"
                  rows={4}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-brand-orange-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none bg-white text-sm sm:text-base"
                />
              </div>

              {/* Notes */}
              <div className="mb-4">
                <label className="block text-xs sm:text-sm font-medium text-brand-orange-800 mb-2">
                  Your Notes
                </label>
                <textarea
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  placeholder="Any additional notes from the session..."
                  rows={4}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-brand-orange-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none bg-white text-sm sm:text-base"
                />
              </div>

              {/* Feedback */}
              {session.status === 'completed' && (
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-brand-orange-800 mb-2">
                    Feedback for your coach (optional)
                  </label>
                  <textarea
                    value={clientFeedback}
                    onChange={(e) => setClientFeedback(e.target.value)}
                    placeholder="Any feedback or suggestions for future sessions?"
                    rows={3}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-brand-orange-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none bg-white text-sm sm:text-base"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-4 sm:space-y-6">
            {/* Transcript */}
            {session.transcript_url && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-4">Transcript</h3>
                <a
                  href={session.transcript_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <FileText className="w-8 h-8 text-brand-orange" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {session.transcript_name || 'Session Transcript'}
                    </p>
                    <p className="text-xs text-brand-orange">Click to view</p>
                  </div>
                </a>
              </div>
            )}

            {/* Session Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-4">Session Info</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Date</span>
                  <span className="text-gray-900 text-right">
                    {new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-AU')}
                  </span>
                </div>
                {session.duration_minutes && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Duration</span>
                    <span className="text-gray-900 text-right">{session.duration_minutes} minutes</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className="text-gray-900 capitalize text-right">{session.status}</span>
                </div>
                {session.completed_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Completed</span>
                    <span className="text-gray-900 text-right">
                      {new Date(session.completed_at).toLocaleDateString('en-AU')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Tips */}
            <div className="bg-brand-orange-50 rounded-xl border border-brand-orange-200 p-4 sm:p-6">
              <h3 className="text-sm sm:text-base font-semibold text-brand-navy mb-3">Tips</h3>
              <ul className="space-y-2 text-xs sm:text-sm text-brand-navy">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Take notes during the session for best recall</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Rating helps your coach improve future sessions</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Review your commitments before the next session</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
