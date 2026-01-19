// Financial Forecast Types

export type PayrollFrequency = 'weekly' | 'fortnightly' | 'monthly'
export type PayDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
export type WageClassification = 'opex' | 'cogs'

export interface ForecastEmployee {
  id?: string
  forecast_id?: string
  employee_name: string
  position?: string
  classification: WageClassification // Simple binary: OpEx or COGS
  start_date?: string // Format: "2024-07" (month/year)
  end_date?: string // Format: "2024-12" (month/year), optional

  // Salary inputs (bidirectional calculation)
  annual_salary?: number
  hourly_rate?: number
  standard_hours_per_week?: number

  // Calculated fields
  pay_per_period?: number // Calculated based on frequency
  super_per_period?: number // 12% of pay_per_period
  payg_per_period?: number // Australian tax calculation (stored for cashflow)
  monthly_cost?: number // Total monthly cost (gross + super)

  // Legacy fields (keeping for backwards compatibility)
  category?: 'Wages Admin' | 'Wages COGS' | 'Contractor' | 'Other'
  hours?: number
  rate?: number
  weekly_budget?: number
  weekly_payg?: number
  super_rate?: number
  sort_order?: number
  is_active?: boolean
}

export type ForecastMethod =
  | 'none'             // Zero out - don't forecast this line
  | 'straight_line'    // Same amount each month (Even Split)
  | 'growth_rate'      // % increase month-over-month or year-over-year
  | 'seasonal_pattern' // Repeat historical pattern (Match FY25 Pattern)
  | 'driver_based'     // Linked to another metric (e.g., % of revenue)
  | 'manual'           // Custom per month

export interface ForecastMethodConfig {
  method: ForecastMethod
  // Parameters vary by method
  percentage_increase?: number  // % increase to apply to base (e.g., 0.05 = 5% increase)
  growth_rate?: number          // For growth_rate method (e.g., 0.05 = 5%)
  growth_type?: 'MoM' | 'YoY'   // Month-over-month or Year-over-year
  driver_line_id?: string       // For driver_based method - which line to link to
  driver_percentage?: number    // For driver_based method (e.g., 0.25 = 25% of revenue)
  base_amount?: number          // For straight_line method
}

export interface LineAnalysis {
  // Revenue analysis
  pct_of_total_revenue?: number     // % of total revenue
  fy_average_per_month?: number     // FY25 total ÷ 12
  yoy_growth_rate?: number          // Year-over-year growth

  // COGS analysis
  pct_of_revenue?: number           // COGS as % of revenue (gross margin)

  // OpEx analysis
  trend_direction?: 'up' | 'down' | 'stable'
  trend_percentage?: number
}

export interface PLLine {
  id?: string
  forecast_id?: string
  account_code?: string
  account_name: string
  account_type?: string
  account_class?: string
  category?: string
  subcategory?: string
  sort_order?: number
  actual_months: { [key: string]: number } // e.g., { "2024-07": 10000, "2024-08": 12000 }
  forecast_months: { [key: string]: number }
  is_from_xero?: boolean
  is_from_payroll?: boolean
  is_manual?: boolean
  notes?: string

  // Forecasting configuration
  forecast_method?: ForecastMethodConfig
  analysis?: LineAnalysis
}

export interface PayrollSummary {
  id?: string
  forecast_id?: string
  pay_runs_per_month: { [key: string]: number }
  wages_admin_monthly: { [key: string]: number }
  wages_cogs_monthly: { [key: string]: number }
  payg_monthly: { [key: string]: number }
  net_wages_monthly: { [key: string]: number }
  superannuation_monthly: { [key: string]: number }
  payroll_tax_monthly: { [key: string]: number }
}

export type DistributionMethod = 'even' | 'linear' | 'seasonal_pattern' | 'custom'

export interface CategoryAssumptions {
  [category: string]: {
    method: ForecastMethod
    config: ForecastMethodConfig
  }
}

export type Currency = 'AUD' | 'USD' | 'NZD' | 'GBP' | 'EUR'
export type ForecastType = 'budget' | 'forecast' | 'actual'

export interface FinancialForecast {
  id?: string
  business_id: string
  user_id: string
  name: string
  description?: string
  fiscal_year: number
  year_type: 'CY' | 'FY'

