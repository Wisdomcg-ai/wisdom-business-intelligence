'use client'

import { Loader2 } from 'lucide-react'

interface LoadingStateProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingState({ message = 'Loading...', size = 'md' }: LoadingStateProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  }

  return (
    <div className="flex flex-col items-center justify-center p-8" role="status" aria-live="polite">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-[#1a1f36]`} />
      <p className="mt-4 text-gray-600">{message}</p>
      <span className="sr-only">{message}</span>
    </div>
  )
}

export function PageLoading({ message = 'Loading page...' }: { message?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <LoadingState message={message} size="lg" />
    </div>
  )
}

export function CardLoading() {
  return (
    <div className="animate-pulse p-4">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
    </div>
  )
}

export function TableLoading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="h-10 bg-gray-100 rounded mb-2" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-50 rounded mb-1 flex items-center px-4 gap-4">
          <div className="h-4 bg-gray-200 rounded w-1/4" />
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-1/6" />
        </div>
      ))}
    </div>
  )
}

export function InlineLoading({ message }: { message?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-gray-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {message && <span>{message}</span>}
    </span>
  )
}
