/**
 * The set-difference check: did every studio that SHOULD have synced actually
 * sync?
 *
 * These cases are deliberately weighted toward the failure paths, because the
 * happy path is not what this module is for. Every per-connection check in the
 * codebase already handles a connection that reports in; the whole point here is
 * the connection that produces NOTHING — no result, no sync_jobs row, no
 * heartbeat — which every other check silently passes over.
 *
 * "Synced" is read from the per-tenant sync clock: last_xero_sync_by_tenant, or
 * sync_jobs page by page while that function is not applied. Every case that
 * depends on it runs both ways and must get the same answer. The >1,000-job case
 * is why the clock is used: this module used to read the window's jobs in one
 * unordered request, and PostgREST would have returned only the oldest 1,000.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

import {
  getXeroSyncCoverage,
  describeSyncCoverage,
  SYNC_COVERAGE_WINDOW_MS,
} from '@/lib/xero/sync-coverage'

const NOW = Date.parse('2026-07-29T07:00:00.000Z')
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()
const HOUR = 60 * 60 * 1000

type Reply = { data: unknown; error: { message: string; code?: string } | null }
type Job = { id?: string; tenant_id: string | null; finished_at: string | null; status?: string }

/** Most rows PostgREST returns per response. Hosted Supabase defaults to 1,000. */
const ROW_CAP = 1000

const statusOf = (j: Job) => j.status ?? 'success'
const isSynced = (j: Job) => statusOf(j) === 'success' || statusOf(j) === 'partial'

/** Every rpc call the module made. */
let rpcCalls: Array<{ fn: string; args: { p_since: string } }> = []
/** Rows returned by each sync_jobs request, in order. */
let jobReads: number[] = []

beforeEach(() => {
  rpcCalls = []
  jobReads = []
})

/**
 * sync_jobs behaves like PostgREST over a real table: filters, ORDER BY and
 * .range() apply, rows otherwise come back in storage order, and no response
 * holds more than ROW_CAP rows.
 */
