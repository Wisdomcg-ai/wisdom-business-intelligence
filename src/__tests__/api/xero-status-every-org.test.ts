/**
 * GET /api/Xero/status — one business, every org (15 Sep 2026).
 *
 * The route used to report `connections[0]` of the business's ACTIVE rows as the
 * business. IICT Group's three rows share one created_at, so that was the lowest
 * id — IICT Group Limited, which syncs fine — and the monthly-report banner read
 * "Connected to Xero: IICT Group Limited · Last synced today" while IICT Group Pty
 * Ltd had not synced since 10 Sep. Only that org's token was refreshed, a dead
 * org was invisible, and a failed read came back as "not connected".
 *
 * These cases go through the exported GET (withQuerySchema wrapper included):
 *   auth & access           401 / 400 / 404 / 403, team member and super admin admitted
 *   every org               IICT worst-org headline, row order irrelevant, every live token refreshed
 *   dead orgs               orphan dead org → dead; superseded by a reconnect → not; all dead → not connected
 *   a refusal mid-check     the re-read row speaks, not the pre-refresh one
 *   could-not-check         failed reads are 500s; a failed sync lookup is unknown, never green
 *   the data clock          per tenant, filtered to the business's tenants
 *   audience                owner/team member get 72h, a coach 48h
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockRouteHandlerFrom = vi.fn()
const mockAdminFrom = vi.fn()
const mockGetValidAccessToken = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockRouteHandlerFrom,
  })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockAdminFrom })),
}))

// Only the refresh is faked; checkConnectionHealth stays real.
vi.mock('@/lib/xero/token-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xero/token-manager')>()
  return { ...actual, getValidAccessToken: mockGetValidAccessToken }
})

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

interface Row {
  id: string
  business_id: string
  tenant_id: string | null
  tenant_name: string | null
  display_name?: string | null
  include_in_consolidation: boolean | null
  is_active: boolean | null
  last_synced_at: string | null
  updated_at: string | null
  expires_at: string | null
  created_at: string | null
}

const IICT = 'biz-iict'
const OWNER = 'user-owner'
const COACH = 'user-coach'

/** A healthy org: token granted 10 minutes ago, synced two hours ago. */
const org = (over: Partial<Row>): Row => ({
  id: 'conn-x',
  business_id: IICT,
  tenant_id: 't-x',
  tenant_name: 'Org',
  include_in_consolidation: true,
  is_active: true,
  last_synced_at: iso(-2 * HOUR),
  updated_at: iso(-1 * MIN),
  expires_at: iso(20 * MIN),
  created_at: '2026-05-30T01:46:29.451Z',
  ...over,
})

/**
 * IICT Group as it stood on 15 Sep 2026: three rows, one created_at, so the old
 * pick was the lowest id — IICT Group Limited. IICT Group Pty Ltd's numbers are
 * five days old.
 */
const iictRows = (): Row[] => [
  org({ id: '09cad39a', tenant_id: 't-limited', tenant_name: 'IICT Group Limited' }),
  org({ id: '4bd37c02', tenant_id: 't-pty', tenant_name: 'IICT Group Pty Ltd', last_synced_at: iso(-5 * DAY) }),
  org({ id: 'f9c98d7f', tenant_id: 't-aust', tenant_name: 'IICT (Aust) Pty Ltd' }),
]

interface World {
  business?: { id: string; owner_id: string | null; assigned_coach_id: string | null } | null
  businessError?: { code?: string; message: string }
  memberUserIds?: string[]
  profiles?: { id: string; business_id: string }[]
  connections: Row[]
  /** What the re-read after the refreshes returns; defaults to `connections`. */
  rereadConnections?: Row[]
  connectionsError?: { message: string }
  rereadError?: { message: string }
  syncJobs?: { tenant_id: string; finished_at: string }[]
  syncJobsError?: { message: string }
  role?: string
}

let xeroReads = 0
let syncJobsReads = 0
let syncTenantFilters: string[][] = []

