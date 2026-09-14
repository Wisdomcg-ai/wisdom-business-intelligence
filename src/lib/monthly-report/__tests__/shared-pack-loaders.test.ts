/**
 * The database halves of the pack's pages, lifted out of their routes so
 * scripts/preview-pack.ts renders the same pack the export does. Each is
 * exercised here through an in-memory client that APPLIES its filters, so a
 * loader reading the wrong id-space, month window or basis gets the wrong rows
 * back and the test says so. The in-memory client also refuses every write —
 * the harness depends on these loaders being read-only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase } from './fake-supabase'

const BUSINESS = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const PROFILE = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'
const TENANT = '8519c134-ed81-4d9b-8f07-ce499d12b7ee'

const { resolveBudgetMock, connectionsMock, ownedMock } = vi.hoisted(() => ({
  resolveBudgetMock: vi.fn(),
  connectionsMock: vi.fn(),
  ownedMock: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: BUSINESS, profileId: PROFILE, all: [BUSINESS, PROFILE] })),
}))
vi.mock('@/lib/business/resolveXeroBusinessId', () => ({ resolveXeroConnections: connectionsMock }))
vi.mock('@/lib/budgets/owned-forecast', () => ({ forecastBelongsToBusiness: ownedMock }))
vi.mock('@/lib/budgets/resolve-budget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/budgets/resolve-budget')>()),
  resolveBudget: resolveBudgetMock,
}))

import { loadPayrollGrid, payrollMonthWindow } from '../payroll-grid-load'
import { loadWagesDetail } from '../wages-detail-load'
import { loadMoneyFlow } from '../money-flow-load'
import { loadOpeningBank } from '../opening-bank-load'
import { loadExternalMetricSeries } from '../external-metrics-load'
import { loadReportSettings, DEFAULT_REPORT_SECTIONS } from '../report-settings-load'
import { loadCashflowAssumptions } from '@/lib/forecast/cashflow-assumptions-load'

/** Urban Road's approved budget for the two payroll months (rev 12 Aug 2026). */
const APPROVED = {
  source: 'budget_version',
  versionId: 'v1',
  forecastId: null,
  noBudgetReason: null,
  label: 'Overall Budget (Xero, rev 12 Aug 2026)',
  lines: [
    { id: 'b1', account_name: 'Employ - Wages & Salaries', category: 'Operating Expenses', forecast_months: { '2026-07': 42015, '2026-08': 52519 } },
    { id: 'b2', account_name: 'Employ - Superannuation', category: 'Operating Expenses', forecast_months: { '2026-07': 5042, '2026-08': 6302 } },
  ],
}

const slip = (employee_id: string, employee_name: string, payment_date: string, wages: number, tenant_id = TENANT) => ({
  business_id: PROFILE, tenant_id, employee_id, employee_name, payment_date,
  period_start: payment_date, period_end: payment_date, calendar_type: 'WEEKLY',
  wages, tax: 0, super_amount: wages * 0.12, net_pay: wages,
})

beforeEach(() => {
  resolveBudgetMock.mockReset().mockResolvedValue(APPROVED)
  connectionsMock.mockReset().mockResolvedValue({ connectionBusinessId: BUSINESS, connections: [{ tenant_id: TENANT }] })
  ownedMock.mockReset().mockResolvedValue(true)
})

describe('payroll-grid-load', () => {
  it('windows the months ending at the report month', () => {
    expect(payrollMonthWindow('2026-08', 2)).toEqual(['2026-07', '2026-08'])
    expect(payrollMonthWindow('2027-01', 3)).toEqual(['2026-11', '2026-12', '2027-01'])
  })

  it('reads the window\'s payslips by tenant and puts the WAGES budget, not super, on the Budget row', async () => {
    const db = fakeSupabase({
      xero_payslip_lines: [
        slip('e1', 'Andrea Shinners', '2026-07-27', 2500),
        slip('e1', 'Andrea Shinners', '2026-08-31', 2500),
        slip('e1', 'Andrea Shinners', '2026-09-07', 2500), // outside the window
        slip('e9', 'Someone Else', '2026-08-10', 9999, 'other-tenant'),
      ],
      xero_employees: [{ tenant_id: TENANT, employee_id: 'e1', start_date: '2020-03-05' }],
      monthly_report_settings: [{ business_id: BUSINESS, budget_source: 'budget_version', budget_forecast_id: null, wages_account_names: ['Employ - Wages & Salaries', 'Employ - Superannuation'] }],
    })
    const res = await loadPayrollGrid(db, { business_id: BUSINESS, report_month: '2026-08', fiscal_year: 2027, months: 2 })
    expect(res.data).not.toBeNull()
    expect(res.data!.grand_total).toBe(5000)
    expect(res.data!.months.map((m) => [m.month, m.total, m.budget])).toEqual([
      ['2026-07', 2500, 42015],
      ['2026-08', 2500, 52519],
    ])
    expect(resolveBudgetMock.mock.calls[0][1]).toMatchObject({ budgetSource: 'budget_version', months: ['2026-07', '2026-08'] })
  })

  it('says why there is no grid rather than failing', async () => {
    connectionsMock.mockResolvedValueOnce({ connectionBusinessId: BUSINESS, connections: [] })
    expect(await loadPayrollGrid(fakeSupabase({}), { business_id: BUSINESS, report_month: '2026-08', fiscal_year: 2027 }))
      .toEqual({ data: null, reason: 'no Xero connection' })
    expect(await loadPayrollGrid(fakeSupabase({ xero_payslip_lines: [] }), { business_id: BUSINESS, report_month: '2026-08', fiscal_year: 2027 }))
      .toEqual({ data: null, reason: 'no payslips synced for this period' })
  })
})

