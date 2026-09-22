/**
 * F1 — cross-tenant forecast access on the two cashflow routes.
 *
 * Both verified the POSTED `business_id` and then used a `forecast_id` that
 * nothing tied to it, on the module-level service-role client that bypasses
 * RLS:
 *
 *   - `sync-balances` POST read `financial_forecasts` by id and UPDATEd
 *     `assumptions`, so any authenticated user with access to ANY business
 *     could overwrite ANY forecast's cashflow assumptions — and the update's
 *     error was discarded, so a failed save still answered 200.
 *   - `xero-actuals` GET passed the id straight to `getMonthlyComposite`,
 *     which loads that forecast's OWN business P&L.
 *
 * These tests drive the EXPORTED handlers — `withSchema` / `withQuerySchema`
 * wrappers included — against a Supabase double whose reads honour their filter
 * VALUES. A filter-blind fake makes every id look right, which is precisely the
 * defect: it lives in the value, not the shape, of the query.
 *
 * The legitimate callers post `businesses.id` (both pages resolve it through
 * `resolveBusinessId`) plus their own forecast id, so that is what the
 * happy-path cases send. `financial_forecasts.business_id` is
 * business_profiles-space, so the guard has to check BOTH id-spaces — the
 * profile-id case below pins that.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFilterAwareSupabase, type FilterAwareSupabase } from '../helpers/filter-aware-supabase'

// ─── The service-role client both routes build at module scope ───────────────

let db: FilterAwareSupabase

/**
 * The double fails whole tables, but the write-error branch needs ONLY the
 * UPDATE to fail — the ownership check and the read before it must still
 * succeed. This intercepts `financial_forecasts.update(...)` alone.
 */
let interceptForecastUpdate: null | (() => { data: null; error: { message: string; code?: string } }) = null

function serviceClient() {
  return {
    from: (table: string) => {
      const q = db.from(table)
      if (table !== 'financial_forecasts' || !interceptForecastUpdate) return q
      return new Proxy(q, {
        get: (target, prop) => {
          if (prop !== 'update') return (target as any)[prop]
          return () => {
            const chain: any = {
              eq: () => chain,
              in: () => chain,
              then: (resolve: any, reject: any) =>
                Promise.resolve(interceptForecastUpdate!()).then(resolve, reject),
            }
            return chain
          }
        },
      })
    },
    rpc: (...args: any[]) => (db as any).rpc(...args),
  }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => serviceClient() }))

// ─── Auth: signed in, and allowed into the business they posted ──────────────

const mockGetUser = vi.fn(async () => ({ data: { user: { id: 'user-ours' } }, error: null }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

// The point of the IDOR: access to their OWN business is genuine. Only the
// forecast belongs to someone else.
const mockVerifyBusinessAccess = vi.fn(async () => true)
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...args: any[]) => (mockVerifyBusinessAccess as any)(...args),
}))

vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allow: true, reason: 'ok' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  enforceSectionPermission: vi.fn(() => null),
}))

const captureMessage = vi.fn()
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: any[]) => captureMessage(...a),
  captureException: (...a: any[]) => captureException(...a),
}))

// ─── sync-balances' Xero dependencies ────────────────────────────────────────

vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn(async () => ({ success: true, accessToken: 'access-token' })),
}))

// ─── xero-actuals' read service ──────────────────────────────────────────────

const getMonthlyComposite = vi.fn(async (_forecastId: string) => ({
  rows: [
    {
      account_name: 'Sales',
      account_code: '200',
      account_type: 'revenue',
      monthly_values: { '2026-07': 1000 },
    },
  ],
  data_quality: { verdict: 'ok' },
  per_tenant_quality: [],
}))
const getDataQualityForBusiness = vi.fn(async (_ids: string[]) => ({
  data_quality: { verdict: 'ok' },
  per_tenant_quality: [],
}))
vi.mock('@/lib/services/forecast-read-service', () => ({
  createForecastReadService: () => ({ getMonthlyComposite, getDataQualityForBusiness }),
}))

// ─── Fixtures ────────────────────────────────────────────────────────────────

const OURS_BUSINESS = 'biz-ours'
const OURS_PROFILE = 'profile-ours'
const THEIRS_PROFILE = 'profile-theirs'
const OUR_FORECAST = 'fc-ours'
const THEIR_FORECAST = 'fc-theirs'

/** What their forecast held before the request — nothing may change it. */
const THEIR_ASSUMPTIONS = { cashflow: { opening_bank_balance: 999999, dso_days: 77 } }

