'use client'

import { type ReactNode } from 'react'

interface PageLayoutProps {
  /** Page content */
  children: ReactNode
  /** Maximum width variant */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '7xl' | 'full'
  /** Vertical padding size */
  paddingY?: 'none' | 'sm' | 'md' | 'lg'
  /** Background color */
  background?: 'white' | 'gray' | 'transparent'
  /** Additional className */
  className?: string
  /** Enable sidebar layout mode */
  sidebar?: ReactNode
  /** Sidebar position */
  sidebarPosition?: 'left' | 'right'
  /** Sidebar width (for desktop) */
  sidebarWidth?: 'sm' | 'md' | 'lg'
}

/**
 * PageLayout Component
 *
 * Provides consistent page layout with standardized max-width, padding, and spacing.
 * Use this component to wrap all page content for consistency.
 *
 * @example
 * // Basic usage
 * <PageLayout>
 *   <PageHeader title="Dashboard" />
 *   <div>Content goes here</div>
 * </PageLayout>
 *
 * @example
 * // With sidebar
 * <PageLayout
 *   sidebar={<SidebarContent />}
 *   sidebarPosition="left"
 * >
 *   <MainContent />
 * </PageLayout>
 *
 * @example
 * // Custom max-width
 * <PageLayout maxWidth="2xl">
 *   <NarrowContent />
 * </PageLayout>
 */
export default function PageLayout({
  children,
  maxWidth = '7xl',
  paddingY = 'md',
  background = 'gray',
  className = '',
  sidebar,
  sidebarPosition = 'left',
  sidebarWidth = 'md'
}: PageLayoutProps) {
  // Max width classes
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-3xl',
    lg: 'max-w-5xl',
    xl: 'max-w-6xl',
    '2xl': 'max-w-7xl',
    '7xl': 'max-w-7xl',
    full: 'max-w-full'
  }

  // Padding classes
  const paddingClasses = {
    none: '',
    sm: 'py-4 sm:py-6',
    md: 'py-6 sm:py-8',
    lg: 'py-8 sm:py-12'
  }

  // Background classes
  const bgClasses = {
    white: 'bg-white',
    gray: 'bg-gray-50',
    transparent: 'bg-transparent'
  }

  // Sidebar width classes
  const sidebarWidthClasses = {
    sm: 'lg:w-64',
    md: 'lg:w-80',
    lg: 'lg:w-96'
  }

  // If no sidebar, simple layout
  if (!sidebar) {
    return (
      <div className={`min-h-screen ${bgClasses[background]}`}>
        <div
          className={`
            ${maxWidthClasses[maxWidth]}
            mx-auto
            px-4 sm:px-6 lg:px-8
            ${paddingClasses[paddingY]}
            ${className}
          `}
        >
          {children}
        </div>
      </div>
    )
  }

  // With sidebar layout
  return (
    <div className={`min-h-screen ${bgClasses[background]}`}>
      <div
        className={`
          ${maxWidthClasses[maxWidth]}
          mx-auto
          px-4 sm:px-6 lg:px-8
          ${paddingClasses[paddingY]}
        `}
      >
        <div className={`flex flex-col lg:flex-row gap-6 lg:gap-8 ${className}`}>
          {/* Sidebar - left position */}
          {sidebarPosition === 'left' && (
            <aside className={`w-full ${sidebarWidthClasses[sidebarWidth]} flex-shrink-0`}>
              <div className="lg:sticky lg:top-8">
                {sidebar}
              </div>
            </aside>
          )}

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {children}
          </main>

          {/* Sidebar - right position */}
          {sidebarPosition === 'right' && (
            <aside className={`w-full ${sidebarWidthClasses[sidebarWidth]} flex-shrink-0`}>
              <div className="lg:sticky lg:top-8">
                {sidebar}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * PageSection Component
 *
 * Use within PageLayout to create consistent vertical sections with proper spacing.
 */
interface PageSectionProps {
  children: ReactNode
  /** Section title */
  title?: string
  /** Section description */
  description?: string
  /** Additional className */
  className?: string
  /** Spacing after section */
  spacing?: 'none' | 'sm' | 'md' | 'lg'
}

export function PageSection({
  children,
  title,
  description,
  className = '',
  spacing = 'md'
}: PageSectionProps) {
  const spacingClasses = {
    none: '',
    sm: 'mb-4 sm:mb-6',
    md: 'mb-6 sm:mb-8',
    lg: 'mb-8 sm:mb-12'
  }

  return (
    <section className={`${spacingClasses[spacing]} ${className}`}>
      {(title || description) && (
        <div className="mb-4">
          {title && (
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
              {title}
            </h2>
          )}
          {description && (
            <p className="mt-1 text-sm text-gray-600">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * PageGrid Component
 *
 * Responsive grid layout for cards and content.
 */
interface PageGridProps {
  children: ReactNode
  /** Number of columns */
  columns?: 1 | 2 | 3 | 4
  /** Gap size */
  gap?: 'sm' | 'md' | 'lg'
  /** Additional className */
  className?: string
}

export function PageGrid({
  children,
  columns = 3,
  gap = 'md',
  className = ''
}: PageGridProps) {
  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
  }

  const gapClasses = {
    sm: 'gap-3 sm:gap-4',
    md: 'gap-4 sm:gap-6',
    lg: 'gap-6 sm:gap-8'
  }

  return (
    <div className={`grid ${columnClasses[columns]} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  )
}

// Named exports
export { PageLayout }