function configure(user: { id: string } | null, w: World) {
  xeroReads = 0
  syncJobsReads = 0
  syncTenantFilters = []
  mockGetUser.mockResolvedValue({ data: { user }, error: null })

  mockRouteHandlerFrom.mockImplementation((table: string) => {
    if (table === 'system_roles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: w.role ? { role: w.role } : null, error: null }),
          }),
        }),
      }
    }
    throw new Error(`route client: unconfigured table "${table}"`)
  })

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'businesses') {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: w.businessError ? null : w.business === undefined ? { id: IICT, owner_id: OWNER, assigned_coach_id: COACH } : w.business,
          error: w.businessError ?? null,
        }),
      }
      return chain
    }
    if (table === 'business_users') {
      let userId = ''
      const chain: any = {
        select: () => chain,
        eq: (col: string, v: string) => {
          if (col === 'user_id') userId = v
          return chain
        },
        limit: async () => ({ data: (w.memberUserIds ?? []).includes(userId) ? [{ id: 'bu-1' }] : [], error: null }),
      }
      return chain
    }
    if (table === 'business_profiles') {
      let col = ''
      let val = ''
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: string) => {
          col = c
          val = v
          return chain
        },
        maybeSingle: async () => ({
          data: (w.profiles ?? []).find((p) => (p as Record<string, string>)[col] === val) ?? null,
          error: null,
        }),
      }
      return chain
    }
    if (table === 'xero_connections') {
      const read = xeroReads++
      let ids: string[] = []
      const chain: any = {
        select: () => chain,
        in: (_col: string, v: string[]) => {
          ids = v
          return chain
        },
        order: () => chain,
        then: (resolve: any, reject: any) => {
          const error = read === 0 ? w.connectionsError : w.rereadError
          const source = read === 0 ? w.connections : w.rereadConnections ?? w.connections
          return Promise.resolve(
            error ? { data: null, error } : { data: source.filter((r) => ids.includes(r.business_id)), error: null },
          ).then(resolve, reject)
        },
      }
      return chain
    }
    if (table === 'sync_jobs') {
      syncJobsReads++
      let tenants: string[] | null = null
      const chain: any = {
        select: () => chain,
        in: (col: string, v: string[]) => {
          if (col === 'tenant_id') {
            tenants = v
            syncTenantFilters.push(v)
          }
          return chain
        },
        gte: () => chain,
        then: (resolve: any, reject: any) =>
          Promise.resolve(
            w.syncJobsError
              ? { data: null, error: w.syncJobsError }
              : { data: (w.syncJobs ?? []).filter((j) => !tenants || tenants.includes(j.tenant_id)), error: null },
          ).then(resolve, reject),
      }
      return chain
    }
    throw new Error(`admin client: unconfigured table "${table}"`)
  })
}

const req = (businessId: string | null) =>
  new NextRequest(
    businessId ? `http://localhost/api/Xero/status?business_id=${businessId}` : 'http://localhost/api/Xero/status',
    { method: 'GET' },
  )

/** `null` sends no business_id at all. */
async function getStatus(businessId: string | null = IICT) {
  const { GET } = await import('@/app/api/Xero/status/route')
  const res = await GET(req(businessId))
  return { res, body: await res.json() }
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockRouteHandlerFrom.mockReset()
  mockAdminFrom.mockReset()
  mockGetValidAccessToken.mockReset()
  mockGetValidAccessToken.mockResolvedValue({ success: true, accessToken: 'fresh' })
})