  // Baseline period (typically prior fiscal year for comparison/patterns)
  baseline_start_month?: string // e.g., "2024-07" (FY25 start)
  baseline_end_month?: string   // e.g., "2025-06" (FY25 end)

  // Current year actuals (for rolling forecasts, this is YTD of fiscal year being forecasted)
  actual_start_month: string // e.g., "2025-07" (FY26 start when rolling)
  actual_end_month: string   // e.g., "2025-10" (last complete month when rolling)

  // Forecast period (remaining months to forecast)
  forecast_start_month: string // e.g., "2025-11" (next month when rolling)
  forecast_end_month: string   // e.g., "2026-06" (FY26 end)

  is_completed?: boolean
  completed_at?: string
  last_xero_sync_at?: string
  xero_connection_id?: string
  created_at?: string
  updated_at?: string
  currency?: Currency // Default: AUD

  // Versioning fields
  forecast_type?: ForecastType // Default: 'forecast'
  version_number?: number // Default: 1
  is_active?: boolean // Default: true - only one active forecast per business
  is_locked?: boolean // Default: false - locked versions cannot be edited
  locked_at?: string
  locked_by?: string
  parent_forecast_id?: string // Reference to the forecast this was copied from
  version_notes?: string // Notes about what changed in this version

  // Goal-driven forecasting fields
  revenue_goal?: number
  gross_profit_goal?: number
  net_profit_goal?: number
  goal_source?: 'goals_wizard' | 'annual_plan' | 'manual'
  annual_plan_id?: string
  revenue_distribution_method?: DistributionMethod
  revenue_distribution_data?: { [monthKey: string]: number }
  category_assumptions?: CategoryAssumptions

  // Cost assumptions
  cogs_percentage?: number // e.g., 0.40 = 40% COGS
  opex_wages?: number // Annual wages from payroll
  opex_fixed?: number // Annual fixed costs
  opex_variable?: number // Annual variable costs
  opex_variable_percentage?: number // e.g., 0.05 = 5% of revenue
  opex_other?: number // Annual other/seasonal costs

  // 5 Ways / Business Engines data
  five_ways_data?: {
    leads: { current: number; target: number }
    conversionRate: { current: number; target: number }
    transactions: { current: number; target: number }
    avgSaleValue: { current: number; target: number }
    margin: { current: number; target: number }
    calculatedRevenue: number
    calculatedGrossProfit: number
    industryId?: string
  }

  // Industry selection for 5 Ways
  industry_id?: string

  // Wizard OpEx categories from Step 4
  wizard_opex_categories?: {
    id: string
    name: string
    priorYearAmount: number
    forecastAmount: number
    method: string
    methodValue?: number
    notes?: string
  }[]

  // Wizard team summary from Step 3
  wizard_team_summary?: {
    totalWagesCOGS: number
    totalWagesOpEx: number
    teamCount: number
  }

  // Payroll settings
  payroll_frequency?: PayrollFrequency // Default: 'fortnightly'
  pay_day?: PayDay // Day of week for pay runs (only for weekly/fortnightly)
  superannuation_rate?: number // Default: 0.12 (12%)

  // Payroll to P&L mapping
  wages_opex_pl_line_id?: string // Which P&L line to sync OpEx wages to
  wages_cogs_pl_line_id?: string // Which P&L line to sync COGS wages to
  super_opex_pl_line_id?: string // Which P&L line to sync OpEx superannuation to
  super_cogs_pl_line_id?: string // Which P&L line to sync COGS superannuation to
}

export interface XeroConnection {
  id: string
  business_id: string
  user_id: string
  tenant_id: string
  tenant_name?: string
  is_active: boolean
  last_synced_at?: string
  created_at?: string
  expires_at?: string
}

// Helper types for UI
export interface MonthColumn {
  key: string // e.g., "2024-07"
  label: string // e.g., "Jul 24"
  isActual: boolean
  isForecast: boolean
  isBaseline?: boolean // true for baseline period (e.g., FY25), false for current year actuals (e.g., FY26 YTD)
}

export const EMPLOYEE_CATEGORIES = [
  'Wages Admin',
  'Wages COGS',
  'Contractor',
  'Other'
] as const

export const PL_CATEGORIES = [
  'Revenue',
  'Cost of Sales',
  'Operating Expenses',
  'Other Income',
  'Other Expenses'
] as const

