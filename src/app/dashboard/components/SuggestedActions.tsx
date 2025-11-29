'use client'

import Link from 'next/link'
import { Rocket, Calendar, MessageCircle, TrendingUp, Target, ArrowRight, Zap } from 'lucide-react'
import type { SuggestedAction } from '../types'

interface SuggestedActionsProps {
  actions?: SuggestedAction[]
}

function getActionIcon(icon: SuggestedAction['icon']) {
  switch (icon) {
    case 'rock':
      return Rocket
    case 'review':
      return Calendar
    case 'coach':
      return MessageCircle
    case 'forecast':
      return TrendingUp
    case 'goal':
      return Target
    default:
      return Target
  }
}

function getPriorityStyle(priority: SuggestedAction['priority']) {
  switch (priority) {
    case 'high':
      return {
        bg: 'bg-amber-50 hover:bg-amber-100',
        border: 'border-amber-200',
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600'
      }
    case 'medium':
      return {
        bg: 'bg-gray-50 hover:bg-gray-100',
        border: 'border-gray-200',
        iconBg: 'bg-gray-100',
        iconColor: 'text-gray-600'
      }
    case 'low':
      return {
        bg: 'bg-white hover:bg-gray-50',
        border: 'border-gray-200',
        iconBg: 'bg-teal-100',
        iconColor: 'text-teal-600'
      }
  }
}

const defaultActions: SuggestedAction[] = [
  {
    id: 'review-forecast',
    label: 'Review financial forecast',
    description: 'Stay on top of the numbers',
    href: '/finances/forecast',
    priority: 'low',
    icon: 'forecast'
  },
  {
    id: 'one-page-plan',
    label: 'Update your One Page Plan',
    description: 'Keep strategy aligned',
    href: '/one-page-plan',
    priority: 'low',
    icon: 'goal'
  },
  {
    id: 'ask-coach',
    label: 'Ask your coach a question',
    description: 'Get expert guidance',
    href: '#ask-coach',
    priority: 'low',
    icon: 'coach'
  }
]

export default function SuggestedActions({ actions }: SuggestedActionsProps) {
  const displayActions = actions && actions.length > 0 ? actions : defaultActions

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
            <Zap className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Suggested Actions</h3>
            <p className="text-xs text-gray-500">Based on your current priorities</p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="space-y-2">
          {displayActions.map((action) => {
            const Icon = getActionIcon(action.icon)
            const style = getPriorityStyle(action.priority)

            return (
              <Link
                key={action.id}
                href={action.href}
                className={`flex items-center gap-4 p-3 rounded-lg border ${style.border} ${style.bg} transition-colors group`}
              >
                <div className={`w-10 h-10 ${style.iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`h-5 w-5 ${style.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{action.label}</p>
                  <p className="text-xs text-gray-500">{action.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-teal-600 transition-colors flex-shrink-0" />
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
