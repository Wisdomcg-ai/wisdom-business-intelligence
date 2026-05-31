/**
 * R30 (REL-N1 / REL-N2) — Xero health check regression lock.
 *
 * REL-N1: checkXero selected a nonexistent column (`token_expires_at`; the real
 * column is `expires_at`), so PostgREST errored every run and the error path
 * swallowed it to status:"ok" — the detector for the product's #1 incident
 * class (connected-but-not-syncing) was permanently DARK.
 *
 * REL-N2: the nightly cron does not update xero_connections.last_synced_at, so
 * a freshness check reading only that column false-positives "stale" on
 * cron-only tenants. Freshness is now derived from sync_jobs.finished_at joined
 * on the stable Xero tenant_id.
 *
 * These tests lock: (1) the corrected column name is what gets queried, (2) a
 * query error now surfaces as status:"error" (not "ok"), (3) getLastSyncByTenant
 * keeps the most-recent finish per tenant, and (4) a cron-only tenant whose
 * last_synced_at is stale but whose sync_jobs is recent is NOT flagged stale.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Service-role client mock ────────────────────────────────────────────────

type TableResult = { data?: any; error?: any; count?: number }
let results: Record<string, TableResult> = {}
const selectArgsByTable: Record<string, string[]> = {}

function makeChain(table: string) {
  const result = () => results[table] ?? { data: [], error: null }
  const chain: any = {
    select: (arg: string) => {
      ;(selectArgsByTable[table] ||= []).push(arg)
      return chain
    },
    eq: () => chain,
    in: () => chain,
    gte: () => chain,
    lt: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result()),
    // Make the builder awaitable so `await supabase.from(t).select(...)` and
    // `.gte(...)` resolve to the configured result.
    then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
  }
  return chain
}

const fakeClient = {
  from: (table: string) => makeChain(table),
  auth: { admin: { listUsers: async () => results.__auth ?? { data: {}, error: null } } },
}

vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => fakeClient,
}))

import { runHealthChecks, getLastSyncByTenant } from '@/lib/health-checks'

const DAY = 24 * 60 * 60 * 1000
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString()
const isoAhead = (ms: number) => new Date(Date.now() + ms).toISOString()

function healthyBaseline() {
  results = {
    businesses: { error: null },
    __auth: { error: null },
    client_error_logs: { count: 0, error: null },
    xero_connections: { data: [], error: null },
    sync_jobs: { data: [], error: null },
  }
}

describe('R30 — checkXero column + error surfacing', () => {
  beforeEach(() => {
    healthyBaseline()
    for (const k of Object.keys(selectArgsByTable)) delete selectArgsByTable[k]
  })

  it('queries `expires_at`, never the nonexistent `token_expires_at`', async () => {
    results.xero_connections = {
      data: [{ id: 'c1', business_id: 'b1', tenant_id: 't1', is_active: true, expires_at: isoAhead(10 * DAY), last_synced_at: isoAgo(1000) }],
      error: null,
    }
    await runHealthChecks()
    const sel = (selectArgsByTable['xero_connections'] || []).join(' ')
    expect(sel).toContain('expires_at')
    expect(sel).not.toContain('token_expires_at')
  })

  it('REL-N1: a query error surfaces as status "error" (not swallowed to "ok")', async () => {
    results.xero_connections = {
      data: null,
      error: { message: 'column xero_connections.token_expires_at does not exist' },
    }
    const health = await runHealthChecks()
    expect(health.checks.xero.status).toBe('error')
    expect(health.overall).toBe('unhealthy')
  })

  it('flags a genuinely stale tenant (no recent last_synced_at and no recent sync_jobs)', async () => {
    results.xero_connections = {
      data: [{ id: 'c1', business_id: 'b1', tenant_id: 't1', is_active: true, expires_at: isoAhead(10 * DAY), last_synced_at: isoAgo(3 * DAY) }],
      error: null,
    }
    results.sync_jobs = { data: [], error: null }
    const health = await runHealthChecks()
    expect(health.checks.xero.status).toBe('warning')
    expect(health.checks.xero.message).toMatch(/Stale sync/)
  })

  it('REL-N2: a cron-only tenant (stale last_synced_at but recent sync_jobs) is NOT flagged stale', async () => {
    results.xero_connections = {
      data: [{ id: 'c1', business_id: 'b1', tenant_id: 't1', is_active: true, expires_at: isoAhead(10 * DAY), last_synced_at: isoAgo(5 * DAY) }],
      error: null,
    }
    // Cron finalized a sync 2 hours ago for this tenant.
    results.sync_jobs = { data: [{ tenant_id: 't1', finished_at: isoAgo(2 * 60 * 60 * 1000) }], error: null }
    const health = await runHealthChecks()
    expect(health.checks.xero.status).toBe('ok')
    expect(health.checks.xero.message).toMatch(/active connection/)
  })

  it('flags a token expiring within a day', async () => {
    results.xero_connections = {
      data: [{ id: 'c1', business_id: 'b1', tenant_id: 't1', is_active: true, expires_at: isoAhead(60 * 60 * 1000), last_synced_at: isoAgo(1000) }],
      error: null,
    }
    results.sync_jobs = { data: [{ tenant_id: 't1', finished_at: isoAgo(1000) }], error: null }
    const health = await runHealthChecks()
    expect(health.checks.xero.status).toBe('warning')
    expect(health.checks.xero.message).toMatch(/Token expiring soon/)
  })
})

describe('R30 — getLastSyncByTenant', () => {
  beforeEach(() => {
    healthyBaseline()
  })

  it('keeps the most-recent finished_at per tenant and ignores null tenant/finish', async () => {
    results.sync_jobs = {
      data: [
        { tenant_id: 't1', finished_at: isoAgo(3 * DAY) },
        { tenant_id: 't1', finished_at: isoAgo(1 * DAY) }, // newer — should win
        { tenant_id: 't2', finished_at: isoAgo(2 * DAY) },
        { tenant_id: null, finished_at: isoAgo(1000) }, // ignored
        { tenant_id: 't3', finished_at: null }, // ignored
      ],
      error: null,
    }
    const map = await getLastSyncByTenant(fakeClient as any)
    expect(map.has('t1')).toBe(true)
    expect(map.has('t2')).toBe(true)
    expect(map.has('t3')).toBe(false)
    // t1 newer entry wins (within ~1 day of now, not ~3 days)
    expect(Date.now() - (map.get('t1') as number)).toBeLessThan(2 * DAY)
  })

  it('returns an empty map on query error (graceful degradation)', async () => {
    results.sync_jobs = { data: null, error: { message: 'boom' } }
    const map = await getLastSyncByTenant(fakeClient as any)
    expect(map.size).toBe(0)
  })
})
