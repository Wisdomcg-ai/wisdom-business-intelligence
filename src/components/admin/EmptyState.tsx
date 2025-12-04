'use client'

import { LucideIcon, Plus } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
    icon?: LucideIcon
  }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  const ActionIcon = action?.icon || Plus

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-slate-500 text-center max-w-sm mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white font-medium rounded-xl hover:bg-teal-700 transition-colors shadow-lg shadow-teal-500/20"
        >
          <ActionIcon className="w-4 h-4" />
          {action.label}
        </button>
      )}
    </div>
  )
}

// Smaller inline empty state for use within cards
interface InlineEmptyStateProps {
  icon: LucideIcon
  message: string
}

export function InlineEmptyState({ icon: Icon, message }: InlineEmptyStateProps) {
  return (
    <div className="flex items-center justify-center gap-3 py-8 text-slate-400">
      <Icon className="w-5 h-5" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
