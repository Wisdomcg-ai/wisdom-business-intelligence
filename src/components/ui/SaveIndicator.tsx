'use client'

import { Check, Loader2, AlertCircle, Cloud } from 'lucide-react'
import { SaveStatus, getSaveStatusText } from '@/hooks/useAutoSave'

interface SaveIndicatorProps {
  /** Current save status from useAutoSave hook */
  status: SaveStatus
  /** Last saved timestamp from useAutoSave hook */
  lastSaved: Date | null
  /** Visual variant */
  variant?: 'default' | 'compact' | 'banner'
  /** Additional className */
  className?: string
  /** Show even when idle with no lastSaved */
  showAlways?: boolean
}

/**
 * SaveIndicator Component
 *
 * Displays auto-save status in a consistent way across the platform.
 * Designed to integrate with PageHeader or be used standalone.
 *
 * @example
 * // Basic usage with useAutoSave hook
 * const { saveStatus, lastSaved } = useAutoSave({ ... })
 * <SaveIndicator status={saveStatus} lastSaved={lastSaved} />
 *
 * @example
 * // Compact variant for headers
 * <SaveIndicator status={saveStatus} lastSaved={lastSaved} variant="compact" />
 */
export default function SaveIndicator({
  status,
  lastSaved,
  variant = 'default',
  className = '',
  showAlways = false
}: SaveIndicatorProps) {
  const text = getSaveStatusText(status, lastSaved)

  // Don't show if idle and no text
  if (!showAlways && status === 'idle' && !text) {
    return null
  }

  // Get icon based on status
  const getIcon = () => {
    switch (status) {
      case 'saving':
        return <Loader2 className="w-3.5 h-3.5 animate-spin" />
      case 'saved':
        return <Check className="w-3.5 h-3.5" />
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5" />
      case 'idle':
        return lastSaved ? <Cloud className="w-3.5 h-3.5" /> : null
      default:
        return null
    }
  }

  // Get colors based on status
  const getColors = () => {
    switch (status) {
      case 'saving':
        return variant === 'banner'
          ? 'text-white/80 bg-white/10'
          : 'text-amber-600 bg-amber-50'
      case 'saved':
        return variant === 'banner'
          ? 'text-green-300 bg-green-500/20'
          : 'text-green-600 bg-green-50'
      case 'error':
        return variant === 'banner'
          ? 'text-red-300 bg-red-500/20'
          : 'text-red-600 bg-red-50'
      case 'idle':
      default:
        return variant === 'banner'
          ? 'text-white/60 bg-white/5'
          : 'text-gray-500 bg-gray-50'
    }
  }

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-1.5 text-xs ${getColors()} px-2 py-1 rounded-full ${className}`}>
        {getIcon()}
        <span>{text}</span>
      </div>
    )
  }

  if (variant === 'banner') {
    return (
      <div className={`flex items-center gap-1.5 text-sm ${getColors()} px-3 py-1.5 rounded-lg ${className}`}>
        {getIcon()}
        <span>{text}</span>
      </div>
    )
  }

  // Default variant
  return (
    <div className={`flex items-center gap-2 text-sm ${getColors()} px-3 py-1.5 rounded-lg ${className}`}>
      {getIcon()}
      <span>{text}</span>
    </div>
  )
}

// Named export for convenience
export { SaveIndicator }
