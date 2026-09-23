/**
 * The engine runs whose output is pinned byte-for-byte in engine-golden.json.
 *
 * Captured from the engine at 80e8a5b3, BEFORE the monthly-report pack's cash
 * model v2 added its options. The engine is shared: the forecast wizard
 * (useCashflowForecast passes settings, xeroAccounts and capexByMonth), the
 * consolidated cashflow (settings and xeroAccounts, per tenant) and the pack's
 * v1 cashflow (signedExpenses) all call it, and none of them turns a v2 option
 * on. Every v2 behaviour sits behind an option that defaults off; these cases
 * are how that claim is checked rather than asserted.
 *
 * To regenerate (only when a deliberate engine change is intended, and then
 * say so in the commit): run the generator in the commit message's notes
 * against the commit BEFORE the change, never after it.
 */
import type { CashflowAssumptions, FinancialForecast, PLLine } from '@/app/finances/forecast/types'
import type { CashflowEngineOptions } from '../engine'
import { FORECAST, FY_MONTHS, baseAssumptions, evenSpread, payrollSummaryFixture, plLine, smallBusinessPL, wagesAsPL } from './small-business'

export interface GoldenCase {
  name: string
  lines: PLLine[]
  payroll: ReturnType<typeof payrollSummaryFixture> | null
  assumptions: CashflowAssumptions
  forecast: FinancialForecast
  plannedSpends: any[]
  options: CashflowEngineOptions | undefined
}

const WIZARD_SETTINGS = {
  use_explicit_accounts: true,
  depreciation_expense_account_id: 'acc-depn',
  company_tax_rate: 0.25,
  company_tax_schedule: 'quarterly',
} as any

const XERO_ACCOUNTS = [
  { xero_account_id: 'acc-depn', account_code: '61600', account_name: 'Depreciation' },
  { xero_account_id: 'acc-rent', account_code: '66000', account_name: 'Rent' },
]

export function goldenCases(): GoldenCase[] {
  const busy = baseAssumptions({
    opening_bank_balance: 42000,
    opening_trade_debtors: 55000,
    opening_trade_creditors: 31000,
    opening_gst_liability: 7400,
    opening_payg_wh_liability: 4800,
    opening_super_liability: 2760,
    opening_payg_instalment_liability: 1500,
    payg_instalment_amount: 6000,
    payg_instalment_frequency: 'quarterly',
    planned_stock_changes: { '2025-09': 12000, '2026-02': -4000 },
    loans: [
      { name: 'Equipment', balance: 60000, interest_rate: 0.08, monthly_repayment: 2500, is_interest_only: false },
      { name: 'Overdraft', balance: 20000, interest_rate: 0.1, monthly_repayment: 0, is_interest_only: true },
    ] as any,
    dso_days: 45,
    dpo_days: 19,
  })
  const withCredits = [
    ...smallBusinessPL(),
    plLine('Repairs & Maintenance Warehouse', 'Operating Expenses', -502.83),
    plLine('Bank Interest Income', 'Other Income', 57.87),
    { ...plLine('Staff Amenities', 'Operating Expenses', 129.04), report_group: 'Employment Expense' },
  ]
  const spends = [
    { id: 's1', description: 'Forklift', amount: 18000, month: 3, spendType: 'asset', paymentMethod: 'outright' },
    { id: 's2', description: 'Van', amount: 45000, month: 5, spendType: 'asset', paymentMethod: 'finance', financeTerm: 36, financeMonthlyPayment: 1400 },
    { id: 's3', description: 'Printer', amount: 9000, month: 2, spendType: 'asset', paymentMethod: 'lease', leaseTerm: 24, leaseMonthlyPayment: 410 },
  ]
  const monthlyGst = baseAssumptions({ gst_reporting_frequency: 'monthly', super_payment_frequency: 'monthly', payg_wh_reporting_frequency: 'monthly' })
  const allActual: FinancialForecast = { ...FORECAST, actual_end_month: '2025-12', forecast_start_month: '2026-01' }

  return [
    { name: 'no options, small business', lines: smallBusinessPL(), payroll: null, assumptions: baseAssumptions(), forecast: FORECAST, plannedSpends: [], options: undefined },
    { name: 'no options, wages as P&L lines', lines: [...smallBusinessPL(), ...wagesAsPL()], payroll: null, assumptions: busy, forecast: FORECAST, plannedSpends: spends, options: undefined },
    { name: 'no options, payroll summary (the latent double-PAYG path)', lines: [...smallBusinessPL(), ...wagesAsPL()], payroll: payrollSummaryFixture(), assumptions: busy, forecast: FORECAST, plannedSpends: [], options: {} },
    { name: 'no options, monthly reporter, six actual months', lines: withCredits, payroll: payrollSummaryFixture(), assumptions: monthlyGst, forecast: allActual, plannedSpends: spends, options: undefined },
    { name: 'no options, not GST registered', lines: withCredits, payroll: null, assumptions: baseAssumptions({ gst_registered: false, dso_days: 0, dpo_days: 75 }), forecast: FORECAST, plannedSpends: [], options: undefined },
    {
      name: 'forecast wizard options (settings, xeroAccounts, capexByMonth)',
      lines: withCredits, payroll: payrollSummaryFixture(), assumptions: busy, forecast: FORECAST, plannedSpends: spends,
      options: { settings: WIZARD_SETTINGS, xeroAccounts: XERO_ACCOUNTS, capexByMonth: { '2025-10': 25000, '2026-03': 4000 } },
    },
    {
      name: 'consolidation options (settings, xeroAccounts)',
      lines: withCredits, payroll: null, assumptions: { ...busy, opening_bank_balance: 9100 }, forecast: FORECAST, plannedSpends: [],
      options: { settings: WIZARD_SETTINGS, xeroAccounts: XERO_ACCOUNTS },
    },
    {
      name: 'pack v1 options (signedExpenses)',
      lines: withCredits, payroll: null, assumptions: baseAssumptions({ dso_days: 19, dpo_days: 29 }), forecast: FORECAST, plannedSpends: [],
      options: { signedExpenses: true },
    },
    {
      name: 'uneven months',
      lines: [
        { account_name: 'Canvas Sales', category: 'Revenue', actual_months: { '2025-07': 337401.88 }, forecast_months: { ...evenSpread(FY_MONTHS.slice(1), 279320), '2025-11': 510180 } },
        { account_name: 'Antons Canvas', category: 'Cost of Sales', actual_months: { '2025-07': 208264.77 }, forecast_months: evenSpread(FY_MONTHS.slice(1), 172488) },
      ],
      payroll: null, assumptions: baseAssumptions({ dso_days: 19, dpo_days: 29 }), forecast: FORECAST, plannedSpends: [], options: { signedExpenses: true },
    },
  ]
}
