'use client'

import { useEffect } from 'react'
import { errorTracker } from '@/lib/utils/error-tracking'

/**
 * Global error handler component
 * Catches unhandled errors and promise rejections
 * Should be placed near the root of the application
 */
export function GlobalErrorHandler({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault()

      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason))

      errorTracker.trackError(error, {
        action: 'Unhandled Promise Rejection',
        route: typeof window !== 'undefined' ? window.location.pathname : undefined
      }, 'high')

      console.error('[Global Error Handler] Unhandled promise rejection:', error)
    }

    // Handle uncaught errors
    const handleError = (event: ErrorEvent) => {
      errorTracker.trackError(event.error || event.message, {
        action: 'Uncaught Error',
        route: typeof window !== 'undefined' ? window.location.pathname : undefined,
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      }, 'critical')

      console.error('[Global Error Handler] Uncaught error:', event.error || event.message)
    }

    // Add event listeners
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)

    // Cleanup
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
    }
  }, [])

  return <>{children}</>
}
