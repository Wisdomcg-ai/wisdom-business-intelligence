// Monthly Report Types

export type ReportTab = 'report' | 'full-year' | 'trends' | 'charts' | 'subscriptions' | 'wages' | 'cashflow' | 'balance-sheet' | 'balance-sheet-consolidated' | 'cashflow-consolidated' | 'mapping' | 'history' | 'consolidated'

export type ReportStatus = 'draft' | 'final'

export type ReportCategory =
  | 'Revenue'
  | 'Cost of Sales'
  | 'Operating Expenses'
  | 'Other Income'
  | 'Other Expenses'

export const REPORT_CATEGORIES: ReportCategory[] = [
  'Revenue',
  'Cost of Sales',
  'Operating Expenses',
  'Other Income',
  'Other Expenses',
]

// ============================================
// Report Settings
// ============================================

export interface ReportSections {
  revenue_detail: boolean
  cogs_detail: boolean
  opex_detail: boolean
  payroll_detail: boolean
  subscription_detail: boolean
  balance_sheet: boolean
  cashflow: boolean
  trend_charts: boolean
  // Chart toggles
  chart_cash_runway: boolean
  chart_cumulative_net_cash: boolean
  chart_working_capital_gap: boolean
  chart_revenue_vs_expenses: boolean
  chart_revenue_breakdown: boolean
  chart_variance_heatmap: boolean
  chart_budget_burn_rate: boolean
  chart_break_even: boolean
  chart_team_cost_pct: boolean
  chart_cost_per_employee: boolean
  chart_subscription_creep: boolean
}

export interface MonthlyReportSettings {
  id?: string
  business_id: string
  sections: ReportSections
  show_prior_year: boolean
  show_ytd: boolean
  show_unspent_budget: boolean
  show_budget_next_month: boolean
  show_budget_annual_total: boolean
  budget_forecast_id?: string | null
  subscription_account_codes?: string[]
  wages_account_names?: string[]
  pdf_layout?: import('./types/pdf-layout').PDFLayout | null
  created_at?: string
  updated_at?: string
}

// ============================================
// Report Templates (Phase 23)
// ============================================

export interface TemplateColumnSettings {
  show_prior_year: boolean
  show_ytd: boolean
  show_unspent_budget: boolean
  show_budget_next_month: boolean
  show_budget_annual_total: boolean
}

export interface ReportTemplate {
  id: string
  business_id: string
  name: string
  is_default: boolean
  sections: ReportSections
  column_settings: TemplateColumnSettings
  budget_forecast_id?: string | null
  subscription_account_codes?: string[]
  wages_account_names?: string[]
  created_at?: string
  updated_at?: string
}

export const DEFAULT_SECTIONS: ReportSections = {
  revenue_detail: true,
  cogs_detail: true,
  opex_detail: true,
  payroll_detail: false,
  subscription_detail: false,
  balance_sheet: false,
  cashflow: false,
  trend_charts: true,
  // P&L charts ON by default
  chart_revenue_vs_expenses: true,
  chart_revenue_breakdown: true,
  chart_variance_heatmap: true,
  chart_budget_burn_rate: true,
  chart_break_even: true,
  // Data-dependent charts OFF by default
  chart_cash_runway: false,
  chart_cumulative_net_cash: false,
  chart_working_capital_gap: false,
  chart_team_cost_pct: false,
  chart_cost_per_employee: false,
  chart_subscription_creep: false,
}

// ============================================
// Account Mappings
// ============================================

export interface AccountMapping {
  id?: string
  business_id: string
  xero_account_code?: string | null
  xero_account_name: string
  xero_account_type?: string | null
  report_category: ReportCategory
  report_subcategory?: string | null
  is_auto_mapped: boolean
  is_confirmed: boolean
  mapped_by?: string | null
  mapped_at?: string | null
  forecast_pl_line_id?: string | null
  forecast_pl_line_name?: string | null
  created_at?: string
  updated_at?: string
}

// ============================================
// Report Data
// ============================================

export interface ReportLine {
  account_name: string
  xero_account_name?: string | null
  is_budget_only: boolean
  // Monthly
  actual: number
  budget: number
  variance_amount: number
  variance_percent: number
  // YTD
  ytd_actual: number
  ytd_budget: number
  ytd_variance_amount: number
  ytd_variance_percent: number
  // Extra columns (Calxa-style)
  unspent_budget: number
  budget_next_month: number
  budget_annual_total: number
  // Prior year
  prior_year: number | null
}

export interface ReportSection {
  category: ReportCategory
  lines: ReportLine[]
  subtotal: ReportLine
}

export interface ReportSummary {
  revenue: { actual: number; budget: number; variance: number; variance_percent: number }
  cogs: { actual: number; budget: number; variance: number; variance_percent: number }
  gross_profit: { actual: number; budget: number; variance: number; gp_percent: number }
  opex: { actual: number; budget: number; variance: number; variance_percent: number }
  net_profit: { actual: number; budget: number; variance: number; np_percent: number }
}

export interface GeneratedReport {
  business_id: string
  report_month: string
  fiscal_year: number
  settings: MonthlyReportSettings
  sections: ReportSection[]
  summary: ReportSummary
  gross_profit_row: ReportLine
  net_profit_row: ReportLine
  is_draft: boolean
  unreconciled_count: number
  has_budget: boolean
  budget_forecast_name?: string
  /**
   * True when this report was produced by `/api/monthly-report/consolidated`
   * (i.e. the underlying business is a consolidation parent). Enables
   * consolidation-specific UI affordances — e.g. the "Consolidated budget
   * not yet supported" info note in BudgetVsActualTable's header, and
   * blocking the snapshot path (Phase 35 will ship consolidated snapshots).
   */
  is_consolidation?: boolean
}

