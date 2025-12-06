'use client'

import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode } from 'react'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  /** Page title - required */
  title: string
  /** Optional subtitle/description */
  subtitle?: string
  /** Optional icon from lucide-react */
  icon?: LucideIcon
  /** Action buttons to display on the right */
  actions?: ReactNode
  /** Badge text to display next to title */
  badge?: string
  /** Badge color variant */
  badgeColor?: 'teal' | 'orange' | 'navy' | 'gray'
  /** Back link configuration */
  backLink?: {
    href: string
    label?: string
  }
  /** Breadcrumb navigation */
  breadcrumbs?: BreadcrumbItem[]
  /** Visual variant */
  variant?: 'default' | 'compact' | 'simple'
  /** Additional className */
  className?: string
}

/**
 * PageHeader Component
 *
 * Consistent header component for all pages in the platform.
 * Provides title, subtitle, actions, breadcrumbs, and back navigation.
 *
 * @example
 * // Basic usage
 * <PageHeader title="Dashboard" subtitle="Welcome back" />
 *
 * @example
 * // With actions and icon
 * <PageHeader
 *   title="Clients"
 *   icon={Users}
 *   actions={<Button>Add Client</Button>}
 * />
 *
 * @example
 * // With back link and breadcrumbs
 * <PageHeader
 *   title="Client Details"
 *   backLink={{ href: '/clients', label: 'Back to Clients' }}
 *   breadcrumbs={[
 *     { label: 'Dashboard', href: '/dashboard' },
 *     { label: 'Clients', href: '/clients' },
 *     { label: 'John Doe' }
 *   ]}
 * />
 */
export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  badge,
  badgeColor = 'orange',
  backLink,
  breadcrumbs,
  variant = 'default',
  className = ''
}: PageHeaderProps) {
  const badgeColors = {
    teal: 'bg-brand-teal/20 text-brand-teal',
    orange: 'bg-brand-orange-100 text-brand-orange-700',
    navy: 'bg-white/20 text-white',
    gray: 'bg-gray-100 text-gray-700'
  }

  // Simple variant - minimal styling, no navy background
  if (variant === 'simple') {
    return (
      <div className={`mb-6 sm:mb-8 ${className}`}>
        {/* Back link */}
        {backLink && (
          <Link
            href={backLink.href}
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {backLink.label || 'Back'}
          </Link>
        )}

        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-3">
            {breadcrumbs.map((crumb, index) => (
              <span key={index} className="flex items-center">
                {index > 0 && <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-gray-700 transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-gray-900 font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {Icon && (
              <div className="w-10 h-10 sm:w-11 sm:h-11 bg-brand-navy rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="h-5 w-5 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{title}</h1>
                {badge && (
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${badgeColors[badgeColor]}`}>
                    {badge}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-sm sm:text-base text-gray-600 mt-0.5 line-clamp-2">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {actions}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Compact variant - smaller navy header
  if (variant === 'compact') {
    return (
      <div className={`bg-brand-navy rounded-lg px-4 py-3 sm:px-5 sm:py-4 mb-4 sm:mb-6 ${className}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="h-4 w-4 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-white truncate">{title}</h1>
                {badge && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColors[badgeColor]}`}>
                    {badge}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-xs text-white/70 mt-0.5 line-clamp-1">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {actions}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Default variant - full navy header
  return (
    <div className={`mb-6 sm:mb-8 ${className}`}>
      {/* Back link - outside the navy header */}
      {backLink && (
        <Link
          href={backLink.href}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          {backLink.label || 'Back'}
        </Link>
      )}

      {/* Breadcrumbs - outside the navy header */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-3 overflow-x-auto">
          {breadcrumbs.map((crumb, index) => (
            <span key={index} className="flex items-center whitespace-nowrap">
              {index > 0 && <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-gray-700 transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-gray-900 font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Navy header card */}
      <div className="bg-brand-navy rounded-xl px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {Icon && (
              <div className="w-10 h-10 sm:w-11 sm:h-11 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="h-5 w-5 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-white truncate">{title}</h1>
                {badge && (
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${badgeColors[badgeColor]}`}>
                    {badge}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-sm text-white/70 mt-0.5 line-clamp-2">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 flex-wrap sm:flex-nowrap">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Named export for convenience
export { PageHeader }