function seed() {
  return createFilterAwareSupabase({
    business_profiles: [
      { id: OURS_PROFILE, business_id: OURS_BUSINESS },
      { id: THEIRS_PROFILE, business_id: 'biz-theirs' },
    ],
    financial_forecasts: [
      {
        id: OUR_FORECAST,
        business_id: OURS_PROFILE,
        is_active: true,
        created_at: '2026-07-01',
        assumptions: {
          growth: 'keep me',
          cashflow: { opening_bank_balance: 0, loans: [{ name: 'Existing loan', balance: 50 }] },
        },
      },
      {
        id: THEIR_FORECAST,
        business_id: THEIRS_PROFILE,
        is_active: true,
        created_at: '2026-07-01',
        assumptions: THEIR_ASSUMPTIONS,
      },
    ],
    xero_connections: [
      { business_id: OURS_BUSINESS, is_active: true, tenant_id: 'tenant-ours', id: 'conn-1' },
    ],
    xero_pl_lines_wide_compat: [],
  })
}

/** A Xero balance sheet with one bank account; the aged reports are skipped. */
const BANK_BALANCE = 12345.67
function xeroFetch() {
  return vi.fn(async (url: string) => {
    if (String(url).includes('Reports/BalanceSheet')) {
      return {
        ok: true,
        json: async () => ({
          Reports: [
            {
              Rows: [
                {
                  RowType: 'Section',
                  Title: 'Bank',
                  Rows: [
                    { RowType: 'Row', Cells: [{ Value: 'Business Account' }, { Value: String(BANK_BALANCE) }] },
                  ],
                },
              ],
            },
          ],
        }),
      }
    }
    // Aged receivables / payables — non-ok keeps the DSO/DPO defaults.
    return { ok: false, json: async () => ({}), text: async () => '' }
  })
}

let fetchSpy: ReturnType<typeof xeroFetch>

