'use client'

import { Fragment, ReactNode } from 'react'
import { X } from 'lucide-react'

interface SlideOverProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
}

export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = 'lg',
  footer
}: SlideOverProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40
          transition-opacity duration-300 ease-out
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`
          fixed inset-y-0 right-0 z-50 w-full ${sizeClasses[size]}
          transform transition-transform duration-300 ease-out
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        <div className="h-full flex flex-col bg-white shadow-2xl">
          {/* Header */}
          <div className="flex-shrink-0 px-6 py-5 border-b border-slate-200 bg-slate-50">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
                {subtitle && (
                  <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// Subcomponent for sections within the slide-over
interface SlideOverSectionProps {
  title?: string
  children: ReactNode
  className?: string
}

export function SlideOverSection({ title, children, className = '' }: SlideOverSectionProps) {
  return (
    <div className={`px-6 py-5 ${className}`}>
      {title && (
        <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
      )}
      {children}
    </div>
  )
}
