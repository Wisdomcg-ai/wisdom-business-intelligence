'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface RouteErrorProps {
  error: Error & { digest?: string }
  reset: () => void
  section?: string
}

/**
 * Reusable route-level error component for Next.js error.tsx files.
 *
 * Usage in any error.tsx:
 *   import RouteError from '@/components/RouteError'
 *   export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
 *     return <RouteError error={error} reset={reset} section="Goals" />
 *   }
 */
export default function RouteError({ error, reset, section = 'this page' }: RouteErrorProps) {
  useEffect(() => {
    console.error(`[RouteError] ${section}:`, error)
  }, [error, section])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-6">
      <div className="p-3 bg-amber-100 rounded-full">
        <AlertTriangle className="h-8 w-8 text-amber-600" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900">Something went wrong</h2>
      <p className="text-gray-600 text-sm max-w-md text-center">
        An error occurred while loading {section}. This has been logged.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-navy text-white rounded-lg hover:bg-brand-navy/90 transition-colors font-medium"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
        <button
          onClick={() => window.location.href = '/dashboard'}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}
