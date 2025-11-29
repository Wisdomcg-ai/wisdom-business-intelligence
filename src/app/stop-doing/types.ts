/**
 * Stop Doing List Types
 * =====================
 * Based on Matt Malouf's "The Stop Doing List" book methodology
 */

// ============================================
// Time Log Types
// ============================================
export interface TimeLogEntry {
  [timeSlot: string]: string // e.g., "0500": "Email"
}

export interface TimeLogDay {
  [day: string]: TimeLogEntry // e.g., "mon": { "0500": "Email", "0515": "Email" }
}

export interface TimeLog {
  id: string
  business_id: string
  user_id: string
  week_start_date: string // ISO date string (Monday)
  entries: TimeLogDay
  total_minutes: number
  is_complete: boolean
  created_at: string
  updated_at: string
}

// ============================================
// Hourly Rate Types
// ============================================
export interface HourlyRate {
  id: string
  business_id: string
  user_id: string
  target_annual_income: number
  working_weeks_per_year: number
  hours_per_week: number
  calculated_hourly_rate: number
  created_at: string
  updated_at: string
}

// ============================================
// Activity Types
// ============================================
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'other'
export type Zone = 'incompetence' | 'competence' | 'excellence' | 'genius'
export type FocusFunnelOutcome = 'eliminate' | 'automate' | 'delegate' | 'concentrate'
export type Importance = 'low' | 'medium' | 'high'

export interface Activity {
  id: string
  business_id: string
  user_id: string
  activity_name: string
  frequency: Frequency
  duration_minutes: number
  zone: Zone
  focus_funnel_outcome: FocusFunnelOutcome | null
  special_skills_required: string | null
  importance: Importance
  has_system: boolean
  delegation_hourly_rate: number | null
  order_index: number
  is_selected_for_stop_doing: boolean
  created_at: string
  updated_at: string
}

// ============================================
// Stop Doing Item Types
// ============================================
export type StopDoingStatus = 'identified' | 'planned' | 'in_progress' | 'delegated' | 'automated' | 'eliminated' | 'completed'

export interface StopDoingItem {
  id: string
  business_id: string
  user_id: string
  activity_id: string | null
  item_name: string
  zone: Zone | null
  focus_funnel_outcome: FocusFunnelOutcome | null
  monthly_hours: number
  hourly_rate_used: number
  delegation_rate: number
  net_gain_loss: number
  opportunity_cost_monthly: number
  suggested_decision: string | null
  delegate_to: string | null
  target_date: string | null
  notes: string | null
  status: StopDoingStatus
  order_index: number
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ============================================
// Zone Options (Simplified per user preference)
// ============================================
export interface ZoneOption {
  label: string
  zone: Zone
  description: string
  color: string
  bgColor: string
  borderColor: string
}

export const ZONE_OPTIONS: ZoneOption[] = [
  {
    label: 'Love it & great at it',
    zone: 'genius',
    description: 'Zone of Genius: High value, high energy - KEEP doing',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200'
  },
  {
    label: 'Good at it, don\'t love it',
    zone: 'excellence',
    description: 'Zone of Excellence: High value, low energy - Consider delegating',
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200'
  },
  {
    label: 'Can do it, drains energy',
    zone: 'competence',
    description: 'Zone of Competence: Low value, drains you - STOP doing',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200'
  },
  {
    label: 'Struggle with it',
    zone: 'incompetence',
    description: 'Zone of Incompetence: Low value, not your strength - STOP immediately',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200'
  }
]

// ============================================
// Focus Funnel Options
// ============================================
export interface FocusFunnelOption {
  label: string
  value: FocusFunnelOutcome
  description: string
  icon: string
}

export const FOCUS_FUNNEL_OPTIONS: FocusFunnelOption[] = [
  {
    label: 'Eliminate',
    value: 'eliminate',
    description: 'Can this task be eliminated entirely?',
    icon: '🗑️'
  },
  {
    label: 'Automate',
    value: 'automate',
    description: 'Can technology do this for you?',
    icon: '🤖'
  },
  {
    label: 'Delegate',
    value: 'delegate',
    description: 'Can someone else do this?',
    icon: '👥'
  },
  {
    label: 'Concentrate',
    value: 'concentrate',
    description: 'If you must do it, focus deeply',
    icon: '🎯'
  }
]

// ============================================
// Frequency Options
// ============================================
export interface FrequencyOption {
  label: string
  value: Frequency
  multiplierPerMonth: number // For calculating monthly hours
}

export const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { label: 'Daily', value: 'daily', multiplierPerMonth: 22 }, // ~22 working days
  { label: 'Weekly', value: 'weekly', multiplierPerMonth: 4.33 },
  { label: 'Monthly', value: 'monthly', multiplierPerMonth: 1 },
  { label: 'Quarterly', value: 'quarterly', multiplierPerMonth: 0.33 },
  { label: 'Other', value: 'other', multiplierPerMonth: 1 }
]

