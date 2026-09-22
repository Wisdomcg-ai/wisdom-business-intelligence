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
 * keeps the most-recent finish per tenant, (4) a cron-only tenant whose
 * last_synced_at is stale but whose sync_jobs is recent is NOT flagged stale,
 * and (5) the lookup reads a window of more than 1,000 jobs whole — through
 * last_xero_sync_by_tenant, or page by page while that function is not
 * deployed — and a read that could not cover the window is ok:false.
 *
 * (5) is 15 Sep 2026: the 60-day window held 3,214 jobs, a read of that shape
 * capped at 1,000 took the oldest rows, and 12 of 15 tenants read ~3 weeks
 * stale under ok:true.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

// ─── Service-role client mock ────────────────────────────────────────────────

type TableResult = { data?: any; error?: any; count?: number }
let results: Record<string, TableResult> = {}
const selectArgsByTable: Record<string, string[]> = {}

type SyncJobRow = { id?: string; tenant_id: string | null; finished_at: string | null; status?: string }

/** Most rows PostgREST returns per response. Hosted Supabase defaults to 1,000. */
let rowCap = 1000
/** Every sync_jobs row request: where it started and how many rows came back. */
let syncJobsRequests: Array<{ from: number; rows: number }> = []
/** Zero-based index of the sync_jobs request that fails, if any. */
let failingSyncJobsRequest: number | null = null
/** last_xero_sync_by_tenant: applied, not yet applied, or a canned reply. */
let rpcReply: 'deployed' | 'missing' | { data: unknown; error: unknown } = 'deployed'
let rpcCalls: Array<{ fn: string; args: { p_since: string } }> = []

const ms = (iso: string) => new Date(iso).getTime()
const statusOf = (r: SyncJobRow) => r.status ?? 'success'

/**
 * sync_jobs behaves like PostgREST over a real table: filters, ORDER BY and
 * .range() apply, rows otherwise come back in storage order, and no response
 * holds more than `rowCap` rows. An unordered read of a big window therefore
 * gets its OLDEST rows, as prod did.
 */
function syncJobsChain() {
  const filters: Array<(r: SyncJobRow) => boolean> = []
  const orderBy: Array<{ column: keyof SyncJobRow; ascending: boolean }> = []
  let from = 0
  let to = Infinity
  const run = () => {
    const reply = results.sync_jobs ?? { data: [], error: null }
    if (reply.error || syncJobsRequests.length === failingSyncJobsRequest) {
      syncJobsRequests.push({ from, rows: 0 })
      return { data: null, error: reply.error ?? { code: '57014', message: 'canceling statement due to statement timeout' } }
    }
    let rows = ((reply.data ?? []) as SyncJobRow[]).filter((r) => filters.every((f) => f(r)))
    if (orderBy.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending } of orderBy) {
          const x = String(a[column] ?? '')
          const y = String(b[column] ?? '')
          if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1)
        }
        return 0
      })
    }
    const page = rows.slice(from, from + Math.min(to - from + 1, rowCap))
    syncJobsRequests.push({ from, rows: page.length })
    return { data: page, error: null }
  }
  const chain: any = {
    select: (arg: string) => {
      ;(selectArgsByTable.sync_jobs ||= []).push(arg)
      return chain
    },
    in: (column: string, values: string[]) => {
      filters.push((r) => values.includes(column === 'status' ? statusOf(r) : (r as any)[column]))
      return chain
    },
    gte: (column: string, value: string) => {
      filters.push((r) => (r as any)[column] != null && ms((r as any)[column]) >= ms(value))
      return chain
    },
    order: (column: keyof SyncJobRow, opts?: { ascending?: boolean }) => {
      orderBy.push({ column, ascending: opts?.ascending !== false })
      return chain
    },
    range: (start: number, end: number) => {
      from = start
      to = end
      return chain
    },
    then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
  }
  return chain
}

