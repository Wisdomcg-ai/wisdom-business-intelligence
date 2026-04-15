'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Trophy,
  AlertCircle,
  MessageSquare,
  Star,
  Plus,
  X,
  Check,
  Loader2
} from 'lucide-react'

// --- Types ---

interface RockUpdate {
  title: string
  status: 'on-track' | 'off-track' | 'at-risk'
}

interface PrepResponses {
  wins: string[]
  challenges: string[]
  topics: string[]
  rockUpdates: RockUpdate[]
  rating: number
  notes: string
}

interface SessionPrepRecord {
  id: string
  session_id: string
  business_id: string
  client_id: string
  responses: PrepResponses
  submitted_at: string | null
  created_at: string
  updated_at: string
}

interface SessionPrepFormProps {
  sessionId: string
  businessId: string
  mode: 'client' | 'coach'
  onSubmit?: () => void
}

const emptyResponses: PrepResponses = {
  wins: [''],
  challenges: [''],
  topics: [''],
  rockUpdates: [],
  rating: 5,
  notes: ''
}

// --- Helpers ---

function getRatingColor(rating: number): string {
  if (rating >= 7) return 'text-brand-teal-600 bg-brand-teal-50 border-brand-teal-200'
  if (rating >= 4) return 'text-amber-600 bg-amber-50 border-amber-200'
  return 'text-red-600 bg-red-50 border-red-200'
}

function getRatingLabel(rating: number): string {
  if (rating >= 7) return 'Great week'
  if (rating >= 4) return 'Okay week'
  return 'Tough week'
}

function getRockStatusColor(status: RockUpdate['status']): string {
  switch (status) {
    case 'on-track': return 'bg-brand-teal-100 text-brand-teal-700'
    case 'at-risk': return 'bg-amber-100 text-amber-700'
    case 'off-track': return 'bg-red-100 text-red-700'
  }
}

function getRockStatusLabel(status: RockUpdate['status']): string {
  switch (status) {
    case 'on-track': return 'On Track'
    case 'at-risk': return 'At Risk'
    case 'off-track': return 'Off Track'
  }
}

// --- Dynamic List Field ---

function DynamicListField({
  label,
  icon: Icon,
  iconColor,
  items,
  onChange,
  placeholder
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
}) {
  const addItem = () => onChange([...items, ''])

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index)
    onChange(next.length === 0 ? [''] : next)
  }

  const updateItem = (index: number, value: string) => {
    const next = [...items]
    next[index] = value
    onChange(next)
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-semibold text-brand-navy-700 mb-3">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        {label}
      </label>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => updateItem(index, e.target.value)}
              placeholder={placeholder}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange
                placeholder:text-gray-400"
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                aria-label="Remove item"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItem}
        className="mt-2 flex items-center gap-1.5 text-sm text-brand-orange hover:text-brand-orange-700
          font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add another
      </button>
    </div>
  )
}

// --- Read-Only List ---