describe('wages-detail-load', () => {
  const input = {
    business_id: BUSINESS,
    report_month: '2026-08',
    fiscal_year: 2027,
    wages_account_names: ['Employ - Wages & Salaries'],
  }

  it('builds the page from stored payslips and the resolved budget, with no live pull', async () => {
    const db = fakeSupabase({
      monthly_report_settings: [{ business_id: BUSINESS, budget_source: 'budget_version' }],
      xero_pl_lines_wide_compat: [{ business_id: PROFILE, account_name: 'Employ - Wages & Salaries', monthly_values: { '2026-08': -52519 } }],
      account_mappings: [],
      xero_payslip_lines: [slip('e1', 'Andrea Shinners', '2026-08-03', 2500), slip('e1', 'Andrea Shinners', '2026-08-10', 2500), slip('e1', 'Andrea Shinners', '2026-07-27', 2500)],
      xero_connections: [{ business_id: BUSINESS, tenant_id: TENANT, is_active: true }],
    })
    const fetchLivePayroll = vi.fn()
    const res = await loadWagesDetail(db, input, { fetchLivePayroll })
    expect(res.live_fallback).toBe('not_needed')
    expect(fetchLivePayroll).not.toHaveBeenCalled()
    expect(res.data.accounts[0]).toMatchObject({ account_name: 'Employ - Wages & Salaries', actual: 52519, budget: 52519, variance: 0 })
    expect(res.data.employees).toHaveLength(1)
    expect(res.data.employees[0]).toMatchObject({ name: 'Andrea Shinners', actual_total: 5000, pay_frequency: 'Weekly', source: 'xero' })
    expect(res.data.pay_run_dates).toEqual(['2026-08-03', '2026-08-10'])
    expect(res.data.budget_provenance).toMatchObject({ source: 'budget_version', label: APPROVED.label })
  })

  const neverSynced = () => fakeSupabase({
    monthly_report_settings: [],
    xero_pl_lines_wide_compat: [],
    account_mappings: [],
    xero_payslip_lines: [],
    xero_pay_runs: [],
    xero_connections: [{ business_id: BUSINESS, tenant_id: TENANT, is_active: true }],
  })

  it('reports when the live payroll fallback was needed but not supplied', async () => {
    const res = await loadWagesDetail(neverSynced(), input)
    expect(res.live_fallback).toBe('skipped_no_fetcher')
    expect(res.data.employees).toEqual([])
    expect(res.data.payroll_available).toBe(false)
  })

  it('runs the injected live pull only for a business with nothing stored', async () => {
    const fetchLivePayroll = vi.fn(async () => ({
      payrollAvailable: true,
      payRunDates: ['2026-08-14'],
      employees: [{ name: 'Lara Powell', employeeId: 'e2', calendarType: 'FORTNIGHTLY', payslips: [{ date: '2026-08-14', periodStart: '', periodEnd: '', gross: 3846, tax: 0, superAmt: 0, net: 3846 }] }],
    }))
    const res = await loadWagesDetail(neverSynced(), input, { fetchLivePayroll })
    expect(fetchLivePayroll).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: TENANT }))
    expect(res.live_fallback).toBe('used')
    expect(res.data.payroll_available).toBe(true)
    expect(res.data.employees[0]).toMatchObject({ name: 'Lara Powell', actual_total: 3846, pay_frequency: 'Fortnightly' })
  })

  it('ignores a pinned forecast the business does not own', async () => {
    ownedMock.mockResolvedValueOnce(false)
    await loadWagesDetail(neverSynced(), { ...input, budget_forecast_id: 'someone-elses' })
    expect(resolveBudgetMock.mock.calls[0][1].pin).toEqual({ budgetForecastId: null })
  })
})

