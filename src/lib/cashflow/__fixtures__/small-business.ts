/**
 * Test fixtures for a realistic small-business cashflow scenario.
 * 12-month FY July → June, $600k revenue, $360k COGS, $120k OpEx.
 *
 * These fixtures are used by engine.test.ts to assert correct behaviour
 * across the cashflow calculations.
 */

import type {
  PLLine,
  PayrollSummary,
  CashflowAssumptions,
  FinancialForecast,
} from '@/app/finances/forecast/types'
import { getDefaultCashflowAssumptions } from '../engine'

/** 12 FY months starting July 2025 */
export const FY_MONTHS = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
]

/** Build a monthly_values map with same value for every month */
export function evenSpread(months: string[], amount: number): Record<string, number> {
  const result: Record<string, number> = {}
  for (const m of months) result[m] = amount
  return result
}

/** Minimal FinancialForecast with forecast period July 2025 → June 2026 (all forecast, no actuals) */
export const FORECAST: FinancialForecast = {
  id: 'forecast-test-1',
  business_id: 'business-test-1',
  user_id: 'user-test-1',
  name: 'Test Forecast FY2026',
  fiscal_year: 2026,
  year_type: 'FY',
  actual_start_month: '2025-07',
  actual_end_month: '2025-07',        // Tiny actual period (just the first month)
  forecast_start_month: '2025-08',
  forecast_end_month: '2026-06',
}

/** Default assumptions with all opening balances at zero */
export function baseAssumptions(overrides: Partial<CashflowAssumptions> = {}): CashflowAssumptions {
  return {
    ...getDefaultCashflowAssumptions(),
    gst_registered: true,
    gst_rate: 0.10,
    gst_reporting_frequency: 'quarterly',
    gst_applicable_expense_pct: 0.80,
    super_payment_frequency: 'quarterly',
    payg_wh_reporting_frequency: 'quarterly',
    payg_instalment_amount: 0,
    payg_instalment_frequency: 'none',
    dso_days: 30,
    dpo_days: 30,
    opening_bank_balance: 100000,
    ...overrides,
  }
}

/** Build a single P&L line with an even spread across forecast months */
export function plLine(
  name: string,
  category: 'Revenue' | 'Cost of Sales' | 'Operating Expenses' | 'Other Income' | 'Other Expenses',
  monthly: number,
  opts: { actualMonths?: string[]; forecastMonths?: string[]; xeroAccountId?: string } = {}
): PLLine {
  const am = opts.actualMonths ?? [FY_MONTHS[0]]
  const fm = opts.forecastMonths ?? FY_MONTHS.slice(1)
  return {
    account_name: name,
    category,
    actual_months: evenSpread(am, monthly),
    forecast_months: evenSpread(fm, monthly),
    ...(opts.xeroAccountId ? { account_code: opts.xeroAccountId } : {}),
  }
}

/** A realistic small-business P&L: $600k revenue, $360k COGS, $120k OpEx */
export function smallBusinessPL(): PLLine[] {
  return [
    // Revenue: $600k/year = $50k/month
    plLine('Sales Revenue', 'Revenue', 50000),

    // COGS: $360k/year = $30k/month (60% of revenue)
    plLine('Cost of Goods Sold', 'Cost of Sales', 30000),

    // OpEx: $120k/year = $10k/month total
    plLine('Rent', 'Operating Expenses', 3000),
    plLine('Utilities', 'Operating Expenses', 800),
    plLine('Marketing', 'Operating Expenses', 2000),
    plLine('Software Subscriptions', 'Operating Expenses', 1200),
    plLine('Professional Fees', 'Operating Expenses', 1500),
    plLine('Insurance', 'Operating Expenses', 500),
    plLine('Depreciation', 'Operating Expenses', 1000),  // Non-cash — should NOT appear in outflows
  ]
}

/** Fixture with payroll summary providing timing for wages/super/PAYG */
export function payrollSummaryFixture(): PayrollSummary {
  return {
    forecast_id: FORECAST.id,
    pay_runs_per_month: evenSpread(FY_MONTHS, 2),
    wages_admin_monthly: evenSpread(FY_MONTHS, 8000),   // $96k/year admin wages
    wages_cogs_monthly: evenSpread(FY_MONTHS, 4000),    // $48k/year COGS wages
    payg_monthly: evenSpread(FY_MONTHS, 2400),          // ~20% of gross
    net_wages_monthly: evenSpread(FY_MONTHS, 9600),
    superannuation_monthly: evenSpread(FY_MONTHS, 1380), // 11.5% of $12k gross
    payroll_tax_monthly: evenSpread(FY_MONTHS, 0),
  }
}

/** Wage lines for scenarios WITHOUT payroll summary */
export function wagesAsPL(): PLLine[] {
  return [
    plLine('Wages & Salaries', 'Operating Expenses', 12000), // matches payroll total
    plLine('Superannuation', 'Operating Expenses', 1380),
  ]
}
