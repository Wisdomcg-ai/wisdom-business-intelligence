'use client'

import { type ReactNode } from 'react'

// ===================
// CARD COMPONENT
// ===================

interface CardProps {
  children: ReactNode
  /** Card variant */
  variant?: 'default' | 'elevated' | 'outlined' | 'interactive' | 'accent'
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Additional className */
  className?: string
  /** Click handler for interactive cards */
  onClick?: () => void
}

/**
 * Card Component
 *
 * Consistent card container for content sections.
 */
export function Card({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  onClick
}: CardProps) {
  const variantClasses = {
    default: 'bg-white border border-gray-200 rounded-xl',
    elevated: 'bg-white rounded-xl shadow-lg',
    outlined: 'bg-white border-2 border-gray-200 rounded-xl',
    interactive: 'bg-white border border-gray-200 rounded-xl hover:border-brand-orange hover:shadow-md transition-all cursor-pointer',
    accent: 'bg-brand-navy rounded-xl text-white'
  }

  const paddingClasses = {
    none: '',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-6',
    lg: 'p-6 sm:p-8'
  }

  const baseClasses = `${variantClasses[variant]} ${paddingClasses[padding]} ${className}`

  if (onClick) {
    return (
      <button
        type="button"
        className={baseClasses}
        onClick={onClick}
      >
        {children}
      </button>
    )
  }

  return (
    <div className={baseClasses}>
      {children}
    </div>
  )
}

// ===================
// CARD HEADER
// ===================

interface CardHeaderProps {
  children: ReactNode
  actions?: ReactNode
  className?: string
  border?: boolean
}

export function CardHeader({
  children,
  actions,
  className = '',
  border = true
}: CardHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between px-4 sm:px-6 py-4 ${border ? 'border-b border-gray-100' : ''} ${className}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions && (
        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}

// ===================
// CARD TITLE
// ===================

interface CardTitleProps {
  children: ReactNode
  subtitle?: string
  className?: string
}

export function CardTitle({ children, subtitle, className = '' }: CardTitleProps) {
  return (
    <div className={className}>
      <h3 className="text-lg font-semibold text-gray-900">{children}</h3>
      {subtitle && (
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      )}
    </div>
  )
}

// ===================
// CARD CONTENT
// ===================

interface CardContentProps {
  children: ReactNode
  className?: string
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return (
    <div className={`p-4 sm:p-6 ${className}`}>
      {children}
    </div>
  )
}

// ===================
// CARD FOOTER
// ===================

interface CardFooterProps {
  children: ReactNode
  className?: string
  border?: boolean
  background?: 'none' | 'gray'
}

export function CardFooter({
  children,
  className = '',
  border = true,
  background = 'gray'
}: CardFooterProps) {
  const bgClasses = {
    none: '',
    gray: 'bg-gray-50'
  }

  return (
    <div
      className={`px-4 sm:px-6 py-4 ${border ? 'border-t border-gray-100' : ''} ${bgClasses[background]} rounded-b-xl ${className}`}
    >
      {children}
    </div>
  )
}

// ===================
// STAT CARD
// ===================

interface StatCardProps {
  label: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  icon?: ReactNode
  className?: string
}

export function StatCard({
  label,
  value,
  change,
  changeType = 'neutral',
  icon,
  className = ''
}: StatCardProps) {
  const changeColors = {
    positive: 'text-brand-teal',
    negative: 'text-red-500',
    neutral: 'text-gray-500'
  }

  return (
    <div className={`bg-white rounded-xl p-4 sm:p-6 border border-gray-200 ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900">{value}</p>
          {change && (
            <p className={`mt-1 text-sm ${changeColors[changeType]}`}>
              {change}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-brand-navy-50 rounded-lg">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

// ===================
// EMPTY CARD
// ===================

interface EmptyCardProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyCard({
  title,
  description,
  icon,
  action,
  className = ''
}: EmptyCardProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center ${className}`}>
      {icon && (
        <div className="mx-auto w-12 h-12 text-gray-400 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-900">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">{description}</p>
      )}
      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  )
}

export default Card
