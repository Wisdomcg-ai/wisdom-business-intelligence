// Financial Forecast Module Constants
// Centralizes all magic numbers and configuration values

// ============================================================================
// PAYROLL CONSTANTS
// ============================================================================

/**
 * Australian Tax Brackets (2024-25 Financial Year)
 * Source: ATO - https://www.ato.gov.au/rates/individual-income-tax-rates/
 */
export const TAX_BRACKETS_2024_25 = {
  // Tax-free threshold
  TAX_FREE_THRESHOLD: 18200,

  // Bracket 1: $18,201 - $45,000 = 19 cents for each $1 over $18,200
  BRACKET_1_MAX: 45000,
  BRACKET_1_RATE: 0.19,
  BRACKET_1_BASE_TAX: 0,

  // Bracket 2: $45,001 - $120,000 = $5,092 plus 32.5 cents for each $1 over $45,000
  BRACKET_2_MAX: 120000,
  BRACKET_2_RATE: 0.325,
  BRACKET_2_BASE_TAX: 5092,

  // Bracket 3: $120,001 - $180,000 = $29,467 plus 37 cents for each $1 over $120,000
  BRACKET_3_MAX: 180000,
  BRACKET_3_RATE: 0.37,
  BRACKET_3_BASE_TAX: 29467,

  // Bracket 4: $180,001+ = $51,667 plus 45 cents for each $1 over $180,000
  BRACKET_4_RATE: 0.45,
  BRACKET_4_BASE_TAX: 51667,
} as const

/**
 * Superannuation Guarantee Rate
 * Current rate for 2024-25 is 11.5%, increasing to 12% from 1 July 2025
 */
export const SUPERANNUATION = {
  RATE_2024_25: 0.115, // 11.5%
  RATE_2025_26: 0.12,  // 12%
  DEFAULT_RATE: 0.12,  // Use 12% as default for forecasting
  MAX_CONTRIBUTION_BASE_QUARTERLY: 62500, // Per quarter (2024-25)
} as const

/**
 * Pay Period Divisors
 * Number of pay periods per year for each frequency
 */
export const PAY_PERIODS_PER_YEAR = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
} as const

/**
 * Default Work Hours
 */
export const WORK_HOURS = {
  STANDARD_HOURS_PER_WEEK: 38, // Award standard
  DEFAULT_HOURS_PER_WEEK: 40,  // Common assumption
  HOURS_PER_DAY: 7.6,          // 38 hours / 5 days
} as const

// ============================================================================
// FISCAL YEAR CONSTANTS
// ============================================================================

/**
 * Australian Fiscal Year Configuration
 */
export const FISCAL_YEAR = {
  START_MONTH: 7,  // July (0-indexed would be 6)
  END_MONTH: 6,    // June
  MONTHS_IN_YEAR: 12,
} as const

// ============================================================================
// FORECAST DEFAULTS
// ============================================================================

/**
 * Default Forecast Assumptions
 */
export const FORECAST_DEFAULTS = {
  // Revenue distribution
  DEFAULT_DISTRIBUTION_METHOD: 'seasonal_pattern' as const,

  // Cost assumptions
  DEFAULT_COGS_PERCENTAGE: 0.40,      // 40% COGS (60% gross margin)
  DEFAULT_OPEX_PERCENTAGE: 0.35,      // 35% OpEx as % of revenue

  // Growth assumptions
  DEFAULT_ANNUAL_GROWTH_RATE: 0.05,   // 5% YoY growth
  DEFAULT_MONTHLY_GROWTH_RATE: 0.004, // ~5% annualized

  // Forecasting method defaults
  DEFAULT_PERCENTAGE_INCREASE: 0.05,  // 5% increase from baseline
} as const

/**
 * Validation Limits
 */
export const VALIDATION = {
  // Revenue goals
  MIN_REVENUE: 0,
  MAX_REVENUE: 999999999,  // ~$1B

  // Margins
  MIN_GROSS_MARGIN: 0,
  MAX_GROSS_MARGIN: 1,     // 100%
  MIN_NET_MARGIN: -1,      // Can be negative
  MAX_NET_MARGIN: 1,

  // Growth rates
  MIN_GROWTH_RATE: -0.5,   // -50%
  MAX_GROWTH_RATE: 2,      // +200%

  // Salaries
  MIN_SALARY: 0,
  MAX_SALARY: 10000000,    // $10M
} as const

// ============================================================================
// UI CONSTANTS
// ============================================================================

/**
 * History Stack Limits (for Undo/Redo)
 */
export const UI = {
  MAX_HISTORY_STATES: 50,
  AUTO_SAVE_DEBOUNCE_MS: 2000,
  TOAST_DURATION_MS: 4000,
} as const

/**
 * Table Display Limits
 */
export const TABLE = {
  MAX_VISIBLE_ROWS: 100,
  DEFAULT_ROW_HEIGHT: 36,
  HEADER_HEIGHT: 48,
} as const

// ============================================================================
// XERO INTEGRATION
// ============================================================================

/**
 * Xero API Configuration
 */
export const XERO = {
  SYNC_TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
  TOKEN_REFRESH_BUFFER_MS: 300000, // 5 minutes before expiry
} as const

// ============================================================================
// HELPER TYPE EXPORTS
// ============================================================================

export type TaxBrackets = typeof TAX_BRACKETS_2024_25
export type PayPeriodFrequency = keyof typeof PAY_PERIODS_PER_YEAR