/** What the SQL function returns: the newest success/partial finish per non-blank tenant since p_since, as one object. */
function lastSyncByTenantRpc(fn: string, args: { p_since: string }) {
  rpcCalls.push({ fn, args })
  if (rpcReply === 'missing') {
    return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}(p_since) in the schema cache` } }
  }
  if (rpcReply !== 'deployed') return rpcReply
  const reply = results.sync_jobs ?? { data: [], error: null }
  if (reply.error) return { data: null, error: reply.error }
  const latest: Record<string, string> = {}
  for (const r of (reply.data ?? []) as SyncJobRow[]) {
    if (!['success', 'partial'].includes(statusOf(r)) || !r.tenant_id || !r.finished_at) continue
    if (ms(r.finished_at) < ms(args.p_since)) continue
    if (!latest[r.tenant_id] || ms(r.finished_at) > ms(latest[r.tenant_id])) latest[r.tenant_id] = r.finished_at
  }
  return { data: latest, error: null }
}

function makeChain(table: string) {
  if (table === 'sync_jobs') return syncJobsChain()
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
  rpc: async (fn: string, args: { p_since: string }) => lastSyncByTenantRpc(fn, args),
  auth: { admin: { listUsers: async () => results.__auth ?? { data: {}, error: null } } },
}

vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => fakeClient,
}))

import * as Sentry from '@sentry/nextjs'
import { runHealthChecks, getLastSyncByTenant, getLastSyncByTenantSince } from '@/lib/health-checks'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
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
  rowCap = 1000
  syncJobsRequests = []
  failingSyncJobsRequest = null
  rpcReply = 'deployed'
  rpcCalls = []
  vi.mocked(Sentry.captureMessage).mockClear()
}

/**
 * Sixty days shaped like prod on 15 Sep 2026, stored oldest first: a run every
 * 6 hours writes a row per org, each followed by an outer per-business row
 * (tenant_id ''). Two orgs connected in the last 6 days, so all of their rows
 * sit past the first 1,000; one stopped syncing 35 days ago. A failed job and a
 * still-running one are newer than real finishes and must not count.
 *
 * `latest` is each org's true last finish, tracked as the rows are written.
 */
function prodShapedWindow() {
  const rows: SyncJobRow[] = []
  const latest = new Map<string, number>()
  const established = Array.from({ length: 10 }, (_, i) => `t-${String(i + 1).padStart(2, '0')}`)
  let n = 0
  const nextId = () => `job-${String(++n).padStart(5, '0')}`
  for (let hoursAgo = 59 * 24; hoursAgo >= 6; hoursAgo -= 6) {
    const orgs = [
      ...established,
      ...(hoursAgo <= 6 * 24 ? ['t-new-a', 't-new-b'] : []),
      ...(hoursAgo >= 35 * 24 ? ['t-stopped'] : []),
    ]
    orgs.forEach((tenant, i) => {
      const finishedMs = Date.now() - hoursAgo * HOUR + i * 60_000
      const finished_at = new Date(finishedMs).toISOString()
      rows.push({ id: nextId(), tenant_id: tenant, finished_at, status: n % 5 === 0 ? 'partial' : 'success' })
      rows.push({ id: nextId(), tenant_id: '', finished_at, status: 'success' })
      latest.set(tenant, Math.max(latest.get(tenant) ?? 0, finishedMs))
    })
  }
  rows.push({ id: nextId(), tenant_id: 't-01', finished_at: isoAgo(HOUR), status: 'error' })
  rows.push({ id: nextId(), tenant_id: 't-02', finished_at: null, status: 'running' })
  return { rows, latest }
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

  it('does NOT flag a token merely because it expires within a day', async () => {
    // Was asserted as a warning. Xero access tokens live THIRTY MINUTES, so
    // `expires_at < now + 24h` is true for every active connection on every run
    // — the check fired constantly and meant nothing. At 2 connections it was 2
    // junk lines in the daily email; at the 35 this fleet is about to have it
    // would bury every real alert. A token expiring in an hour is a token that
    // was refreshed normally.
    results.xero_connections = {
      data: [{ id: 'c1', business_id: 'b1', tenant_id: 't1', is_active: true, expires_at: isoAhead(60 * 60 * 1000), last_synced_at: isoAgo(1000), created_at: isoAgo(30 * DAY) }],
      error: null,
    }
    results.sync_jobs = { data: [{ tenant_id: 't1', finished_at: isoAgo(1000) }], error: null }
    const health = await runHealthChecks()
    expect(health.checks.xero.status).toBe('ok')
  })

  it('DOES flag a token the refresh cron has not renewed in over 12h', async () => {
    // The real question, and the one the old check could not ask: has Xero
    // actually granted us a token recently? expires_at minus the 30-min TTL is
    // when it last did. This is the Caringbah shape — the row looks alive, and
    // nothing has renewed it.
    results.xero_connections = {
      data: [{ id: 'c1', business_id: 'b1', tenant_id: 't1', is_active: true, expires_at: isoAgo(20 * 60 * 60 * 1000), last_synced_at: isoAgo(1000), created_at: isoAgo(30 * DAY) }],
      error: null,
    }
    results.sync_jobs = { data: [{ tenant_id: 't1', finished_at: isoAgo(1000) }], error: null }
    const health = await runHealthChecks()
    expect(health.checks.xero.status).toBe('warning')
    expect(health.checks.xero.message).toMatch(/Token not refreshing/)
  })

  it('flags a connection that has NEVER synced once it is past the first-sync grace', async () => {
    // The old check exempted never-synced connections outright and forever, so a
    // connection that never worked stayed invisible. Every studio onboarding at
    // launch begins in exactly this state.
    results.xero_connections = {
      data: [{ id: 'c1', business_id: 'b1', tenant_id: 't-none', is_active: true, expires_at: isoAhead(20 * 60 * 1000), last_synced_at: null, created_at: isoAgo(3 * DAY) }],
      error: null,
    }
    results.sync_jobs = { data: [], error: null }
    const health = await runHealthChecks()
    expect(health.checks.xero.status).toBe('warning')
    expect(health.checks.xero.message).toMatch(/Never synced since connecting/)
  })
})

describe('R30 — getLastSyncByTenant', () => {
  beforeEach(() => {
    healthyBaseline()
  })

  // Every answer must be the same whether the database function is applied or
  // the lookup is paging through sync_jobs because it is not.
  describe.each([
    ['through last_xero_sync_by_tenant', 'deployed' as const],
    ['page by page while the function is not deployed', 'missing' as const],
  ])('%s', (_label, mode) => {
    beforeEach(() => {
      rpcReply = mode
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
      const { ok, byTenant } = await getLastSyncByTenant(fakeClient as any)
      expect(ok).toBe(true)
      expect(byTenant.has('t1')).toBe(true)
      expect(byTenant.has('t2')).toBe(true)
      expect(byTenant.has('t3')).toBe(false)
      // t1 newer entry wins (within ~1 day of now, not ~3 days)
      expect(Date.now() - (byTenant.get('t1') as number)).toBeLessThan(2 * DAY)
    })

    it('reports ok:false on query error — a failed lookup must not read as "nobody synced"', async () => {
      // Was asserted as "returns an empty map (graceful degradation)". It wasn't
      // graceful: an empty map is indistinguishable from a fleet that has never
      // synced, and every caller rendered that as nothing-to-report. The failure
      // now has to be carried out to the caller so it can say `unknown`.
      results.sync_jobs = { data: null, error: { message: 'boom' } }
      const { ok, byTenant } = await getLastSyncByTenant(fakeClient as any)
      expect(ok).toBe(false)
      expect(byTenant.size).toBe(0)
    })

    it('reads a 60-day window of more than 1,000 jobs whole: every org’s true latest finish, none missing', async () => {
      const { rows, latest } = prodShapedWindow()
      expect(rows.length).toBeGreaterThan(5000)
      results.sync_jobs = { data: rows, error: null }

      const { ok, byTenant } = await getLastSyncByTenant(fakeClient as any, 60)

      expect(ok).toBe(true)
      expect(byTenant).toEqual(latest)
      expect(byTenant.has('')).toBe(false)
      expect(Date.now() - (byTenant.get('t-new-a') as number)).toBeLessThan(7 * HOUR)
      expect(Date.now() - (byTenant.get('t-stopped') as number)).toBeGreaterThan(34 * DAY)

      if (mode === 'deployed') {
        // One call, one value back — no row reads for a row cap to cut short.
        expect(rpcCalls).toHaveLength(1)
        expect(Math.abs(ms(rpcCalls[0].args.p_since) - (Date.now() - 60 * DAY))).toBeLessThan(60_000)
        expect(syncJobsRequests).toHaveLength(0)
      } else {
        // Every successful job in the window was read, in capped pages, and only
        // an empty page ended the read.
        const successful = rows.filter((r) => r.status === 'success' || r.status === 'partial').length
        expect(syncJobsRequests.reduce((sum, r) => sum + r.rows, 0)).toBe(successful)
        expect(syncJobsRequests.every((r) => r.rows <= 1000)).toBe(true)
        expect(syncJobsRequests[syncJobsRequests.length - 1].rows).toBe(0)
      }
    })

    it('from an explicit instant: a finish at that instant counts, one a millisecond earlier does not', async () => {
      const since = Date.now() - 26 * HOUR
      results.sync_jobs = {
        data: [
          { tenant_id: 't-at', finished_at: new Date(since).toISOString() },
          { tenant_id: 't-before', finished_at: new Date(since - 1).toISOString() },
        ],
        error: null,
      }
      const { ok, byTenant, error } = await getLastSyncByTenantSince(fakeClient as any, since)
      expect(ok).toBe(true)
      expect(error).toBeNull()
      expect([...byTenant.keys()]).toEqual(['t-at'])
      if (mode === 'deployed') expect(rpcCalls.map((c) => c.args.p_since)).toEqual([new Date(since).toISOString()])
    })
  })

  it.each([
    [
      'the function errors',
      () => {
        rpcReply = { data: null, error: { code: '42501', message: 'permission denied for function last_xero_sync_by_tenant' } }
      },
      /^last_xero_sync_by_tenant: permission denied/,
    ],
    ['its reply is not an object', () => { rpcReply = { data: [], error: null } }, /not a \{tenant_id: finished_at\} object/],
    ['an entry is unreadable', () => { rpcReply = { data: { t1: 'never' }, error: null } }, /unreadable entry for tenant "t1"/],
    ['a fallback page fails', () => { rpcReply = 'missing'; failingSyncJobsRequest = 1 }, /^sync_jobs page 2: canceling statement due to statement timeout/],
    [
      'the fallback runs out of pages',
      () => {
        rpcReply = 'missing'
        rowCap = 50
        results.sync_jobs = { data: prodShapedWindow().rows, error: null }
      },
      /did not end within 50 pages/,
    ],
  ])('a failed lookup says why when %s', async (_label, arrange, reason) => {
    results.sync_jobs = { data: [{ tenant_id: 't1', finished_at: isoAgo(HOUR) }], error: null }
    arrange()
    const { ok, byTenant, error } = await getLastSyncByTenantSince(fakeClient as any, Date.now() - 60 * DAY)
    expect(ok).toBe(false)
    expect(byTenant.size).toBe(0)
    expect(error).toMatch(reason)
  })

  it('the prod-shaped window really does break a single read: the oldest 1,000 rows, weeks-old clocks, orgs missing', async () => {
    // Pins that the >1,000-row cases above can fail. This is the read the
    // lookup used to make, against the same stand-in.
    const { rows, latest } = prodShapedWindow()
    results.sync_jobs = { data: rows, error: null }
    const { data } = await (fakeClient.from('sync_jobs') as any)
      .select('tenant_id, finished_at')
      .in('status', ['success', 'partial'])
      .gte('finished_at', isoAgo(60 * DAY))
    expect(data).toHaveLength(1000)
    const seen = new Set((data as SyncJobRow[]).map((r) => r.tenant_id))
    expect(seen.has('t-new-a')).toBe(false)
    const newestT01 = Math.max(...(data as SyncJobRow[]).filter((r) => r.tenant_id === 't-01').map((r) => ms(r.finished_at!)))
    expect((latest.get('t-01') as number) - newestT01).toBeGreaterThan(40 * DAY)
  })

  describe('while the function is not deployed', () => {
    let fixture: ReturnType<typeof prodShapedWindow>

    beforeEach(() => {
      rpcReply = 'missing'
      fixture = prodShapedWindow()
      results.sync_jobs = { data: fixture.rows, error: null }
    })

    it('a row cap lower than the page size costs pages, not rows', async () => {
      // A 300-row cap makes every full page look "short" against the 1,000 asked
      // for. Treating a short page as the end would stop after the first.
      rowCap = 300
      const { rows, latest } = fixture
      const successful = rows.filter((r) => r.status === 'success' || r.status === 'partial').length
      const { ok, byTenant } = await getLastSyncByTenant(fakeClient as any, 60)
      expect(ok).toBe(true)
      expect(byTenant).toEqual(latest)
      expect(syncJobsRequests.reduce((sum, r) => sum + r.rows, 0)).toBe(successful)
      expect(syncJobsRequests).toHaveLength(Math.ceil(successful / 300) + 1)
    })

    it('a page that fails part-way is ok:false — never the pages read before it', async () => {
      failingSyncJobsRequest = 2
      const { ok, byTenant } = await getLastSyncByTenant(fakeClient as any, 60)
      expect(ok).toBe(false)
      expect(byTenant.size).toBe(0)
      expect(syncJobsRequests).toHaveLength(3)
    })

    it('a window too large to page through is ok:false, after a bounded number of requests', async () => {
      rowCap = 50
      const { ok, byTenant } = await getLastSyncByTenant(fakeClient as any, 60)
      expect(ok).toBe(false)
      expect(byTenant.size).toBe(0)
      expect(syncJobsRequests).toHaveLength(50)
    })

    it('says so in Sentry, so an unapplied migration is not hidden by pills that stay right', async () => {
      await getLastSyncByTenant(fakeClient as any, 60)
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
      expect(vi.mocked(Sentry.captureMessage).mock.calls[0][1]).toMatchObject({
        level: 'warning',
        tags: { invariant: 'sync_clock_rpc_missing' },
      })
    })
  })

  it('does not report to Sentry when the function answers', async () => {
    await getLastSyncByTenant(fakeClient as any, 60)
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('any other function error is ok:false — it does not fall back to reading rows', async () => {
    rpcReply = { data: null, error: { code: '42501', message: 'permission denied for function last_xero_sync_by_tenant' } }
    results.sync_jobs = { data: [{ tenant_id: 't1', finished_at: isoAgo(HOUR) }], error: null }
    const { ok, byTenant } = await getLastSyncByTenant(fakeClient as any, 60)
    expect(ok).toBe(false)
    expect(byTenant.size).toBe(0)
    expect(syncJobsRequests).toHaveLength(0)
  })

  it.each([
    ['null (the function is STRICT)', null],
    ['an array', [{ tenant_id: 't1', finished_at: '2026-09-15T04:06:33.612+00:00' }]],
    ['a scalar', '2026-09-15T04:06:33.612+00:00'],
    ['an entry that is not a timestamp', { t1: '2026-09-15T04:06:33.612+00:00', t2: 'never' }],
    ['an entry that is not a string', { t1: 1789445193612 }],
  ])('a reply that is %s is ok:false, not a map missing tenants', async (_label, data) => {
    rpcReply = { data, error: null }
    const { ok, byTenant } = await getLastSyncByTenant(fakeClient as any, 60)
    expect(ok).toBe(false)
    expect(byTenant.size).toBe(0)
  })

  it('reads the function’s timestamps exactly, microseconds included', async () => {
    rpcReply = {
      data: { 't-a': '2026-09-15T04:06:33.612345+00:00', 't-b': '2026-09-10T16:11:11.42+00:00' },
      error: null,
    }
    const { ok, byTenant } = await getLastSyncByTenant(fakeClient as any, 60)
    expect(ok).toBe(true)
    expect(byTenant.get('t-a')).toBe(Date.parse('2026-09-15T04:06:33.612Z'))
    expect(byTenant.get('t-b')).toBe(Date.parse('2026-09-10T16:11:11.420Z'))
  })
})