function postSyncBalances(body: Record<string, unknown>) {
  return new NextRequest('http://test.local/api/forecast/cashflow/sync-balances', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function getXeroActuals(qs: string) {
  return new NextRequest(`http://test.local/api/forecast/cashflow/xero-actuals${qs}`)
}

/** The forecast row as it now stands in the double. */
const forecastRow = (id: string) => db.tables.financial_forecasts.find((f) => f.id === id) as any

beforeEach(() => {
  vi.clearAllMocks()
  db = seed()
  interceptForecastUpdate = null
  fetchSpy = xeroFetch()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─────────────────────────────────────────────────────────────────────────────

describe('F1 — sync-balances POST ties forecast_id to the verified business', () => {
  it("refuses another tenant's forecast — nothing written, no Xero call", async () => {
    const { POST } = await import('@/app/api/forecast/cashflow/sync-balances/route')
    const res = await POST(
      postSyncBalances({
        business_id: OURS_BUSINESS,
        forecast_id: THEIR_FORECAST,
        balance_date: '2026-06-30',
        save: true,
      }),
    )

    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('FORECAST_NOT_OWNED')

    // Nothing written anywhere — and their assumptions are byte-for-byte intact.
    expect(db.writes).toEqual([])
    expect(forecastRow(THEIR_FORECAST).assumptions).toEqual(THEIR_ASSUMPTIONS)

    // Refused before the three Xero calls, so the request cost nothing.
    expect(fetchSpy).not.toHaveBeenCalled()

    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('refused a forecast_id from another business'),
      expect.objectContaining({
        tags: expect.objectContaining({ invariant: 'forecast-id-not-owned' }),
      }),
    )
  })

  it('refuses a forecast that does not exist — identically, and writes nothing', async () => {
    const { POST } = await import('@/app/api/forecast/cashflow/sync-balances/route')
    const res = await POST(
      postSyncBalances({
        business_id: OURS_BUSINESS,
        forecast_id: 'fc-does-not-exist',
        balance_date: '2026-06-30',
        save: true,
      }),
    )

    // Same refusal as a foreign forecast on purpose: a different answer here
    // would tell any caller which forecast ids exist.
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('FORECAST_NOT_OWNED')
    expect(db.writes).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('saves the caller’s OWN forecast — posted the way the page posts it', async () => {
    const { POST } = await import('@/app/api/forecast/cashflow/sync-balances/route')
    const res = await POST(
      postSyncBalances({
        business_id: OURS_BUSINESS, // businesses.id, as resolveBusinessId returns
        forecast_id: OUR_FORECAST,
        balance_date: '2026-06-30',
        save: true,
      }),
    )

    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.opening_bank_balance).toBe(BANK_BALANCE)

    const saved = forecastRow(OUR_FORECAST).assumptions
    expect(saved.cashflow.opening_bank_balance).toBe(BANK_BALANCE)
    // The merge still preserves what the sync does not own.
    expect(saved.growth).toBe('keep me')
    expect(saved.cashflow.loans).toEqual([{ name: 'Existing loan', balance: 50 }])

    // And their forecast was never touched.
    expect(forecastRow(THEIR_FORECAST).assumptions).toEqual(THEIR_ASSUMPTIONS)
  })

  it('accepts the business_profiles.id too — the guard checks BOTH id-spaces', async () => {
    // financial_forecasts.business_id is profiles-space. A guard that compared
    // against businesses.id alone would reject every legitimate caller.
    const { POST } = await import('@/app/api/forecast/cashflow/sync-balances/route')
    const res = await POST(
      postSyncBalances({
        business_id: OURS_PROFILE,
        forecast_id: OUR_FORECAST,
        balance_date: '2026-06-30',
        save: true,
      }),
    )

    expect(res.status).toBe(200)
    expect(forecastRow(OUR_FORECAST).assumptions.cashflow.opening_bank_balance).toBe(BANK_BALANCE)
  })

  it('reports a failed save instead of answering 200 for a write that never landed', async () => {
    interceptForecastUpdate = () => ({ data: null, error: { message: 'permission denied', code: '42501' } })

    const { POST } = await import('@/app/api/forecast/cashflow/sync-balances/route')
    const res = await POST(
      postSyncBalances({
        business_id: OURS_BUSINESS,
        forecast_id: OUR_FORECAST,
        balance_date: '2026-06-30',
        save: true,
      }),
    )

    // A 200 here would let the hook merge these balances into the on-screen
    // assumptions and show a saved state the forecast never took.
    expect(res.status).toBe(500)
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'permission denied' }),
      expect.objectContaining({
        tags: expect.objectContaining({ invariant: 'sync_balances_assumptions_write_failed' }),
      }),
    )
  })

  it('still syncs without a forecast_id — the read-only call is unaffected', async () => {
    const { POST } = await import('@/app/api/forecast/cashflow/sync-balances/route')
    const res = await POST(postSyncBalances({ business_id: OURS_BUSINESS, balance_date: '2026-06-30' }))

    expect(res.status).toBe(200)
    expect((await res.json()).data.opening_bank_balance).toBe(BANK_BALANCE)
    expect(db.writes).toEqual([])
  })
})

describe('F1 — xero-actuals GET ties forecast_id to the verified business', () => {
  it("refuses another tenant's forecast — no composite read", async () => {
    const { GET } = await import('@/app/api/forecast/cashflow/xero-actuals/route')
    const res = await GET(getXeroActuals(`?business_id=${OURS_BUSINESS}&forecast_id=${THEIR_FORECAST}`))

    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('FORECAST_NOT_OWNED')
    expect(getMonthlyComposite).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])

    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('refused a forecast_id from another business'),
      expect.objectContaining({
        tags: expect.objectContaining({ invariant: 'forecast-id-not-owned' }),
      }),
    )
  })

  it('refuses a forecast that does not exist — no composite read', async () => {
    const { GET } = await import('@/app/api/forecast/cashflow/xero-actuals/route')
    const res = await GET(getXeroActuals(`?business_id=${OURS_BUSINESS}&forecast_id=fc-does-not-exist`))

    expect(res.status).toBe(403)
    expect(getMonthlyComposite).not.toHaveBeenCalled()
  })

  it('reads the caller’s OWN forecast — the cashflow page’s exact call', async () => {
    const { GET } = await import('@/app/api/forecast/cashflow/xero-actuals/route')
    const res = await GET(getXeroActuals(`?business_id=${OURS_BUSINESS}&forecast_id=${OUR_FORECAST}`))

    expect(res.status).toBe(200)
    expect(getMonthlyComposite).toHaveBeenCalledWith(OUR_FORECAST)
    const body = await res.json()
    expect(body.data[0].account_name).toBe('Sales')
    expect(body.data_quality).toEqual({ verdict: 'ok' })
  })

  it('still resolves the active forecast when none is named — the hook’s call', async () => {
    // useCashflowForecast requests xero-actuals with business_id only.
    const { GET } = await import('@/app/api/forecast/cashflow/xero-actuals/route')
    const res = await GET(getXeroActuals(`?business_id=${OURS_BUSINESS}`))

    expect(res.status).toBe(200)
    // The auto-lookup is business-scoped, so it can only ever find our own —
    // never the other tenant's equally-active forecast.
    expect(getMonthlyComposite).toHaveBeenCalledWith(OUR_FORECAST)
  })

  it('accepts the business_profiles.id too — the guard checks BOTH id-spaces', async () => {
    const { GET } = await import('@/app/api/forecast/cashflow/xero-actuals/route')
    const res = await GET(getXeroActuals(`?business_id=${OURS_PROFILE}&forecast_id=${OUR_FORECAST}`))

    expect(res.status).toBe(200)
    expect(getMonthlyComposite).toHaveBeenCalledWith(OUR_FORECAST)
  })
})
