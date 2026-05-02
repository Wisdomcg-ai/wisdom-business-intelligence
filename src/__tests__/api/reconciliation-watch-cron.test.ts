/**
 * Phase 44.2 Plan 44.2-10 (re-scoped) — reconciliation-watch cron tests.
 *
 * Verifies:
 *   - 401 without Authorization header
 *   - 401 with wrong Bearer
 *   - 200 with valid auth, returns drift list from sync_jobs
 *   - drift events Sentry-tagged with `continuous_reconciliation_drift`
 *   - empty drift when sync_jobs are clean (no discrepancies)
 *   - tolerates both post-06D shape (pl/bs sub-objects) and pre-06D legacy
 *     flat shape on sync_jobs.reconciliation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const captureMessageMock = vi.fn()
const captureExceptionMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageMock,
  captureException: captureExceptionMock,
}))

const supabaseMock: any = {}
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => supabaseMock,
}))

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET

function makeSupabaseStub(syncJobsRows: any[]) {
  const ctx: any = { _filters: [] as any[] }
  ctx.select = () => ctx
  ctx.gte = (col: string, val: any) => {
    ctx._filters.push({ kind: 'gte', col, val })
    return ctx
  }
  ctx.order = () => ctx
  ctx.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: syncJobsRows, error: null }).then(resolve, reject)
  supabaseMock.from = (_table: string) => ctx
}

function makeRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/cron/reconciliation-watch', {
    method: 'GET',
    headers,
  }) as any
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  captureMessageMock.mockReset()
  captureExceptionMock.mockReset()
  vi.resetModules()
})

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET
})

describe('Reconciliation watch cron', () => {
  it('401 without Authorization', async () => {
    makeSupabaseStub([])
    const { GET } = await import('@/app/api/cron/reconciliation-watch/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('401 with wrong bearer', async () => {
    makeSupabaseStub([])
    const { GET } = await import('@/app/api/cron/reconciliation-watch/route')
    const res = await GET(makeRequest({ authorization: 'Bearer wrong' }))
    expect(res.status).toBe(401)
  })

  it('200 with empty drift when sync_jobs are clean', async () => {
    makeSupabaseStub([
      {
        id: 'job-1',
        business_id: 'biz-1',
        tenant_id: 'tenant-A',
        status: 'success',
        started_at: new Date().toISOString(),
        reconciliation: { pl: { discrepant_accounts: [] }, bs: { unbalanced_dates: [] } },
      },
    ])
    const { GET } = await import('@/app/api/cron/reconciliation-watch/route')
    const res = await GET(makeRequest({ authorization: 'Bearer test-cron-secret' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.sync_jobs_scanned).toBe(1)
    expect(body.drift_count).toBe(0)
    expect(captureMessageMock).not.toHaveBeenCalled()
  })

  it('200 with drift event when post-06D shape has unbalanced_dates', async () => {
    makeSupabaseStub([
      {
        id: 'job-2',
        business_id: 'biz-1',
        tenant_id: 'tenant-A',
        status: 'partial',
        started_at: new Date().toISOString(),
        reconciliation: {
          pl: { discrepant_accounts: [] },
          bs: { unbalanced_dates: [{ balance_date: '2026-04-30', delta: 5.0 }] },
        },
      },
    ])
    const { GET } = await import('@/app/api/cron/reconciliation-watch/route')
    const res = await GET(makeRequest({ authorization: 'Bearer test-cron-secret' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.drift_count).toBe(1)
    expect(body.drift[0].bs_unbalanced_dates).toEqual(['2026-04-30'])
    expect(captureMessageMock).toHaveBeenCalledWith(
      'continuous_reconciliation_drift',
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({
          invariant: 'continuous_reconciliation_drift',
          tenant_id: 'tenant-A',
        }),
      }),
    )
  })

  it('200 with drift event for legacy pre-06D flat reconciliation shape', async () => {
    makeSupabaseStub([
      {
        id: 'job-3',
        business_id: 'biz-1',
        tenant_id: 'tenant-A',
        status: 'partial',
        started_at: new Date().toISOString(),
        reconciliation: {
          discrepant_accounts: [{ account_name: 'Sales' }, { account_name: 'COGS' }],
        },
      },
    ])
    const { GET } = await import('@/app/api/cron/reconciliation-watch/route')
    const res = await GET(makeRequest({ authorization: 'Bearer test-cron-secret' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.drift_count).toBe(1)
    expect(body.drift[0].pl_discrepant).toBe(2)
    expect(captureMessageMock).toHaveBeenCalledTimes(1)
  })

  it('500 when sync_jobs query errors', async () => {
    const ctx: any = {}
    ctx.select = () => ctx
    ctx.gte = () => ctx
    ctx.order = () => ctx
    ctx.then = (resolve: any, reject: any) =>
      Promise.resolve({ data: null, error: { message: 'db down' } }).then(resolve, reject)
    supabaseMock.from = () => ctx
    const { GET } = await import('@/app/api/cron/reconciliation-watch/route')
    const res = await GET(makeRequest({ authorization: 'Bearer test-cron-secret' }))
    expect(res.status).toBe(500)
    expect(captureExceptionMock).toHaveBeenCalled()
  })
})
