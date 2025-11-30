'use client'

import { useState, useEffect } from 'react'
import { Target, CheckCircle2, Clock, AlertTriangle, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/contexts/BusinessContext'

interface SessionAction {
  id: string
  description: string
  due_date: string | null
  status: 'pending' | 'completed' | 'missed' | 'carried_over'
  completed_at: string | null
  session_note_id: string | null
  created_at: string
}

interface SessionActionsCardProps {
  userId?: string | null
}

export function SessionActionsCard({ userId }: SessionActionsCardProps) {
  const supabase = createClient()
  const { activeBusiness } = useBusinessContext()
  const [actions, setActions] = useState<SessionAction[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    async function loadActions() {
      try {
        // First try to get business ID from context
        let businessId = activeBusiness?.id

        // If no context, try to find user's business directly
        if (!businessId) {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) {
            setLoading(false)
            return
          }

          // Try business_users first
          const { data: businessUser } = await supabase
            .from('business_users')
            .select('business_id')
            .eq('user_id', user.id)
            .maybeSingle()

          if (businessUser?.business_id) {
            businessId = businessUser.business_id
          } else {
            // Try direct owner lookup
            const { data: ownedBusiness } = await supabase
              .from('businesses')
              .select('id')
              .eq('owner_id', user.id)
              .maybeSingle()

            if (ownedBusiness?.id) {
              businessId = ownedBusiness.id
            }
          }
        }

        if (!businessId) {
          setLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('session_actions')
          .select('*')
          .eq('business_id', businessId)
          .eq('status', 'pending')
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(5)

        if (error) {
          console.error('Error loading actions:', error)
          return
        }

        setActions(data || [])
      } catch (error) {
        console.error('Error loading actions:', error)
      } finally {
        setLoading(false)
      }
    }

    loadActions()
  }, [supabase, activeBusiness?.id])

  async function toggleComplete(actionId: string) {
    setUpdating(actionId)
    try {
      const action = actions.find(a => a.id === actionId)
      const newStatus = action?.status === 'completed' ? 'pending' : 'completed'

      const { error } = await supabase
        .from('session_actions')
        .update({
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null
        })
        .eq('id', actionId)

      if (error) throw error

      // Update local state
      if (newStatus === 'completed') {
        setActions(actions.filter(a => a.id !== actionId))
      }
    } catch (error) {
      console.error('Error updating action:', error)
    } finally {
      setUpdating(null)
    }
  }

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate + 'T00:00:00')
    return due < today
  }

  const formatDueDate = (dueDate: string | null) => {
    if (!dueDate) return null
    const date = new Date(dueDate + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.getTime() === today.getTime()) return 'Today'
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow'

    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  }

  const getDaysUntil = (dueDate: string | null) => {
    if (!dueDate) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate + 'T00:00:00')
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-12 bg-gray-100 rounded"></div>
            <div className="h-12 bg-gray-100 rounded"></div>
            <div className="h-12 bg-gray-100 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (actions.length === 0) {
    return null // Don't show if no actions
  }

  const overdueCount = actions.filter(a => isOverdue(a.due_date)).length

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            overdueCount > 0 ? 'bg-red-50' : 'bg-slate-100'
          }`}>
            {overdueCount > 0 ? (
              <AlertTriangle className="w-5 h-5 text-red-500" />
            ) : (
              <Target className="w-5 h-5 text-slate-600" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              Actions from Coaching Session
            </h3>
            <p className="text-sm text-gray-500">
              {overdueCount > 0
                ? <span className="text-red-600">{overdueCount} overdue</span>
                : `${actions.length} action${actions.length !== 1 ? 's' : ''} to complete`
              }
            </p>
          </div>
        </div>
        <Link
          href="/sessions"
          className="text-sm font-medium flex items-center gap-1 text-gray-500 hover:text-gray-700"
        >
          View Sessions
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="space-y-2">
        {actions.map((action) => {
          const overdue = isOverdue(action.due_date)
          const daysUntil = getDaysUntil(action.due_date)

          return (
            <div
              key={action.id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                overdue
                  ? 'bg-red-50 border-red-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <button
                onClick={() => toggleComplete(action.id)}
                disabled={updating === action.id}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  updating === action.id
                    ? 'border-gray-300 bg-gray-100'
                    : overdue
                    ? 'border-red-400 hover:bg-red-100'
                    : 'border-gray-400 hover:bg-gray-200'
                }`}
              >
                {updating === action.id ? (
                  <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className={`w-4 h-4 opacity-0 hover:opacity-100 ${
                    overdue ? 'text-red-500' : 'text-gray-600'
                  }`} />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${overdue ? 'text-red-900' : 'text-gray-900'}`}>
                  {action.description}
                </p>
              </div>

              {action.due_date && (
                <div className={`flex items-center gap-1.5 text-xs font-medium flex-shrink-0 ${
                  overdue
                    ? 'text-red-600'
                    : daysUntil !== null && daysUntil <= 2
                    ? 'text-amber-600'
                    : 'text-gray-500'
                }`}>
                  <Clock className="w-3.5 h-3.5" />
                  {formatDueDate(action.due_date)}
                  {overdue && ' (Overdue)'}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {actions.length > 0 && (
        <p className="text-xs text-gray-400 mt-4 text-center">
          Click the circle to mark complete
        </p>
      )}
    </div>
  )
}

export default SessionActionsCard
