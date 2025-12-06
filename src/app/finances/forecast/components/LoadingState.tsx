'use client'

import React from 'react'
import { Loader2, TrendingUp } from 'lucide-react'

interface LoadingStateProps {
  message?: string
  fullPage?: boolean
}

export function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <Loader2 className={`animate-spin ${className}`} />
  )
}

export function LoadingState({ message = 'Loading forecast...', fullPage = true }: LoadingStateProps) {
  if (fullPage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-orange-50 via-white to-brand-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <div className="w-20 h-20 bg-brand-orange-100 rounded-full flex items-center justify-center">
                <TrendingUp className="w-10 h-10 text-brand-orange" />
              </div>
              <div className="absolute top-0 left-0 w-20 h-20">
                <LoadingSpinner className="w-20 h-20 text-brand-orange" />
              </div>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{message}</h2>
          <p className="text-sm text-gray-500">
            This may take a moment...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <LoadingSpinner className="w-8 h-8 text-brand-orange mx-auto mb-3" />
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        <div className="space-y-3">
          <div className="h-3 bg-gray-200 rounded"></div>
          <div className="h-3 bg-gray-200 rounded w-5/6"></div>
          <div className="h-3 bg-gray-200 rounded w-4/6"></div>
        </div>
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="animate-pulse">
        {/* Header */}
        <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-200">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-6 py-4 flex items-center space-x-4">
              <div className="h-3 bg-gray-200 rounded flex-1"></div>
              <div className="h-3 bg-gray-200 rounded w-20"></div>
              <div className="h-3 bg-gray-200 rounded w-20"></div>
              <div className="h-3 bg-gray-200 rounded w-20"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