// ============================================================================
// Scenario Planning Types
// ============================================================================

export type ScenarioType = 'active' | 'planning' | 'archived'

export type AdjustmentType = 'multiplier' | 'fixed'

export interface ForecastScenario {
  id?: string
  forecast_id: string
  user_id: string
  name: string
  description?: string
  scenario_type: ScenarioType

  // Multipliers (1.00 = 100%, 1.15 = +15%, 0.85 = -15%)
  revenue_multiplier: number
  cogs_multiplier: number
  opex_multiplier: number

  // Alternative: fixed value adjustments
  revenue_adjustment_type?: AdjustmentType
  revenue_fixed_value?: number

  // Status
  is_active: boolean
  is_baseline: boolean

  // Metadata
  created_at?: string
  updated_at?: string
}

export interface ScenarioLine {
  id?: string
  scenario_id: string
  pl_line_id: string
  adjusted_forecast_months: { [monthKey: string]: number }
  adjustment_reason?: string
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface ScenarioComparison {
  scenario: ForecastScenario
  totalRevenue: number
  totalCOGS: number
  totalOpEx: number
  grossProfit: number
  netProfit: number
  grossMargin: number
  netMargin: number
}

export interface WhatIfParameters {
  revenueChange: number // -50 to +100 (percentage)
  cogsChange: number // -20 to +20 (percentage points)
  opexChange: number // -20 to +50 (percentage)
}

// ============================================================================
// Forecast Wizard V2 Types
// ============================================================================

export type WizardMode = 'guided' | 'quick'
export type WizardStep = 'setup' | 'team' | 'costs' | 'investments' | 'projections' | 'review'
export type DecisionType = 'new_hire' | 'remove_employee' | 'salary_change' | 'investment' | 'cost_added' | 'cost_changed' | 'goal_adjusted' | 'year_projection' | 'team_confirmed' | 'costs_confirmed' | 'investments_confirmed' | 'projections_confirmed'
export type InvestmentType = 'capex' | 'opex'
export type RecurrenceType = 'monthly' | 'quarterly' | 'annual'
export type YearGranularity = 'monthly' | 'quarterly' | 'annual'
export type AIConfidence = 'high' | 'medium' | 'low'

export interface WizardSession {
  id: string
  forecast_id?: string
  user_id: string
  business_id: string
  started_at: string
  completed_at?: string
  mode: WizardMode
  current_step: WizardStep
  steps_completed: Record<WizardStep, {
    completed: boolean
    time_spent_seconds: number
    completed_at?: string
  }>
  dropped_off_at?: WizardStep
  years_selected: number[] // [1], [1,2], [1,2,3]
  created_at: string
  updated_at: string
}

export interface ForecastDecision {
  id: string
  forecast_id?: string // Optional for in-memory decisions
  session_id?: string
  user_id?: string // Optional for in-memory decisions
  business_id?: string // Optional for in-memory decisions
  decision_type: DecisionType | string // Allow flexibility for parsing
  decision_data: Record<string, unknown>
  reasoning?: string
  user_reasoning?: string // User's explanation for the decision
  ai_suggestion?: {
    suggestion: string
    reasoning: string
    confidence: AIConfidence
  }
  user_accepted_ai?: boolean
  ai_confidence?: AIConfidence
  linked_initiative_id?: string
  linked_pl_line_id?: string
  created_at: string
}

export interface ForecastInvestment {
  id: string
  forecast_id: string
  user_id: string
  business_id: string
  initiative_id?: string
  name: string
  description?: string
  investment_type: InvestmentType
  amount: number
  start_month: string
  is_recurring: boolean
  recurrence?: RecurrenceType
  end_month?: string
  pl_account_category?: string
  pl_line_id?: string
  depreciation_years?: number
  reasoning?: string
  created_at: string
  updated_at: string
}

export interface ForecastYear {
  id: string
  forecast_id: string
  user_id: string
  business_id: string
  year_number: 1 | 2 | 3
  fiscal_year: number
  granularity: YearGranularity
  revenue_target?: number
  revenue_growth_percent?: number
  gross_margin_percent?: number
  net_profit_percent?: number
  headcount_start?: number
  headcount_end?: number
  headcount_change?: number
  planned_roles?: string[]
  team_cost_estimate?: number
  opex_estimate?: number
  capex_estimate?: number
  quarterly_data?: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', {
    revenue?: number
    costs?: number
    profit?: number
  }>
  notes?: string
  assumptions?: string
  created_at: string
  updated_at: string
}