describe('GET /api/Xero/status — auth and access', () => {
  it('401 when unauthenticated', async () => {
    configure(null, { connections: [] })
    const { res } = await getStatus()
    expect(res.status).toBe(401)
  })

  it('400 without a business_id', async () => {
    configure({ id: OWNER }, { connections: [] })
    const { res } = await getStatus(null)
    expect(res.status).toBe(400)
  })

  it('404 for a business that does not exist — including a malformed id, which is not a failed check', async () => {
    configure({ id: OWNER }, { business: null, connections: [] })
    expect((await getStatus()).res.status).toBe(404)

    configure({ id: OWNER }, { businessError: { code: '22P02', message: 'invalid input syntax for type uuid' }, connections: [] })
    expect((await getStatus('undefined')).res.status).toBe(404)
  })

  it('a failed businesses read is a 500, not a 404', async () => {
    configure({ id: OWNER }, { businessError: { code: '57014', message: 'canceling statement' }, connections: [] })
    expect((await getStatus()).res.status).toBe(500)
  })

  it('403 for someone with no relationship to the business, and nothing is refreshed', async () => {
    configure({ id: 'user-stranger' }, { connections: iictRows() })
    const { res } = await getStatus()
    expect(res.status).toBe(403)
    expect(mockGetValidAccessToken).not.toHaveBeenCalled()
  })

  it('an active team member is admitted — the xero_connections RLS policy already lets them read these rows', async () => {
    configure({ id: 'user-team' }, { memberUserIds: ['user-team'], connections: iictRows() })
    const { res, body } = await getStatus()
    expect(res.status).toBe(200)
    expect(body.status).toBe('data_stale')
  })

  it('a super admin is admitted', async () => {
    configure({ id: 'user-admin' }, { role: 'super_admin', connections: iictRows() })
    expect((await getStatus()).res.status).toBe(200)
  })
})

describe('GET /api/Xero/status — a business is every one of its orgs', () => {
  it('THE REGRESSION TEST: IICT Group reads data_stale and names IICT Group Pty Ltd — not "connected" to the lowest-id org', async () => {
    configure({ id: COACH }, { connections: iictRows() })
    const { res, body } = await getStatus()

    expect(res.status).toBe(200)
    expect(body.status).toBe('data_stale')
    expect(body.status_scope).toBe('IICT Group Pty Ltd')
    expect(body.more_orgs_needing_attention).toBe(0)
    // The headline org's own clock — five days old, not a sibling's "today".
    expect(Date.now() - Date.parse(body.last_sync_at)).toBeGreaterThan(4 * DAY)
    expect(body.orgs.map((o: { tenant_name: string }) => o.tenant_name)).toEqual([
      'IICT Group Pty Ltd',
      // healthy orgs follow, oldest sync first — both synced at the same moment here, so by name
      'IICT (Aust) Pty Ltd',
      'IICT Group Limited',
    ])
    expect(body.orgs[0].status).toBe('data_stale')
    expect(body.orgs[0].display_name).toBeNull()
    expect(body.orgs.slice(1).every((o: { status: string }) => o.status === 'connected')).toBe(true)

    // Legacy fields describe the business: a live org exists, nobody must reconnect,
    // and `connection` is the headline org, never IICT Group Limited.
    expect(body.connected).toBe(true)
    expect(body.expired).toBe(false)
    expect(body.needsReconnect).toBe(false)
    expect(body.connection.tenant_name).toBe('IICT Group Pty Ltd')
    expect(body.connection.id).toBe('4bd37c02')
  })

  it('refreshes the token of EVERY live org — the keepalive used to keep only one alive', async () => {
    configure({ id: OWNER }, { connections: iictRows() })
    await getStatus()
    expect(mockGetValidAccessToken.mock.calls.map(([arg]) => arg).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: '09cad39a' },
      { id: '4bd37c02' },
      { id: 'f9c98d7f' },
    ])
  })

  it('the answer does not depend on the order the rows arrive in', async () => {
    const rows = iictRows()
    configure({ id: COACH }, { connections: rows })
    const forward = (await getStatus()).body
    configure({ id: COACH }, { connections: [...rows].reverse() })
    const reversed = (await getStatus()).body

    for (const key of ['status', 'status_scope', 'last_sync_at', 'connection', 'orgs', 'connected', 'expired'] as const) {
      expect(reversed[key]).toEqual(forward[key])
    }
  })

  it('Dragon Roofing — two healthy orgs read connected, business-wide, with both named and the older sync as the clock', async () => {
    const dragon = 'biz-dragon'
    const rows = [
      org({ id: '9eb65be5', business_id: dragon, tenant_id: 't-dragon', tenant_name: 'Dragon Roofing Pty Ltd', last_synced_at: iso(-3 * HOUR) }),
      org({ id: 'd85f3cef', business_id: dragon, tenant_id: 't-hail', tenant_name: 'EASY HAIL CLAIM PTY LTD', last_synced_at: iso(-1 * HOUR) }),
    ]
    configure({ id: OWNER }, { business: { id: dragon, owner_id: OWNER, assigned_coach_id: COACH }, connections: rows })
    const { body } = await getStatus(dragon)

    expect(body.status).toBe('connected')
    expect(body.status_scope).toBeNull()
    expect(body.orgs).toHaveLength(2)
    expect(body.last_sync_at).toBe(rows[0].last_synced_at)
    expect(body.health.isHealthy).toBe(true)
  })

  it('each org carries the name an admin gave it, while the status wording keeps the Xero name', async () => {
    const rows = iictRows()
    rows[1] = { ...rows[1], display_name: ' IICT Pty (AU) ' }
    configure({ id: COACH }, { connections: rows })
    const { body } = await getStatus()
    expect(body.status_scope).toBe('IICT Group Pty Ltd')
    expect(body.orgs[0]).toMatchObject({ tenant_name: 'IICT Group Pty Ltd', display_name: 'IICT Pty (AU)' })
  })

  it('no rows at all is "none" — and nothing is refreshed or looked up', async () => {
    configure({ id: OWNER }, { connections: [] })
    const { res, body } = await getStatus()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      status: 'none',
      connected: false,
      expired: false,
      needsReconnect: false,
      connection: null,
      orgs: [],
      retired_orgs: [],
    })
    expect(mockGetValidAccessToken).not.toHaveBeenCalled()
    expect(syncJobsReads).toBe(0)
  })
})

