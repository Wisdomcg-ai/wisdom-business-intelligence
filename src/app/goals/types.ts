// /app/goals/types.ts
// This file contains all TypeScript interfaces used across the goals wizard

export interface FinancialData {
  revenue: { current: number; year1: number; year2: number; year3: number }
  grossProfit: { current: number; year1: number; year2: number; year3: number }
  grossMargin: { current: number; year1: number; year2: number; year3: number }
  netProfit: { current: number; year1: number; year2: number; year3: number }
  netMargin: { current: number; year1: number; year2: number; year3: number }
  customers: { current: number; year1: number; year2: number; year3: number }
  employees: { current: number; year1: number; year2: number; year3: number }
}

export interface CoreMetricsData {
  leadsPerMonth: { current: number; year1: number; year2: number; year3: number }
  conversionRate: { current: number; year1: number; year2: number; year3: number }
  avgTransactionValue: { current: number; year1: number; year2: number; year3: number }
  teamHeadcount: { current: number; year1: number; year2: number; year3: number }
  ownerHoursPerWeek: { current: number; year1: number; year2: number; year3: number }
}

export interface KPIData {
  id: string
  name: string
  friendlyName?: string
  category: string
  currentValue: number
  year1Target: number
  year2Target: number
  year3Target: number
  unit: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
  description?: string
  whyItMatters?: string
  actionToTake?: string
  benchmarks?: {
    poor: number | string
    average: number | string
    good: number | string
    excellent: number | string
  }
  isStandard?: boolean
  isIndustry?: boolean
  isCustom?: boolean
}

export type InitiativeCategory =
  | 'marketing'
  | 'operations'
  | 'finance'
  | 'people'
  | 'systems'
  | 'product'
  | 'customer_experience'
  | 'other'
  | 'misc'

export type InitiativePriority = 'high' | 'medium' | 'low'

export type InitiativeEffort = 'small' | 'medium' | 'large'

export type InitiativeStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold'

export interface StrategicInitiative {
  id: string
  title: string
  description?: string
  source: 'strategic_ideas' | 'roadmap'
  category?: InitiativeCategory
  priority?: InitiativePriority
  estimatedEffort?: InitiativeEffort
  timeline?: 'year1' | 'year2' | 'year3'
  selected?: boolean
  notes?: string
  linkedKPIs?: string[]
  order?: number
  assignedTo?: string
  // Lifecycle tracking
  status?: InitiativeStatus
  progressPercentage?: number
  actualStartDate?: string
  actualCompletionDate?: string
  quarterAssigned?: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  yearAssigned?: number
  reflectionNotes?: string
}

export interface BusinessProfile {
  id?: string
  company_name?: string
  industry: string
  current_revenue?: number
  employee_count?: number
}

export type YearType = 'FY' | 'CY'

export type QuarterType = 'Q1' | 'Q2' | 'Q3' | 'Q4'

export type PlanStatus = 'draft' | 'active' | 'completed' | 'archived'

export type PlanType = 'initial' | 'quarterly_refresh' | 'annual_reset'

export interface StrategicPlan {
  id: string
  businessId: string
  userId: string
  wizardCompletedAt?: string
  planStartDate?: string
  planYear?: number
  currentQuarter?: QuarterType
  status: PlanStatus
  planType: PlanType
  createdAt: string
  updatedAt: string
}

export interface QuarterlySnapshot {
  id: string
  businessId: string
  userId: string
  strategicPlanId?: string
  snapshotYear: number
  snapshotQuarter: QuarterType
  snapshotDate: string
  // Performance summary
  totalInitiatives: number
  completedInitiatives: number
  inProgressInitiatives: number
  cancelledInitiatives: number
  completionRate: number
  // Snapshot data
  initiativesSnapshot: StrategicInitiative[]
  kpisSnapshot: any // KPI performance data
  financialSnapshot: any // Financial actuals
  // Reflections
  wins?: string
  challenges?: string
  learnings?: string
  adjustments?: string
  overallReflection?: string
  createdAt: string
  updatedAt: string
}

export interface KPIActual {
  id: string
  businessId: string
  userId: string
  kpiId: string
  periodYear: number
  periodQuarter?: QuarterType
  periodMonth?: number
  periodType: 'monthly' | 'quarterly' | 'annual'
  actualValue: number
  targetValue?: number
  variance?: number
  variancePercentage?: number
  notes?: string
  recordedAt: string
  createdAt: string
  updatedAt: string
}

export interface AnnualSnapshot {
  id: string
  businessId: string
  userId: string
  strategicPlanId?: string
  snapshotYear: number
  snapshotDate: string
  totalInitiatives: number
  completedInitiatives: number
  annualCompletionRate: number
  q1SnapshotId?: string
  q2SnapshotId?: string
  q3SnapshotId?: string
  q4SnapshotId?: string
  fullYearSnapshot: any
  financialPerformance: any
  kpiPerformance: any
  yearWins?: string
  yearChallenges?: string
  yearLearnings?: string
  strategicAdjustments?: string
  nextYearFocus?: string
  createdAt: string
  updatedAt: string
}

