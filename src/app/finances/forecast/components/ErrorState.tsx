'use client'

import React from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'

interface ErrorStateProps {
  error?: Error | string
  onRetry?: () => void
  fullPage?: boolean
  title?: string
}

export default function ErrorState({
  error,
  onRetry,
  fullPage = false,
  title = 'Something went wrong'
}: ErrorStateProps) {
  const errorMessage = typeof error === 'string'
    ? error
    : error?.message || 'An unexpected error occurred'

  if (fullPage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-brand-orange-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>

          <p className="text-gray-600 mb-6">{errorMessage}</p>

          <div className="flex items-center justify-center gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-2 px-6 py-3 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            )}
            <a
              href="/dashboard"
              className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Home className="w-4 h-4" />
              Go Home
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <AlertCircle className="w-6 h-6 text-red-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900 mb-1">{title}</h3>
          <p className="text-sm text-red-700 mb-3">{errorMessage}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = React.useState(false)
  const [error, setError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true)
      setError(event.error)
    }

    window.addEventListener('error', handleError)
    return () => window.removeEventListener('error', handleError)
  }, [])

  if (hasError) {
    return (
      <ErrorState
        error={error || undefined}
        onRetry={() => {
          setHasError(false)
          setError(null)
          window.location.reload()
        }}
        fullPage
      />
    )
  }

  return <>{children}</>
}
