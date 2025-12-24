// Setup Wizard Types

import type { DistributionMethod } from '../../types'

// Re-export for convenience
export type { DistributionMethod }

export interface PriorYearAnalysis {
  // Revenue breakdown
  totalRevenue: number
  revenueByCategory: { name: string; amount: number; percentage: number }[]
  monthlyRevenuePattern: { month: string; amount: number; percentOfAvg: number }[]
  averageMonthlyRevenue: number
  peakMonth: { month: string; amount: number }
  lowMonth: { month: string; amount: number }
  seasonalityScore: number // 0-100, higher = more seasonal

  // COGS breakdown
  totalCOGS: number
  cogsPercentage: number
  cogsByCategory: { name: string; amount: number; percentage: number }[]

  // OpEx breakdown
  totalOpEx: number
  opexPercentage: number // As % of revenue
  opexByCategory: { name: string; amount: number; percentage: number; trend: 'up' | 'down' | 'stable' }[]

  // Profitability
  grossProfit: number
  grossMargin: number
  netProfit: number
  netMargin: number

  // Trends
  yoyRevenueGrowth?: number // If we have prior year to compare
  avgMonthlyGrowth: number
}

export interface FiveWaysData {
  // Core 5 Ways metrics
  leads: { current: number; target: number; change: number }
  conversionRate: { current: number; target: number; change: number } // as percentage
  transactions: { current: number; target: number; change: number } // per customer per year
  avgSaleValue: { current: number; target: number; change: number }
  margin: { current: number; target: number; change: number } // gross margin as percentage

  // Calculated results
  calculatedRevenue: number
  calculatedGrossProfit: number

  // Industry-specific driver labels
  industryLabels: {
    leads: string
    conversion: string
    transactions: string
    avgSale: string
    margin: string
  }
}

export interface IndustryConfig {
  id: string
  name: string
  // Custom labels for 5 Ways
  fiveWaysLabels: {
    leads: string
    leadsDescription: string
    conversion: string
    conversionDescription: string
    transactions: string
    transactionsDescription: string
    avgSale: string
    avgSaleDescription: string
    margin: string
    marginDescription: string
  }
  // Typical benchmarks
  benchmarks: {
    avgConversionRate: number
    avgMargin: number
    avgTransactionsPerCustomer: number
  }
  // Suggested COGS categories
  cogsSuggestions: string[]
  // Suggested OpEx categories
  opexSuggestions: string[]
}

export interface TeamMemberPlan {
  id: string
  name: string
  position: string
  classification: 'opex' | 'cogs'
  annualSalary: number
  startMonth?: string // YYYY-MM format
  endMonth?: string // YYYY-MM format
  isNew: boolean // Is this a planned new hire?
  notes?: string
}

export interface OpExCategory {
  id: string
  name: string
  priorYearAmount: number
  forecastAmount: number
  method: 'match_prior' | 'percentage_increase' | 'fixed' | 'percentage_of_revenue'
  methodValue?: number // The percentage or fixed value
  notes?: string
}

export interface StrategicInvestment {
  id: string
  title: string
  quarters: string[] // ['Q1', 'Q3'] etc - from One Page Plan
  cost: number
  costType: 'one-off' | 'ongoing'
  category: 'marketing' | 'technology' | 'training' | 'equipment' | 'consulting' | 'other'
  primaryQuarter: string // Which quarter the main cost hits
  notes?: string
  fromPlan: boolean // Whether this came from One Page Plan
}

export interface SetupWizardData {
  // Step 1: Goals (imported from Goals Wizard)
  revenueGoal: number
  grossProfitGoal: number
  netProfitGoal: number
  goalsSource: 'goals_wizard' | 'manual'
  goalsLastUpdated?: string

  // Step 2: Prior Year Analysis (calculated from actual data)
  priorYearAnalysis?: PriorYearAnalysis
  hasActualData: boolean
  dataSource: 'xero' | 'csv' | 'manual' | 'none'

  // Step 3: Team Planning
  teamMembers: TeamMemberPlan[]
  totalWagesCOGS: number
  totalWagesOpEx: number

  // Step 4: Operating Costs
  opexCategories: OpExCategory[]
  totalOpExForecast: number

  // Step 5: Strategic Investments (from One Page Plan)
  strategicInvestments: StrategicInvestment[]
  totalInvestmentCost: number
  industryId: string

  // Legacy 5 Ways data (kept for backward compatibility)
  fiveWaysData?: FiveWaysData

  // Step 6: Distribution & Generate
  distributionMethod: DistributionMethod
  cogsPercentage: number
}

export type WizardStep =
  | 'goals'
  | 'prior-year'
  | 'team'
  | 'opex'
  | 'investments'
  | 'review'

export interface WizardStepConfig {
  id: WizardStep
  number: number
  title: string
  subtitle: string
  icon: string // Lucide icon name
  isComplete: (data: SetupWizardData) => boolean
  isEnabled: (data: SetupWizardData, priorStepsComplete: boolean) => boolean
}
