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

  // Step 5: Revenue Drivers (5 Ways)
  fiveWaysData?: FiveWaysData
  industryId: string

  // Step 6: Distribution & Generate
  distributionMethod: DistributionMethod
  cogsPercentage: number
}

export type WizardStep =
  | 'goals'
  | 'prior-year'
  | 'team'
  | 'opex'
  | 'revenue-drivers'
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
