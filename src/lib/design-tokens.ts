/**
 * Design Tokens - Centralized Design System Constants
 * ===================================================
 *
 * All components should import from here for consistent styling.
 * Brand: Navy (#172238) + Orange (#F5821F) + Teal (success only)
 */

// ===================
// COLORS
// ===================

export const COLORS = {
  // Brand Primary
  brand: {
    navy: '#172238',
    orange: '#F5821F',
    teal: '#14B8A6', // Success states only
  },

  // Semantic Colors
  semantic: {
    success: 'brand-teal',
    warning: 'amber',
    error: 'red',
    info: 'brand-navy',
  },

  // Background Classes
  backgrounds: {
    page: 'bg-gray-50',
    card: 'bg-white',
    cardElevated: 'bg-white shadow-lg',
    header: 'bg-brand-navy',
    accent: 'bg-brand-orange',
    success: 'bg-brand-teal',
    muted: 'bg-gray-100',
  },

  // Text Classes
  text: {
    primary: 'text-gray-900',
    secondary: 'text-gray-600',
    muted: 'text-gray-500',
    inverse: 'text-white',
    accent: 'text-brand-orange',
    success: 'text-brand-teal',
    link: 'text-brand-navy hover:text-brand-orange',
  },

  // Border Classes
  borders: {
    default: 'border-gray-200',
    strong: 'border-gray-300',
    accent: 'border-brand-orange',
    success: 'border-brand-teal',
  },
} as const

// ===================
// TYPOGRAPHY
// ===================

export const TYPOGRAPHY = {
  // Headings
  h1: 'text-2xl sm:text-3xl font-bold text-gray-900',
  h2: 'text-xl sm:text-2xl font-semibold text-gray-900',
  h3: 'text-lg font-semibold text-gray-900',
  h4: 'text-base font-semibold text-gray-900',

  // Body
  body: 'text-base text-gray-700',
  bodySmall: 'text-sm text-gray-600',

  // Labels
  label: 'text-sm font-medium text-gray-700',
  labelSmall: 'text-xs font-medium uppercase tracking-wide text-gray-500',

  // Special
  pageTitle: 'text-2xl sm:text-3xl font-bold text-gray-900',
  pageSubtitle: 'text-base sm:text-lg text-gray-600 mt-1',
  cardTitle: 'text-lg font-semibold text-gray-900',
  cardSubtitle: 'text-sm text-gray-500',

  // Links
  link: 'text-brand-navy hover:text-brand-orange transition-colors',
  linkAccent: 'text-brand-orange hover:text-brand-orange-700 transition-colors',
} as const

// ===================
// SPACING
// ===================

export const SPACING = {
  // Page Layout
  page: {
    padding: 'px-4 sm:px-6 lg:px-8',
    paddingY: 'py-6 sm:py-8',
    maxWidth: 'max-w-7xl mx-auto',
  },

  // Sections
  section: {
    gap: 'space-y-6 sm:space-y-8',
    margin: 'mt-6 sm:mt-8',
  },

  // Cards
  card: {
    padding: 'p-4 sm:p-6',
    gap: 'space-y-4',
  },

  // Grid
  grid: {
    gap: 'gap-4 sm:gap-6',
  },

  // Stack
  stack: {
    sm: 'space-y-2',
    md: 'space-y-4',
    lg: 'space-y-6',
  },

  // Inline
  inline: {
    sm: 'space-x-2',
    md: 'space-x-4',
    lg: 'space-x-6',
  },
} as const

// ===================
// SHADOWS
// ===================

export const SHADOWS = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  default: 'shadow',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
  card: 'shadow-sm hover:shadow-md transition-shadow',
  elevated: 'shadow-lg',
} as const

// ===================
// BORDERS
// ===================

export const BORDERS = {
  radius: {
    sm: 'rounded',
    md: 'rounded-lg',
    lg: 'rounded-xl',
    xl: 'rounded-2xl',
    full: 'rounded-full',
  },
  width: {
    default: 'border',
    thick: 'border-2',
  },
} as const

// ===================
// COMPONENT STYLES
// ===================

