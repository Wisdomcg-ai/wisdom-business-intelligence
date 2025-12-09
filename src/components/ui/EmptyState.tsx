'use client'

import { ReactNode } from 'react'
import { Inbox, FileText, Users, Target, Calendar, MessageSquare, BarChart3 } from 'lucide-react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4">
      {icon && (
        <div className="mx-auto h-12 w-12 text-gray-400 mb-4 flex items-center justify-center">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      {description && (
        <p className="text-gray-500 mb-6 max-w-md mx-auto">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center px-4 py-2 bg-[#1a1f36] text-white rounded-lg hover:bg-[#2a2f46] transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// Pre-configured empty states for common use cases
export function NoDataEmpty({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={<Inbox className="h-12 w-12" />}
      title="No data yet"
      description="Get started by adding your first item."
      action={onAction ? { label: 'Get Started', onClick: onAction } : undefined}
    />
  )
}

export function NoResultsEmpty({ searchTerm }: { searchTerm?: string }) {
  return (
    <EmptyState
      icon={<FileText className="h-12 w-12" />}
      title="No results found"
      description={searchTerm
        ? `No results match "${searchTerm}". Try adjusting your search.`
        : "Try adjusting your filters or search terms."
      }
    />
  )
}

export function NoClientsEmpty({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={<Users className="h-12 w-12" />}
      title="No clients yet"
      description="Add your first client to start coaching."
      action={onAction ? { label: 'Add Client', onClick: onAction } : undefined}
    />
  )
}

export function NoGoalsEmpty({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={<Target className="h-12 w-12" />}
      title="No goals set"
      description="Define your business goals to track progress."
      action={onAction ? { label: 'Create Goal', onClick: onAction } : undefined}
    />
  )
}

export function NoSessionsEmpty({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={<Calendar className="h-12 w-12" />}
      title="No sessions scheduled"
      description="Schedule your first coaching session."
      action={onAction ? { label: 'Schedule Session', onClick: onAction } : undefined}
    />
  )
}

export function NoMessagesEmpty() {
  return (
    <EmptyState
      icon={<MessageSquare className="h-12 w-12" />}
      title="No messages"
      description="Your conversation will appear here."
    />
  )
}

export function NoReportsEmpty({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={<BarChart3 className="h-12 w-12" />}
      title="No reports available"
      description="Reports will be generated as you add data."
      action={onAction ? { label: 'Add Data', onClick: onAction } : undefined}
    />
  )
}