describe('money-flow-load', () => {
  it('derives the month from the profile-space mirror only', async () => {
    const bank = (business_id: string, start: number, end: number) => ({
      business_id, tenant_id: TENANT, account_name: 'CBA Cheque Account', account_type: 'asset', section: 'Bank',
      balances_by_date: { '2026-07-31': start, '2026-08-31': end },
    })
    // Assets = equity at both dates, so the sheet balances — unless the decoy
    // under another business id leaks in, which unbalances it by $1M.
    const equity = {
      business_id: PROFILE, tenant_id: TENANT, account_name: 'Current Year Earnings', account_type: 'equity', section: null,
      balances_by_date: { '2026-07-31': 265685, '2026-08-31': 210185 },
    }
    const res = await loadMoneyFlow(fakeSupabase({
      xero_bs_lines_wide_compat: [bank(PROFILE, 265685, 210185), equity, bank('some-other-business', 1_000_000, 0)],
    }), BUSINESS, '2026-08')
    expect(res.flow.comparable).toBe(true)
    expect(res.dates).toEqual({ start: '2026-07-31', end: '2026-08-31' })
    expect(res.flow.bank).toMatchObject({ start: 265685, end: 210185, delta: -55500 })
  })
})

describe('opening-bank-load', () => {
  it('reads Total Bank the day before the fiscal year, accruals only, for active orgs', async () => {
    const row = (balance: number, basis: string, tenant_id = TENANT) => ({
      business_id: PROFILE, tenant_id, account_type: 'asset', section: 'Bank', balance_date: '2026-06-30', balance, basis,
    })
    const opening = await loadOpeningBank(fakeSupabase({
      business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
      xero_connections: [
        { business_id: BUSINESS, tenant_id: TENANT, functional_currency: 'AUD', is_active: true },
        { business_id: BUSINESS, tenant_id: 'retired', functional_currency: 'AUD', is_active: false },
      ],
      xero_bs_lines: [row(167629.81, 'accruals'), row(999999, 'cash'), row(5, 'accruals', 'retired')],
    }), BUSINESS, '2026-08')
    expect(opening).toEqual({ status: 'read', amount: 167629.81, asAt: '2026-06-30' })
  })
})

describe('external-metrics-load', () => {
  it('returns active series with only this month\'s values', async () => {
    const series = await loadExternalMetricSeries(fakeSupabase({
      external_metric_series: [
        { id: 's1', business_id: BUSINESS, is_active: true, display_name: 'Orders by channel', reconciles_to_account_name: null },
        { id: 's2', business_id: BUSINESS, is_active: false, display_name: 'Retired' },
      ],
      external_metric_values: [
        { series_id: 's1', period_month: '2026-08', dimension_value: 'Shopify', measure_key: 'orders', value: 120 },
        { series_id: 's1', period_month: '2026-07', dimension_value: 'Shopify', measure_key: 'orders', value: 90 },
      ],
    }), BUSINESS, '2026-08')
    expect(series).toHaveLength(1)
    expect(series[0].values).toEqual([expect.objectContaining({ value: 120 })])
    expect(series[0].tie).toBeNull()
  })
})

describe('report-settings-load', () => {
  it('fills section keys added since the row was saved', async () => {
    const { settings, is_default } = await loadReportSettings(fakeSupabase({
      monthly_report_settings: [{ business_id: BUSINESS, sections: { balance_sheet: true, trend_charts: false }, contractor_account_codes: ['61400'] }],
    }), BUSINESS)
    expect(is_default).toBe(false)
    expect(settings.sections).toEqual({ ...DEFAULT_REPORT_SECTIONS, balance_sheet: true, trend_charts: false })
    expect(settings.contractor_account_codes).toEqual(['61400'])
  })

  it('answers the defaults, without a row, when there is none', async () => {
    const { settings, is_default } = await loadReportSettings(fakeSupabase({ monthly_report_settings: [] }), BUSINESS)
    expect(is_default).toBe(true)
    expect(settings).toMatchObject({ business_id: BUSINESS, budget_source: 'forecast', sections: DEFAULT_REPORT_SECTIONS })
  })
})

describe('cashflow-assumptions-load', () => {
  it('returns the saved cashflow block, null when none, and null for a missing forecast', async () => {
    const db = fakeSupabase({
      financial_forecasts: [
        { id: 'fc1', business_id: PROFILE, assumptions: { cashflow: { dso_days: 30 } } },
        { id: 'fc2', business_id: PROFILE, assumptions: {} },
      ],
    })
    expect(await loadCashflowAssumptions(db, 'fc1')).toEqual({ business_id: PROFILE, cashflow: { dso_days: 30 } })
    expect(await loadCashflowAssumptions(db, 'fc2')).toEqual({ business_id: PROFILE, cashflow: null })
    expect(await loadCashflowAssumptions(db, 'nope')).toBeNull()
  })
})
