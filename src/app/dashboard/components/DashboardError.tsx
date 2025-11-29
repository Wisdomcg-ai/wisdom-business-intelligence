'use client'

import { AlertCircle, RefreshCw, LogIn } from 'lucide-react'
import Link from 'next/link'
import type { DashboardError } from '../types'

interface DashboardErrorProps {
  error: DashboardError
  onRetry?: () => void
}

export default function DashboardErrorComponent({ error, onRetry }: DashboardErrorProps) {
  const isAuthError = error.type === 'auth'

  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md text-center">
        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
          isAuthError ? 'bg-yellow-100' : 'bg-red-100'
        }`}>
          <AlertCircle className={`h-8 w-8 ${isAuthError ? 'text-yellow-600' : 'text-red-600'}`} />
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {isAuthError ? 'Sign In Required' : 'Something went wrong'}
        </h2>

        <p className="text-gray-600 mb-6">
          {error.message}
        </p>

        {error.details && !isAuthError && (
          <p className="text-sm text-gray-500 mb-6 font-mono bg-gray-50 p-2 rounded">
            {error.details}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isAuthError ? (
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <LogIn className="h-5 w-5" />
              Sign In
            </Link>
          ) : (
            <>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <RefreshCw className="h-5 w-5" />
                  Try Again
                </button>
              )}
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Go Home
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
