/**
 * GET /api/cfo/board — the connection column for multi-org businesses.
 *
 * 15 Sep 2026: the board reduced each business's xero_connections rows to ONE
 * representative (the most recently written active row) and classified only
 * that. Token refreshes and syncs both bump updated_at, so for IICT Group —
 * three orgs, one of them (IICT Group Pty Ltd) failing every sync since
 * 10 Sep — the row read "No fresh data" only while the failing org was the
 * latest write, and "Xero OK" after any sibling's sync. These cases drive the
 * exported GET, not the classifier alone, so the wiring is what is pinned.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()

/** Per-table query result. Every filter/order call is ignored: rows come back
 *  in fixture order, which is exactly what the classification must not care about. */
let tables: Record<string, { data: unknown; error: { message: string } | null }> = {}

function chainFor(table: string) {
  const result = () => tables[table] ?? { data: [], error: null }
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => {
      const r = result()
      return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
    },
    then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

/** The sync clock the route reads: last_xero_sync_by_tenant over the sync_jobs fixture — each tenant's newest finish, or its error. */
async function rpcFor(fn: string) {
  if (fn !== 'last_xero_sync_by_tenant') throw new Error(`unexpected rpc ${fn}`)
  const jobs = tables.sync_jobs ?? { data: [], error: null }
  if (jobs.error) return { data: null, error: jobs.error }
  const latest: Record<string, string> = {}
  for (const j of (jobs.data ?? []) as { tenant_id: string; finished_at: string }[]) {
    if (!latest[j.tenant_id] || Date.parse(j.finished_at) > Date.parse(latest[j.tenant_id])) latest[j.tenant_id] = j.finished_at
  }
  return { data: latest, error: null }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (table: string) => chainFor(table), rpc: (fn: string) => rpcFor(fn) })),
}))

const HOUR = 60 * 60 * 1000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const tokenFresh = () => new Date(Date.now() + 25 * 60 * 1000).toISOString()

interface Conn {
  id: string
  business_id: string
  tenant_id: string
  tenant_name: string
  include_in_consolidation?: boolean
  is_active: boolean
  last_synced_at: string | null
  updated_at: string
  expires_at: string
  created_at: string
}

const conn = (over: Partial<Conn> & Pick<Conn, 'id' | 'tenant_id' | 'tenant_name'>): Conn => ({
  business_id: 'biz-iict',
  is_active: true,
  last_synced_at: ago(3 * HOUR),
  updated_at: ago(60_000),
  expires_at: tokenFresh(),
  created_at: '2026-05-30T01:46:29.451Z',
  ...over,
})

function setFleet(opts: {
  businesses?: { id: string; name: string }[]
  profiles?: { id: string; business_id: string }[]
  connections: Conn[]
  syncJobs?: { tenant_id: string; finished_at: string }[]
  syncJobsError?: { message: string }
}) {
  tables = {
    system_roles: { data: [{ role: 'super_admin' }], error: null },
    businesses: {
      data: (opts.businesses ?? [{ id: 'biz-iict', name: 'IICT Group' }]).map(b => ({ ...b, assigned_coach_id: null })),
      error: null,
    },
    business_profiles: { data: opts.profiles ?? [], error: null },
    xero_connections: { data: opts.connections, error: null },
    monthly_report_settings: { data: [], error: null },
    cfo_report_status: { data: [], error: null },
    reconciliation_checks: { data: [], error: null },
    reconciliation_snapshots: { data: [], error: null },
    sync_jobs: opts.syncJobsError
      ? { data: null, error: opts.syncJobsError }
      : { data: opts.syncJobs ?? [], error: null },
    reconciliation_dashboard_captures: { data: [], error: null },
    recon_round_requests: { data: [], error: null },
  }
}

async function boardConnection(businessName = 'IICT Group') {
  const { GET } = await import('@/app/api/cfo/board/route')
  const res = await GET(new NextRequest('http://localhost/api/cfo/board?month=2026-08'))
  expect(res.status).toBe(200)
  const body = await res.json()
  const client = body.clients.find((c: { business_name: string }) => c.business_name === businessName)
  expect(client).toBeDefined()
  return client.connection
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
})

