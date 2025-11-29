'use client'

import Link from 'next/link'
import {
  ListChecks,
  CheckCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Circle
} from 'lucide-react'

interface Action {
  id: string
  title: string
  dueDate?: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  category?: string
}

interface PendingActionsProps {
  actions: Action[]
  onToggleComplete?: (actionId: string) => void
}

export function PendingActions({ actions, onToggleComplete }: PendingActionsProps) {
  const getPriorityStyles = (priority: Action['priority']) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-700 border-red-200'
      case 'high':
        return 'bg-orange-100 text-orange-700 border-orange-200'
      case 'medium':
        return 'bg-amber-100 text-amber-700 border-amber-200'
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false
    return new Date(dueDate) < new Date()
  }

  const formatDueDate = (dueDate?: string) => {
    if (!dueDate) return null
    const date = new Date(dueDate)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow'
    }
    return date.toLocaleDateString('en-AU', {
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <ListChecks className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Pending Actions</h3>
            <p className="text-sm text-gray-500">{actions.length} items to complete</p>
          </div>
        </div>
        <Link
          href="/actions"
          className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
        >
          View all
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {actions.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h4 className="font-medium text-gray-900 mb-1">All caught up!</h4>
          <p className="text-sm text-gray-500">You have no pending actions</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {actions.slice(0, 5).map(action => (
            <div
              key={action.id}
              className="px-6 py-3 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => onToggleComplete?.(action.id)}
                  className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-teal-500 transition-colors"
                >
                  <Circle className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-medium">{action.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getPriorityStyles(action.priority)}`}>
                      {action.priority}
                    </span>
                    {action.dueDate && (
                      <span className={`flex items-center gap-1 text-xs ${
                        isOverdue(action.dueDate) ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        {isOverdue(action.dueDate) ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {formatDueDate(action.dueDate)}
                      </span>
                    )}
                    {action.category && (
                      <span className="text-xs text-gray-400">{action.category}</span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/actions/${action.id}`}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-teal-600 transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {actions.length > 5 && (
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
          <Link
            href="/actions"
            className="text-sm text-teal-600 hover:text-teal-700 font-medium"
          >
            +{actions.length - 5} more actions
          </Link>
        </div>
      )}
    </div>
  )
}

export default PendingActions
