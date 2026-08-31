/**
 * WE.1 — external-metrics route contract.
 *
 * Proves: (1) the R29 hard-gate blocks cross-tenant callers before any
 * service-role query on both verbs; (2) the handler self-enforces its
 * contract (withSchema is observe-mode): bad month → 400, unknown action →
 * 400, dangling reconcile_measure_key → 400; (3) upsert_values validates
 * against the stored series and returns NAMED rejects; (4) an all-invalid
 * batch is a 400, not a silent success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockVerifyBusinessAccess = vi.fn()
const mockAdminFrom = vi.fn()

vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allowed: true, reason: 'test-bypass' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  enforceSectionPermission: vi.fn(() => null),
}))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: () => 'test-secret-key',
}))
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...args: any[]) => mockVerifyBusinessAccess(...args),
}))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async (_c: any, id: string) => ({ all: [id] })),
}))
vi.mock('@supabase/supabase-js', () => ({
  // Lazy indirection: the route builds its client at module scope, before this
  // test file's consts initialize — resolve mockAdminFrom at call time instead.
  createClient: vi.fn(() => ({ from: (...args: any[]) => mockAdminFrom(...args) })),
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

import { GET, POST } from '@/app/api/monthly-report/external-metrics/route'

const authedUser = { data: { user: { id: 'user-1' } }, error: null }
const BIZ = 'biz-1'

function getReq(qs: string) {
  return new NextRequest(`http://test.local/api/monthly-report/external-metrics?${qs}`)
}
function postReq(body: any) {
  return new NextRequest('http://test.local/api/monthly-report/external-metrics', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Minimal thenable query-builder: every chain method returns itself; awaiting resolves `result`. */
function chain(result: { data: any; error: any }) {
  const q: any = {}
  for (const m of ['select', 'eq', 'in', 'order', 'upsert', 'maybeSingle', 'single']) {
    q[m] = vi.fn(() => q)
  }
  q.then = (resolve: any) => resolve(result)
  return q
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
  mockGetUser.mockReset()
  mockVerifyBusinessAccess.mockReset()
  mockAdminFrom.mockReset()
  mockGetUser.mockResolvedValue(authedUser)
  mockVerifyBusinessAccess.mockResolvedValue(true)
  mockAdminFrom.mockImplementation(() => {
    throw new Error('service-role query should not run in this scenario')
  })
})

