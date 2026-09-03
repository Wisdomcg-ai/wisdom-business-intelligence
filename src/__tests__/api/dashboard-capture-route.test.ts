/**
 * Dashboard-capture route contract: R29 hard-gate on both verbs, self-enforced
 * validation (withSchema is observe-mode), and the tenant-ownership check —
 * a badge for an org that isn't an active connection of the business is refused.
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
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret-key' }))
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...args: any[]) => mockVerifyBusinessAccess(...args),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (...args: any[]) => mockAdminFrom(...args) })),
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { GET, POST } from '@/app/api/cfo/reconciliation/dashboard-capture/route'

const BIZ = 'biz-1'
const postReq = (body: any) =>
  new NextRequest('http://test.local/api/cfo/reconciliation/dashboard-capture', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
const getReq = (qs: string) => new NextRequest(`http://test.local/api/cfo/reconciliation/dashboard-capture?${qs}`)

function chain(result: { data: any; error: any }) {
  const q: any = { calls: {} }
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'insert']) {
    q[m] = vi.fn((...a: any[]) => { q.calls[m] = a; return q })
  }
  q.then = (resolve: any) => resolve(result)
  return q
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
  mockGetUser.mockReset(); mockVerifyBusinessAccess.mockReset(); mockAdminFrom.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  mockVerifyBusinessAccess.mockResolvedValue(true)
  mockAdminFrom.mockImplementation(() => { throw new Error('no query expected') })
})

describe('hard-gate', () => {
  it('POST: denied access → 403 before any query', async () => {
    mockVerifyBusinessAccess.mockResolvedValue(false)
    const res = await POST(postReq({ business_id: BIZ, captures: [{ tenant_id: 't1', total_count: 1 }] }))
    expect(res.status).toBe(403)
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })
  it('GET: unauthenticated → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await GET(getReq(`business_id=${BIZ}`))).status).toBe(401)
  })
})

describe('self-enforced contract', () => {
  it('empty captures → 400 before auth', async () => {
    const res = await POST(postReq({ business_id: BIZ, captures: [] }))
    expect(res.status).toBe(400)
    expect(mockGetUser).not.toHaveBeenCalled()
  })
  it('a non-footing capture is refused by name', async () => {
    const res = await POST(postReq({ business_id: BIZ, captures: [{ tenant_id: 't1', total_count: 5, accounts: [{ name: 'A', count: 1 }] }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('accounts sum to 1')
  })
})

describe('tenant ownership + write', () => {
  it("a tenant that isn't an active connection of the business is refused", async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'xero_connections') return chain({ data: [{ tenant_id: 't1' }], error: null })
      throw new Error(`unexpected ${table}`)
    })
    const res = await POST(postReq({ business_id: BIZ, captures: [{ tenant_id: 'someone-elses', total_count: 3 }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('someone-elses')
  })

  it('valid captures are inserted append-only with the operator and method', async () => {
    const insertChain = chain({ data: [{ id: 'c1', tenant_id: 't1', total_count: 25, captured_at: 'now' }], error: null })
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'xero_connections') return chain({ data: [{ tenant_id: 't1' }], error: null })
      if (table === 'reconciliation_dashboard_captures') return insertChain
      throw new Error(`unexpected ${table}`)
    })
    const res = await POST(postReq({
      business_id: BIZ,
      captures: [{ tenant_id: 't1', total_count: 25, method: 'chrome_routine', accounts: [{ name: 'Airwallex', count: 25 }] }],
    }))
    expect(res.status).toBe(200)
    expect(insertChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({ tenant_id: 't1', business_id: BIZ, total_count: 25, method: 'chrome_routine', captured_by: 'user-1' }),
    ])
  })

  it('GET returns the latest-per-tenant rollup', async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'xero_connections') return chain({ data: [{ tenant_id: 't1' }, { tenant_id: 't2' }], error: null })
      if (table === 'reconciliation_dashboard_captures') return chain({
        data: [
          { tenant_id: 't1', business_id: BIZ, captured_at: '2026-09-02T02:00:00Z', total_count: 25, accounts: [], method: 'chrome_routine' },
          { tenant_id: 't1', business_id: BIZ, captured_at: '2026-09-01T02:00:00Z', total_count: 30, accounts: [], method: 'chrome_routine' },
        ],
        error: null,
      })
      throw new Error(`unexpected ${table}`)
    })
    const res = await GET(getReq(`business_id=${BIZ}`))
    const body = await res.json()
    expect(body.summary.total_count).toBe(25)
    expect(body.summary.captured_tenants).toBe(1)
    expect(body.summary.tenant_count).toBe(2)
  })
})
