'use client'

import Link from 'next/link'
import {
  Target,
  ListChecks,
  TrendingUp,
  FileText,
  MessageSquare,
  Calendar,
  Briefcase,
  ArrowRight
} from 'lucide-react'

interface QuickAction {
  id: string
  label: string
  description: string
  href: string
  icon: React.ElementType
  color: string
  bgColor: string
}

const defaultActions: QuickAction[] = [
  {
    id: 'goals',
    label: 'Goals & Planning',
    description: 'Track your strategic goals',
    href: '/goals',
    icon: Target,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50'
  },
  {
    id: 'actions',
    label: 'My Actions',
    description: 'View pending tasks',
    href: '/actions',
    icon: ListChecks,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50'
  },
  {
    id: 'financials',
    label: 'Financials',
    description: 'Financial forecasts',
    href: '/finances/forecast',
    icon: TrendingUp,
    color: 'text-green-600',
    bgColor: 'bg-green-50'
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'Access shared files',
    href: '/documents',
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  },
  {
    id: 'messages',
    label: 'Messages',
    description: 'Chat with your coach',
    href: '/messages',
    icon: MessageSquare,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50'
  },
  {
    id: 'sessions',
    label: 'Sessions',
    description: 'View session history',
    href: '/sessions',
    icon: Calendar,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50'
  }
]

interface QuickActionsProps {
  actions?: QuickAction[]
  pendingActionsCount?: number
  unreadMessagesCount?: number
}

export function QuickActions({
  actions = defaultActions,
  pendingActionsCount = 0,
  unreadMessagesCount = 0
}: QuickActionsProps) {
  const getBadge = (actionId: string) => {
    if (actionId === 'actions' && pendingActionsCount > 0) {
      return pendingActionsCount
    }
    if (actionId === 'messages' && unreadMessagesCount > 0) {
      return unreadMessagesCount
    }
    return null
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Quick Access</h3>
        <p className="text-sm text-gray-500">Jump to your most used tools</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
        {actions.map(action => {
          const Icon = action.icon
          const badge = getBadge(action.id)
          return (
            <Link
              key={action.id}
              href={action.href}
              className="group relative p-4 rounded-xl border border-gray-100 hover:border-teal-200 hover:shadow-sm transition-all"
            >
              {badge !== null && (
                <span className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {badge}
                </span>
              )}
              <div className={`w-10 h-10 ${action.bgColor} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <h4 className="font-medium text-gray-900 group-hover:text-teal-600 transition-colors">
                {action.label}
              </h4>
              <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default QuickActions