// ============================================
// Importance Options
// ============================================
export const IMPORTANCE_OPTIONS: { label: string; value: Importance }[] = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' }
]

// ============================================
// Status Options
// ============================================
export interface StatusOption {
  label: string
  value: StopDoingStatus
  color: string
  bgColor: string
}

export const STATUS_OPTIONS: StatusOption[] = [
  { label: 'Identified', value: 'identified', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  { label: 'Planned', value: 'planned', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  { label: 'In Progress', value: 'in_progress', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  { label: 'Completed', value: 'completed', color: 'text-green-700', bgColor: 'bg-green-100' }
]

// ============================================
// Time Slot Generation
// ============================================
export const DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export const DAY_LABELS: Record<typeof DAYS_OF_WEEK[number], string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday'
}

// Generate time slots from 5:00 AM to 10:00 PM in 15-minute increments
export function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let hour = 5; hour <= 22; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const hourStr = hour.toString().padStart(2, '0')
      const minStr = minute.toString().padStart(2, '0')
      slots.push(`${hourStr}${minStr}`)
    }
  }
  return slots
}

export function formatTimeSlot(slot: string): string {
  const hour = parseInt(slot.substring(0, 2))
  const minute = slot.substring(2)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${displayHour}:${minute} ${period}`
}

// ============================================
// Calculation Helpers
// ============================================
export function calculateMonthlyHours(durationMinutes: number, frequency: Frequency): number {
  const option = FREQUENCY_OPTIONS.find(f => f.value === frequency)
  const multiplier = option?.multiplierPerMonth || 1
  return (durationMinutes / 60) * multiplier
}

export function calculateOpportunityCost(monthlyHours: number, hourlyRate: number): number {
  return monthlyHours * hourlyRate
}

export function calculateNetGainLoss(hourlyRate: number, delegationRate: number): number {
  return hourlyRate - delegationRate
}

export function getSuggestedDecision(zone: Zone, focusFunnel: FocusFunnelOutcome | null): string {
  if (zone === 'incompetence' || zone === 'competence') {
    if (focusFunnel === 'eliminate') return 'Eliminate this task immediately'
    if (focusFunnel === 'automate') return 'Set up automation ASAP'
    if (focusFunnel === 'delegate') return 'Delegate to team member or outsource'
    return 'Stop doing this task - find an alternative'
  }
  if (zone === 'excellence') {
    if (focusFunnel === 'delegate') return 'Consider delegating to free up time'
    return 'Keep doing but monitor time investment'
  }
  return 'Keep doing - this is your genius zone'
}

// ============================================
// Wizard Step Types
// ============================================
export type StepNumber = 1 | 2 | 3 | 4 | 5

export interface StepInfo {
  num: StepNumber
  label: string
  title: string
  description: string
}

export const WIZARD_STEPS: StepInfo[] = [
  {
    num: 1,
    label: 'Time Log',
    title: 'Track Your Time',
    description: 'Log how you spend your time for 1-2 weeks'
  },
  {
    num: 2,
    label: 'Hourly Rate',
    title: 'Calculate Your Value',
    description: 'Determine your hourly rate benchmark'
  },
  {
    num: 3,
    label: 'Activities',
    title: 'Inventory Your Tasks',
    description: 'List everything you do in your business'
  },
  {
    num: 4,
    label: 'Analyze',
    title: 'Analyze & Select',
    description: 'Identify what to stop doing'
  },
  {
    num: 5,
    label: 'Action Plan',
    title: 'Create Your Plan',
    description: 'Commit to stopping and track progress'
  }
]

// ============================================
// Prompt Triggers for Activity Brainstorming
// ============================================
export const ACTIVITY_PROMPT_TRIGGERS = [
  'Yesterday',
  'Last Week',
  'Monthly',
  'Marketing',
  'Sales',
  'Content',
  'Clients',
  'Team',
  'Admin',
  'Finance',
  'Meetings',
  'Email',
  'Social Media',
  'Operations'
]