describe('GET /api/Xero/status — dead orgs', () => {
  it('a disconnected org with no live row makes the business dead, named — and siblings keep the business "connected" for sync', async () => {
    const rows = iictRows()
    rows[2] = { ...rows[2], is_active: false, expires_at: iso(-30 * DAY) }
    configure({ id: COACH }, { connections: rows })
    const { body } = await getStatus()

    expect(body.status).toBe('dead')
    expect(body.status_scope).toBe('IICT (Aust) Pty Ltd')
    // IICT Group Pty Ltd's old numbers are not hidden behind the worse org.
    expect(body.more_orgs_needing_attention).toBe(1)
    expect(body.expired).toBe(true)
    expect(body.needsReconnect).toBe(true)
    expect(body.connected).toBe(true)
    // A dead row is not refreshed here — that is what reactivate is for.
    expect(mockGetValidAccessToken.mock.calls.map(([arg]) => arg.id)).not.toContain('f9c98d7f')
  })

  it('a dead row superseded by a reconnect of the SAME org under the other id form does not read dead', async () => {
    const profileId = 'prof-iict'
    const rows = [
      org({ id: 'april-dead', business_id: profileId, tenant_id: 't-limited', tenant_name: 'IICT Group Limited', is_active: false, expires_at: '2026-05-22T22:33:11.063Z' }),
      org({ id: 'may-live', business_id: IICT, tenant_id: 't-limited', tenant_name: 'IICT Group Limited' }),
    ]
    configure({ id: OWNER }, { profiles: [{ id: profileId, business_id: IICT }], connections: rows })
    const { body } = await getStatus()

    expect(body.status).toBe('connected')
    expect(body.orgs).toHaveLength(1)
    expect(body.expired).toBe(false)
  })

  it('every org dead: dead, not connected — it used to read "Not connected to Xero", as if it had never been', async () => {
    const rows = iictRows().map((r) => ({ ...r, is_active: false }))
    configure({ id: OWNER }, { connections: rows })
    const { body } = await getStatus()

    expect(body.status).toBe('dead')
    expect(body.status_scope).toBeNull()
    expect(body.connected).toBe(false)
    expect(body.expired).toBe(true)
    expect(body.connection).not.toBeNull()
    expect(mockGetValidAccessToken).not.toHaveBeenCalled()
  })

  it('an org retired on purpose sets nothing, and is listed apart', async () => {
    const rows = iictRows()
    rows[1] = { ...rows[1], is_active: false, include_in_consolidation: false }
    configure({ id: COACH }, { connections: rows })
    const { body } = await getStatus()

    expect(body.status).toBe('connected')
    expect(body.orgs).toHaveLength(2)
    expect(body.retired_orgs.map((o: { tenant_name: string }) => o.tenant_name)).toEqual(['IICT Group Pty Ltd'])
  })

  it('Xero refusing a token during the check: the re-read row (now inactive) is what gets classified', async () => {
    const before = iictRows()
    const after = before.map((r) => (r.id === '4bd37c02' ? { ...r, is_active: false } : r))
    mockGetValidAccessToken.mockImplementation(async ({ id }: { id: string }) =>
      id === '4bd37c02'
        ? { success: false, error: 'token_expired_permanently', message: 'Refresh token has expired', shouldDeactivate: true }
        : { success: true, accessToken: 'fresh' },
    )
    configure({ id: COACH }, { connections: before, rereadConnections: after })
    const { body } = await getStatus()

    expect(xeroReads).toBe(2)
    expect(body.status).toBe('dead')
    expect(body.status_scope).toBe('IICT Group Pty Ltd')
    expect(body.needsReconnect).toBe(true)
    expect(body.error).toBe('token_expired_permanently')
    expect(body.message).toBe('IICT Group Pty Ltd: Refresh token has expired')
  })
})

