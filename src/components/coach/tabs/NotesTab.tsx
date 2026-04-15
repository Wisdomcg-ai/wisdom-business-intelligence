'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Plus,
  Edit,
  ChevronDown,
  Lock,
  Calendar,
  Clock,
  Save,
  X,
  Loader2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface SessionNote {
  id: string
  business_id: string
  coach_id: string
  session_date: string
  status: 'active' | 'completed'
  duration_minutes: number | null
  discussion_points: string | null
  client_commitments: string | null
  coach_action_items: string | null
  private_observations: string | null
  next_session_prep: string | null
  created_at: string
  updated_at: string
}

interface NoteFormData {
  session_date: string
  duration_minutes: number | null
  status: 'active' | 'completed'
  discussion_points: string
  client_commitments: string
  coach_action_items: string
  private_observations: string
  next_session_prep: string
}

const emptyForm: NoteFormData = {
  session_date: new Date().toISOString().split('T')[0],
  duration_minutes: 60,
  status: 'active',
  discussion_points: '',
  client_commitments: '',
  coach_action_items: '',
  private_observations: '',
  next_session_prep: '',
}

interface NotesTabProps {
  businessId: string
  businessName: string
}

export function NotesTab({ businessId, businessName }: NotesTabProps) {
  const [notes, setNotes] = useState<SessionNote[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [formData, setFormData] = useState<NoteFormData>(emptyForm)
  const [coachId, setCoachId] = useState<string | null>(null)

  const supabase = createClient()

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('session_notes')
      .select('*')
      .eq('business_id', businessId)
      .order('session_date', { ascending: false })

    if (error) {
      console.error('Error fetching session notes:', error)
    } else {
      setNotes(data ?? [])
    }
    setLoading(false)
  }, [businessId, supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCoachId(user.id)
      }
      await fetchNotes()
    }
    init()
  }, [fetchNotes, supabase.auth])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const handleToggleExpand = (noteId: string) => {
    setExpandedNoteId((prev) => (prev === noteId ? null : noteId))
  }

  const handleNewNote = () => {
    setFormData(emptyForm)
    setEditingNoteId(null)
    setShowNewForm(true)
  }

  const handleEditNote = (note: SessionNote) => {
    setFormData({
      session_date: note.session_date,
      duration_minutes: note.duration_minutes,
      status: note.status as 'active' | 'completed',
      discussion_points: note.discussion_points ?? '',
      client_commitments: note.client_commitments ?? '',
      coach_action_items: note.coach_action_items ?? '',
      private_observations: note.private_observations ?? '',
      next_session_prep: note.next_session_prep ?? '',
    })
    setEditingNoteId(note.id)
    setShowNewForm(false)
    setExpandedNoteId(note.id)
  }

  const handleCancelForm = () => {
    setShowNewForm(false)
    setEditingNoteId(null)
    setFormData(emptyForm)
  }

  const handleSaveNote = async () => {
    if (!coachId) return
    setSaving(true)

    if (editingNoteId) {
      const { error } = await supabase
        .from('session_notes')
        .update({
          session_date: formData.session_date,
          duration_minutes: formData.duration_minutes,
          status: formData.status,
          discussion_points: formData.discussion_points || null,
          client_commitments: formData.client_commitments || null,
          coach_action_items: formData.coach_action_items || null,
          private_observations: formData.private_observations || null,
          next_session_prep: formData.next_session_prep || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingNoteId)

      if (error) {
        console.error('Error updating note:', error)
      } else {
        setEditingNoteId(null)
      }
    } else {
      const { error } = await supabase
        .from('session_notes')
        .insert({
          business_id: businessId,
          coach_id: coachId,
          session_date: formData.session_date,
          duration_minutes: formData.duration_minutes,
          status: formData.status,
          discussion_points: formData.discussion_points || null,
          client_commitments: formData.client_commitments || null,
          coach_action_items: formData.coach_action_items || null,
          private_observations: formData.private_observations || null,
          next_session_prep: formData.next_session_prep || null,
        })

      if (error) {
        console.error('Error creating note:', error)
      } else {
        setShowNewForm(false)
      }
    }

    setFormData(emptyForm)
    await fetchNotes()
    setSaving(false)
  }

  const handleFormChange = (field: keyof NoteFormData, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // Shared form fields renderer
  const renderFormFields = () => (
    <div className="space-y-4">
      {/* Date, Duration, Status Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Session Date</label>
          <input
            type="date"
            value={formData.session_date}
            onChange={(e) => handleFormChange('session_date', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
          <input
            type="number"
            value={formData.duration_minutes ?? ''}
            onChange={(e) => handleFormChange('duration_minutes', e.target.value ? parseInt(e.target.value, 10) : null)}
            placeholder="60"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={formData.status}
            onChange={(e) => handleFormChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange outline-none"
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Discussion Points */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Discussion Points</label>
        <textarea
          value={formData.discussion_points}
          onChange={(e) => handleFormChange('discussion_points', e.target.value)}
          rows={3}
          placeholder="Key topics discussed during the session..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange outline-none resize-y"
        />
      </div>

      {/* Client Commitments */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Client Commitments</label>
        <textarea
          value={formData.client_commitments}
          onChange={(e) => handleFormChange('client_commitments', e.target.value)}
          rows={2}
          placeholder="What the client committed to doing..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange outline-none resize-y"
        />
      </div>

      {/* Coach Action Items - Private */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Coach Action Items
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
            <Lock className="w-3 h-3" />
            Private
          </span>
        </label>
        <textarea
          value={formData.coach_action_items}
          onChange={(e) => handleFormChange('coach_action_items', e.target.value)}
          rows={2}
          placeholder="Your follow-up actions..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange outline-none resize-y"
        />
      </div>

      {/* Private Observations */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Private Observations
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
            <Lock className="w-3 h-3" />
            Private
          </span>
        </label>
        <textarea
          value={formData.private_observations}
          onChange={(e) => handleFormChange('private_observations', e.target.value)}
          rows={2}
          placeholder="Your private notes and observations..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange outline-none resize-y"
        />
      </div>

      {/* Next Session Prep */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Next Session Prep
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
            <Lock className="w-3 h-3" />
            Private
          </span>
        </label>
        <textarea
          value={formData.next_session_prep}
          onChange={(e) => handleFormChange('next_session_prep', e.target.value)}
          rows={2}
          placeholder="Topics and prep for next session..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange outline-none resize-y"
        />
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={handleCancelForm}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSaveNote}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {editingNoteId ? 'Update Note' : 'Save Note'}
        </button>
      </div>
    </div>
  )

  // Expandable section renderer
  const renderSection = (
    title: string,
    content: string | null,
    isPrivate: boolean = false
  ) => {
    if (!content) return null
    return (
      <div className="py-3 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-1">
          <h5 className="text-sm font-medium text-gray-700">{title}</h5>
          {isPrivate && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
              <Lock className="w-3 h-3" />
              Private
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{content}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-brand-orange animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">Session Notes</h2>
          <p className="text-sm text-gray-500">
            {notes.length} note{notes.length !== 1 ? 's' : ''} for {businessName}
          </p>
        </div>
        <button
          onClick={handleNewNote}
          disabled={showNewForm}
          className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          New Note
        </button>
      </div>

      {/* New Note Form */}
      {showNewForm && (
        <div className="bg-white rounded-xl border-2 border-brand-orange border-dashed p-6">
          <h3 className="text-base font-semibold text-brand-navy mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-orange" />
            New Session Note
          </h3>
          {renderFormFields()}
        </div>
      )}

      {/* Notes List */}
      {notes.length === 0 && !showNewForm ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No session notes yet</h3>
          <p className="text-gray-500 mb-4">
            Create your first session note to start tracking coaching discussions.
          </p>
          <button
            onClick={handleNewNote}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600"
          >
            <Plus className="w-4 h-4" />
            Create First Note
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const isExpanded = expandedNoteId === note.id
            const isEditing = editingNoteId === note.id

            return (
              <div
                key={note.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-brand-orange-300 transition-colors"
              >
                {/* Card Header */}
                <button
                  type="button"
                  onClick={() => handleToggleExpand(note.id)}
                  className="w-full flex items-center justify-between p-5 text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-brand-orange-50 rounded-lg flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-brand-orange" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        {formatDate(note.session_date)}
                      </h4>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        {note.duration_minutes && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {note.duration_minutes} min
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            note.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {note.status.charAt(0).toUpperCase() + note.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditing && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditNote(note)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation()
                            handleEditNote(note)
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </span>
                    )}
                    <ChevronDown
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-100">
                    {isEditing ? (
                      <div className="pt-4">
                        {renderFormFields()}
                      </div>
                    ) : (
                      <div>
                        {renderSection('Discussion Points', note.discussion_points)}
                        {renderSection('Client Commitments', note.client_commitments)}
                        {renderSection('Coach Action Items', note.coach_action_items, true)}
                        {renderSection('Private Observations', note.private_observations, true)}
                        {renderSection('Next Session Prep', note.next_session_prep, true)}
                        {!note.discussion_points &&
                          !note.client_commitments &&
                          !note.coach_action_items &&
                          !note.private_observations &&
                          !note.next_session_prep && (
                            <p className="py-4 text-sm text-gray-400 italic">
                              No content recorded for this session.
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default NotesTab
