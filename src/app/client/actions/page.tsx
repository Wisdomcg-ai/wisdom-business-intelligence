'use client'

import { useEffect, useState } from 'react'
import ClientLayout from '@/components/client/ClientLayout'
import {
  ListChecks,
  CheckCircle,
  Circle,
  Calendar,
  AlertCircle,
  Filter,
  Video
} from 'lucide-react'

interface Action {
  id: string
  action_text: string
  status: string
  due_date: string | null
  created_at: string
  coaching_sessions: {
    id: string
    title: string
    scheduled_at: string
  }
}

export default function ActionsPage() {
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'completed'>('all')

  useEffect(() => {
    loadActions()
  }, [])

  async function loadActions() {
    setLoading(true)

    const res = await fetch('/api/actions')
    const data = await res.json()

    if (data.success) {
      setActions(data.actions || [])
    } else {
      console.error('Error loading actions:', data.error)
    }

    setLoading(false)
  }

  async function toggleActionStatus(actionId: string, currentStatus: string) {
    const newStatus = currentStatus === 'completed' ? 'open' : 'completed'

    const res = await fetch('/api/actions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: actionId, status: newStatus })
    })

    if (res.ok) {
      setActions(prev => prev.map(action =>
        action.id === actionId ? { ...action, status: newStatus } : action
      ))
    }
  }

  const filteredActions = actions.filter(action => {
    if (filter === 'all') return true
    return action.status === filter
  })

  const pendingCount = actions.filter(a => a.status === 'open' || a.status === 'in_progress').length
  const completedCount = actions.filter(a => a.status === 'completed').length

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString()
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Actions & Tasks</h1>
            <p className="text-sm text-gray-600 mt-1">Track your coaching commitments and follow-ups</p>
          </div>
        </div>

        {/* Stats */}
        {actions.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Actions</p>
                  <p className="text-2xl font-bold text-gray-900">{actions.length}</p>
                </div>
                <ListChecks className="w-8 h-8 text-gray-400" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-brand-orange-600">{pendingCount}</p>
                </div>
                <Circle className="w-8 h-8 text-brand-orange-400" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-green-600">{completedCount}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </div>
          </div>
        )}

        {/* Filter */}
        {actions.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-4">
              <Filter className="w-4 h-4 text-gray-600" />
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'all'
                      ? 'bg-brand-orange text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All ({actions.length})
                </button>
                <button
                  onClick={() => setFilter('open')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'open'
                      ? 'bg-brand-orange-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pending ({pendingCount})
                </button>
                <button
                  onClick={() => setFilter('completed')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'completed'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Completed ({completedCount})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Actions List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <ListChecks className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
            <p className="text-gray-600">Loading actions...</p>
          </div>
        ) : filteredActions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <ListChecks className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {actions.length === 0 ? 'No Actions Yet' : `No ${filter} actions`}
            </h3>
            <p className="text-gray-600">
              {actions.length === 0
                ? 'Actions from your coaching sessions will appear here.'
                : `You don't have any ${filter} actions at the moment.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredActions.map((action) => (
              <div
                key={action.id}
                className={`bg-white rounded-lg shadow-sm border-2 transition-all ${
                  action.status === 'completed'
                    ? 'border-green-200 bg-green-50/30'
                    : isOverdue(action.due_date)
                    ? 'border-red-200 bg-red-50/30'
                    : 'border-gray-200 hover:border-brand-orange-300'
                }`}
              >
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <button
                      onClick={() => toggleActionStatus(action.id, action.status)}
                      className="mt-1 flex-shrink-0 transition-transform hover:scale-110"
                    >
                      {action.status === 'completed' ? (
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      ) : (
                        <Circle className="w-6 h-6 text-gray-400 hover:text-brand-orange" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-lg font-semibold mb-2 ${
                        action.status === 'completed'
                          ? 'text-gray-500 line-through'
                          : 'text-gray-900'
                      }`}>
                        {action.action_text}
                      </h3>

                      {/* Session Info */}
                      {action.coaching_sessions && (
                        <div className="mb-3 inline-flex items-center gap-2 px-3 py-1 bg-brand-orange-50 rounded-full text-xs text-brand-orange-700">
                          <Video className="w-3 h-3" />
                          <span>From: {action.coaching_sessions.title}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {action.due_date && (
                          <span className={`flex items-center gap-1 ${
                            isOverdue(action.due_date) && action.status !== 'completed'
                              ? 'text-red-600 font-medium'
                              : ''
                          }`}>
                            <Calendar className="w-3 h-3" />
                            Due {new Date(action.due_date).toLocaleDateString('en-AU', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                            {isOverdue(action.due_date) && action.status !== 'completed' && (
                              <AlertCircle className="w-3 h-3 ml-1" />
                            )}
                          </span>
                        )}
                        <span>
                          Created {new Date(action.created_at).toLocaleDateString('en-AU', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ClientLayout>
  )
}