function syncJobsChain(reply: { data: Job[] | null; error: { message: string } | null }) {
  const filters: Array<(j: Job) => boolean> = []
  const orderBy: Array<{ column: keyof Job; ascending: boolean }> = []
  let from = 0
  let to = Infinity
  const run = () => {
    if (reply.error) {
      jobReads.push(0)
      return { data: null, error: reply.error }
    }
    let rows = (reply.data ?? []).filter((j) => filters.every((f) => f(j)))
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
    const page = rows.slice(from, from + Math.min(to - from + 1, ROW_CAP))
    jobReads.push(page.length)
    return { data: page, error: null }
  }
  const chain: any = {
    select: () => chain,
    in: (column: keyof Job, values: string[]) => {
      filters.push((j) => values.includes(column === 'status' ? statusOf(j) : String(j[column])))
      return chain
    },
    gte: (column: keyof Job, value: string) => {
      filters.push((j) => j[column] != null && Date.parse(String(j[column])) >= Date.parse(value))
      return chain
    },
    order: (column: keyof Job, opts?: { ascending?: boolean }) => {
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

/**
 * Minimal supabase stand-in. xero_connections gets one canned reply; sync_jobs
 * is the table above. The clock is last_xero_sync_by_tenant: 'deployed' answers
 * as the SQL function does from the same jobs (newest success/partial finish per
 * tenant since p_since, never tenant_id ''), 'missing' is the function not yet
 * applied, and anything else is its canned reply.
 */
function fakeClient(replies: {
  xero_connections?: Reply
  sync_jobs?: { data: Job[] | null; error: { message: string } | null }
  clock?: 'deployed' | 'missing' | Reply
}) {
  const jobs = replies.sync_jobs ?? { data: [], error: null }
  const clock = replies.clock ?? 'deployed'
  return {
    from(table: string) {
      if (table === 'sync_jobs') return syncJobsChain(jobs)
      const reply = (replies as Record<string, unknown>)[table] ?? { data: [], error: null }
      const thenable = { then: (r: (v: unknown) => unknown) => Promise.resolve(reply).then(r) }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'gte']) chain[m] = () => ({ ...chain, ...thenable })
      return { ...chain, ...thenable }
    },
    async rpc(fn: string, args: { p_since: string }) {
      rpcCalls.push({ fn, args })
      if (fn !== 'last_xero_sync_by_tenant') throw new Error(`unexpected rpc ${fn}`)
      if (clock === 'missing') {
        return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}(p_since) in the schema cache` } }
      }
      if (clock !== 'deployed') return clock
      if (jobs.error) return { data: null, error: jobs.error }
      const latest: Record<string, string> = {}
      for (const j of jobs.data ?? []) {
        if (!isSynced(j) || !j.tenant_id || !j.finished_at) continue
        if (Date.parse(j.finished_at) < Date.parse(args.p_since)) continue
        if (!latest[j.tenant_id] || Date.parse(j.finished_at) > Date.parse(latest[j.tenant_id])) latest[j.tenant_id] = j.finished_at
      }
      return { data: latest, error: null }
    },
  } as never
}

const conn = (over: Partial<{ id: string; business_id: string; tenant_id: string | null; tenant_name: string | null }> = {}) => ({
  id: 'c1',
  business_id: 'b1',
  tenant_id: 't1',
  tenant_name: 'Studio One Pty Ltd',
  ...over,
})

/** A job for `tenant_id` that finished `hoursAgo` before NOW. */
const job = (tenant_id: string | null, hoursAgo = 1, status = 'success'): Job => ({
  tenant_id,
  finished_at: at(-hoursAgo * HOUR),
  status,
})

/**
 * A 26h window at about 10× today's volume, stored oldest first. 150 orgs sync
 * every 6 hours and each job is followed by its outer per-business row
 * (tenant_id ''), so the window holds 1,506 successful jobs. t-new-b connected 7
 * hours ago and t-new an hour ago, so every job of theirs sits past the first
 * 1,000 rows. t-stopped last synced 31 hours ago, t-failing's only job failed,
 * and t-running's has not finished.
 */
function busyWindow() {
  const jobs: Job[] = []
  let n = 0
  const add = (tenant_id: string, finished_at: string | null, status: string) => {
    jobs.push({ id: `job-${String(++n).padStart(5, '0')}`, tenant_id, finished_at, status })
  }
  const established = Array.from({ length: 150 }, (_, i) => `t-${String(i + 1).padStart(3, '0')}`)
  for (const hoursAgo of [31, 25, 19, 13, 7, 1]) {
    const orgs = [
      ...established,
      ...(hoursAgo === 31 ? ['t-stopped'] : []),
      ...(hoursAgo <= 7 ? ['t-new-b'] : []),
      ...(hoursAgo === 1 ? ['t-new'] : []),
    ]
    orgs.forEach((tenant, i) => {
      const finished_at = at(-hoursAgo * HOUR + i * 1000)
      add(tenant, finished_at, i % 4 === 0 ? 'partial' : 'success')
      add('', finished_at, 'success')
    })
  }
  add('t-failing', at(-2 * HOUR), 'error')
  add('t-running', null, 'running')

  const tenants = [...established, 't-new', 't-new-b', 't-stopped', 't-failing', 't-running']
  const connections = tenants.map((t, i) => conn({ id: `c-${i}`, business_id: `b-${i}`, tenant_id: t, tenant_name: `Org ${t}` }))
  return { jobs, connections }
}

describe('getXeroSyncCoverage', () => {
  describe.each([
    ['through last_xero_sync_by_tenant', 'deployed' as const],
    ['page by page while the function is not applied', 'missing' as const],
  ])('%s', (_label, mode) => {
    it('a connection with a recent successful job is covered', async () => {
      const c = await getXeroSyncCoverage(
        fakeClient({
          clock: mode,
          xero_connections: { data: [conn()], error: null },
          sync_jobs: { data: [job('t1')], error: null },
        }),
        NOW,
      )
      expect(c.ok).toBe(true)
      expect(c.expected).toBe(1)
      expect(c.covered).toBe(1)
      expect(c.missing).toEqual([])
    })

    it('THE POINT: a connection with NO job at all is missing', async () => {
      // A cron that times out mid-fleet leaves its unreached studios exactly like
      // this — nothing anywhere. No other check in the system notices.
      const c = await getXeroSyncCoverage(
        fakeClient({
          clock: mode,
          xero_connections: { data: [conn(), conn({ id: 'c2', business_id: 'b2', tenant_id: 't2', tenant_name: 'Studio Two' })], error: null },
          sync_jobs: { data: [job('t1')], error: null },
        }),
        NOW,
      )
      expect(c.expected).toBe(2)
      expect(c.covered).toBe(1)
      expect(c.missing).toEqual([
        { connectionId: 'c2', businessId: 'b2', tenantId: 't2', tenantName: 'Studio Two' },
      ])
    })

    it('a whole fleet with no jobs reports every one of them, not a bare zero', async () => {
      const conns = Array.from({ length: 35 }, (_, i) =>
        conn({ id: `c${i}`, business_id: `b${i}`, tenant_id: `t${i}`, tenant_name: `Studio ${i}` }),
      )
      const c = await getXeroSyncCoverage(
        fakeClient({
          clock: mode,
          xero_connections: { data: conns, error: null },
          sync_jobs: { data: [], error: null },
        }),
        NOW,
      )
      expect(c.ok).toBe(true)
      expect(c.expected).toBe(35)
      expect(c.covered).toBe(0)
      expect(c.missing).toHaveLength(35)
    })

    it('a failed sync_jobs read is ok:false, not a fleet-wide false alarm', async () => {
      // The opposite failure mode matters too: treating an unreadable sync_jobs as
      // "nobody synced" would page someone about 35 studios that are all fine.
      const c = await getXeroSyncCoverage(
        fakeClient({
          clock: mode,
          xero_connections: { data: [conn()], error: null },
          sync_jobs: { data: null, error: { message: 'boom' } },
        }),
        NOW,
      )
      expect(c.ok).toBe(false)
      expect(c.error).toMatch(/sync clock lookup failed: .*boom/)
      expect(c.missing).toEqual([])
    })

    it("ignores the outer per-business sync_jobs row, whose tenant_id is ''", async () => {
      // About half of sync_jobs carries tenant_id = ''. Treating it as a match
      // would mark a studio covered on the strength of a row belonging to nobody.
      const c = await getXeroSyncCoverage(
        fakeClient({
          clock: mode,
          xero_connections: { data: [conn()], error: null },
          sync_jobs: { data: [job(''), job(null)], error: null },
        }),
        NOW,
      )
      expect(c.ok).toBe(true)
      expect(c.covered).toBe(0)
      expect(c.missing).toHaveLength(1)
    })

    it('a partial job covers its connection; a failed or unfinished one does not', async () => {
      const c = await getXeroSyncCoverage(
        fakeClient({
          clock: mode,
          xero_connections: {
            data: [
              conn(),
              conn({ id: 'c2', business_id: 'b2', tenant_id: 't2', tenant_name: 'Studio Two' }),
              conn({ id: 'c3', business_id: 'b3', tenant_id: 't3', tenant_name: 'Studio Three' }),
            ],
            error: null,
          },
          sync_jobs: { data: [job('t1', 1, 'partial'), job('t2', 1, 'error'), { tenant_id: 't3', finished_at: null, status: 'running' }], error: null },
        }),
        NOW,
      )
      expect(c.covered).toBe(1)
      expect(c.missing.map((m) => m.tenantId)).toEqual(['t2', 't3'])
    })

    it('the window runs back from the nowMs it is given: a job at the start counts, a millisecond earlier does not', async () => {
      // NOW is July 2026. A window measured from the real clock would contain
      // neither job and report both connections missing.
      const start = NOW - SYNC_COVERAGE_WINDOW_MS
      const c = await getXeroSyncCoverage(
        fakeClient({
          clock: mode,
          xero_connections: { data: [conn(), conn({ id: 'c2', business_id: 'b2', tenant_id: 't2', tenant_name: 'Studio Two' })], error: null },
          sync_jobs: {
            data: [
              { tenant_id: 't1', finished_at: new Date(start).toISOString(), status: 'success' },
              { tenant_id: 't2', finished_at: new Date(start - 1).toISOString(), status: 'success' },
            ],
            error: null,
          },
        }),
        NOW,
      )
      expect(c.ok).toBe(true)
      expect(c.missing.map((m) => m.tenantId)).toEqual(['t2'])
    })

    it('a window of more than 1,000 jobs covers every tenant that synced — only the ones that did not are missing', async () => {
      const { jobs, connections } = busyWindow()
      const inWindow = jobs.filter((j) => isSynced(j) && j.finished_at != null && Date.parse(j.finished_at) >= NOW - SYNC_COVERAGE_WINDOW_MS)
      expect(inWindow.length).toBeGreaterThan(1000)

      const c = await getXeroSyncCoverage(
        fakeClient({
          clock: mode,
          xero_connections: { data: connections, error: null },
          sync_jobs: { data: jobs, error: null },
        }),
        NOW,
      )

      expect(c.ok).toBe(true)
      expect(c.expected).toBe(155)
      expect(c.missing.map((m) => m.tenantId).sort()).toEqual(['t-failing', 't-running', 't-stopped'])
      expect(c.covered).toBe(152)
      expect(describeSyncCoverage(c)).toMatch(/^3 of 155 Xero connections did NOT sync/)

      if (mode === 'deployed') {
        // One call for exactly this window, one value back — no job rows for a
        // row cap to cut short.
        expect(rpcCalls).toEqual([
          { fn: 'last_xero_sync_by_tenant', args: { p_since: new Date(NOW - SYNC_COVERAGE_WINDOW_MS).toISOString() } },
        ])
        expect(jobReads).toHaveLength(0)
      } else {
        // Every successful job in the window, in capped pages, ended only by an
        // empty page.
        expect(jobReads.reduce((sum, rows) => sum + rows, 0)).toBe(inWindow.length)
        expect(jobReads.every((rows) => rows <= ROW_CAP)).toBe(true)
        expect(jobReads[jobReads.length - 1]).toBe(0)
      }
    })
  })

  it('the busy window really does break the read this module used to make', async () => {
    // Pins that the >1,000-job case above can fail. This is the old query, run
    // against the same stand-in: it gets the oldest 1,000 rows and never sees
    // the two newest orgs, so both would have been reported as not syncing.
    const { jobs } = busyWindow()
    const client: { from: (table: string) => any } = fakeClient({ sync_jobs: { data: jobs, error: null } })
    const { data } = await client
      .from('sync_jobs')
      .select('tenant_id')
      .in('status', ['success', 'partial'])
      .gte('finished_at', at(-SYNC_COVERAGE_WINDOW_MS))
    expect(data).toHaveLength(1000)
    const seen = new Set((data as Job[]).map((j) => j.tenant_id))
    expect(seen.has('t-001')).toBe(true)
    expect(seen.has('t-new')).toBe(false)
    expect(seen.has('t-new-b')).toBe(false)
  })

  it('any other clock failure is ok:false, names the cause, and does not fall back to reading jobs', async () => {
    const c = await getXeroSyncCoverage(
      fakeClient({
        xero_connections: { data: [conn()], error: null },
        sync_jobs: { data: [job('t1')], error: null },
        clock: { data: null, error: { code: '42501', message: 'permission denied for function last_xero_sync_by_tenant' } },
      }),
      NOW,
    )
    expect(c.ok).toBe(false)
    expect(c.error).toMatch(/sync clock lookup failed: .*permission denied/)
    expect(c.missing).toEqual([])
    expect(jobReads).toHaveLength(0)
    expect(describeSyncCoverage(c)).toMatch(/UNKNOWN/)
  })

  it('a clock reply that is not the object the function returns is ok:false, not every connection missing', async () => {
    const c = await getXeroSyncCoverage(
      fakeClient({
        xero_connections: { data: [conn()], error: null },
        clock: { data: null, error: null },
      }),
      NOW,
    )
    expect(c.ok).toBe(false)
    expect(c.error).toMatch(/sync clock lookup failed/)
    expect(c.missing).toEqual([])
  })

  it("trims the clock's tenant ids and drops blank ones", async () => {
    const c = await getXeroSyncCoverage(
      fakeClient({
        xero_connections: { data: [conn(), conn({ id: 'c2', business_id: 'b2', tenant_id: ' t2 ', tenant_name: 'Studio Two' })], error: null },
        clock: { data: { ' t1 ': at(-HOUR), '   ': at(-HOUR) }, error: null },
      }),
      NOW,
    )
    expect(c.ok).toBe(true)
    expect(c.covered).toBe(1)
    expect(c.missing).toEqual([
      { connectionId: 'c2', businessId: 'b2', tenantId: 't2', tenantName: 'Studio Two' },
    ])
  })

  it('a failed connection query is ok:false — NEVER "nothing is missing"', async () => {
    // The equivalence between "no problems found" and "could not look" is the
    // mistake this entire area kept making.
    const c = await getXeroSyncCoverage(
      fakeClient({ xero_connections: { data: null, error: { message: 'boom' } } }),
      NOW,
    )
    expect(c.ok).toBe(false)
    expect(c.error).toMatch(/connection query failed/)
    expect(c.missing).toEqual([])
  })

  it('a blank tenant_id is counted as uncheckable, not silently dropped', async () => {
    // Dropping it from the denominator would flatter the coverage number:
    // "1 of 1 synced" while a second connection is unverifiable.
    const c = await getXeroSyncCoverage(
      fakeClient({
        xero_connections: { data: [conn(), conn({ id: 'c2', tenant_id: '   ' }), conn({ id: 'c3', tenant_id: null })], error: null },
        sync_jobs: { data: [job('t1')], error: null },
      }),
      NOW,
    )
    expect(c.expected).toBe(1)
    expect(c.covered).toBe(1)
    expect(c.uncheckable).toBe(2)
  })

  it('no active connections is genuinely clean, not an alarm — and reads no clock', async () => {
    const c = await getXeroSyncCoverage(fakeClient({ xero_connections: { data: [], error: null } }), NOW)
    expect(c.ok).toBe(true)
    expect(c.expected).toBe(0)
    expect(c.missing).toEqual([])
    expect(describeSyncCoverage(c)).toBeNull()
    expect(rpcCalls).toHaveLength(0)
  })

  it('the window is 26h, not 24h — the check runs 15h after the sync', () => {
    expect(SYNC_COVERAGE_WINDOW_MS).toBe(26 * HOUR)
  })
})

describe('describeSyncCoverage', () => {
  const base = { ok: true as const, error: null, expected: 0, covered: 0, missing: [], uncheckable: 0 }

  it('says nothing when there is nothing to say', () => {
    expect(describeSyncCoverage({ ...base, expected: 5, covered: 5 })).toBeNull()
  })

  it('names the studios rather than only counting them', () => {
    const line = describeSyncCoverage({
      ...base,
      expected: 3,
      covered: 1,
      missing: [
        { connectionId: 'c1', businessId: 'b1', tenantId: 't1', tenantName: 'Caringbah Pty Ltd' },
        { connectionId: 'c2', businessId: 'b2', tenantId: 't2', tenantName: null },
      ],
    })
    expect(line).toMatch(/2 of 3/)
    expect(line).toMatch(/Caringbah Pty Ltd/)
    expect(line).toMatch(/t2/) // falls back to the tenant id when unnamed
  })

  it('caps the list at 10 and says how many more', () => {
    const missing = Array.from({ length: 14 }, (_, i) => ({
      connectionId: `c${i}`, businessId: `b${i}`, tenantId: `t${i}`, tenantName: `Studio ${i}`,
    }))
    expect(describeSyncCoverage({ ...base, expected: 14, covered: 0, missing })).toMatch(/\+4 more/)
  })

  it('an unknown result says UNKNOWN, and does not imply everything is fine', () => {
    const line = describeSyncCoverage({ ...base, ok: false, error: 'boom' })
    expect(line).toMatch(/UNKNOWN/)
  })
})
