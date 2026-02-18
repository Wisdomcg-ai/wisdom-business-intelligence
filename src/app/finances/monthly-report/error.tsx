'use client'

import { useEffect } from 'react'
import { logError } from '@/lib/error-logger'

export default function MonthlyReportError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logError({
      errorType: 'unexpected_error',
      errorMessage: error.message,
      component: 'monthly-report',
      metadata: { digest: error.digest },
    })
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <h2 className="text-xl font-semibold text-gray-900">Something went wrong</h2>
      <p className="text-gray-600 text-sm max-w-md text-center">
        An error occurred while loading the monthly report. Please try again.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
