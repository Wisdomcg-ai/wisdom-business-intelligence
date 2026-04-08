import type { YearType } from '@/app/goals/types'

export interface OnePagePlanData {
  // Vision/Mission/Values
  vision: string
  mission: string
  coreValues: string[]

  // SWOT
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]

  // Financial & Metrics
  financialGoals: {
    year3: { revenue: number; grossProfit: number; netProfit: number }
    year2: { revenue: number; grossProfit: number; netProfit: number }
    year1: { revenue: number; grossProfit: number; netProfit: number }
    quarter: { revenue: number; grossProfit: number; netProfit: number }
  }

  coreMetrics: {
    year3: { [key: string]: any }
    year2: { [key: string]: any }
    year1: { [key: string]: any }
    quarter: { [key: string]: any }
  }

  kpis: Array<{
    name: string
    category: string
    year3Target: number
    year1Target: number
    quarterTarget: number
  }>

  // Strategic Initiatives (12-month plan)
  strategicInitiatives: Array<{
    title: string
    quarters: string[] // ['Q1', 'Q3'] etc
    owner?: string
  }>

  // Current Quarter Rocks (90-day sprint)
  quarterlyRocks: Array<{
    action: string
    owner?: string
    dueDate?: string
  }>

  currentQuarter: string
  currentQuarterLabel: string // e.g., "Q2 (Oct-Dec)"
  yearType: YearType
  planYear: number
  companyName: string

  // Owner Personal Goals
  ownerGoals: {
    desiredHoursPerWeek?: number
    currentHoursPerWeek?: number
    primaryGoal?: string
    timeHorizon?: string
    exitStrategy?: string
  }
}

export interface PlanSnapshot {
  id: string
  business_id: string
  user_id: string
  version_number: number
  snapshot_type: 'goals_wizard_complete' | 'quarterly_review_pre_sync' | 'quarterly_review_post_sync'
  quarter?: string
  year?: number
  quarterly_review_id?: string
  plan_data: OnePagePlanData
  label?: string
  notes?: string
  created_at: string
}