// ============================================================================
// 90-DAY SPRINT MANAGEMENT TYPES
// ============================================================================

export type ActionStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
export type ActionPriority = 'p1' | 'p2' | 'p3' // P1=Must do, P2=Should do, P3=Nice to have
export type RockStatus = 'not_started' | 'on_track' | 'at_risk' | 'completed' | 'missed'
export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'missed'

export interface QuarterlyRock {
  id: string
  title: string
  description?: string
  owner: string
  status: RockStatus
  progressPercentage: number
  linkedInitiatives?: string[] // IDs of strategic initiatives
  linkedKPIs?: string[] // IDs of KPIs this rock will impact
  successCriteria: string
  startDate?: string
  targetDate?: string
  completionDate?: string
  notes?: string
}

export interface Milestone {
  id: string
  day: 30 | 60 | 90 // Day marker (30-day, 60-day, 90-day)
  title: string
  description?: string
  targetDate: string
  status: MilestoneStatus
  completionDate?: string
  keyMetrics?: Array<{
    metric: string
    target: number | string
    actual?: number | string
  }>
  reviewNotes?: string
  wins?: string[]
  challenges?: string[]
  adjustments?: string[]
}

export interface WeeklyPlan {
  id: string
  weekNumber: number // 1-13
  startDate: string
  endDate: string
  focus: string // Main focus for the week
  keyActions: string[] // IDs of actions planned for this week
  completed: boolean
  progressNotes?: string
}

export interface KeyAction {
  id: string
  action: string
  description?: string
  owner: string
  status: ActionStatus
  priority: ActionPriority
  dueDate: string
  completionDate?: string
  estimatedHours?: number
  linkedRocks?: string[] // IDs of rocks this action supports
  linkedKPIs?: string[] // IDs of KPIs this action will move
  linkedInitiatives?: string[] // IDs of strategic initiatives
  weekNumber?: number // Which week (1-13) this is scheduled
  blockers?: string
  progressNotes?: string
  tags?: string[]
}

export interface WeeklyCheckIn {
  id: string
  weekNumber: number
  checkInDate: string
  completedActions: number
  totalActions: number
  progressPercentage: number
  wins: string[]
  challenges: string[]
  blockers: string[]
  nextWeekFocus: string
  teamNotes?: string
  coachNotes?: string
}

export interface SprintMetadata {
  id: string
  businessId: string
  userId: string
  quarter: QuarterType
  year: number
  yearType: YearType
  startDate: string
  endDate: string
  totalWeeks: number
  currentWeek: number
  quarterlyTargets: {
    revenue?: number
    grossProfit?: number
    netProfit?: number
    kpiTargets?: Record<string, number>
  }
  overallProgress: number
  status: 'planning' | 'active' | 'completed' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface SprintData {
  metadata: SprintMetadata
  rocks: QuarterlyRock[]
  milestones: Milestone[]
  weeklyPlans: WeeklyPlan[]
  keyActions: KeyAction[]
  checkIns: WeeklyCheckIn[]
  focusInitiatives: string[] // IDs of initiatives from Q1
}

// ============================================================================
// V3 - MONTHLY TARGETS & INITIATIVE TASK BREAKDOWN
// ============================================================================

export type TaskStatus = 'not_started' | 'in_progress' | 'done'

export interface MonthlyTargets {
  month1: {
    revenue: number
    grossProfit: number
    grossMargin: number
    netProfit: number
    netMargin: number
    customers: number
    employees: number
  }
  month2: {
    revenue: number
    grossProfit: number
    grossMargin: number
    netProfit: number
    netMargin: number
    customers: number
    employees: number
  }
  month3: {
    revenue: number
    grossProfit: number
    grossMargin: number
    netProfit: number
    netMargin: number
    customers: number
    employees: number
  }
}

// Monthly targets stored as strings for database persistence (similar to quarterlyTargets)
// Key format: "metricName_quarter" (e.g., "revenue_q1", "grossProfit_q2")
// Value: { m1: string, m2: string, m3: string }
export type MonthlyTargetsData = Record<string, { m1: string; m2: string; m3: string }>

export interface InitiativeTask {
  id: string
  task: string
  assignedTo: string
  minutesAllocated: number
  dueDate: string
  status: TaskStatus
  order: number
}

export interface TeamMember {
  id: string
  name: string
  email?: string
  role?: string
  type: 'employee' | 'contractor'
  initials?: string // For avatar display
  color?: string // Avatar background color
  businessId: string
  userId: string
  createdAt: string
  updatedAt: string
}

// Simple milestone for project tracking
export interface ProjectMilestone {
  id: string
  description: string
  targetDate: string
  isCompleted: boolean
}

// Enhanced StrategicInitiative with V3 task breakdown fields
export interface InitiativeWithTasks extends StrategicInitiative {
  // Project plan fields
  why?: string // Why are we doing this now?
  outcome?: string // What outcome are we looking for?
  startDate?: string // Project start date
  endDate?: string // Project end date
  milestones?: ProjectMilestone[] // Key checkpoints
  tasks?: InitiativeTask[] // Task breakdown
  totalHours?: number // Auto-calculated from tasks
}