describe('GET /api/Xero/status — a check that could not finish is never an answer', () => {
  it('a failed xero_connections read is a 500 — never "none", never "not connected"', async () => {
    configure({ id: OWNER }, { connections: iictRows(), connectionsError: { message: 'connection reset' } })
    const { res, body } = await getStatus()
    expect(res.status).toBe(500)
    expect(body.status).toBeUndefined()
    expect(body.connected).toBeUndefined()
    expect(mockGetValidAccessToken).not.toHaveBeenCalled()
  })

  it('a failed re-read after the refreshes is a 500 — the pre-refresh rows may be stale', async () => {
    configure({ id: OWNER }, { connections: iictRows(), rereadError: { message: 'connection reset' } })
    const { res } = await getStatus()
    expect(res.status).toBe(500)
  })

  it('a failed sync_jobs lookup is unknown for every live org — never green', async () => {
    const rows = iictRows().map((r) => ({ ...r, last_synced_at: iso(-1 * HOUR) }))
    configure({ id: OWNER }, { connections: rows, syncJobsError: { message: 'timeout' } })
    const { res, body } = await getStatus()
    expect(res.status).toBe(200)
    expect(body.status).toBe('unknown')
    expect(body.orgs.every((o: { status: string }) => o.status === 'unknown')).toBe(true)
  })
})

describe('GET /api/Xero/status — the data clock', () => {
  it('each org folds in ITS tenant’s sync_jobs clock, and the lookup is filtered to this business’s tenants', async () => {
    // IICT Group Pty Ltd's column is stale, but its tenant finished a sync an hour ago.
    configure(
      { id: COACH },
      {
        connections: iictRows(),
        syncJobs: [
          { tenant_id: 't-pty', finished_at: iso(-1 * HOUR) },
          { tenant_id: 't-someone-else', finished_at: iso(-1 * MIN) },
        ],
      },
    )
    const { body } = await getStatus()

    expect(body.status).toBe('connected')
    expect(syncTenantFilters).toHaveLength(1)
    expect([...syncTenantFilters[0]].sort()).toEqual(['t-aust', 't-limited', 't-pty'])
    // The legacy `connection.last_synced_at` is the folded clock, not the raw column.
    const pty = body.orgs.find((o: { tenant_name: string }) => o.tenant_name === 'IICT Group Pty Ltd')
    expect(Date.now() - Date.parse(pty.last_sync_at)).toBeLessThan(2 * HOUR)
  })

  it('the owner and team members get the owner’s 72h threshold; the coach gets 48h', async () => {
    const rows = [org({ id: 'solo', tenant_id: 't-solo', tenant_name: 'Solo Pty Ltd', last_synced_at: iso(-60 * HOUR) })]

    configure({ id: OWNER }, { connections: rows })
    expect((await getStatus()).body.status).toBe('connected')

    configure({ id: 'user-team' }, { memberUserIds: ['user-team'], connections: rows })
    expect((await getStatus()).body.status).toBe('connected')

    configure({ id: COACH }, { connections: rows })
    expect((await getStatus()).body.status).toBe('data_stale')

    configure({ id: 'user-admin' }, { role: 'super_admin', connections: rows })
    expect((await getStatus()).body.status).toBe('data_stale')
  })
})
