/**
 * POST /api/forecast/seed-from-xero-budget — mirrors the seed-from-prior route
 * tests: auth ordering, the tenant-ownership check, the idempotency gate, the
 * scope-missing contract the UI keys on, and the atomic persist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: 'biz-1', profileId: 'profile-1', all: ['biz-1', 'profile-1'] })),
}))
const resolveConnectionsMock = vi.fn()
vi.mock('@/lib/business/resolveXeroBusinessId', () => ({ resolveXeroConnections: (...a: unknown[]) => resolveConnectionsMock(...a) }))
const tokenMock = vi.fn()
vi.mock('@/lib/xero/token-manager', () => ({ getValidAccessToken: (...a: unknown[]) => tokenMock(...a) }))
const getBudgetMock = vi.fn()
vi.mock('@/lib/xero/budgets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xero/budgets')>()
  return { ...actual, getXeroBudget: (...a: unknown[]) => getBudgetMock(...a) }
})
vi.mock('@/lib/services/xero-budget-seed-data', () => ({
  loadAccountsCatalog: vi.fn(async () => [
    { accountId: 'id-200', accountCode: '200', accountName: 'Sales', xeroType: 'REVENUE' },
    { accountId: 'id-400', accountCode: '400', accountName: 'Advertising', xeroType: 'OVERHEADS' },
  ]),
  loadAccountActuals: vi.fn(async () => []),
}))
const convertMock = vi.fn((..._args: unknown[]) => [
  { account_name: 'Sales', account_code: '200', category: 'Revenue', subcategory: null, sort_order: 0, actual_months: {}, forecast_months: { '2026-07': 1000 }, is_from_xero: false },
])
vi.mock('@/app/finances/forecast/services/assumptions-to-pl-lines', () => ({ convertAssumptionsToPLLines: (...a: unknown[]) => convertMock(...a) }))
const createClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createRouteHandlerClient: (...a: unknown[]) => createClientMock(...a) }))

import { POST } from '../route'
import { BudgetsScopeMissingError } from '@/lib/xero/budgets'
import { RateLimitDailyExceededError } from '@/lib/xero/xero-api-client'
import { completedMonthKeysFor } from '@/lib/services/xero-budget-seed-service'

const FY_KEYS = ['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06']
const flat = (v: number) => Object.fromEntries(FY_KEYS.map((k) => [k, v]))
const BUDGET = {
  budgetId: 'b-1', name: 'FY27 Budget', type: 'OVERALL', updatedAt: null, tracking: [],
  lines: [
    { accountId: 'id-200', accountCode: '200', months: flat(10_000) },
    { accountId: 'id-400', accountCode: '400', months: flat(500) },
  ],
}
const CONNECTION = { id: 'conn-1', tenant_id: 'tenant-1', tenant_name: 'Acme', display_name: null, functional_currency: 'AUD' }

let updateSpy: ReturnType<typeof vi.fn>
let rpcSpy: ReturnType<typeof vi.fn>

function thenable(result: unknown) {
  const b: Record<string, unknown> = {}
  const chain = () => b
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = vi.fn(chain)
  b.maybeSingle = vi.fn(() => Promise.resolve(result))
  ;(b as any).then = (res: (v: unknown) => void, rej: (e: unknown) => void) => Promise.resolve(result).then(res, rej)
  return b
}

function makeSupabase(over: {
  user?: unknown
  business?: unknown
  targetForecast?: unknown
  plLineCount?: number
  rpcError?: unknown
  updateError?: unknown
} = {}) {
  const {
    user = { id: 'user-1' },
    business = { id: 'biz-1', owner_id: 'user-1' },
    targetForecast = { id: 'target-1', assumptions: null, forecast_start_month: '2026-07', forecast_end_month: '2027-06', forecast_duration: 1 },
    plLineCount = 0, rpcError = null, updateError = null,
  } = over
  updateSpy = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: updateError })) }))
  rpcSpy = vi.fn(() => Promise.resolve({ data: null, error: rpcError }))
  const from = vi.fn((table: string) => {
    let b: Record<string, unknown>
    if (table === 'businesses') b = thenable({ data: business, error: null })
    else if (table === 'financial_forecasts') b = thenable({ data: targetForecast, error: null })
    else if (table === 'forecast_pl_lines') b = thenable({ data: null, error: null, count: plLineCount })
    else b = thenable({ data: null, error: null })
    b.update = updateSpy
    return b
  })
  return { auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) }, from, rpc: rpcSpy }
}

const request = (body: Record<string, unknown> = { businessId: 'biz-1', targetFiscalYear: 2027, tenantId: 'tenant-1', budgetId: 'b-1' }) =>
  new Request('http://localhost/api/forecast/seed-from-xero-budget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
  createClientMock.mockReset().mockResolvedValue(makeSupabase())
  resolveConnectionsMock.mockReset().mockResolvedValue({ connectionBusinessId: 'biz-1', connections: [CONNECTION] })
  tokenMock.mockReset().mockResolvedValue({ success: true, accessToken: 'tok' })
  getBudgetMock.mockReset().mockResolvedValue(BUDGET)
  convertMock.mockClear()
})

describe('auth and validation', () => {
  it('401 before anything else when there is no user', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ user: null }))
    expect((await POST(request())).status).toBe(401)
  })
  it('400 when a required field is missing', async () => {
    expect((await POST(request({ businessId: 'biz-1', targetFiscalYear: 2027, tenantId: 'tenant-1' }))).status).toBe(400)
  })
  it('403 when the business is not visible to the user', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ business: null }))
    expect((await POST(request())).status).toBe(403)
  })
  it('403 when the tenant is not one of this business\'s connections (no cross-business seeding)', async () => {
    resolveConnectionsMock.mockResolvedValue({ connectionBusinessId: 'biz-1', connections: [{ ...CONNECTION, tenant_id: 'someone-else' }] })
    const res = await POST(request())
    expect(res.status).toBe(403)
    expect(getBudgetMock).not.toHaveBeenCalled()
  })
})

describe('gates', () => {
  it('404 when the target FY forecast row does not exist', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ targetForecast: null }))
    expect((await POST(request())).status).toBe(404)
  })
  it('409 when the forecast already has wizard data (seed refused, Xero never called)', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ plLineCount: 3 }))
    const res = await POST(request())
    expect(res.status).toBe(409)
    expect(getBudgetMock).not.toHaveBeenCalled()
  })
})

describe('Xero outcomes', () => {
  it('422 with code xero_budget_scope_missing when the org has not granted the scope', async () => {
    getBudgetMock.mockRejectedValue(new BudgetsScopeMissingError('tenant-1'))
    const res = await POST(request())
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('xero_budget_scope_missing')
    expect(rpcSpy).not.toHaveBeenCalled()
  })
  it('404 when the budget is not found in Xero', async () => {
    getBudgetMock.mockResolvedValue(null)
    expect((await POST(request())).status).toBe(404)
  })
  it('503 on the Xero daily rate limit, 502 when the token cannot be obtained', async () => {
    getBudgetMock.mockRejectedValueOnce(new RateLimitDailyExceededError('tenant-1'))
    expect((await POST(request())).status).toBe(503)
    tokenMock.mockResolvedValueOnce({ success: false, shouldDeactivate: true })
    const res = await POST(request())
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('requires_reconnect')
  })
  it('asks Xero for exactly the forecast window (duration years from the FY start)', async () => {
    createClientMock.mockResolvedValue(makeSupabase({
      targetForecast: { id: 'target-1', assumptions: null, forecast_start_month: '2026-07', forecast_end_month: '2029-06', forecast_duration: 3 },
    }))
    await POST(request())
    expect(getBudgetMock.mock.calls[0][2]).toEqual({ from: '2026-07', to: '2029-06' })
  })
})

describe('success', () => {
  it('transforms, persists duration once, materialises, saves atomically, returns the report', async () => {
    const res = await POST(request())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ success: true, forecastId: 'target-1' })
    expect(body.report.counts).toMatchObject({ revenue: 1, opex: 1 })
    // Months of FY2027 already lived at test time are locked to actuals (none mocked → 0),
    // so budgeted revenue counts only the months still ahead. Deterministic for any run date.
    const monthsAhead = 12 - completedMonthKeysFor(2027, new Date()).length
    expect(body.report.goals.revenue).toBe(10_000 * monthsAhead)

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ forecast_duration: 1 })

    expect(convertMock).toHaveBeenCalledTimes(1)
    const convertArg = (convertMock.mock.calls[0] as unknown[])[0] as { assumptions: any; existingLines: unknown[]; fiscalYear: number }
    expect(convertArg.existingLines).toEqual([])
    expect(convertArg.fiscalYear).toBe(2027)
    expect(convertArg.assumptions.seedSource).toMatchObject({ kind: 'xero_budget', tenantId: 'tenant-1', budgetId: 'b-1', orgName: 'Acme' })
    expect(convertArg.assumptions.opex.lines[0]).toMatchObject({ costBehavior: 'budgeted', accountCode: '400' })

    expect(rpcSpy).toHaveBeenCalledTimes(1)
    const rpcArgs = (rpcSpy.mock.calls[0] as unknown[])
    expect(rpcArgs[0]).toBe('save_assumptions_and_materialize')
    expect((rpcArgs[1] as any).p_forecast_id).toBe('target-1')
    expect((rpcArgs[1] as any).p_pl_lines[0]).toMatchObject({ account_name: 'Sales', account_code: '200', forecast_months: { '2026-07': 1000 } })
  })
  it('500 when the atomic save fails (nothing reported as success)', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ rpcError: { message: 'rpc down', code: 'P0001' } }))
    const res = await POST(request())
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('P0001')
  })
  it('500 when the duration write fails, before any materialisation', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ updateError: { message: 'locked' } }))
    expect((await POST(request())).status).toBe(500)
    expect(rpcSpy).not.toHaveBeenCalled()
  })
})