// Strategic Initiative (from existing table)
export interface StrategicInitiative {
  id: string
  business_id: string
  user_id: string
  title: string
  description?: string
  notes?: string
  category?: 'marketing' | 'operations' | 'finance' | 'people' | 'systems' | 'product' | 'customer_experience' | 'other'
  priority?: 'high' | 'medium' | 'low'
  estimated_effort?: 'small' | 'medium' | 'large'
  status?: 'not_started' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold'
  progress_percentage?: number
  quarter_assigned?: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  year_assigned?: number
  selected?: boolean
  created_at: string
  updated_at: string
}

// Xero Employee (from payroll)
export interface XeroEmployee {
  employee_id: string
  first_name: string
  last_name: string
  full_name: string
  job_title?: string
  start_date?: string
  termination_date?: string
  annual_salary?: number
  hourly_rate?: number
  hours_per_week?: number
  pay_frequency?: 'weekly' | 'fortnightly' | 'monthly'
  classification?: WageClassification
  is_active: boolean
  from_xero: boolean
}

// Goals (from goals table)
export interface BusinessGoals {
  id?: string
  business_id?: string
  fiscal_year?: number
  // Year type: 'FY' = Financial Year (Jul-Jun), 'CY' = Calendar Year (Jan-Dec)
  year_type?: 'FY' | 'CY'

  // Year 1 targets
  revenue_target?: number
  gross_profit_target?: number
  profit_target?: number
  gross_margin_percent?: number
  net_profit_percent?: number

  // Year 2 targets (multi-year planning)
  revenue_year2?: number
  gross_profit_year2?: number
  net_profit_year2?: number

  // Year 3 targets (multi-year planning)
  revenue_year3?: number
  gross_profit_year3?: number
  net_profit_year3?: number

  headcount_target?: number
  key_objectives?: string[]
  created_at?: string
  updated_at?: string
}

// Operating expense category summary
export interface OpExCategory {
  category: string
  account_name: string
  total: number
  monthly_average: number
}

// Revenue/COGS line item from Xero
export interface PLLineItem {
  account_name: string
  category: string
  total: number
  by_month: Record<string, number>
  percent_of_revenue?: number
}

// Period financial summary
export interface PeriodSummary {
  period_label: string
  start_month: string
  end_month: string
  months_count: number
  total_revenue: number
  total_cogs: number
  gross_profit: number
  gross_margin_percent: number
  operating_expenses: number
  operating_expenses_by_category: OpExCategory[]
  net_profit: number
  net_margin_percent: number
  // Monthly breakdown for seasonality
  revenue_by_month?: Record<string, number>
  seasonality_pattern?: number[] // 12 percentages for FY months (Jul-Jun)
  // Individual line items
  revenue_lines?: PLLineItem[]
  cogs_lines?: PLLineItem[]
}

// Historical P&L summary for AI context
export interface HistoricalPLSummary {
  has_xero_data: boolean

  // Prior complete FY - the baseline for comparison
  prior_fy?: PeriodSummary

  // Current FY Year-to-Date - what's already happened
  current_ytd?: PeriodSummary & {
    // Run rate projections
    run_rate_revenue: number
    run_rate_opex: number
    run_rate_net_profit: number
    // Variance vs prior FY
    revenue_vs_prior_percent: number
    opex_vs_prior_percent: number
  }

  // Forecast period - what we're planning
  forecast_period?: {
    start_month: string
    end_month: string
    months_remaining: number
  }

  // User adjustments/notes for the AI to consider
  adjustments?: {
    month: string
    account: string
    note: string
    exclude_from_run_rate?: boolean
  }[]
}

// Wizard Context (for AI CFO)
export interface WizardContext {
  business_id: string
  business_name?: string
  industry?: string
  fiscal_year: number
  goals: BusinessGoals
  current_team: XeroEmployee[]
  strategic_initiatives: StrategicInitiative[]
  existing_forecast?: FinancialForecast
  session: WizardSession
  decisions_made: ForecastDecision[]
  // Xero connection and historical data
  xero_connected?: boolean
  historical_pl?: HistoricalPLSummary
}

