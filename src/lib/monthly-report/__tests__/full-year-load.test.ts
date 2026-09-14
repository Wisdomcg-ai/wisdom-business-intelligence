/**
 * loadFullYearReport — the Full Year build lifted out of its route so the
 * preview harness renders the page the route serves. These pin the build's
 * boundaries end to end through the loader, against fixtures shaped like Urban
 * Road's: the ledger under the profile id, the mappings under the businesses
 * id, a Xero part-month that must not become an actual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase } from './fake-supabase'

const BUSINESS = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const PROFILE = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'

const { compositeMock, qualityMock, resolveBudgetMock } = vi.hoisted(() => ({
  compositeMock: vi.fn(),
  qualityMock: vi.fn(),
  resolveBudgetMock: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: BUSINESS, profileId: PROFILE, all: [BUSINESS, PROFILE] })),
}))
vi.mock('@/lib/services/forecast-read-service', () => ({
  createForecastReadService: () => ({ getMonthlyComposite: compositeMock, getDataQualityForBusiness: qualityMock }),
}))
vi.mock('@/lib/budgets/resolve-budget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/budgets/resolve-budget')>()),
  resolveBudget: resolveBudgetMock,
}))

import { loadFullYearReport } from '../full-year-load'

const FY27 = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06']
const monthly = (v: number) => Object.fromEntries(FY27.map((m) => [m, v]))

function tables(overrides: Record<string, unknown> = {}) {
  return {
    business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
    monthly_report_settings: [{ business_id: BUSINESS, budget_forecast_id: null, budget_source: 'forecast', expense_group_order: ['Bank and Other Fees'] }],
    account_mappings: [
      { business_id: BUSINESS, xero_account_name: 'Canvas Sales', xero_account_code: '41000', report_category: 'Revenue', report_subcategory: null },
      { business_id: BUSINESS, xero_account_name: 'Bank Fees', xero_account_code: '64000', report_category: 'Operating Expenses', report_subcategory: 'Bank and Other Fees' },
    ],
    financial_forecasts: [{ id: 'fc27', business_id: PROFILE, is_active: true, fiscal_year: 2027, name: 'FY2027 Forecast', created_at: '2026-07-01' }],
    forecast_pl_lines: [
      { id: 'l1', forecast_id: 'fc27', account_name: 'Canvas Sales', category: 'Revenue', account_code: '41000', forecast_months: monthly(300) },
      { id: 'l2', forecast_id: 'fc27', account_name: 'Marketing Digital', category: 'Operating Expenses', account_code: '65000', forecast_months: { '2026-09': 500 } },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  compositeMock.mockReset()
  qualityMock.mockReset()
  resolveBudgetMock.mockReset()
  compositeMock.mockResolvedValue({
    rows: [
      // September is Xero's month in progress: it must not become an actual.
      { account_code: '41000', account_name: 'Canvas Sales', account_type: 'revenue', monthly_values: { '2025-07': 50, '2026-07': 100, '2026-08': 200, '2026-09': 999 } },
      { account_code: '64000', account_name: 'Bank Fees', account_type: 'opex', monthly_values: { '2026-08': 10 } },
    ],
    data_quality: 'ok',
    per_tenant_quality: [],
  })
})

describe('loadFullYearReport', () => {
  it('takes actuals to the report month and the forecast after it', async () => {
    const res = await loadFullYearReport(fakeSupabase(tables()), { business_id: BUSINESS, fiscal_year: 2027, report_month: '2026-08' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const { report } = res
    expect(report.last_actual_month).toBe('2026-08')
    expect(report.forecast_available).toBe(true)
    expect(report.approved_budget_label).toBeNull()

    const revenue = report.sections.find((s) => s.category === 'Revenue')!
    const canvas = revenue.lines.find((l) => l.account_name === 'Canvas Sales')!
    expect(canvas.months[0]).toMatchObject({ month: '2026-07', actual: 100, source: 'actual', prior_year: 50 })
    expect(canvas.months[2]).toMatchObject({ month: '2026-09', actual: 0, budget: 300, source: 'forecast' })
    // 100 + 200 actual, then ten forecast months of 300.
    expect(canvas.projected_total).toBe(300 + 10 * 300)
    expect(canvas.annual_budget).toBe(12 * 300)
  })

  it('carries each account under its mapping group, and adds forecast-only lines', async () => {
    const res = await loadFullYearReport(fakeSupabase(tables()), { business_id: BUSINESS, fiscal_year: 2027, report_month: '2026-08' })
    if (!res.ok) throw new Error('expected ok')
    const opex = res.report.sections.find((s) => s.category === 'Operating Expenses')!
    expect(opex.lines.find((l) => l.account_name === 'Bank Fees')?.group).toBe('Bank and Other Fees')
    const marketing = opex.lines.find((l) => l.account_name === 'Marketing Digital')!
    expect(marketing.group).toBeNull()
    expect(marketing.annual_budget).toBe(500)
    expect(res.report.expense_group_order).toEqual(['Bank and Other Fees'])
    // Net profit is revenue less opex, on the same months.
    expect(res.report.net_profit.months[1].actual).toBe(200 - 10)
  })

  it('answers not-ok, rather than throwing, when the mappings cannot be read', async () => {
    const res = await loadFullYearReport(
      fakeSupabase(tables({ account_mappings: { error: { message: 'boom' } } })),
      { business_id: BUSINESS, fiscal_year: 2027, report_month: '2026-08' },
    )
    expect(res).toEqual({ ok: false, error: 'Failed to load account mappings', detail: 'boom' })
  })

  it('says there is no forecast when none is active for the year', async () => {
    qualityMock.mockResolvedValue({ data_quality: 'no_sync', per_tenant_quality: [] })
    const res = await loadFullYearReport(
      fakeSupabase(tables({ financial_forecasts: [], xero_pl_lines_wide_compat: [] })),
      { business_id: BUSINESS, fiscal_year: 2027, report_month: '2026-08' },
    )
    expect(res.ok && res.report.forecast_available).toBe(false)
    expect(compositeMock).not.toHaveBeenCalled()
  })

  it('says which months the approved budget reaches, so a partial version is not read as zeros', async () => {
    // A six-month Xero budget: the resolver answers because August is governed.
    const firstHalf = Object.fromEntries(FY27.slice(0, 6).map((m) => [m, 400]))
    resolveBudgetMock.mockResolvedValue({
      source: 'budget_version', versionId: 'v1', forecastId: null, label: 'FY27 H1', monthsCovered: 6, noBudgetReason: null,
      lines: [{ id: 'b1', account_code: '41000', account_name: 'Canvas Sales', category: 'Revenue', forecast_months: firstHalf }],
    })
    const settings = [{ business_id: BUSINESS, budget_forecast_id: null, budget_source: 'budget_version', expense_group_order: null }]
    const res = await loadFullYearReport(
      fakeSupabase(tables({ monthly_report_settings: settings })),
      { business_id: BUSINESS, fiscal_year: 2027, report_month: '2026-08' },
    )
    if (!res.ok) throw new Error('expected ok')
    expect(res.report.approved_months_covered).toEqual(FY27.slice(0, 6))
    // The loader still fills the rest with 0 — which is why the page must know.
    const canvas = res.report.sections[0].lines.find((l) => l.account_name === 'Canvas Sales')!
    expect(canvas.months[6].approved_budget).toBe(0)
  })

  it('counts a month blank for every account as covered when the budget reaches past it', async () => {
    // Xero omits a blank cell and a blank cell is $0, so a December no account
    // was budgeted for has no key on any line. The budget still runs to June —
    // December is inside its window, and the page must not fall back to the
    // forecast and call the budget short.
    const noDecember = Object.fromEntries(FY27.filter((m) => m !== '2026-12').map((m) => [m, 400]))
    resolveBudgetMock.mockResolvedValue({
      source: 'budget_version', versionId: 'v1', forecastId: null, label: 'FY27', monthsCovered: 11, noBudgetReason: null,
      lines: [{ id: 'b1', account_code: '41000', account_name: 'Canvas Sales', category: 'Revenue', forecast_months: noDecember }],
    })
    const settings = [{ business_id: BUSINESS, budget_forecast_id: null, budget_source: 'budget_version', expense_group_order: null }]
    const res = await loadFullYearReport(
      fakeSupabase(tables({ monthly_report_settings: settings })),
      { business_id: BUSINESS, fiscal_year: 2027, report_month: '2026-08' },
    )
    if (!res.ok) throw new Error('expected ok')
    expect(res.report.approved_months_covered).toEqual(FY27)
  })

  it('carries no coverage for a client on the forecast', async () => {
    const res = await loadFullYearReport(fakeSupabase(tables()), { business_id: BUSINESS, fiscal_year: 2027, report_month: '2026-08' })
    expect(res.ok && res.report.approved_months_covered).toBeNull()
  })
})
