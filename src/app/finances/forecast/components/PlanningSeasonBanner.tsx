'use client'

import { useState, useEffect } from 'react'
import { Calendar, X } from 'lucide-react'

interface PlanningSeasonBannerProps {
  nextFiscalYear: number
  monthsRemaining: number
  yearStartMonth: number
  onPlanNextYear: () => void
}

export function PlanningSeasonBanner({
  nextFiscalYear,
  monthsRemaining,
  onPlanNextYear,
}: PlanningSeasonBannerProps) {
  const currentFY = nextFiscalYear - 1
  const dismissKey = `planning-banner-dismissed-${nextFiscalYear}`

  const [dismissed, setDismissed] = useState(false)

  // Check sessionStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(dismissKey)
      if (stored === 'true') {
        setDismissed(true)
      }
    }
  }, [dismissKey])

  const handleDismiss = () => {
    setDismissed(true)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(dismissKey, 'true')
    }
  }

  if (dismissed) return null

  const message =
    monthsRemaining === 0
      ? `FY${currentFY} has ended. Lock it and start FY${nextFiscalYear}.`
      : `Planning season — ${monthsRemaining} month${monthsRemaining === 1 ? '' : 's'} until FY${currentFY} ends. Start building your FY${nextFiscalYear} forecast.`

  return (
    <div className="relative flex items-center gap-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 border-l-4 border-l-brand-navy">
      <Calendar className="w-5 h-5 text-brand-navy flex-shrink-0" />

      <p className="flex-1 text-sm text-gray-700">{message}</p>

      <button
        onClick={onPlanNextYear}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-brand-navy hover:bg-brand-navy-800 rounded-md transition-colors"
      >
        Plan FY{nextFiscalYear}
      </button>

      <button
        onClick={handleDismiss}
        aria-label="Dismiss planning season banner"
        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
