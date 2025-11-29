// /src/components/todos/utils/constants.ts
// System-wide constants for the todo manager

export const PRIORITIES = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
} as const

export const STATUSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const

export const CATEGORIES = {
  OPERATIONS: 'Operations',
  SALES: 'Sales',
  MARKETING: 'Marketing',
  FINANCE: 'Finance',
  TEAM: 'Team',
  STRATEGY: 'Strategy',
  PERSONAL: 'Personal',
  ADMIN: 'Admin',
  OTHER: 'Other'
} as const

export const VIEWS = {
  MUSTS: 'musts',
  OPEN_LOOPS: 'open_loops',
  THIS_WEEK: 'this_week',
  BACKLOG: 'backlog',
  ALL: 'all'
} as const

export const LIMITS = {
  TRUE_MUST: 1,
  TOP_THREE: 2,
  TOTAL_MUSTS: 3,
  MAX_TITLE_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_NOTES_LENGTH: 500,
  MAX_TAGS: 10
} as const

export const COLORS = {
  priority: {
    critical: 'bg-red-100 text-red-700 border-red-300',
    high: 'bg-orange-100 text-orange-700 border-orange-300',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    low: 'bg-green-100 text-green-700 border-green-300'
  },
  category: {
    Operations: 'bg-purple-100 text-purple-700',
    Sales: 'bg-blue-100 text-blue-700',
    Marketing: 'bg-green-100 text-green-700',
    Finance: 'bg-yellow-100 text-yellow-700',
    Team: 'bg-pink-100 text-pink-700',
    Strategy: 'bg-indigo-100 text-indigo-700',
    Personal: 'bg-gray-100 text-gray-700',
    Admin: 'bg-orange-100 text-orange-700',
    Other: 'bg-gray-100 text-gray-700'
  },
  status: {
    pending: 'bg-gray-100 text-gray-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700'
  }
} as const

export const MORNING_RITUAL = {
  STEPS: 5,
  START_HOUR: 6,
  END_HOUR: 12,
  DURATION_MINUTES: 5
} as const

export const RECURRING_PATTERNS = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly'
} as const

export const EFFORT_SIZES = {
  QUICK_WIN: 'quick_win',
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
  EPIC: 'epic'
} as const

export const EFFORT_ESTIMATES = {
  quick_win: 15, // minutes
  small: 60,
  medium: 180,
  large: 480,
  epic: 960
} as const