// ============================================
// Report Snapshots
// ============================================

export interface ReportSnapshot {
  id?: string
  business_id: string
  report_month: string
  fiscal_year: number
  status: ReportStatus
  is_draft: boolean
  unreconciled_count: number
  report_data: GeneratedReport
  summary: ReportSummary
  coach_notes?: string | null
  commentary?: Record<string, string> | null
  generated_by?: string | null
  generated_at?: string
  pdf_exported_at?: string | null
  created_at?: string
  updated_at?: string
}

// ============================================
// Reconciliation
// ============================================

export interface ReconciliationStatus {
  unreconciled_count: number
  unreconciled_total: number
  has_more: boolean
  bank_accounts: { name: string; count: number; balance: number }[]
  is_clean: boolean
}

// ============================================
// Forecast reference types (for budget linking)
// ============================================

export interface ForecastOption {
  id: string
  name: string
  fiscal_year: number
  forecast_type: string
  is_active: boolean
}

export interface ForecastPLLine {
  id: string
  account_name: string
  category: string
  forecast_months: Record<string, number>
}

// ============================================
// Full Year Projection
// ============================================

export interface FullYearMonthData {
  month: string           // 'YYYY-MM'
  actual: number
  budget: number
  source: 'actual' | 'forecast'
}

export interface FullYearLine {
  account_name: string
  category: string
  months: FullYearMonthData[]    // 12 entries
  projected_total: number        // actuals + remaining forecast
  annual_budget: number          // full year budget
  variance_amount: number
  variance_percent: number
}

export interface FullYearSection {
  category: string
  lines: FullYearLine[]
  subtotal: FullYearLine
}

export interface FullYearReport {
  business_id: string
  fiscal_year: number
  last_actual_month: string      // most recent month with actuals
  sections: FullYearSection[]
  gross_profit: FullYearLine
  net_profit: FullYearLine
}

// ============================================
// Trend Charts
// ============================================

export interface TrendDataPoint {
  month: string
  monthLabel: string             // 'Jul', 'Aug', etc.
  revenue_actual: number
  revenue_budget: number
  cogs_actual: number
  cogs_budget: number
  opex_actual: number
  opex_budget: number
  gp_percent: number
  np_percent: number
  gp_percent_budget: number
  np_percent_budget: number
}

// ============================================
// Variance Commentary
// ============================================

export interface VendorTransaction {
  date: string
  vendor: string          // Clean vendor name for this specific transaction
  context: string | null  // Additional detail only when it adds value (e.g. invoice description)
  amount: number
  type: 'invoice' | 'bank'
}

export interface VendorSummary {
  vendor: string
  amount: number
  transactions?: VendorTransaction[]
}

export interface VarianceCommentaryEntry {
  vendor_summary: VendorSummary[]  // Grouped by vendor, sorted by amount desc
  coach_note: string               // Editable coach note (can override or supplement)
  is_edited: boolean
  detail_tab_ref?: 'subscriptions' | 'wages' | null
}

export interface VarianceCommentary {
  [accountName: string]: VarianceCommentaryEntry
}

// ============================================
// Subscription Analysis (Phase 4)
// ============================================

export interface SubscriptionVendorLine {
  vendor_name: string
  vendor_key: string
  prior_month_actual: number
  actual: number
  budget: number
  variance: number
}

export interface SubscriptionAccountGroup {
  account_code: string
  account_name: string
  vendors: SubscriptionVendorLine[]
  total_prior_month: number
  total_actual: number
  total_budget: number
  total_variance: number
}

export interface SubscriptionDetailData {
  accounts: SubscriptionAccountGroup[]
  grand_total: { prior_month: number; actual: number; budget: number; variance: number }
  report_month: string
}

// ============================================
// Wages Analysis (Phase 4)
// ============================================

export interface WagesAccountLine {
  account_name: string
  actual: number
  budget: number
  variance: number
  variance_percent: number
}

export interface WagesPayRunEntry {
  date: string
  period_start: string
  period_end: string
  gross_earnings: number
  tax: number
  super_amount: number
  net_pay: number
}

export interface WagesEmployeeLine {
  name: string
  position: string
  category: string
  employment_type?: string
  pay_frequency: string
  budget_per_period: number
  actual_total: number
  budget_total: number
  pay_runs: WagesPayRunEntry[]
  variance: number
  variance_percent: number
  source: 'xero' | 'forecast' | 'both'
}

export interface WagesDetailData {
  accounts: WagesAccountLine[]
  employees: WagesEmployeeLine[]
  employee_totals: { actual: number; budget: number; variance: number }
  grand_total: { actual: number; budget: number; variance: number }
  payroll_available: boolean
  pay_run_dates: string[]
}

// ============================================
// Balance Sheet (Phase 27)
// ============================================

export type BalanceSheetRowType = 'section_header' | 'line_item' | 'subtotal' | 'net_assets'

export interface BalanceSheetRow {
  type: BalanceSheetRowType
  label: string
  current: number | null   // Current period actuals
  prior: number | null     // Prior period actuals
  variance: number | null  // current - prior
  variance_pct: number | null  // null = N/A (prior is 0)
}

export type BalanceSheetCompare = 'yoy' | 'mom'

export interface BalanceSheetData {
  business_id: string
  report_date: string        // last day of report month, YYYY-MM-DD
  compare: BalanceSheetCompare
  current_label: string      // e.g. "Mar 2026"
  prior_label: string        // e.g. "Mar 2025"
  rows: BalanceSheetRow[]
  balances: boolean          // true if Total Asset - Total Liability === Total Equity
}

