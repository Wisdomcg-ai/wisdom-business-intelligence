'use client'

import { Cloud, CloudOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface SaveIndicatorProps {
  status: SaveStatus
  lastSaved?: Date | null
  isDirty?: boolean
  onRetry?: () => void
  className?: string
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export function SaveIndicator({
  status,
  lastSaved,
  isDirty = false,
  onRetry,
  className = ''
}: SaveIndicatorProps) {
  // Determine display state
  const getDisplayState = () => {
    if (status === 'saving') {
      return {
        icon: <Loader2 className="w-4 h-4 animate-spin text-amber-600" />,
        text: 'Saving...',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        textColor: 'text-amber-700'
      }
    }

    if (status === 'saved') {
      return {
        icon: <Cloud className="w-4 h-4 text-green-600" />,
        text: 'All changes saved',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        textColor: 'text-green-700'
      }
    }

    if (status === 'error') {
      return {
        icon: <CloudOff className="w-4 h-4 text-red-600" />,
        text: 'Save failed',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-700',
        showRetry: true
      }
    }

    if (isDirty) {
      return {
        icon: <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />,
        text: 'Unsaved changes',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        textColor: 'text-amber-700'
      }
    }

    // Idle state with last saved time
    if (lastSaved) {
      return {
        icon: <Cloud className="w-4 h-4 text-slate-400" />,
        text: `Saved ${getTimeAgo(lastSaved)}`,
        bgColor: 'bg-slate-50',
        borderColor: 'border-slate-200',
        textColor: 'text-slate-500'
      }
    }

    return null
  }

  const displayState = getDisplayState()

  if (!displayState) return null

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all
        ${displayState.bgColor} ${displayState.borderColor}
        ${className}
      `}
    >
      {displayState.icon}
      <span className={`text-xs font-medium ${displayState.textColor}`}>
        {displayState.text}
      </span>
      {displayState.showRetry && onRetry && (
        <button
          onClick={onRetry}
          className="ml-1 text-xs font-medium text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      )}
    </div>
  )
}

// Compact version for inline use
export function SaveIndicatorCompact({
  status,
  className = ''
}: {
  status: SaveStatus
  className?: string
}) {
  if (status === 'saving') {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
        <span className="text-xs text-amber-600">Saving...</span>
      </div>
    )
  }

  if (status === 'saved') {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
        <span className="text-xs text-green-600">Saved</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
        <span className="text-xs text-red-600">Error</span>
      </div>
    )
  }

  return null
}

// Hook-friendly wrapper that matches the useStrategicPlanning status
export function useSaveIndicatorProps(
  saveStatus: SaveStatus,
  isDirty: boolean,
  lastSaved: Date | null
): SaveIndicatorProps {
  return {
    status: saveStatus,
    isDirty,
    lastSaved
  }
}
