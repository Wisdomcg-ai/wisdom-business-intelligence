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

export const CATEGORIES_SIMPLE = {
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

// Category objects with display properties
export const CATEGORIES: Record<string, { label: string; emoji: string; color: string; keywords: string[] }> = {
  Operations: { label: 'Operations', emoji: '⚙️', color: 'text-purple-600', keywords: ['ops', 'operation', 'process', 'system', 'workflow'] },
  Sales: { label: 'Sales', emoji: '💰', color: 'text-blue-600', keywords: ['sale', 'sell', 'deal', 'prospect', 'lead', 'client', 'customer', 'revenue'] },
  Marketing: { label: 'Marketing', emoji: '📢', color: 'text-green-600', keywords: ['market', 'campaign', 'ads', 'content', 'social', 'brand', 'promo'] },
  Finance: { label: 'Finance', emoji: '💵', color: 'text-yellow-600', keywords: ['finance', 'money', 'budget', 'invoice', 'payment', 'expense', 'profit', 'tax'] },
  Team: { label: 'Team', emoji: '👥', color: 'text-pink-600', keywords: ['team', 'hire', 'recruit', 'staff', 'employee', 'hr', 'training', 'meeting'] },
  Strategy: { label: 'Strategy', emoji: '🎯', color: 'text-indigo-600', keywords: ['strategy', 'plan', 'goal', 'vision', 'roadmap', 'quarterly', 'annual'] },
  Personal: { label: 'Personal', emoji: '🏠', color: 'text-gray-600', keywords: ['personal', 'home', 'family', 'health', 'self', 'life'] },
  Admin: { label: 'Admin', emoji: '📋', color: 'text-orange-600', keywords: ['admin', 'office', 'document', 'file', 'report', 'email'] },
  Other: { label: 'Other', emoji: '📌', color: 'text-gray-500', keywords: [] }
}

export const VIEWS = {
  MUSTS: 'musts',
  OPEN_LOOPS: 'open_loops',
  THIS_WEEK: 'this_week',
  BACKLOG: 'backlog',
  ALL: 'all'
} as const

// View configurations for display
export const VIEW_CONFIGS: Record<string, { label: string; emoji: string; description: string; emptyMessage: string }> = {
  musts: { label: 'MUSTs', emoji: '⭐', description: 'Your top priorities for today', emptyMessage: 'No MUSTs selected for today' },
  'open-loops': { label: 'Open Loops', emoji: '🔄', description: 'Unfinished tasks needing attention', emptyMessage: 'No open loops - great job!' },
  week: { label: 'This Week', emoji: '📅', description: 'Tasks due this week', emptyMessage: 'No tasks due this week' },
  backlog: { label: 'Backlog', emoji: '📋', description: 'Tasks without due dates', emptyMessage: 'No tasks in backlog' },
  all: { label: 'All Tasks', emoji: '📝', description: 'All your tasks', emptyMessage: 'No tasks yet - add your first task!' }
}

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

// Date shortcuts for natural language parsing (takes today's date, returns target date)
export const DATE_SHORTCUTS: Record<string, (today: Date) => Date> = {
  today: (today) => new Date(today),
  tomorrow: (today) => {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return d
  },
  yesterday: (today) => {
    const d = new Date(today)
    d.setDate(d.getDate() - 1)
    return d
  },
  'this week': (today) => {
    const d = new Date(today)
    const dayOfWeek = d.getDay()
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 7 - dayOfWeek + 5
    d.setDate(d.getDate() + daysUntilFriday)
    return d
  },
  'next week': (today) => {
    const d = new Date(today)
    d.setDate(d.getDate() + 7)
    return d
  },
  monday: (today) => getNextWeekday(today, 1),
  tuesday: (today) => getNextWeekday(today, 2),
  wednesday: (today) => getNextWeekday(today, 3),
  thursday: (today) => getNextWeekday(today, 4),
  friday: (today) => getNextWeekday(today, 5),
  saturday: (today) => getNextWeekday(today, 6),
  sunday: (today) => getNextWeekday(today, 0),
  eod: (today) => new Date(today)
}

// Helper function to get next weekday
function getNextWeekday(from: Date, targetDay: number): Date {
  const d = new Date(from)
  const currentDay = d.getDay()
  let daysToAdd = targetDay - currentDay
  if (daysToAdd <= 0) daysToAdd += 7
  d.setDate(d.getDate() + daysToAdd)
  return d
}

export const EFFORT_SIZES_SIMPLE = {
  QUICK_WIN: 'quick_win',
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
  EPIC: 'epic'
} as const

// Effort size objects with display properties
export const EFFORT_SIZES: Record<string, { label: string; color: string; minutes: number }> = {
  quick_win: { label: '⚡ Quick Win', color: 'bg-green-100 text-green-700', minutes: 15 },
  small: { label: 'Small', color: 'bg-blue-100 text-blue-700', minutes: 60 },
  medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-700', minutes: 180 },
  large: { label: 'Large', color: 'bg-orange-100 text-orange-700', minutes: 480 },
  epic: { label: 'Epic', color: 'bg-red-100 text-red-700', minutes: 960 }
}

export const EFFORT_ESTIMATES = {
  quick_win: 15, // minutes
  small: 60,
  medium: 180,
  large: 480,
  epic: 960
} as const

// Priority mapping from simplified priority to DB value
export const PRIORITY_TO_DB: Record<string, string> = {
  important: 'high',
  normal: 'medium'
} as const

// Open loop aging thresholds (in days)
export const OPEN_LOOP_AGING = {
  FRESH: 2,    // 1-2 days
  WARNING: 4,  // 3-4 days
  CRITICAL: 5,  // 5+ days
  // Also provide nested object format for components
  fresh: { max: 2, color: 'text-green-500', label: 'Fresh', emoji: '🟢' },
  warning: { max: 4, color: 'text-yellow-500', label: 'Warning', emoji: '🟡' },
  critical: { max: 6, color: 'text-orange-500', label: 'Critical', emoji: '🟠' },
  fire: { max: Infinity, color: 'text-red-500', label: 'On Fire', emoji: '🔥' }
} as const

// Error messages
export const ERROR_MESSAGES = {
  LOAD_FAILED: 'Failed to load tasks',
  SAVE_FAILED: 'Failed to save task',
  DELETE_FAILED: 'Failed to delete task',
  MUST_LIMIT: 'You can only have 3 TOP MUSTs per day'
} as const

// Success messages
export const SUCCESS_MESSAGES = {
  TASK_CREATED: 'Task created',
  TASK_UPDATED: 'Task updated',
  TASK_DELETED: 'Task deleted',
  MUST_SELECTED: 'MUST selected'
} as const

// MUST levels (simple keys)
export const MUST_LEVELS_SIMPLE = {
  TRUE_MUST: 1,
  TOP_THREE: 2
} as const

// MUST levels (indexed by level number)
export const MUST_LEVELS: Record<number, { icon: string; label: string; color: string }> = {
  1: { icon: '⭐', label: 'TRUE MUST', color: 'text-yellow-500' },
  2: { icon: '🔥', label: 'Top 3', color: 'text-orange-500' }
}

// Priority display mapping
export const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  high: { label: 'High', color: 'text-red-600' },
  medium: { label: 'Medium', color: 'text-yellow-600' },
  low: { label: 'Low', color: 'text-green-600' }
} as const