function ReadOnlyList({
  label,
  icon: Icon,
  iconColor,
  bgColor,
  items
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  bgColor: string
  items: string[]
}) {
  const filtered = items.filter(Boolean)
  if (filtered.length === 0) return null

  return (
    <div className={`rounded-xl p-5 ${bgColor}`}>
      <h4 className="flex items-center gap-2 text-sm font-semibold text-brand-navy-700 mb-3">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        {label}
      </h4>
      <ul className="space-y-2">
        {filtered.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${iconColor.replace('text-', 'bg-')}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

// --- Coach View ---

function CoachView({ prep }: { prep: SessionPrepRecord }) {
  const { responses } = prep

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-brand-navy-800">Pre-Session Prep</h3>
        <span className="text-xs text-gray-500">
          Submitted {new Date(prep.submitted_at!).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      </div>

      {/* Week Rating */}
      <div className={`rounded-xl p-5 border ${getRatingColor(responses.rating)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            <span className="font-semibold">Week Rating</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">{responses.rating}/10</span>
            <span className="text-sm font-medium">{getRatingLabel(responses.rating)}</span>
          </div>
        </div>
      </div>

      {/* Wins */}
      <ReadOnlyList
        label="Wins This Week"
        icon={Trophy}
        iconColor="text-brand-teal-600"
        bgColor="bg-brand-teal-50/50"
        items={responses.wins}
      />

      {/* Challenges */}
      <ReadOnlyList
        label="Challenges & Blockers"
        icon={AlertCircle}
        iconColor="text-amber-600"
        bgColor="bg-amber-50/50"
        items={responses.challenges}
      />

      {/* Topics */}
      <ReadOnlyList
        label="Topics to Discuss"
        icon={MessageSquare}
        iconColor="text-brand-navy-600"
        bgColor="bg-brand-navy-50/50"
        items={responses.topics}
      />

      {/* Rock Updates */}
      {responses.rockUpdates && responses.rockUpdates.length > 0 && (
        <div className="rounded-xl p-5 bg-gray-50">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-brand-navy-700 mb-3">
            Rock Updates
          </h4>
          <div className="space-y-2">
            {responses.rockUpdates.map((rock, i) => (
              <div key={i} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-gray-100">
                <span className="text-sm text-gray-700 font-medium">{rock.title}</span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getRockStatusColor(rock.status)}`}>
                  {getRockStatusLabel(rock.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {responses.notes && (
        <div className="rounded-xl p-5 bg-gray-50">
          <h4 className="text-sm font-semibold text-brand-navy-700 mb-2">Additional Notes</h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{responses.notes}</p>
        </div>
      )}
    </div>
  )
}

// --- Main Component ---

export function SessionPrepForm({ sessionId, businessId, mode, onSubmit }: SessionPrepFormProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prep, setPrep] = useState<SessionPrepRecord | null>(null)
  const [responses, setResponses] = useState<PrepResponses>(emptyResponses)

  // Load existing prep record
  const loadPrep = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('session_prep')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (data) {
        setPrep(data as SessionPrepRecord)
        const r = data.responses as PrepResponses
        setResponses({
          wins: r.wins?.length ? r.wins : [''],
          challenges: r.challenges?.length ? r.challenges : [''],
          topics: r.topics?.length ? r.topics : [''],
          rockUpdates: r.rockUpdates || [],
          rating: r.rating ?? 5,
          notes: r.notes || ''
        })
        if (data.submitted_at) {
          setSubmitted(true)
        }
      }
    } catch (err) {
      console.error('Failed to load session prep:', err)
      setError('Failed to load session prep. Please try again.')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    loadPrep()
  }, [loadPrep])

  // Clean up empty strings before saving
  function cleanResponses(r: PrepResponses): PrepResponses {
    return {
      ...r,
      wins: r.wins.filter(Boolean),
      challenges: r.challenges.filter(Boolean),
      topics: r.topics.filter(Boolean)
    }
  }

  // Upsert handler
  async function upsertPrep(submit: boolean) {
    const isSaving = submit ? setSubmitting : setSaving
    isSaving(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const cleaned = cleanResponses(responses)
      const now = new Date().toISOString()

      const payload = {
        session_id: sessionId,
        business_id: businessId,
        client_id: user.id,
        responses: cleaned,
        updated_at: now,
        ...(submit ? { submitted_at: now } : {}),
        ...(prep ? {} : { created_at: now })
      }

      let result
      if (prep) {
        result = await supabase
          .from('session_prep')
          .update(payload)
          .eq('id', prep.id)
          .select()
          .single()
      } else {
        result = await supabase
          .from('session_prep')
          .insert(payload)
          .select()
          .single()
      }

      if (result.error) throw result.error

      setPrep(result.data as SessionPrepRecord)

      if (submit) {
        setSubmitted(true)
        onSubmit?.()
      }
    } catch (err) {
      console.error('Failed to save session prep:', err)
      setError(submit ? 'Failed to submit. Please try again.' : 'Failed to save draft. Please try again.')
    } finally {
      isSaving(false)
    }
  }

  // --- Render: Loading ---
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading session prep...</span>
        </div>
      </div>
    )
  }

  // --- Render: Error ---
  if (error && !prep && !responses) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-8">
        <div className="flex items-center justify-center gap-3 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    )
  }

  // --- Render: Coach Mode ---
  if (mode === 'coach') {
    if (!prep || !prep.submitted_at) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex flex-col items-center justify-center gap-3 text-gray-500">
            <MessageSquare className="w-8 h-8 text-gray-300" />
            <p className="text-sm font-medium">Client hasn&apos;t submitted pre-session prep yet</p>
          </div>
        </div>
      )
    }

    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <CoachView prep={prep} />
      </div>
    )
  }

  // --- Render: Client Mode — Already Submitted ---
  if (submitted && prep) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* Confirmation banner */}
        <div className="flex items-center gap-3 bg-brand-teal-50 border border-brand-teal-200 rounded-xl px-5 py-4">
          <div className="w-10 h-10 rounded-full bg-brand-teal-100 flex items-center justify-center">
            <Check className="w-5 h-5 text-brand-teal-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-teal-800">Pre-session prep submitted</p>
            <p className="text-xs text-brand-teal-600">
              Submitted {new Date(prep.submitted_at!).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        </div>

        {/* Read-only view of submitted responses */}
        <CoachView prep={prep} />
      </div>
    )
  }

  // --- Render: Client Mode — Form ---
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-brand-navy-800 mb-1">Pre-Session Prep</h3>
      <p className="text-sm text-gray-500 mb-6">
        Fill this in before your session so your coach can prepare.
      </p>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          upsertPrep(true)
        }}
        className="space-y-6"
      >
        {/* Wins */}
        <DynamicListField
          label="Wins this week"
          icon={Trophy}
          iconColor="text-brand-teal-600"
          items={responses.wins}
          onChange={(wins) => setResponses((prev) => ({ ...prev, wins }))}
          placeholder="What went well this week?"
        />

        {/* Challenges */}
        <DynamicListField
          label="Challenges or blockers"
          icon={AlertCircle}
          iconColor="text-amber-600"
          items={responses.challenges}
          onChange={(challenges) => setResponses((prev) => ({ ...prev, challenges }))}
          placeholder="What's been difficult or blocking progress?"
        />

        {/* Topics */}
        <DynamicListField
          label="Topics I'd like to discuss"
          icon={MessageSquare}
          iconColor="text-brand-navy-600"
          items={responses.topics}
          onChange={(topics) => setResponses((prev) => ({ ...prev, topics }))}
          placeholder="What do you want to cover in this session?"
        />

        {/* Week Rating */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-navy-700 mb-3">
            <Star className="w-4 h-4 text-brand-orange" />
            How would you rate your week? (1-10)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={10}
              value={responses.rating}
              onChange={(e) => setResponses((prev) => ({ ...prev, rating: parseInt(e.target.value, 10) }))}
              className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-orange
                [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md"
            />
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold ${getRatingColor(responses.rating)}`}>
              {responses.rating}/10
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{getRatingLabel(responses.rating)}</p>
        </div>

        {/* Notes */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-navy-700 mb-3">
            Any other notes
          </label>
          <textarea
            value={responses.notes}
            onChange={(e) => setResponses((prev) => ({ ...prev, notes: e.target.value }))}
            rows={4}
            placeholder="Anything else you'd like your coach to know..."
            className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange
              placeholder:text-gray-400 resize-none"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => upsertPrep(false)}
            disabled={saving || submitting}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 border border-gray-300
              rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Draft'
            )}
          </button>
          <button
            type="submit"
            disabled={saving || submitting}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-brand-orange
              rounded-xl text-sm font-semibold text-white hover:bg-brand-orange-700
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Submit
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default SessionPrepForm
