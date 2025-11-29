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
