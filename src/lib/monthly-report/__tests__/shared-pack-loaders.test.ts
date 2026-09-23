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
import { loadOpeningBank, loadPackCashflowOpening } from '../opening-bank-load'
import { loadBankAccountIds } from '../bank-accounts-load'
import { URBAN_ROAD_BS_JUL_AUG_2026, URBAN_ROAD_PL_AUG_2026, CBA_CHEQUE, BUS_ONLINE_SAVER, AMEX_PLATINUM } from './fixtures/urban-road-money-flow-2026-08'
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

  it('a window reaching back past 1 July has no budget for the old year\'s month — a dash, not a $0 budget and an overrun', async () => {
    const db = fakeSupabase({
      xero_payslip_lines: [
        slip('e1', 'Andrea Shinners', '2026-06-29', 2500),
        slip('e1', 'Andrea Shinners', '2026-07-27', 2500),
      ],
      xero_employees: [{ tenant_id: TENANT, employee_id: 'e1', start_date: '2020-03-05' }],
      monthly_report_settings: [{ business_id: BUSINESS, budget_source: 'budget_version', budget_forecast_id: null, wages_account_names: ['Employ - Wages & Salaries'] }],
    })
    const res = await loadPayrollGrid(db, { business_id: BUSINESS, report_month: '2026-07', fiscal_year: 2027, months: 2 })
    expect(res.data!.months.map((m) => [m.month, m.budget, m.difference])).toEqual([
      ['2026-06', null, null],
      ['2026-07', 42015, 39515],
    ])
  })

  it('says why there is no grid rather than failing', async () => {
    connectionsMock.mockResolvedValueOnce({ connectionBusinessId: BUSINESS, connections: [] })
    expect(await loadPayrollGrid(fakeSupabase({}), { business_id: BUSINESS, report_month: '2026-08', fiscal_year: 2027 }))
      .toEqual({ data: null, reason: 'no Xero connection' })
    expect(await loadPayrollGrid(fakeSupabase({ xero_payslip_lines: [] }), { business_id: BUSINESS, report_month: '2026-08', fiscal_year: 2027 }))
      .toEqual({ data: null, reason: 'no payslips synced for this period' })
  })

  it("carries each run's pay period and every named employee record, for the roster budget (P10)", async () => {
    const db = fakeSupabase({
      xero_payslip_lines: [
        { ...slip('e1', 'Andrea Shinners', '2026-08-05', 5000), calendar_type: 'FORTNIGHTLY', period_start: '2026-07-22', period_end: '2026-08-04' },
        { ...slip('e2', 'Lara Powell', '2026-08-05', 3800), calendar_type: 'FORTNIGHTLY', period_start: '2026-07-22', period_end: '2026-08-04' },
        { ...slip('e1', 'Andrea Shinners', '2026-08-19', 5000), calendar_type: 'FORTNIGHTLY', period_start: '2026-08-05', period_end: '2026-08-18' },
      ],
      xero_employees: [
        { tenant_id: TENANT, employee_id: 'e1', first_name: 'Andrea', last_name: 'Shinners', start_date: '2020-03-05', termination_date: null },
        { tenant_id: TENANT, employee_id: 'e2', first_name: 'Lara', last_name: 'Powell', start_date: '2022-05-09', termination_date: '2026-08-10' },
        { tenant_id: TENANT, employee_id: 'e3', first_name: 'On', last_name: 'Leave', start_date: '2021-01-01', termination_date: null },
        { tenant_id: 'other-tenant', employee_id: 'x', first_name: 'Not', last_name: 'Ours', start_date: null, termination_date: null },
      ],
      monthly_report_settings: [],
    })
    const res = await loadPayrollGrid(db, { business_id: BUSINESS, report_month: '2026-08', fiscal_year: 2027, months: 1 })
    expect(res.data!.pay_periods).toEqual([
      { payment_date: '2026-08-05', calendar_type: 'FORTNIGHTLY', period_start: '2026-07-22', period_end: '2026-08-04' },
      { payment_date: '2026-08-19', calendar_type: 'FORTNIGHTLY', period_start: '2026-08-05', period_end: '2026-08-18' },
    ])
    expect(res.data!.employee_records).toEqual([
      { employee_id: 'e1', name: 'Andrea Shinners', start_date: '2020-03-05', termination_date: null },
      { employee_id: 'e2', name: 'Lara Powell', start_date: '2022-05-09', termination_date: '2026-08-10' },
      { employee_id: 'e3', name: 'On Leave', start_date: '2021-01-01', termination_date: null },
    ])
    expect(res.data!.employees.find((e) => e.employee_id === 'e2')!.termination_date).toBe('2026-08-10')
    expect(res.data!.records_unreadable).toBeUndefined()
  })

  it('employee records that could not be read still build the grid, and say so — the roster budget cannot count weeks without them', async () => {
    const db = fakeSupabase({
      xero_payslip_lines: [slip('e1', 'Andrea Shinners', '2026-08-03', 2500)],
      xero_employees: { error: { message: 'timeout' } },
      monthly_report_settings: [],
    })
    const res = await loadPayrollGrid(db, { business_id: BUSINESS, report_month: '2026-08', fiscal_year: 2027, months: 1 })
    expect(res.data!.grand_total).toBe(2500)
    expect(res.data!.records_unreadable).toBe(true)
  })

  it('a payslip read that fails is could-not-check, not "no payslips synced"', async () => {
    const res = await loadPayrollGrid(fakeSupabase({ xero_payslip_lines: { error: { message: 'canceling statement due to statement timeout' } } }), { business_id: BUSINESS, report_month: '2026-08', fiscal_year: 2027 })
    expect(res).toEqual({ data: null, reason: 'the payslips could not be read' })
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

  /**
   * F5 (22 Sep 2026 system diagnostic) — a multi-org business showed ONE org's
   * wages as the total. The mirror holds a row per org per account and the
   * lookup returned a single line, so Dragon Roofing's $40,000 and $25,000 read
   * as $40,000. Rows for the same account are summed; an org in another
   * currency is left out rather than added one-for-one (the F1 bug elsewhere).
   */
  describe('multi-org actuals', () => {
    const SECOND_TENANT = 'b2222222-2222-4222-8222-000000000002'
    const wagesRow = (tenant_id: string, value: number) => ({
      business_id: PROFILE, tenant_id, account_name: 'Employ - Wages & Salaries',
      monthly_values: { '2026-08': value },
    })

    it('sums the same account across both orgs', async () => {
      const db = fakeSupabase({
        monthly_report_settings: [{ business_id: BUSINESS, budget_source: 'budget_version' }],
        xero_pl_lines_wide_compat: [wagesRow(TENANT, -40_000), wagesRow(SECOND_TENANT, -25_000)],
        account_mappings: [],
        xero_payslip_lines: [],
        xero_connections: [
          { business_id: BUSINESS, tenant_id: TENANT, is_active: true, functional_currency: 'AUD' },
          { business_id: BUSINESS, tenant_id: SECOND_TENANT, is_active: true, functional_currency: 'AUD' },
        ],
      })
      const res = await loadWagesDetail(db, input, { fetchLivePayroll: vi.fn() })
      expect(res.data.accounts[0]).toMatchObject({ account_name: 'Employ - Wages & Salaries', actual: 65_000 })
    })

    it('leaves an org in another currency out instead of adding HKD to AUD', async () => {
      const db = fakeSupabase({
        monthly_report_settings: [{ business_id: BUSINESS, budget_source: 'budget_version' }],
        xero_pl_lines_wide_compat: [wagesRow(TENANT, -40_000), wagesRow(SECOND_TENANT, -1_000_000)],
        account_mappings: [],
        xero_payslip_lines: [],
        xero_connections: [
          { business_id: BUSINESS, tenant_id: TENANT, is_active: true, functional_currency: 'AUD' },
          { business_id: BUSINESS, tenant_id: SECOND_TENANT, is_active: true, functional_currency: 'HKD' },
        ],
      })
      const res = await loadWagesDetail(db, input, { fetchLivePayroll: vi.fn() })
      expect(res.data.accounts[0]).toMatchObject({ actual: 40_000 })
    })

    it('a single-org business is unchanged', async () => {
      const db = fakeSupabase({
        monthly_report_settings: [{ business_id: BUSINESS, budget_source: 'budget_version' }],
        xero_pl_lines_wide_compat: [wagesRow(TENANT, -52_519)],
        account_mappings: [],
        xero_payslip_lines: [],
        xero_connections: [{ business_id: BUSINESS, tenant_id: TENANT, is_active: true, functional_currency: 'AUD' }],
      })
      const res = await loadWagesDetail(db, input, { fetchLivePayroll: vi.fn() })
      expect(res.data.accounts[0]).toMatchObject({ actual: 52_519, budget: 52_519, variance: 0 })
    })
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

describe('money-flow-load — the Calxa page from the mirror, the P&L and the settings', () => {
  const mirror = [
    ...URBAN_ROAD_BS_JUL_AUG_2026.map((r) => ({ ...r, business_id: PROFILE })),
    // A decoy under another business: if it leaks in, the sheet stops balancing.
    { business_id: 'some-other-business', tenant_id: TENANT, account_id: 'x', account_code: null, account_name: 'Decoy', account_type: 'asset', section: 'Bank', balances_by_date: { '2026-07-31': 0, '2026-08-31': 1_000_000 } },
  ]
  const tables = (settings: unknown) => ({
    xero_bs_lines_wide_compat: mirror,
    xero_pl_lines_wide_compat: URBAN_ROAD_PL_AUG_2026.map((r) => ({ ...r, business_id: PROFILE })),
    xero_accounts: [
      { business_id: BUSINESS, tenant_id: TENANT, xero_account_id: AMEX_PLATINUM, bank_account_type: 'CREDITCARD' },
      { business_id: BUSINESS, tenant_id: TENANT, xero_account_id: CBA_CHEQUE, bank_account_type: 'BANK' },
    ],
    monthly_report_settings: settings as never,
  })

  it("reads the business's chosen bank accounts, the P&L summary and the card's sign", async () => {
    const { flow } = await loadMoneyFlow(fakeSupabase(tables([
      { business_id: BUSINESS, bank_account_ids: [CBA_CHEQUE, BUS_ONLINE_SAVER] },
    ])), BUSINESS, '2026-08')
    expect(flow.comparable).toBe(true)
    expect(flow.bank_basis).toBe('chosen')
    expect(flow.bank.delta).toBe(-31708.01)
    expect(flow.summary?.surplus).toBe(132701.26)
    expect(flow.uses[0]).toMatchObject({ label: 'American Express® Platinum Business Card', opening: -65918.57, closing: -64332.13 })
  })

  it('an explicit bankAccountIds (the harness override) wins over the stored row', async () => {
    const { flow } = await loadMoneyFlow(fakeSupabase(tables([
      { business_id: BUSINESS, bank_account_ids: [CBA_CHEQUE, BUS_ONLINE_SAVER] },
    ])), BUSINESS, '2026-08', { bankAccountIds: null })
    expect(flow.bank_basis).toBe('section')
    expect(flow.bank.delta).toBe(-55500.33)
  })

  it('before the migration is applied the Bank section is bank, as it always was', async () => {
    const { flow } = await loadMoneyFlow(fakeSupabase(tables({
      error: { code: '42703', message: 'column monthly_report_settings.bank_account_ids does not exist' },
    })), BUSINESS, '2026-08')
    expect(flow.comparable).toBe(true)
    expect(flow.bank_basis).toBe('section')
  })
})

describe('bank-accounts-load', () => {
  it('prefers the businesses-space settings row and parses it', async () => {
    const ids = await loadBankAccountIds(fakeSupabase({
      monthly_report_settings: [
        { business_id: PROFILE, bank_account_ids: ['wrong'] },
        { business_id: BUSINESS, bank_account_ids: [CBA_CHEQUE, CBA_CHEQUE] },
      ],
    }), BUSINESS)
    expect(ids).toEqual([CBA_CHEQUE])
  })

  it('no row, or a schema cache that has not seen the column, is no choice', async () => {
    expect(await loadBankAccountIds(fakeSupabase({ monthly_report_settings: [] }), BUSINESS)).toBeNull()
    expect(await loadBankAccountIds(fakeSupabase({ monthly_report_settings: { error: { code: 'PGRST204', message: 'x' } as never } }), BUSINESS)).toBeNull()
  })

  it('any other database error throws — a guessed bank set is a wrong page', async () => {
    await expect(loadBankAccountIds(fakeSupabase({ monthly_report_settings: { error: { code: '57014', message: 'timeout' } as never } }), BUSINESS)).rejects.toMatchObject({ code: '57014' })
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

  it("opens on the business's chosen bank accounts when it has chosen them", async () => {
    const row = (account_id: string, balance: number) => ({
      business_id: PROFILE, tenant_id: TENANT, account_id, account_type: 'asset', section: 'Bank', balance_date: '2026-06-30', balance, basis: 'accruals',
    })
    const opening = await loadOpeningBank(fakeSupabase({
      business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
      xero_connections: [{ business_id: BUSINESS, tenant_id: TENANT, functional_currency: 'AUD', is_active: true }],
      xero_bs_lines: [row(CBA_CHEQUE, 31948.67), row(BUS_ONLINE_SAVER, 86037.86), row('tax-savings', 45000)],
      monthly_report_settings: [{ business_id: BUSINESS, bank_account_ids: [CBA_CHEQUE, BUS_ONLINE_SAVER] }],
    }), BUSINESS, '2026-08')
    expect(opening).toEqual({ status: 'read', amount: 117986.53, asAt: '2026-06-30' })
  })

  it('a chosen account Xero left off the opening sheet at $0 is $0, found on another month-end of the same org', async () => {
    const USD_PAYPAL = '1b2c3d4e-0000-4000-8000-000000000001'
    const row = (account_id: string, account_type: string, balance: number, balance_date = '2026-06-30', tenant_id = TENANT) => ({
      business_id: PROFILE, tenant_id, account_id, account_type, section: account_type === 'asset' ? 'Bank' : 'Other', balance_date, balance, basis: 'accruals',
    })
    const tables = (usdPaypalRows: Record<string, unknown>[]) => fakeSupabase({
      business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
      xero_connections: [{ business_id: BUSINESS, tenant_id: TENANT, functional_currency: 'AUD', is_active: true }],
      xero_bs_lines: [
        row(CBA_CHEQUE, 'asset', 31948.67), row(BUS_ONLINE_SAVER, 'asset', 86037.86),
        row('00000000-0000-4000-8000-00000000c0de', 'liability', 100000), row('00000000-0000-4000-8000-0000000e0e17', 'equity', 17986.53),
        ...usdPaypalRows,
      ],
      monthly_report_settings: [{ business_id: BUSINESS, bank_account_ids: [CBA_CHEQUE, BUS_ONLINE_SAVER, USD_PAYPAL] }],
    })
    expect(await loadOpeningBank(tables([row(USD_PAYPAL, 'asset', 0, '2026-07-31')]), BUSINESS, '2026-08'))
      .toEqual({ status: 'read', amount: 117986.53, asAt: '2026-06-30' })
    // Held only by another organisation, or only as a cash-basis row, it is no evidence.
    expect(await loadOpeningBank(tables([row(USD_PAYPAL, 'asset', 0, '2026-07-31', 'another-org')]), BUSINESS, '2026-08'))
      .toMatchObject({ status: 'unavailable', reason: '1 of the 3 bank accounts chosen for this report is not in the synced balance sheet at 2026-06-30' })
    expect(await loadOpeningBank(tables([{ ...row(USD_PAYPAL, 'asset', 0, '2026-07-31'), basis: 'cash' }]), BUSINESS, '2026-08'))
      .toMatchObject({ status: 'unavailable' })
  })

  it('an id in the list that is not a uuid is never sent to the uuid column, and is simply not in the sheet', async () => {
    const row = (account_id: string, balance: number) => ({
      business_id: PROFILE, tenant_id: TENANT, account_id, account_type: 'asset', section: 'Bank', balance_date: '2026-06-30', balance, basis: 'accruals',
    })
    const db = fakeSupabase({
      business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
      xero_connections: [{ business_id: BUSINESS, tenant_id: TENANT, functional_currency: 'AUD', is_active: true }],
      xero_bs_lines: [row(CBA_CHEQUE, 31948.67)],
    })
    const opening = await loadOpeningBank(db, BUSINESS, '2026-08', { bankAccountIds: [CBA_CHEQUE.toUpperCase(), 'closed-saver'] })
    expect(opening).toMatchObject({ status: 'unavailable', reason: '1 of the 2 bank accounts chosen for this report is not in the synced balance sheet at 2026-06-30' })
    const idFilters = db.calls.flatMap((c) => c.filters).filter(([, col]) => col === 'account_id')
    expect(idFilters).toEqual([['in', 'account_id', [CBA_CHEQUE]]])
  })
})

describe('loadPackCashflowOpening — the opening and the v1 verdict from one read', () => {
  const bank = (tenant_id: string, balance: number) => ({
    business_id: PROFILE, tenant_id, account_type: 'asset', section: 'Bank', balance_date: '2026-06-30', balance, basis: 'accruals',
  })

  it('one active AUD organisation: the opening, and no refusal', async () => {
    const res = await loadPackCashflowOpening(fakeSupabase({
      business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
      xero_connections: [
        { business_id: BUSINESS, tenant_id: TENANT, functional_currency: 'AUD', is_active: true },
        { business_id: BUSINESS, tenant_id: 'retired', functional_currency: 'AUD', is_active: false },
      ],
      xero_bs_lines: [bank(TENANT, 167629.81)],
    }), BUSINESS, '2026-08')
    expect(res).toEqual({ opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' }, v1Refusal: null })
  })

  it("Dragon Roofing's shape — two active AUD organisations — is refused though its opening reads", async () => {
    const res = await loadPackCashflowOpening(fakeSupabase({
      business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
      xero_connections: [
        { business_id: BUSINESS, tenant_id: 'dragon', functional_currency: 'AUD', is_active: true },
        { business_id: BUSINESS, tenant_id: 'easy-hail', functional_currency: 'AUD', is_active: true },
      ],
      xero_bs_lines: [bank('dragon', 41339.27), bank('easy-hail', 388767.43)],
    }), BUSINESS, '2026-08')
    expect(res.opening).toMatchObject({ status: 'read', amount: 430106.7 })
    expect(res.v1Refusal).toContain('more than one Xero organisation')
  })

  it("IICT's shape — an HKD organisation among AUD ones — is refused", async () => {
    const res = await loadPackCashflowOpening(fakeSupabase({
      business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
      xero_connections: [
        { business_id: BUSINESS, tenant_id: 'iap', functional_currency: 'AUD', is_active: true },
        { business_id: PROFILE, tenant_id: 'igl', functional_currency: 'HKD', is_active: true },
      ],
      xero_bs_lines: [],
    }), BUSINESS, '2026-08')
    expect(res.v1Refusal).not.toBeNull()
  })

  it('a connection read that fails throws — never a silent "one organisation"', async () => {
    await expect(loadPackCashflowOpening(fakeSupabase({
      business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
      xero_connections: { error: { message: 'timeout' } },
    }), BUSINESS, '2026-08')).rejects.toBeTruthy()
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
    expect(series[0].history).toBeUndefined()
  })

  it('a trend placement also gets the window, month by month, newest month included (P10)', async () => {
    const values = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((period_month, i) => ({
      id: `v${i}`, series_id: 's1', business_id: BUSINESS, period_month, dimension_value: 'Shopify', measure_key: 'orders', scenario: 'actual', value: 100 + i,
    }))
    const series = await loadExternalMetricSeries(fakeSupabase({
      external_metric_series: [{ id: 's1', business_id: BUSINESS, is_active: true, display_name: 'Orders by channel', reconciles_to_account_name: null }],
      external_metric_values: values,
    }), BUSINESS, '2026-08', { months: 3 })
    expect(series[0].values.map((v: { value: number }) => v.value)).toEqual([104])
    // June, July and August — not September, and not March.
    expect(series[0].history.map((v: { period_month: string }) => v.period_month)).toEqual(['2026-06', '2026-07', '2026-08'])
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
