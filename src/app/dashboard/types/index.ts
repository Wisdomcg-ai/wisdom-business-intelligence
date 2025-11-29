// Consolidated financial goals interface
export interface FinancialGoals {
  revenue: number
  grossProfit: number
  grossMargin: number
  netProfit: number
  netMargin: number
}

// Extended goals with progress context
export interface GoalsWithProgress extends FinancialGoals {
  currentRevenue?: number
  progressPercent: number
  daysRemaining: number
  trend?: 'ahead' | 'behind' | 'on_track'
  trendPercent?: number
}

export interface Rock {
  id: string
  title: string
  owner: string
  status: 'not_started' | 'on_track' | 'at_risk' | 'completed'
  progressPercentage: number
}

// Smart insight for header
export interface DashboardInsight {
  type: 'rock_attention' | 'goal_deadline' | 'weekly_review' | 'celebration'
  title: string
  message: string
  actionLabel?: string
  actionHref?: string
  priority: 'high' | 'medium' | 'low'
}

// Contextual action suggestion
export interface SuggestedAction {
  id: string
  label: string
  description: string
  href: string
  priority: 'high' | 'medium' | 'low'
  icon: 'rock' | 'review' | 'coach' | 'forecast' | 'goal'
}

export interface DashboardData {
  annualGoals: FinancialGoals | null
  quarterlyGoals: FinancialGoals | null
  currentQuarter: 'q1' | 'q2' | 'q3' | 'q4'
  rocks: Rock[]
  weeklyGoals: string[]
  // New smart data
  insight?: DashboardInsight
  suggestedActions?: SuggestedAction[]
  quarterDaysRemaining?: number
  yearDaysRemaining?: number
  annualProgress?: number
  quarterlyProgress?: number
  rocksNeedingAttention?: Rock[]
  rocksOnTrack?: Rock[]
}

export interface DashboardError {
  type: 'auth' | 'data' | 'network'
  message: string
  details?: string
}