describe('GET /api/cfo/board — a multi-org business is as healthy as its worst org', () => {
  const lastGoodPty = ago(106 * HOUR) // 10 Sep 16:11 UTC, seen from 15 Sep 02:00
  const aust = conn({ id: 'f9c98d7f', tenant_id: 't-aust', tenant_name: 'IICT (Aust) Pty Ltd' })
  const pty = conn({ id: '4bd37c02', tenant_id: 't-pty', tenant_name: 'IICT Group Pty Ltd', last_synced_at: lastGoodPty })
  const hk = conn({ id: '09cad39a', tenant_id: 't-hk', tenant_name: 'IICT Group Limited' })

  it('IICT Group reads "No fresh data: IICT Group Pty Ltd" whichever org was written last, in any row order', async () => {
    const stamps = [ago(30_000), ago(60_000), ago(90_000)]
    const seen: unknown[] = []
    for (let latest = 0; latest < 3; latest++) {
      const restamped = [aust, pty, hk].map((c, i) => ({ ...c, updated_at: stamps[(i + latest) % 3] }))
      for (const order of [restamped, [...restamped].reverse(), [restamped[1], restamped[2], restamped[0]]]) {
        setFleet({ connections: order })
        const connection = await boardConnection()
        // The names list follows the query's ORDER BY created_at, id — which
        // this mock ignores — so only its contents are compared.
        seen.push({ ...connection, tenant_names: [...connection.tenant_names].sort() })
      }
    }
    const first = seen[0] as Record<string, unknown>
    for (const s of seen) expect(s).toEqual(first)
    expect(first).toMatchObject({
      status: 'data_stale',
      needs_attention: true,
      status_scope: 'IICT Group Pty Ltd',
      tenant_count: 3,
      last_sync_at: new Date(lastGoodPty).toISOString(),
    })
  })

  it('judges each org on its own tenant’s sync_jobs clock when the column is empty', async () => {
    setFleet({
      connections: [aust, pty, hk].map(c => ({ ...c, last_synced_at: null })),
      syncJobs: [
        { tenant_id: 't-aust', finished_at: ago(2 * HOUR) },
        { tenant_id: 't-hk', finished_at: ago(2 * HOUR) },
        { tenant_id: 't-pty', finished_at: lastGoodPty },
      ],
    })
    expect(await boardConnection()).toMatchObject({ status: 'data_stale', status_scope: 'IICT Group Pty Ltd' })
  })

  it('every org healthy reads connected, with no org named', async () => {
    setFleet({
      businesses: [{ id: 'biz-dragon', name: 'Dragon Roofing' }],
      connections: [
        conn({ id: '9eb65be5', business_id: 'biz-dragon', tenant_id: 't-dragon', tenant_name: 'Dragon Roofing Pty Ltd' }),
        conn({ id: 'd85f3cef', business_id: 'biz-dragon', tenant_id: 't-easyhail', tenant_name: 'EASY HAIL CLAIM PTY LTD' }),
      ],
    })
    expect(await boardConnection('Dragon Roofing')).toMatchObject({
      status: 'connected',
      needs_attention: false,
      status_scope: null,
      tenant_count: 2,
    })
  })

  it('a failed sync_jobs lookup is "Health unknown" for the whole business, never green', async () => {
    setFleet({ connections: [aust, pty, hk], syncJobsError: { message: 'statement timeout' } })
    expect(await boardConnection()).toMatchObject({ status: 'unknown', needs_attention: true, status_scope: null })
  })

  it('a row filed under the business_profiles id is still one of the business’s orgs', async () => {
    setFleet({
      profiles: [{ id: 'prof-iict', business_id: 'biz-iict' }],
      connections: [aust, { ...pty, business_id: 'prof-iict' }, hk],
    })
    expect(await boardConnection()).toMatchObject({ status: 'data_stale', status_scope: 'IICT Group Pty Ltd', tenant_count: 3 })
  })

  it('surfaces a dead org the board exists to show — and lists every org with its own state', async () => {
    // Easy Hail refused by Xero while Dragon Roofing's token stopped refreshing:
    // the row names the worst and counts the other, the panel lists all three.
    setFleet({
      businesses: [{ id: 'biz-dragon', name: 'Dragon Roofing' }],
      connections: [
        conn({ id: 'c-ok', business_id: 'biz-dragon', tenant_id: 't-ok', tenant_name: 'Dragon Holdings' }),
        conn({ id: 'c-auth', business_id: 'biz-dragon', tenant_id: 't-auth', tenant_name: 'Dragon Roofing Pty Ltd', expires_at: ago(13 * HOUR) }),
        conn({ id: 'c-dead', business_id: 'biz-dragon', tenant_id: 't-dead', tenant_name: 'EASY HAIL CLAIM PTY LTD', is_active: false }),
      ],
    })
    const connection = await boardConnection('Dragon Roofing')
    expect(connection).toMatchObject({
      status: 'dead',
      needs_attention: true,
      status_scope: 'EASY HAIL CLAIM PTY LTD',
      more_orgs_needing_attention: 1,
      tenant_count: 2,
    })
    expect(connection.orgs.map((o: { tenant_name: string; status: string; needs_attention: boolean; retired: boolean }) =>
      [o.tenant_name, o.status, o.needs_attention, o.retired])).toEqual([
      ['EASY HAIL CLAIM PTY LTD', 'dead', true, false],
      ['Dragon Roofing Pty Ltd', 'auth_stale', true, false],
      ['Dragon Holdings', 'connected', false, false],
    ])
  })

  it('an org retired on purpose is listed as retired and no longer holds the row red', async () => {
    setFleet({
      businesses: [{ id: 'biz-dragon', name: 'Dragon Roofing' }],
      connections: [
        conn({ id: 'c-ok', business_id: 'biz-dragon', tenant_id: 't-ok', tenant_name: 'Dragon Roofing Pty Ltd' }),
        conn({ id: 'c-gone', business_id: 'biz-dragon', tenant_id: 't-gone', tenant_name: 'Wound Up Pty Ltd', is_active: false, include_in_consolidation: false }),
      ],
    })
    const connection = await boardConnection('Dragon Roofing')
    expect(connection).toMatchObject({ status: 'connected', needs_attention: false, status_scope: null })
    expect(connection.orgs.at(-1)).toMatchObject({ tenant_name: 'Wound Up Pty Ltd', retired: true, needs_attention: false })
  })
})