// AI CFO Message
export interface CFOMessage {
  id: string
  role: 'cfo' | 'user' | 'system'
  content: string
  timestamp: string
  step?: WizardStep
  structured_input?: {
    type: 'salary' | 'amount' | 'percentage' | 'select' | 'multi_select' | 'date' | 'confirm'
    options?: { label: string; value: string }[]
    placeholder?: string
    validation?: Record<string, unknown>
  }
  ai_suggestion?: {
    suggestion: string | number
    reasoning: string
    confidence: AIConfidence
    source?: string
  }
}

// Wizard State
export interface WizardState {
  mode: WizardMode
  currentStep: WizardStep
  session: WizardSession | null
  messages: CFOMessage[]
  context: WizardContext | null
  isLoading: boolean
  error: string | null

  // Step data
  setupData: {
    goalsLoaded: boolean
    yearsSelected: number[]
    xeroConnected: boolean
  }
  teamData: {
    existingTeam: XeroEmployee[]
    plannedHires: Partial<ForecastEmployee>[]
    plannedDepartures: { employee_id: string; end_month: string }[]
  }
  costsData: {
    categories: {
      category: string
      items: { name: string; annual_amount: number; is_monthly: boolean }[]
    }[]
  }
  investmentsData: {
    investments: ForecastInvestment[]
  }
  projectionsData: {
    year2?: Partial<ForecastYear>
    year3?: Partial<ForecastYear>
  }

  // Live preview
  livePreview: {
    revenue: number
    cogs: number
    grossProfit: number
    grossMargin: number
    teamCosts: number
    opex: number
    netProfit: number
    netMargin: number
    vsTarget: number
  }
}

// Wizard Validation Result
export interface ValidationResult {
  isValid: boolean
  meetsGoals: boolean
  concerns: {
    severity: 'critical' | 'warning' | 'info'
    area: string
    message: string
    suggestion?: string
  }[]
  summary: {
    revenue: number
    grossProfit: number
    grossMargin: number
    netProfit: number
    netMargin: number
    targetNetMargin: number
    variance: number
  }
  aiCommentary?: string
}

// Cost Categories with descriptions
export const COST_CATEGORIES: Record<string, { label: string; description: string }> = {
  rent_occupancy: { label: 'Rent & Occupancy', description: 'Office rent, building costs' },
  utilities: { label: 'Utilities & Services', description: 'Power, water, internet' },
  technology: { label: 'Technology & Software', description: 'SaaS, hosting, licenses' },
  marketing: { label: 'Marketing & Advertising', description: 'Ads, campaigns, content' },
  insurance: { label: 'Insurance', description: 'Business insurance policies' },
  professional_fees: { label: 'Professional Fees', description: 'Accounting, legal, consulting' },
  travel: { label: 'Travel & Entertainment', description: 'Business travel, client entertainment' },
  office_supplies: { label: 'Office & Supplies', description: 'Stationery, equipment' },
  training: { label: 'Training & Development', description: 'Staff training, courses' },
  other: { label: 'Other Operating Costs', description: 'Miscellaneous expenses' }
}

export type CostCategory = keyof typeof COST_CATEGORIES

// Investment Account Categories with labels
export const INVESTMENT_ACCOUNT_CATEGORIES: Record<string, { label: string }> = {
  marketing: { label: 'Marketing' },
  technology: { label: 'Technology' },
  equipment: { label: 'Equipment' },
  training: { label: 'Training' },
  professional_services: { label: 'Professional Services' },
  research_development: { label: 'Research & Development' },
  other: { label: 'Other' }
}

export type InvestmentAccountCategory = keyof typeof INVESTMENT_ACCOUNT_CATEGORIES

// Validation concern for forecast review
export interface ValidationConcern {
  severity: 'error' | 'warning' | 'info'
  category: string
  message: string
  suggestion?: string
}

// Forecast summary for review
export interface ForecastSummary {
  revenue: {
    year1: number
    year2?: number
    year3?: number
  }
  costs: {
    team: number
    operations: number
    investments: number
    total: number
  }
  profit: {
    gross: number
    net: number
    margin: number
  }
  headcount: {
    current: number
    planned: number
    endOfYear: number
  }
  keyDecisions: string[]
}
