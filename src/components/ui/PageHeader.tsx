'use client'

import { ChevronLeft, ChevronRight, type LucideIcon, Check, Loader2, AlertCircle, Cloud } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode } from 'react'
import { SaveStatus, getSaveStatusText } from '@/hooks/useAutoSave'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface SaveIndicatorConfig {
  status: SaveStatus
  lastSaved: Date | null
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
  variant?: 'default' | 'compact' | 'simple' | 'banner'
  /** Additional className */
  className?: string
  /** Auto-save indicator configuration */
  saveIndicator?: SaveIndicatorConfig
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
  className = '',
  saveIndicator
}: PageHeaderProps) {
  const badgeColors = {
    teal: 'bg-brand-teal/20 text-brand-teal',
    orange: 'bg-brand-orange-100 text-brand-orange-700',
    navy: 'bg-white/20 text-white',
    gray: 'bg-gray-100 text-gray-700'
  }

  // Helper to render save indicator
  const renderSaveIndicator = (isBanner: boolean = false) => {
    if (!saveIndicator) return null

    const { status, lastSaved } = saveIndicator
    const text = getSaveStatusText(status, lastSaved)

    // Don't show if idle and no text
    if (status === 'idle' && !text) return null

    const getIcon = () => {
      switch (status) {
        case 'saving':
          return <Loader2 className="w-3.5 h-3.5 animate-spin" />
        case 'saved':
          return <Check className="w-3.5 h-3.5" />
        case 'error':
          return <AlertCircle className="w-3.5 h-3.5" />
        case 'idle':
          return lastSaved ? <Cloud className="w-3.5 h-3.5" /> : null
        default:
          return null
      }
    }

    const getColors = () => {
      if (isBanner) {
        switch (status) {
          case 'saving': return 'text-white/80 bg-white/10'
          case 'saved': return 'text-green-300 bg-green-500/20'
          case 'error': return 'text-red-300 bg-red-500/20'
          default: return 'text-white/60 bg-white/5'
        }
      } else {
        switch (status) {
          case 'saving': return 'text-amber-600 bg-amber-50'
          case 'saved': return 'text-green-600 bg-green-50'
          case 'error': return 'text-red-600 bg-red-50'
          default: return 'text-gray-500 bg-gray-50'
        }
      }
    }

    return (
      <div className={`flex items-center gap-1.5 text-xs ${getColors()} px-2.5 py-1 rounded-full`}>
        {getIcon()}
        <span>{text}</span>
      </div>
    )
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
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {renderSaveIndicator(false)}
            {actions}
          </div>
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
          <div className="flex items-center gap-2 flex-shrink-0">
            {renderSaveIndicator(true)}
            {actions}
          </div>
        </div>
      </div>
    )
  }

  // Banner variant - full-width edge-to-edge navy header with orange border
  if (variant === 'banner') {
    return (
      <div className={`bg-brand-navy border-b-4 border-brand-orange ${className}`}>
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {Icon && (
                <div className="w-12 h-12 bg-brand-orange rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="h-6 w-6 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-white">{title}</h1>
                  {badge && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${badgeColors[badgeColor]}`}>
                      {badge}
                    </span>
                  )}
                </div>
                {subtitle && (
                  <p className="text-white/70 mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {renderSaveIndicator(true)}
              {actions}
            </div>
          </div>
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
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 flex-wrap sm:flex-nowrap">
            {renderSaveIndicator(true)}
            {actions}
          </div>
        </div>
      </div>
    </div>
  )
}

// Named export for convenience
export { PageHeader }
