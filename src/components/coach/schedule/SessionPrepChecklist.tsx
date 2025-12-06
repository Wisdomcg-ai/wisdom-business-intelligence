'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle,
  Circle,
  FileText,
  Target,
  TrendingUp,
  ListChecks,
  MessageSquare,
  Clock,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react'

interface PrepItem {
  id: string
  label: string
  description: string
  completed: boolean
  link?: string
  linkLabel?: string
}

interface SessionPrepChecklistProps {
  sessionId: string
  clientId: string
  businessName: string
  onComplete?: () => void
  initialItems?: PrepItem[]
}

const defaultPrepItems: Omit<PrepItem, 'id' | 'completed'>[] = [
  {
    label: 'Review previous session notes',
    description: 'Check notes from the last session for context and follow-ups',
    linkLabel: 'View notes'
  },
  {
    label: 'Check action item progress',
    description: 'Review status of assigned action items',
    linkLabel: 'View actions'
  },
  {
    label: 'Review goals & KPIs',
    description: 'Check current progress on strategic goals',
    linkLabel: 'View goals'
  },
  {
    label: 'Check financial forecast',
    description: 'Review latest forecast and any significant changes',
    linkLabel: 'View forecast'
  },
  {
    label: 'Review recent messages',
    description: 'Check for any questions or concerns raised since last session',
    linkLabel: 'View messages'
  },
  {
    label: 'Prepare session agenda',
    description: 'Outline key topics to cover in this session'
  }
]

export function SessionPrepChecklist({
  sessionId,
  clientId,
  businessName,
  onComplete,
  initialItems
}: SessionPrepChecklistProps) {
  const [items, setItems] = useState<PrepItem[]>(
    initialItems || defaultPrepItems.map((item, idx) => ({
      ...item,
      id: `prep-${idx}`,
      completed: false,
      link: item.linkLabel ? `/coach/clients/${clientId}?tab=${
        item.label.includes('notes') ? 'notes' :
        item.label.includes('action') ? 'actions' :
        item.label.includes('goals') ? 'goals' :
        item.label.includes('forecast') ? 'financials' :
        item.label.includes('messages') ? 'messages' : 'overview'
      }` : undefined
    }))
  )

  const [expanded, setExpanded] = useState(true)
  const [notes, setNotes] = useState('')

  const completedCount = items.filter(i => i.completed).length
  const allCompleted = completedCount === items.length
  const progress = Math.round((completedCount / items.length) * 100)

  const toggleItem = (id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ))
  }

  const getIcon = (label: string) => {
    if (label.includes('notes')) return FileText
    if (label.includes('action')) return ListChecks
    if (label.includes('goals')) return Target
    if (label.includes('forecast')) return TrendingUp
    if (label.includes('messages')) return MessageSquare
    if (label.includes('agenda')) return Clock
    return Circle
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            allCompleted ? 'bg-green-100' : 'bg-amber-100'
          }`}>
            {allCompleted ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <Clock className="w-5 h-5 text-amber-600" />
            )}
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">Session Prep</h3>
            <p className="text-sm text-gray-500">{businessName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className={`text-sm font-medium ${allCompleted ? 'text-green-600' : 'text-amber-600'}`}>
              {completedCount}/{items.length} complete
            </p>
            <div className="w-24 h-1.5 bg-gray-200 rounded-full mt-1">
              <div
                className={`h-full rounded-full transition-all ${
                  allCompleted ? 'bg-green-500' : 'bg-amber-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Checklist */}
      {expanded && (
        <div className="border-t border-gray-200">
          <div className="divide-y divide-gray-100">
            {items.map(item => {
              const Icon = getIcon(item.label)
              return (
                <div
                  key={item.id}
                  className="px-5 py-4 flex items-start gap-4"
                >
                  <button
                    onClick={() => toggleItem(item.id)}
                    className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      item.completed
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 hover:border-brand-orange'
                    }`}
                  >
                    {item.completed && <CheckCircle className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${item.completed ? 'text-gray-400' : 'text-gray-600'}`} />
                      <p className={`font-medium ${item.completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                        {item.label}
                      </p>
                    </div>
                    <p className={`text-sm mt-1 ${item.completed ? 'text-gray-400' : 'text-gray-500'}`}>
                      {item.description}
                    </p>
                  </div>
                  {item.link && item.linkLabel && (
                    <Link
                      href={item.link}
                      className="flex items-center gap-1 text-sm text-brand-orange hover:text-brand-orange-700 font-medium flex-shrink-0"
                    >
                      {item.linkLabel}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              )
            })}
          </div>

          {/* Session Notes */}
          <div className="px-5 py-4 border-t border-gray-200 bg-gray-50">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pre-session Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Key points to discuss, questions to ask, goals for this session..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm"
            />
          </div>

          {/* Complete Button */}
          <div className="px-5 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onComplete}
              disabled={!allCompleted}
              className={`w-full py-3 rounded-lg font-medium transition-colors ${
                allCompleted
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              {allCompleted ? 'Mark Prep Complete' : `Complete ${items.length - completedCount} more items`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default SessionPrepChecklist