describe('WE.1 — IDOR hard-gate', () => {
  it('GET: denied access → 403, zero service-role queries', async () => {
    mockVerifyBusinessAccess.mockResolvedValue(false)
    const res = await GET(getReq(`business_id=${BIZ}&period_month=2026-07`))
    expect(res.status).toBe(403)
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('POST: denied access → 403, zero service-role queries', async () => {
    mockVerifyBusinessAccess.mockResolvedValue(false)
    const res = await POST(postReq({ business_id: BIZ, action: 'upsert_values', series_key: 'k', period_month: '2026-07', values: [] }))
    expect(res.status).toBe(403)
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('unauthenticated → 401 before any query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(getReq(`business_id=${BIZ}&period_month=2026-07`))
    expect(res.status).toBe(401)
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })
})

describe('WE.1 — self-enforced contract (withSchema is observe-mode)', () => {
  it('GET without a valid YYYY-MM month → 400 before auth or queries', async () => {
    const res = await GET(getReq(`business_id=${BIZ}&period_month=July`))
    expect(res.status).toBe(400)
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('POST with an unknown action → 400', async () => {
    const res = await POST(postReq({ business_id: BIZ, action: 'delete_everything', series_key: 'k' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('define_series')
  })

  it('define_series with a dangling reconcile_measure_key → 400 (would silently disable EXT-TIES)', async () => {
    const res = await POST(postReq({
      business_id: BIZ,
      action: 'define_series',
      series_key: 'ndis_revenue',
      display_name: 'NDIS Revenue',
      dimension_label: 'Service line',
      measures: [{ key: 'revenue', label: 'Revenue' }],
      reconcile_measure_key: 'revenu',
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("'revenu'")
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('define_series with duplicate measure keys → 400', async () => {
    const res = await POST(postReq({
      business_id: BIZ,
      action: 'define_series',
      series_key: 'k',
      display_name: 'X',
      dimension_label: 'Y',
      measures: [{ key: 'a', label: 'A' }, { key: 'a', label: 'A again' }],
    }))
    expect(res.status).toBe(400)
  })
})

describe('WE.1 — upsert_values against the stored series', () => {
  it('unknown series → 404 with a define_series hint', async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'external_metric_series') return chain({ data: null, error: null })
      throw new Error(`unexpected table ${table}`)
    })
    const res = await POST(postReq({
      business_id: BIZ, action: 'upsert_values', series_key: 'nope',
      period_month: '2026-07', values: [{ dimension_value: 'A', measure_key: 'revenue', value: 1 }],
    }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('define_series')
  })

  it('valid batch upserts and returns counts + named rejects for the bad rows', async () => {
    const upsertChain = chain({ data: [{ id: 'v1' }, { id: 'v2' }], error: null })
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'external_metric_series') {
        return chain({ data: { id: 'series-1', measures: [{ key: 'revenue', label: 'Revenue' }] }, error: null })
      }
      if (table === 'external_metric_values') return upsertChain
      throw new Error(`unexpected table ${table}`)
    })
    const res = await POST(postReq({
      business_id: BIZ, action: 'upsert_values', series_key: 'ndis_revenue',
      period_month: '2026-07', source_ref: 'skill:monthly-report',
      values: [
        { dimension_value: 'NDIS Core', measure_key: 'revenue', value: 42150.5 },
        { dimension_value: 'Plan Mgmt', measure_key: 'revenue', scenario: 'budget', value: 8000 },
        { dimension_value: 'Typo Row', measure_key: 'revenu', value: 5 },
      ],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.upserted).toBe(2)
    expect(body.rejected).toHaveLength(1)
    expect(body.rejected[0].reason).toContain("'revenu'")
    // Natural-key idempotency: the write is an upsert on the full unique key.
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          series_id: 'series-1', period_month: '2026-07',
          dimension_value: 'NDIS Core', measure_key: 'revenue',
          scenario: 'actual', value: 42150.5, source_ref: 'skill:monthly-report',
        }),
      ]),
      expect.objectContaining({ onConflict: 'series_id,period_month,dimension_value,measure_key,scenario' }),
    )
  })

  it('an all-invalid batch is a 400 with reasons, NOT a silent success', async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'external_metric_series') {
        return chain({ data: { id: 'series-1', measures: [{ key: 'revenue', label: 'Revenue' }] }, error: null })
      }
      throw new Error(`no value write should happen`)
    })
    const res = await POST(postReq({
      business_id: BIZ, action: 'upsert_values', series_key: 'ndis_revenue',
      period_month: '2026-07',
      values: [{ dimension_value: 'A', measure_key: 'wrong', value: 1 }],
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.rejected).toHaveLength(1)
  })
})

describe('WE.1 — GET returns series + values + EXT-TIES', () => {
  it('computes the tie from stored actuals vs the wide-compat account month', async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'external_metric_series') {
        return chain({
          data: [{
            id: 'series-1', business_id: BIZ, series_key: 'ndis_revenue',
            display_name: 'NDIS Revenue', dimension_label: 'Service line',
            measures: [{ key: 'revenue', label: 'Revenue' }],
            reconciles_to_account_name: 'NDIS Revenue', reconcile_measure_key: 'revenue',
            reconcile_tolerance: 1, is_active: true,
          }],
          error: null,
        })
      }
      if (table === 'external_metric_values') {
        return chain({
          data: [
            { series_id: 'series-1', dimension_value: 'NDIS Core', measure_key: 'revenue', scenario: 'actual', value: 30000 },
            { series_id: 'series-1', dimension_value: 'Plan Mgmt', measure_key: 'revenue', scenario: 'actual', value: 12150.5 },
            { series_id: 'series-1', dimension_value: 'NDIS Core', measure_key: 'revenue', scenario: 'budget', value: 99999 },
          ],
          error: null,
        })
      }
      if (table === 'xero_pl_lines_wide_compat') {
        return chain({ data: [{ account_name: 'NDIS Revenue', monthly_values: { '2026-07': 42151.0, '2026-06': 39000 } }], error: null })
      }
      throw new Error(`unexpected table ${table}`)
    })

    const res = await GET(getReq(`business_id=${BIZ}&period_month=2026-07`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.series).toHaveLength(1)
    const tie = body.series[0].tie
    expect(tie.comparable).toBe(true)
    expect(tie.within_tolerance).toBe(true) // |42151 − 42150.5| = 0.5 ≤ $1
    expect(tie.series_total).toBeCloseTo(42150.5)
    expect(tie.account_actual).toBeCloseTo(42151.0)
  })

  it('a series with no reconciliation target gets tie:null — not a fake tie', async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'external_metric_series') {
        return chain({
          data: [{
            id: 'series-2', business_id: BIZ, series_key: 'hubstaff_hours',
            display_name: 'Hubstaff Hours', dimension_label: 'Team member',
            measures: [{ key: 'hours', label: 'Hours' }],
            reconciles_to_account_name: null, reconcile_measure_key: null,
            is_active: true,
          }],
          error: null,
        })
      }
      if (table === 'external_metric_values') return chain({ data: [], error: null })
      throw new Error(`unexpected table ${table}`)
    })
    const res = await GET(getReq(`business_id=${BIZ}&period_month=2026-07`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.series[0].tie).toBeNull()
  })
})
