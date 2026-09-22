/**
 * data_quality must distinguish "nothing synced" from "we could not check".
 *
 * computeDataQuality reads xero_connections (to learn the tenant list) and then
 * one sync_jobs row per tenant. Both reads discarded their `error`, so a FAILED
 * read produced exactly the same output as a genuinely empty one: 'no_sync' —
 * a confident claim about Xero ("nothing has ever synced here") made on the
 * strength of a read that never succeeded.
 *
 * That was not hypothetical. The sole authenticated SELECT policy on sync_jobs
 * compared the wrong id-space (see migrations/sync-jobs-rls-id-space.test.ts),
 * so on the one RLS-bound path — GET /api/Xero/pl-summary, which the forecast
 * wizard hits on load — every tenant on the platform resolved to 'no_sync', and
 * the wizard steps then rewrote that to 'verified' whenever YTD actuals were
 * present. A business whose last sync ERRORED rendered a clean bill of health.
 *
 * The fail-open house rule has three outcomes, not two: a value, a genuinely
 * empty source, and "couldn't check". `quality_check_failed` is the third.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ForecastReadService } from '@/lib/services/forecast-read-service'

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

const BIZ_IDS = ['profile-id-1', 'business-id-1']

interface MockOpts {
  /** Rows for xero_connections, or an Error to fail that read. */
  connections: Array<{ tenant_id: string; business_id: string }> | Error
  /** Per tenant: the latest sync_jobs row, null for none, or an Error to fail. */
  syncJobs: Record<string, { status: string; started_at: string; reconciliation?: unknown } | null | Error>
}

function makeMockSupabase(opts: MockOpts) {
  const fromBuilder = (table: string) => {
    const ctx: any = { _filters: [] as Array<{ col: string; val: unknown }> }
    ctx.select = () => ctx
    ctx.in = (col: string, val: unknown) => { ctx._filters.push({ col, val }); return ctx }
    ctx.eq = (col: string, val: unknown) => { ctx._filters.push({ col, val }); return ctx }
    ctx.order = () => ctx
    ctx.limit = () => ctx
    ctx.maybeSingle = async () => {
      if (table !== 'sync_jobs') return { data: null, error: null }
      const tenantId = ctx._filters.find((f: any) => f.col === 'tenant_id')?.val as string
      const row = opts.syncJobs[tenantId] ?? null
      if (row instanceof Error) return { data: null, error: row }
      return { data: row, error: null }
    }
    // xero_connections is awaited directly (no terminal method).
    ctx.then = (resolve: any, reject: any) => {
      if (table === 'xero_connections') {
        return opts.connections instanceof Error
          ? Promise.resolve({ data: null, error: opts.connections }).then(resolve, reject)
          : Promise.resolve({ data: opts.connections, error: null }).then(resolve, reject)
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject)
    }
    return ctx
  }
  return { from: (table: string) => fromBuilder(table) } as any
}

const recent = () => new Date(Date.now() - 60 * 60 * 1000).toISOString()

function service(opts: MockOpts) {
  return new ForecastReadService(makeMockSupabase(opts))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a healthy read is still reported as measured', () => {
  it('a recent successful sync is verified, and the check did not fail', async () => {
    const result = await service({
      connections: [{ tenant_id: 'tenant-a', business_id: 'profile-id-1' }],
      syncJobs: { 'tenant-a': { status: 'success', started_at: recent() } },
    }).getDataQualityForBusiness(BIZ_IDS)

    expect(result.data_quality).toBe('verified')
    expect(result.quality_check_failed).toBe(false)
  })
})

describe('a genuinely empty source is still no_sync', () => {
  it('a tenant that has never synced reports no_sync WITHOUT claiming a failure', async () => {
    const result = await service({
      connections: [{ tenant_id: 'tenant-a', business_id: 'profile-id-1' }],
      syncJobs: { 'tenant-a': null },
    }).getDataQualityForBusiness(BIZ_IDS)

    expect(result.data_quality).toBe('no_sync')
    // This is real news about Xero, not a read failure — the banner should show
    // the no_sync copy, not "couldn't verify".
    expect(result.quality_check_failed).toBe(false)
  })

  it('a business with no active connections reports no_sync, not a failure', async () => {
    const result = await service({
      connections: [],
      syncJobs: {},
    }).getDataQualityForBusiness(BIZ_IDS)

    expect(result.data_quality).toBe('no_sync')
    expect(result.quality_check_failed).toBe(false)
  })
})

describe("an unreadable source is NOT reported as no_sync", () => {
  it('a failed sync_jobs read sets quality_check_failed', async () => {
    // This is exactly what the broken RLS policy produced on the pl-summary
    // path: connections readable, sync_jobs not.
    const result = await service({
      connections: [{ tenant_id: 'tenant-a', business_id: 'profile-id-1' }],
      syncJobs: { 'tenant-a': new Error('permission denied for table sync_jobs') },
    }).getDataQualityForBusiness(BIZ_IDS)

    expect(result.quality_check_failed).toBe(true)
  })

  it('a failed xero_connections read sets it too — the tenant list is unknown', async () => {
    const result = await service({
      connections: new Error('connection reset'),
      syncJobs: {},
    }).getDataQualityForBusiness(BIZ_IDS)

    // Without the tenant list, 'no_sync' would claim the business has no Xero
    // at all — a statement we have no evidence for.
    expect(result.quality_check_failed).toBe(true)
  })

  it('one unreadable tenant among several still flags the whole result', async () => {
    const result = await service({
      connections: [
        { tenant_id: 'tenant-a', business_id: 'profile-id-1' },
        { tenant_id: 'tenant-b', business_id: 'profile-id-1' },
      ],
      syncJobs: {
        'tenant-a': { status: 'success', started_at: recent() },
        'tenant-b': new Error('permission denied for table sync_jobs'),
      },
    }).getDataQualityForBusiness(BIZ_IDS)

    // Worst-of over what we could read says 'no_sync'; the flag is what stops
    // the UI presenting a partial picture as a complete one.
    expect(result.quality_check_failed).toBe(true)
  })

  it('reports the failure to Sentry with an invariant tag', async () => {
    const Sentry = await import('@sentry/nextjs')
    await service({
      connections: [{ tenant_id: 'tenant-sentry-1', business_id: 'profile-id-1' }],
      syncJobs: { 'tenant-sentry-1': new Error('permission denied for table sync_jobs') },
    }).getDataQualityForBusiness(['profile-sentry-1'])

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    const [, options] = vi.mocked(Sentry.captureMessage).mock.calls[0] as [string, any]
    expect(options.tags).toMatchObject({ invariant: 'data_quality_unreadable', source: 'sync_jobs' })
  })

  it('dedupes repeat captures — pl-summary fires on every page load', async () => {
    const Sentry = await import('@sentry/nextjs')
    const opts: MockOpts = {
      connections: [{ tenant_id: 'tenant-dedupe-1', business_id: 'profile-id-1' }],
      syncJobs: { 'tenant-dedupe-1': new Error('permission denied for table sync_jobs') },
    }
    await service(opts).getDataQualityForBusiness(['profile-dedupe-1'])
    await service(opts).getDataQualityForBusiness(['profile-dedupe-1'])
    await service(opts).getDataQualityForBusiness(['profile-dedupe-1'])

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
  })
})
