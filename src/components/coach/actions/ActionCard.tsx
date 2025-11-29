'use client'

import Link from 'next/link'
import {
  CheckCircle,
  Circle,
  Clock,
  AlertTriangle,
  Building2,
  Calendar,
  Flag,
  MoreHorizontal,
  Edit2,
  Trash2,
  ArrowRight
} from 'lucide-react'
import { useState } from 'react'

export interface ActionItem {
  id: string
  title: string
  description?: string
  businessId: string
  businessName: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string
  assignedTo?: string
  createdAt: string
  completedAt?: string
  category?: string
}

interface ActionCardProps {
  action: ActionItem
  onToggleComplete?: (actionId: string) => void
  onEdit?: (action: ActionItem) => void
  onDelete?: (actionId: string) => void
  compact?: boolean
}

export function ActionCard({
  action,
  onToggleComplete,
  onEdit,
  onDelete,
  compact = false
}: ActionCardProps) {
  const [showMenu, setShowMenu] = useState(false)

  const isOverdue = action.dueDate &&
    new Date(action.dueDate) < new Date() &&
    action.status !== 'completed' &&
    action.status !== 'cancelled'

  const isDueSoon = action.dueDate && !isOverdue && (() => {
    const dueDate = new Date(action.dueDate)
    const now = new Date()
    const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays <= 3
  })()

  const getPriorityColor = (priority: ActionItem['priority']) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100'
      case 'high': return 'text-orange-600 bg-orange-100'
      case 'medium': return 'text-yellow-600 bg-yellow-100'
      case 'low': return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = () => {
    if (action.status === 'completed') {
      return <CheckCircle className="w-5 h-5 text-green-600" />
    }
    if (action.status === 'in_progress') {
      return <Clock className="w-5 h-5 text-indigo-600" />
    }
    if (isOverdue) {
      return <AlertTriangle className="w-5 h-5 text-red-600" />
    }
    return <Circle className="w-5 h-5 text-gray-400" />
  }

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow'
    } else {
      return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
    }
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        action.status === 'completed'
          ? 'bg-gray-50 border-gray-200'
          : isOverdue
            ? 'bg-red-50 border-red-200'
            : 'bg-white border-gray-200 hover:border-indigo-300'
      }`}>
        <button
          onClick={() => onToggleComplete?.(action.id)}
          className="flex-shrink-0"
        >
          {getStatusIcon()}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`font-medium truncate ${
            action.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'
          }`}>
            {action.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500 truncate">{action.businessName}</span>
            {action.dueDate && (
              <span className={`text-xs ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
                &middot; {formatDueDate(action.dueDate)}
              </span>
            )}
          </div>
        </div>
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getPriorityColor(action.priority)}`}>
          {action.priority}
        </span>
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-xl border p-5 transition-all ${
      action.status === 'completed'
        ? 'border-gray-200 opacity-75'
        : isOverdue
          ? 'border-red-200 ring-1 ring-red-100'
          : 'border-gray-200 hover:border-indigo-300 hover:shadow-sm'
    }`}>
      <div className="flex items-start gap-4">
        {/* Status Toggle */}
        <button
          onClick={() => onToggleComplete?.(action.id)}
          className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            action.status === 'completed'
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-gray-300 hover:border-indigo-500'
          }`}
        >
          {action.status === 'completed' && <CheckCircle className="w-4 h-4" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h4 className={`font-semibold ${
                action.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'
              }`}>
                {action.title}
              </h4>
              {action.description && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{action.description}</p>
              )}
            </div>

            {/* Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    <button
                      onClick={() => {
                        onEdit?.(action)
                        setShowMenu(false)
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        onDelete?.(action.id)
                        setShowMenu(false)
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center flex-wrap gap-3 mt-3">
            {/* Client */}
            <Link
              href={`/coach/clients/${action.businessId}`}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-indigo-600"
            >
              <Building2 className="w-4 h-4" />
              {action.businessName}
            </Link>

            {/* Due Date */}
            {action.dueDate && (
              <div className={`flex items-center gap-1.5 text-sm ${
                isOverdue ? 'text-red-600' : isDueSoon ? 'text-amber-600' : 'text-gray-600'
              }`}>
                <Calendar className="w-4 h-4" />
                {formatDueDate(action.dueDate)}
                {isOverdue && <span className="font-medium">(Overdue)</span>}
              </div>
            )}

            {/* Priority */}
            <span className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${getPriorityColor(action.priority)}`}>
              <Flag className="w-3 h-3" />
              {action.priority}
            </span>

            {/* Category */}
            {action.category && (
              <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                {action.category}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ActionCard
