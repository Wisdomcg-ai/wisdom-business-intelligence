/**
 * WISDOM-BI-1S — an org with no payroll must not raise a Sentry error every
 * 6-hourly run, and must not stop the other tenants of the same business from
 * syncing.
 *
 * Background: #418 intended `calRes.status === 403 || 401` → "payroll not
 * accessible, move on", but fetchXeroWithRateLimit throws on every non-429
 * 4xx, so that branch never ran and the per-tenant catch captured the throw
 * to Sentry on every run (IICT (Aust) 401, IICT Group Limited 403 → 8
 * events/day). This pins the intended behaviour end to end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

const fetchMock = vi.fn()
vi.mock('@/lib/xero/xero-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xero/xero-api-client')>()
  return { ...actual, fetchXeroWithRateLimit: (...args: unknown[]) => fetchMock(...args) }
})

vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue({ success: true, accessToken: 'tok' }),
}))

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn().mockResolvedValue({
    businessId: 'biz-1',
    profileId: 'prof-1',
    all: ['prof-1', 'biz-1'],
  }),
}))

import * as Sentry from '@sentry/nextjs'
import { XeroHttpError } from '@/lib/xero/xero-api-client'
import { syncPayrollForBusiness } from '@/lib/xero/payroll-sync'

type Resp = { data: unknown; error: unknown }

/** Every chainable resolves to `result`; `upsert`/`update` resolve to no-error. */
function chainable(result: Resp): Record<string, any> {
  const b: Record<string, any> = {}
  const ret = () => b
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) b[m] = vi.fn(ret)
  b.upsert = vi.fn(() => Promise.resolve({ error: null }))
  b.update = vi.fn(ret)
  b.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject)
  return b
}

function makeSupabase(connections: Array<{ tenant_id: string }>) {
  const from = vi.fn((table: string) => {
    if (table === 'xero_connections') {
      return chainable({
        data: connections.map((c, i) => ({
          id: `conn-${i}`,
          tenant_id: c.tenant_id,
          tenant_name: c.tenant_id,
          business_id: 'biz-1',
        })),
        error: null,
      })
    }
    return chainable({ data: [], error: null })
  })
  return { from } as any
}

const ok = (json: unknown) => ({ ok: true, status: 200, json, headers: {} })

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(async (url: string, opts: { tenantId: string }) => {
    if (opts.tenantId === 'tenant-no-payroll') {
      throw new XeroHttpError(
        401,
        opts.tenantId,
        '<Response><Message>Payroll API access not authorised</Message></Response>',
      )
    }
    if (url.includes('/PayrollCalendars')) return ok({ PayrollCalendars: [] })
    if (url.includes('/Employees')) return ok({ Employees: [] })
    if (url.includes('/PayRuns')) return ok({ PayRuns: [] })
    throw new Error(`unexpected url ${url}`)
  })
})

describe('syncPayrollForBusiness — org without payroll', () => {
  it('records "payroll not accessible", raises NO Sentry event, and still syncs the next tenant', async () => {
    const supabase = makeSupabase([{ tenant_id: 'tenant-no-payroll' }, { tenant_id: 'tenant-with-payroll' }])

    const result = await syncPayrollForBusiness(supabase, 'biz-1')

    expect(result.errors).toEqual(['tenant-no-payroll: payroll not accessible (401)'])
    expect(result.tenants_synced).toBe(1)
    expect(Sentry.captureException).not.toHaveBeenCalled()

    // The second tenant's payroll was actually fetched, not skipped.
    const tenantsCalled = fetchMock.mock.calls.map((c) => (c[1] as { tenantId: string }).tenantId)
    expect(tenantsCalled).toContain('tenant-with-payroll')
    // Exactly one call for the refused tenant — no retries, no further endpoints.
    expect(tenantsCalled.filter((t) => t === 'tenant-no-payroll')).toHaveLength(1)
  })

  it('403 "Payroll has not been purchased" is classified the same way', async () => {
    fetchMock.mockImplementationOnce(async (_url: string, opts: { tenantId: string }) => {
      throw new XeroHttpError(403, opts.tenantId, 'Payroll has not been purchased')
    })
    const supabase = makeSupabase([{ tenant_id: 'tenant-hk' }])

    const result = await syncPayrollForBusiness(supabase, 'biz-1')

    expect(result.errors).toEqual(['tenant-hk: payroll not accessible (403)'])
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('any other 4xx on the first payroll call is still a real error and IS captured', async () => {
    fetchMock.mockImplementationOnce(async (_url: string, opts: { tenantId: string }) => {
      throw new XeroHttpError(400, opts.tenantId, 'bad request')
    })
    const supabase = makeSupabase([{ tenant_id: 'tenant-x' }])

    const result = await syncPayrollForBusiness(supabase, 'biz-1')

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/^tenant-x: xero 400 for tenant tenant-x/)
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })
})