export const COMPONENTS = {
  // Page Header
  pageHeader: {
    container: 'mb-6 sm:mb-8',
    wrapper: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4',
    titleArea: 'flex-1 min-w-0',
    title: 'text-2xl sm:text-3xl font-bold text-gray-900',
    subtitle: 'text-base sm:text-lg text-gray-600 mt-1',
    breadcrumbs: 'flex items-center space-x-2 text-sm text-gray-500 mb-2',
    actions: 'flex items-center gap-3 flex-shrink-0',
    backLink: 'inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2',
  },

  // Cards
  card: {
    base: 'bg-white rounded-xl border border-gray-200',
    elevated: 'bg-white rounded-xl shadow-lg',
    interactive: 'bg-white rounded-xl border border-gray-200 hover:border-brand-orange hover:shadow-md transition-all cursor-pointer',
    outlined: 'bg-white rounded-xl border-2 border-gray-200',
    header: 'px-4 sm:px-6 py-4 border-b border-gray-100',
    body: 'p-4 sm:p-6',
    footer: 'px-4 sm:px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl',
  },

  // Buttons
  button: {
    base: 'inline-flex items-center justify-center font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
    primary: 'bg-brand-orange hover:bg-brand-orange-600 text-white focus:ring-brand-orange',
    secondary: 'bg-brand-navy hover:bg-brand-navy-700 text-white focus:ring-brand-navy',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 focus:ring-brand-navy',
    ghost: 'hover:bg-gray-100 text-gray-700 focus:ring-gray-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    sizes: {
      sm: 'px-3 py-1.5 text-sm rounded-lg',
      md: 'px-4 py-2 text-sm rounded-lg',
      lg: 'px-6 py-3 text-base rounded-xl',
    },
    iconOnly: 'p-2 rounded-lg',
  },

  // Form Elements
  form: {
    input: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange transition-colors',
    inputError: 'border-red-500 focus:ring-red-500 focus:border-red-500',
    label: 'block text-sm font-medium text-gray-700 mb-1',
    helperText: 'text-sm text-gray-500 mt-1',
    errorText: 'text-sm text-red-600 mt-1',
  },

  // Stats/Metrics
  stats: {
    card: 'bg-white rounded-xl p-4 sm:p-6 border border-gray-200',
    value: 'text-2xl sm:text-3xl font-bold text-gray-900',
    label: 'text-sm text-gray-500 mt-1',
    change: {
      positive: 'text-brand-teal',
      negative: 'text-red-500',
      neutral: 'text-gray-500',
    },
  },

  // Tables
  table: {
    container: 'overflow-x-auto',
    table: 'min-w-full divide-y divide-gray-200',
    header: 'bg-gray-50',
    headerCell: 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
    body: 'bg-white divide-y divide-gray-200',
    cell: 'px-4 py-4 whitespace-nowrap text-sm text-gray-900',
    cellSecondary: 'px-4 py-4 whitespace-nowrap text-sm text-gray-500',
  },

  // Empty States
  emptyState: {
    container: 'text-center py-12',
    icon: 'mx-auto h-12 w-12 text-gray-400',
    title: 'mt-4 text-lg font-medium text-gray-900',
    description: 'mt-2 text-sm text-gray-500 max-w-sm mx-auto',
    action: 'mt-6',
  },

  // Loading States
  loading: {
    container: 'flex items-center justify-center py-12',
    spinner: 'w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full animate-spin',
    text: 'mt-4 text-sm text-gray-500',
  },

  // Badges
  badge: {
    base: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
    variants: {
      default: 'bg-gray-100 text-gray-800',
      primary: 'bg-brand-orange-100 text-brand-orange-800',
      secondary: 'bg-brand-navy-100 text-brand-navy-800',
      success: 'bg-brand-teal/10 text-brand-teal',
      warning: 'bg-amber-100 text-amber-800',
      danger: 'bg-red-100 text-red-800',
    },
  },
} as const

// ===================
// RESPONSIVE
// ===================

export const BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const

export const RESPONSIVE = {
  // Grid patterns
  grid: {
    single: 'grid grid-cols-1',
    twoCol: 'grid grid-cols-1 md:grid-cols-2',
    threeCol: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    fourCol: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    sidebar: 'grid grid-cols-1 lg:grid-cols-[280px_1fr]',
    mainSide: 'grid grid-cols-1 lg:grid-cols-[1fr_320px]',
  },

  // Visibility
  show: {
    mobile: 'block sm:hidden',
    tablet: 'hidden sm:block lg:hidden',
    desktop: 'hidden lg:block',
  },
  hide: {
    mobile: 'hidden sm:block',
    tablet: 'block sm:hidden lg:block',
    desktop: 'block lg:hidden',
  },

  // Touch targets
  touchTarget: 'min-h-[44px] min-w-[44px]',
} as const

// ===================
// ANIMATIONS
// ===================

export const ANIMATIONS = {
  fadeIn: 'animate-fadeIn',
  slideUp: 'animate-slideUp',
  spin: 'animate-spin',
  pulse: 'animate-pulse',
  bounce: 'animate-bounce',
} as const

// ===================
// HELPER FUNCTIONS
// ===================

/**
 * Combine multiple class strings
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Get status color classes
 */
export function getStatusColor(status: 'success' | 'warning' | 'error' | 'info' | 'default'): string {
  const colors = {
    success: 'text-brand-teal bg-brand-teal/10',
    warning: 'text-amber-600 bg-amber-100',
    error: 'text-red-600 bg-red-100',
    info: 'text-brand-navy bg-brand-navy-50',
    default: 'text-gray-600 bg-gray-100',
  }
  return colors[status] || colors.default
}

/**
 * Get priority color classes
 */
export function getPriorityColor(priority: 'high' | 'medium' | 'low'): string {
  const colors = {
    high: 'text-red-600 bg-red-100',
    medium: 'text-brand-orange bg-brand-orange-100',
    low: 'text-brand-teal bg-brand-teal/10',
  }
  return colors[priority] || colors.medium
}
