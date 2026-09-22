/**
 * Phase 61 Plan 06 — GET /api/coach/client-completion ideas breakdown
 *
 * Pins the contract:
 *   A. Pre-phase shape preserved: when all ideas have shared_with_all=false and
 *      shared_with='{}', ideas_total === pre-phase business-wide count,
 *      ideas_private === ideas_total, ideas_team_shared === 0.
 *   B. Private vs team-shared split: an idea with shared_with_all=true OR
 *      shared_with non-empty counts toward ideas_team_shared (not private).
 *   C. Specific-share counted as team-shared.
 *   D. Headline total (ideas_total) PRESERVES pre-phase semantics — equals the
 *      raw count of all ideas where business_id IN (businessIds) OR user_id IN
 *      (ownerIds) — i.e. it does NOT shrink based on visibility filtering. This
 *      is the headline contract the prompt locks in (regression-pinned).
 *   E. Sentry fallback: when the ideas fetch errors, the route still returns 200
 *      (degraded but non-broken) with the breakdown NULL for that client — a
 *      count that could not be taken is not zero ideas (was zeroed until the
 *      could-not-check fix, Groups K-P).
 *   F. Pre-existing aggregates (modules.ideas presence, engagement, alerts)
 *      are NOT modified by this plan — regression-pinned.
 *   G. Zero-ideas client: returns { ideas_total: 0, ideas_private: 0,
 *      ideas_team_shared: 0 } with no crash.
 *   H. ideas_breakdown convenience object: { owned, team_shared, total } is
 *      ALSO emitted for plan-contract compatibility; total === ideas_total.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Sentry mock ─────────────────────────────────────────────────────────────
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'

// ─── Supabase mock ───────────────────────────────────────────────────────────

const createRouteHandlerClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}))

/**
 * PostgREST's "Max rows": the mock cuts every response to this many rows and
 * still sends error: null, as hosted Supabase does.
 */
const MAX_ROWS = 1000

/**
 * `throws` makes the awaited query reject instead of resolving (the exception path).
 * `maxRows` lowers this table's cap (a project can set Max rows below 1,000).
 * `failOnRequest` fails only that request to the table (0 = the first page).
 * `endless` answers every request with a full page of new rows: a read that never ends.
 */
type TableResp = {
  data: unknown
  error?: unknown
  throws?: boolean
  maxRows?: number
  failOnRequest?: number
  endless?: boolean
}

/**
 * Per-table responses. Routes mostly do .select().eq()/.in()/.or().order()
 * followed by an await — every chainable is a thenable that resolves to the
 * table response.
 */
type MockOpts = {
  user?: { id: string } | null
  userError?: unknown
  systemRole?: TableResp
  businesses?: TableResp
  business_profiles?: TableResp
  ideas?: TableResp
  // Status-filter overrides — only set when test wants a non-default
  ideas_error?: unknown
  // Any other table can be left empty
  defaults?: Record<string, TableResp>
}

/**
 * Every query-shape call the route makes, for assertions on the SQL it would
 * send. A paged read sends one select per page, so these record every page.
 */
const selectCalls: Array<{ table: string; cols: string }> = []
const inCalls: Array<{ table: string; col: string; vals: unknown[] }> = []
const orCalls: Array<{ table: string; filter: string }> = []
const eqCalls: Array<{ table: string; col: string; val: unknown }> = []
const orderCalls: Array<{ table: string; col: string; ascending: boolean }> = []
const gtCalls: Array<{ table: string; col: string; val: string }> = []
const limitCalls: Array<{ table: string; count: number }> = []

/** Code-unit order, which is how Postgres orders the lowercase-hex uuid ids. */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function makeChainable(result: TableResp, table = ''): Record<string, any> {
  const b: Record<string, any> = {}
  let orderBy: { col: string; ascending: boolean } | null = null
  let after: { col: string; val: string } | null = null
  let limit: number | null = null
  b.select = vi.fn((cols: string) => { selectCalls.push({ table, cols }); return b })
  b.eq = vi.fn((col: string, val: unknown) => { eqCalls.push({ table, col, val }); return b })
  b.in = vi.fn((col: string, vals: unknown[]) => { inCalls.push({ table, col, vals }); return b })
  b.or = vi.fn((filter: string) => { orCalls.push({ table, filter }); return b })
  b.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
    orderBy = { col, ascending: opts?.ascending ?? true }
    orderCalls.push({ table, ...orderBy })
    return b
  })
  b.gt = vi.fn((col: string, val: string) => {
    after = { col, val }
    gtCalls.push({ table, col, val })
    return b
  })
  b.limit = vi.fn((count: number) => {
    limit = count
    limitCalls.push({ table, count })
    return b
  })
  b.single = vi.fn(() => Promise.resolve(result))
  b.maybeSingle = vi.fn(() => Promise.resolve(result))

  /**
   * What PostgREST would send back for this request. The mock ignores the
   * eq/in/or VALUES (every fixture row comes back, whatever the ids) but honours
   * the cursor, the order and the limit — and then cuts the response to Max rows.
   * With no order it answers in storage order: the fixture's order, oldest first.
   */
  const respond = (): TableResp => {
    if (!Array.isArray(result.data)) return result
    let rows = result.data as Array<Record<string, any>>
    if (after) {
      const { col, val } = after
      rows = rows.filter((r) => byCodeUnit(String(r[col]), val) > 0)
    }
    if (orderBy) {
      const { col, ascending } = orderBy
      rows = [...rows].sort((x, y) => byCodeUnit(String(x[col] ?? ''), String(y[col] ?? '')) * (ascending ? 1 : -1))
    }
    if (limit !== null) rows = rows.slice(0, limit)
    return { ...result, data: rows.slice(0, result.maxRows ?? MAX_ROWS) }
  }

  ;(b as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    if (result.throws) {
      Promise.reject(new Error(`simulated ${table} network failure`)).then(resolve, reject)
      return
    }
    Promise.resolve(respond()).then(resolve, reject)
  }
  return b
}

/** A full page of rows no earlier request has seen, for `endless` tables. */
function endlessPage(table: string, request: number) {
  return Array.from({ length: MAX_ROWS }, (_, i) => ({
    id: `${table}-${String(request * MAX_ROWS + i).padStart(9, '0')}`,
    business_id: 'biz-1',
    user_id: 'owner-1',
  }))
}

function makeSupabase(opts: MockOpts = {}) {
  const {
    user = { id: 'coach-1' },
    userError = null,
    systemRole = { data: { role: 'coach' }, error: null },
    businesses = {
      data: [
        { id: 'biz-1', business_name: 'Acme', name: 'Acme', owner_id: 'owner-1', status: 'active' },
      ],
      error: null,
    },
    business_profiles = {
      data: [
        { id: 'prof-1', business_id: 'biz-1', user_id: 'owner-1', business_name: 'Acme' },
      ],
      error: null,
    },
    ideas = { data: [], error: null },
    ideas_error,
    defaults = {},
  } = opts

  const ideasResp: TableResp = ideas_error
    ? { data: null, error: ideas_error }
    : ideas

  const responseFor = (table: string): TableResp => {
    if (table === 'system_roles') return systemRole
    if (table === 'businesses') return businesses
    if (table === 'business_profiles') return business_profiles
    if (table === 'ideas') return ideasResp
    if (defaults[table]) return defaults[table]
    return { data: [], error: null }
  }

  // Requests made to each table so far — a paged read makes one per page.
  const requests = new Map<string, number>()
  const fromSpy = vi.fn((table: string) => {
    const request = requests.get(table) ?? 0
    requests.set(table, request + 1)
    const resp = responseFor(table)
    if (resp.failOnRequest === request) {
      return makeChainable({ data: null, error: { message: `simulated ${table} failure on request ${request}` } }, table)
    }
    if (resp.endless) return makeChainable({ data: endlessPage(table, request), error: null }, table)
    return makeChainable(resp, table)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: userError,
      }),
    },
    from: fromSpy,
  }
}

// ─── Import the route AFTER mocks are configured ─────────────────────────────
import { GET } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  selectCalls.length = 0
  inCalls.length = 0
  orCalls.length = 0
  eqCalls.length = 0
  orderCalls.length = 0
  gtCalls.length = 0
  limitCalls.length = 0
})

// ─── Group A — Pre-phase shape preserved ─────────────────────────────────────

describe('Group A — Pre-phase shape preserved (all-private ideas)', () => {
  it('returns ideas_total === pre-phase count when all ideas have shared_with_all=false and shared_with=[]', async () => {
    const allPrivate = [
      { id: 'i1', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: [] },
      { id: 'i2', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: [] },
      { id: 'i3', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: [] },
    ]
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase({ ideas: { data: allPrivate, error: null } }))

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    const body = await res.json()
    const client = body.clients[0]

    expect(client.ideas_total).toBe(3)
    expect(client.ideas_private).toBe(3)
    expect(client.ideas_team_shared).toBe(0)
  })

  it('exposes ideas_breakdown.total === ideas_total (plan-contract alias)', async () => {
    const allPrivate = [
      { id: 'i1', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: [] },
      { id: 'i2', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: [] },
    ]
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase({ ideas: { data: allPrivate, error: null } }))

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    const body = await res.json()
    const client = body.clients[0]

    expect(client.ideas_breakdown).toBeDefined()
    expect(client.ideas_breakdown.total).toBe(client.ideas_total)
    expect(client.ideas_breakdown.total).toBe(2)
  })
})

// ─── Group B — Private vs team-shared split ──────────────────────────────────

describe('Group B — Private vs team-shared split', () => {
  it('counts shared_with_all=true ideas as team_shared, not private', async () => {
    const mixed = [
      // 2 private (owner-owned, no sharing)
      { id: 'i1', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: [] },
      { id: 'i2', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: [] },
      // 2 team-wide shared
      { id: 'i3', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: true, shared_with: [] },
      { id: 'i4', user_id: 'teammate-2', business_id: 'biz-1', shared_with_all: true, shared_with: [] },
    ]
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase({ ideas: { data: mixed, error: null } }))

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    const body = await res.json()
    const client = body.clients[0]

    expect(client.ideas_total).toBe(4)
    expect(client.ideas_private).toBe(2)
    expect(client.ideas_team_shared).toBe(2)
  })

  it('counts shared_with non-empty ideas as team_shared, not private', async () => {
    const mixed = [
      { id: 'i1', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: [] }, // private
      { id: 'i2', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: ['user-x'] }, // specific
      { id: 'i3', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: ['user-x', 'user-y'] }, // specific
    ]
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase({ ideas: { data: mixed, error: null } }))

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    const body = await res.json()
    const client = body.clients[0]

    expect(client.ideas_total).toBe(3)
    expect(client.ideas_private).toBe(1)
    expect(client.ideas_team_shared).toBe(2)
  })
})

// ─── Group C — Specific-share semantics ──────────────────────────────────────

describe('Group C — Specific-share semantics', () => {
  it('treats specific-share (shared_with non-empty) identically to team-wide for the breakdown', async () => {
    const ideas = [
      { id: 'i1', user_id: 'teammate-2', business_id: 'biz-1', shared_with_all: false, shared_with: ['owner-1'] },
    ]
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase({ ideas: { data: ideas, error: null } }))

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    const body = await res.json()
    const client = body.clients[0]

    expect(client.ideas_total).toBe(1)
    expect(client.ideas_team_shared).toBe(1)
    expect(client.ideas_private).toBe(0)
  })

  it('handles shared_with === null as if it were [] (Postgres array default)', async () => {
    const ideas = [
      { id: 'i1', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: null },
    ]
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase({ ideas: { data: ideas, error: null } }))

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    const body = await res.json()
    const client = body.clients[0]

    expect(client.ideas_total).toBe(1)
    expect(client.ideas_private).toBe(1)
    expect(client.ideas_team_shared).toBe(0)
  })
})

// ─── Group D — Headline-total regression (the load-bearing pin) ──────────────

describe('Group D — Headline total preservation', () => {
  it('ideas_total equals the pre-phase business-wide count (does NOT shrink when ideas are shared/unshared)', async () => {
    // Fixture mixes ALL three states: private, team-wide, specific.
    // Headline total must be 12 — the same value the pre-phase route reported.
    const twelveIdeas = Array.from({ length: 12 }, (_, i) => ({
      id: `i${i + 1}`,
      user_id: i < 8 ? 'owner-1' : 'teammate-2',
      business_id: 'biz-1',
      shared_with_all: i % 4 === 0,
      shared_with: i % 3 === 0 ? ['someone'] : [],
    }))
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase({ ideas: { data: twelveIdeas, error: null } }))

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    const body = await res.json()
    const client = body.clients[0]

    // THE PIN: headline does not shrink.
    expect(client.ideas_total).toBe(12)
    // Sanity: private + team_shared === total (the two are an exhaustive split).
    expect(client.ideas_private + client.ideas_team_shared).toBe(client.ideas_total)
  })
})

// ─── Group E — Sentry fallback path ──────────────────────────────────────────

describe('Group E — Sentry fallback when ideas fetch errors', () => {
  it('returns 200 with a NULL breakdown (not zeros) when the ideas query errors', async () => {
    createRouteHandlerClientMock.mockResolvedValueOnce(
      makeSupabase({ ideas_error: { message: 'simulated db error' } })
    )

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    expect(res.status).toBe(200)
    const body = await res.json()
    const client = body.clients[0]

    // A count that could not be taken is not zero ideas. Group G pins the
    // genuine zero, so the two outcomes stay distinguishable on the wire.
    expect(client.ideas_total).toBeNull()
    expect(client.ideas_private).toBeNull()
    expect(client.ideas_team_shared).toBeNull()
    expect(client.ideas_breakdown).toBeNull()
    expect(client.modules.ideas).toBe('unknown')
  })
})

// ─── Group F — Pre-existing fields unchanged ────────────────────────────────

describe('Group F — Pre-existing response shape unchanged', () => {
  it('still emits modules + engagement + alerts on each client', async () => {
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase())

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    const body = await res.json()
    const client = body.clients[0]

    expect(client.modules).toBeDefined()
    expect(client.engagement).toBeDefined()
    expect(client.alerts).toBeDefined()
    expect(typeof client.engagement.engagementScore).toBe('number')
    expect(Array.isArray(client.alerts)).toBe(true)
  })

  it('still emits businessId, businessName, ownerId on each client', async () => {
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase())

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    const body = await res.json()
    const client = body.clients[0]

    expect(client.businessId).toBe('biz-1')
    expect(client.businessName).toBe('Acme')
    expect(client.ownerId).toBe('owner-1')
  })

  it('module computations (modules.ideas) remain orthogonal to sharing — single shared idea still trips the boolean', async () => {
    const oneShared = [
      { id: 'i1', user_id: 'teammate-2', business_id: 'biz-1', shared_with_all: true, shared_with: [] },
    ]
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase({ ideas: { data: oneShared, error: null } }))

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    const body = await res.json()
    const client = body.clients[0]

    // The 'ideas' module key flips to completed if any idea exists in the
    // business; sharing should not change that.
    expect(client.modules.ideas).toBe('completed')
  })
})

// ─── Group G — Zero-ideas client ────────────────────────────────────────────

describe('Group G — Zero-ideas client', () => {
  it('returns zeros across the board and does not throw', async () => {
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase({ ideas: { data: [], error: null } }))

    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    expect(res.status).toBe(200)
    const body = await res.json()
    const client = body.clients[0]

    expect(client.ideas_total).toBe(0)
    expect(client.ideas_private).toBe(0)
    expect(client.ideas_team_shared).toBe(0)
    expect(client.ideas_breakdown).toEqual({ owned: 0, team_shared: 0, total: 0 })
  })
})

// ─── Group H — Auth/role gates regression ────────────────────────────────────

describe('Group H — Auth gates remain in place', () => {
  it('returns 401 when not authenticated', async () => {
    createRouteHandlerClientMock.mockResolvedValueOnce(
      makeSupabase({ user: null, userError: { message: 'not authed' } })
    )
    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when authenticated user is not a coach/super_admin', async () => {
    createRouteHandlerClientMock.mockResolvedValueOnce(
      makeSupabase({ systemRole: { data: { role: 'client' }, error: null } })
    )
    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    expect(res.status).toBe(403)
  })
})

// ─── Group I — WISDOM-BI-T / WISDOM-BI-S: query shape is valid SQL ───────────
//
// The route selected business_profiles.mission / .vision (columns that have
// never existed) → the profiles query failed → profileIds was [] → every
// profile-keyed query hit `.in('business_id', ['__none__'])`, which Postgres
// rejects as an invalid uuid. Net effect on the engagement dashboard: plan,
// initiatives, forecast, metrics, weekly and quarterly reviews read as
// not_started for EVERY client, with 7 Sentry warnings per page load.

const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const fullVisionMission = {
  mission_statement: 'We exist to help family businesses become calm, profitable and worth owning.',
  vision_statement: 'By 2030 every client business runs on a plan its owner understands, with a team that runs the week.',
  core_values: ['Integrity', 'Curiosity', 'Care'],
}

describe('Group I — query shape (WISDOM-BI-T / WISDOM-BI-S)', () => {
  it('never selects mission/vision from business_profiles — those columns do not exist', async () => {
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase())
    await GET(new Request('http://localhost/api/coach/client-completion'))

    const profileSelects = selectCalls.filter((c) => c.table === 'business_profiles')
    expect(profileSelects.length).toBeGreaterThan(0)
    for (const c of profileSelects) {
      expect(c.cols).not.toMatch(/\bmission\b|\bvision\b/)
    }
  })

  it('never sends the "__none__" placeholder; an empty id list becomes the nil uuid', async () => {
    // No profiles and no owner → every derived id list is empty.
    createRouteHandlerClientMock.mockResolvedValueOnce(
      makeSupabase({
        businesses: { data: [{ id: 'biz-1', business_name: 'Acme', name: 'Acme', owner_id: null, status: 'active' }], error: null },
        business_profiles: { data: [], error: null },
      }),
    )
    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    expect(res.status).toBe(200)

    for (const c of inCalls) expect(c.vals, `${c.table}.${c.col}`).not.toContain('__none__')
    for (const c of orCalls) expect(c.filter, c.table).not.toContain('__none__')

    // Profile-keyed tables are still queried (not skipped) with a valid, no-match uuid.
    const planSnapshots = inCalls.find((c) => c.table === 'plan_snapshots')
    expect(planSnapshots?.vals).toEqual([NIL_UUID])
  })

  it('a failing profiles query no longer cascades into a uuid error per profile-keyed table', async () => {
    // The exact WISDOM-BI-T condition, replayed.
    createRouteHandlerClientMock.mockResolvedValueOnce(
      makeSupabase({
        business_profiles: { data: null, error: { message: 'column business_profiles.mission does not exist' } },
      }),
    )
    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    expect(res.status).toBe(200)

    for (const c of inCalls) expect(c.vals, `${c.table}.${c.col}`).not.toContain('__none__')
    // Exactly the one upstream warning — not one per downstream table.
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
  })
})

// ─── Group J — Vision & Mission reads its real source ────────────────────────

describe('Group J — vision_mission module reads strategy_data (owner-keyed)', () => {
  it('queries strategy_data by the owners\' user_id', async () => {
    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase())
    await GET(new Request('http://localhost/api/coach/client-completion'))

    const q = inCalls.find((c) => c.table === 'strategy_data')
    expect(q).toBeDefined()
    expect(q!.col).toBe('user_id')
    expect(q!.vals).toEqual(['owner-1'])
    expect(selectCalls.find((c) => c.table === 'strategy_data')?.cols).toContain('vision_mission')
  })

  it('completed when the owner has a full vision_mission document', async () => {
    createRouteHandlerClientMock.mockResolvedValueOnce(
      makeSupabase({
        defaults: { strategy_data: { data: [{ id: 'sd-1', user_id: 'owner-1', vision_mission: fullVisionMission }], error: null } },
      }),
    )
    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    const body = await res.json()
    expect(body.clients[0].modules.visionMission).toBe('completed')
  })

  it('in_progress when partially filled; not_started when there is no row', async () => {
    createRouteHandlerClientMock.mockResolvedValueOnce(
      makeSupabase({
        defaults: {
          strategy_data: {
            data: [{ id: 'sd-1', user_id: 'owner-1', vision_mission: { ...fullVisionMission, core_values: [] } }],
            error: null,
          },
        },
      }),
    )
    let res = await GET(new Request('http://localhost/api/coach/client-completion'))
    expect((await res.json()).clients[0].modules.visionMission).toBe('in_progress')

    createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase())
    res = await GET(new Request('http://localhost/api/coach/client-completion'))
    expect((await res.json()).clients[0].modules.visionMission).toBe('not_started')
  })
})

// ─── Groups K-P — a failed lookup is "could not check", never an answer ──────
//
// safeQuery returns null when a read fails, and every consumer used to collapse
// that into "no rows": a failed xero_connections read made every client
// 'not_started' with a "Xero not connected" alert, a failed users read said
// "Never logged in", and a failed session_actions read awarded the full 25
// engagement points for "no open actions". The house rule (fail-open family,
// PRES-09/10/11): a real value, a genuinely empty state and a failed check are
// three distinct states, and a failure never inherits the empty state's call
// to action. Everything below goes through the exported GET handler.

const FAILED: TableResp = { data: null, error: { message: 'simulated outage' } }

async function getFirstClient(opts: MockOpts = {}) {
  createRouteHandlerClientMock.mockResolvedValueOnce(makeSupabase(opts))
  const res = await GET(new Request('http://localhost/api/coach/client-completion'))
  expect(res.status).toBe(200)
  return (await res.json()).clients[0]
}

/** Every module the coach dashboard renders. */
const ALL_MODULES = [
  'businessProfile', 'assessment', 'xeroConnected',
  'visionMission', 'swot', 'goals', 'onePagePlan', 'strategicInitiatives',
  'forecast', 'monthlyReport', 'cashflow', 'kpiDashboard',
  'weeklyReviews', 'quarterlyReview', 'issuesList', 'ideas', 'openLoops', 'stopDoing',
  'orgChart', 'accountability', 'valueProposition', 'processes', 'sessionNotes', 'messages',
]

/** Every batched read, bar business_profiles and ideas (they have their own mock options). */
const BATCH_TABLES = [
  'assessments', 'strategy_data', 'xero_connections', 'swot_analyses', 'business_financial_goals',
  'plan_snapshots', 'strategic_initiatives', 'financial_forecasts', 'weekly_metrics_snapshots',
  'weekly_reviews', 'quarterly_reviews', 'issues_list', 'open_loops', 'stop_doing_items',
  'team_data', 'process_diagrams', 'session_notes', 'messages', 'users', 'coaching_sessions',
  'session_actions',
]

describe('Group K — a failed module lookup is unknown and raises no alert', () => {
  it.each([
    ['xero_connections', ['xeroConnected'], 'Xero not connected'],
    ['assessments', ['assessment'], 'Assessment incomplete'],
    ['business_financial_goals', ['goals'], 'No goals set'],
    ['financial_forecasts', ['forecast', 'cashflow'], 'No forecast'],
    ['weekly_reviews', ['weeklyReviews'], 'No weekly reviews'],
  ])('%s failing → %j unknown, "%s" not raised', async (table, moduleKeys, alert) => {
    // Control: the same client with the table genuinely EMPTY does get the
    // empty state and its alert — so the absence below is the failure being
    // handled, not a fixture that never alerts.
    const empty = await getFirstClient()
    for (const key of moduleKeys) expect(empty.modules[key], key).toBe('not_started')
    expect(empty.alerts).toContain(alert)
    expect(empty.alertsComplete).toBe(true)

    const failed = await getFirstClient({ defaults: { [table]: FAILED } })
    for (const key of moduleKeys) expect(failed.modules[key], key).toBe('unknown')
    expect(failed.alerts).not.toContain(alert)
    // …and the shorter list is not an all-clear.
    expect(failed.alertsComplete).toBe(false)
  })

  it.each([
    ['strategy_data', ['visionMission']],
    ['swot_analyses', ['swot']],
    ['plan_snapshots', ['onePagePlan']],
    ['strategic_initiatives', ['strategicInitiatives', 'onePagePlan']],
    ['weekly_metrics_snapshots', ['monthlyReport', 'kpiDashboard']],
    ['quarterly_reviews', ['quarterlyReview']],
    ['issues_list', ['issuesList']],
    ['open_loops', ['openLoops']],
    ['stop_doing_items', ['stopDoing']],
    ['team_data', ['orgChart', 'accountability']],
    ['process_diagrams', ['processes']],
    ['session_notes', ['sessionNotes']],
    ['messages', ['messages']],
  ])('%s failing → %j unknown, not not_started', async (table, moduleKeys) => {
    const client = await getFirstClient({ defaults: { [table]: FAILED } })
    for (const key of moduleKeys) expect(client.modules[key], key).toBe('unknown')
  })

  it('one failed lookup leaves every other module and alert answering normally', async () => {
    const client = await getFirstClient({ defaults: { xero_connections: FAILED } })
    expect(client.modules.xeroConnected).toBe('unknown')
    for (const key of ALL_MODULES.filter((k) => k !== 'xeroConnected')) {
      expect(client.modules[key], key).not.toBe('unknown')
    }
    // Genuinely empty answers from the reads that DID run still alert.
    expect(client.alerts).toEqual(
      expect.arrayContaining(['Assessment incomplete', 'No goals set', 'No forecast', 'Never logged in'])
    )
  })

  it('a query that throws (network error, not a PostgREST error) is unknown too', async () => {
    const client = await getFirstClient({
      defaults: { xero_connections: { data: null, throws: true } },
    })
    expect(client.modules.xeroConnected).toBe('unknown')
    expect(client.alerts).not.toContain('Xero not connected')
    expect(client.alertsComplete).toBe(false)
  })
})

describe('Group L — a failed engagement lookup is unknown, not "never" or "none"', () => {
  it('users failing: no "Never logged in", lastLogin unknown, no score', async () => {
    const empty = await getFirstClient()
    expect(empty.alerts).toContain('Never logged in')
    expect(typeof empty.engagement.engagementScore).toBe('number')

    const client = await getFirstClient({ defaults: { users: FAILED } })
    expect(client.alerts).not.toContain('Never logged in')
    expect(client.engagement.unknown).toContain('lastLogin')
    expect(client.engagement.engagementScore).toBeNull()
    expect(client.alertsComplete).toBe(false)
  })

  it('coaching_sessions failing: no "No sessions yet", daysSinceSession unknown, no score', async () => {
    const empty = await getFirstClient()
    expect(empty.alerts).toContain('No sessions yet')

    const client = await getFirstClient({ defaults: { coaching_sessions: FAILED } })
    expect(client.alerts).not.toContain('No sessions yet')
    expect(client.engagement.unknown).toContain('daysSinceSession')
    expect(client.engagement.engagementScore).toBeNull()
    expect(client.alertsComplete).toBe(false)
  })

  it('session_actions failing does not award the "no open actions" points', async () => {
    // Genuinely zero open actions is worth 25 — with every other signal
    // empty, that is the whole score.
    const empty = await getFirstClient()
    expect(empty.engagement.engagementScore).toBe(25)

    const client = await getFirstClient({ defaults: { session_actions: FAILED } })
    expect(client.engagement.unknown).toContain('openActions')
    expect(client.engagement.engagementScore).toBeNull()
    expect(client.alertsComplete).toBe(false)
  })

  it('weekly_reviews failing: the streak is unknown, not a zero streak', async () => {
    const client = await getFirstClient({ defaults: { weekly_reviews: FAILED } })
    expect(client.engagement.unknown).toContain('weeklyReviewStreak')
    expect(client.engagement.engagementScore).toBeNull()
  })

  it('messages failing: unread count unknown, but score and alerts are untouched (neither reads messages)', async () => {
    const client = await getFirstClient({ defaults: { messages: FAILED } })
    expect(client.modules.messages).toBe('unknown')
    expect(client.engagement.unknown).toEqual(['unreadMessages'])
    expect(client.engagement.engagementScore).toBe(25)
    expect(client.alertsComplete).toBe(true)
  })
})

describe('Group M — a failed profiles read makes profile-keyed modules unknown', () => {
  // With business_profiles failed, the profile-keyed reads run against the nil
  // uuid and "succeed" with nothing. That nothing is not the client having nothing.
  // quarterlyReview is not here: quarterly_reviews is keyed by businesses.id (Group S).
  const PROFILE_DEPENDENT = [
    'businessProfile', 'valueProposition', 'xeroConnected', 'goals', 'onePagePlan',
    'strategicInitiatives', 'forecast', 'cashflow', 'monthlyReport', 'kpiDashboard',
    'weeklyReviews',
  ]

  it('every module that needs a profile id is unknown, though its own query returned []', async () => {
    const client = await getFirstClient({ business_profiles: FAILED })
    for (const key of PROFILE_DEPENDENT) expect(client.modules[key], key).toBe('unknown')
    // Owner- and business-keyed modules never needed the profile id: still answered.
    for (const key of ALL_MODULES.filter((k) => !PROFILE_DEPENDENT.includes(k))) {
      expect(client.modules[key], key).toBe('not_started')
    }
  })

  it('raises no alert from those modules, but still alerts from the reads that ran', async () => {
    const client = await getFirstClient({ business_profiles: FAILED })
    for (const alert of ['No forecast', 'Xero not connected', 'No goals set', 'No weekly reviews']) {
      expect(client.alerts).not.toContain(alert)
    }
    expect(client.alerts).toContain('Assessment incomplete')
    expect(client.alerts).toContain('Never logged in')
    expect(client.engagement.unknown).toContain('weeklyReviewStreak')
    expect(client.alertsComplete).toBe(false)
  })
})

describe('Group N — a row that WAS seen still counts when part of its lookup failed', () => {
  it('a goal under the owner is completed even with the profile-keyed half unread', async () => {
    const client = await getFirstClient({
      business_profiles: FAILED,
      defaults: {
        business_financial_goals: { data: [{ id: 'g1', business_id: 'prof-x', user_id: 'owner-1' }], error: null },
      },
    })
    expect(client.modules.goals).toBe('completed')
  })

  it('an active Xero row under businesses.id is completed with profiles unread', async () => {
    const client = await getFirstClient({
      business_profiles: FAILED,
      defaults: { xero_connections: { data: [{ id: 'x1', business_id: 'biz-1' }], error: null } },
    })
    expect(client.modules.xeroConnected).toBe('completed')
    expect(client.alerts).not.toContain('Xero not connected')
  })

  it('initiatives with the snapshot table unread: the plan is unknown, not in_progress', async () => {
    const client = await getFirstClient({
      defaults: {
        plan_snapshots: FAILED,
        strategic_initiatives: { data: [{ id: 's1', business_id: 'prof-1' }], error: null },
      },
    })
    expect(client.modules.onePagePlan).toBe('unknown')
    expect(client.modules.strategicInitiatives).toBe('completed')
  })
})

describe('Group O — "Xero Connected" stays presence-based', () => {
  it('any active xero_connections row reads completed', async () => {
    const client = await getFirstClient({
      defaults: { xero_connections: { data: [{ id: 'x1', business_id: 'biz-1' }], error: null } },
    })
    expect(client.modules.xeroConnected).toBe('completed')
    expect(eqCalls).toContainEqual({ table: 'xero_connections', col: 'is_active', val: true })
    // Presence, not health: no tokens, expiry or sync clocks are read here —
    // connection health is the coach dashboard pill (/api/Xero/connection-health).
    expect(selectCalls.find((c) => c.table === 'xero_connections')?.cols).toBe('id, business_id')
  })

  it('a row under the business_profiles id counts too', async () => {
    const client = await getFirstClient({
      defaults: { xero_connections: { data: [{ id: 'x1', business_id: 'prof-1' }], error: null } },
    })
    expect(client.modules.xeroConnected).toBe('completed')
  })
})

describe('Group P — healthy vs total outage, and which read failed', () => {
  it('healthy: nothing unknown, the alert list is complete, the score is a number', async () => {
    const client = await getFirstClient()
    for (const key of ALL_MODULES) expect(client.modules[key], key).not.toBe('unknown')
    expect(client.engagement.unknown).toEqual([])
    expect(client.alertsComplete).toBe(true)
    expect(typeof client.engagement.engagementScore).toBe('number')
  })

  it('every read failing: still 200, every module unknown, no alerts, no score — nothing confident', async () => {
    const client = await getFirstClient({
      business_profiles: FAILED,
      ideas_error: { message: 'simulated outage' },
      defaults: Object.fromEntries(BATCH_TABLES.map((t) => [t, FAILED])),
    })
    for (const key of ALL_MODULES) expect(client.modules[key], key).toBe('unknown')
    expect(client.alerts).toEqual([])
    expect(client.alertsComplete).toBe(false)
    expect(client.engagement.engagementScore).toBeNull()
    expect([...client.engagement.unknown].sort()).toEqual(
      ['daysSinceSession', 'lastLogin', 'openActions', 'unreadMessages', 'weeklyReviewStreak']
    )
    expect(client.ideas_breakdown).toBeNull()
  })

  it('tags the failed read with its table, so Sentry says WHICH check could not run', async () => {
    await getFirstClient({ defaults: { xero_connections: FAILED } })
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      '[client-completion] query error: simulated outage',
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ source: 'xero_connections', invariant: 'client-completion-load' }),
      })
    )
  })
})

// ─── Groups Q-R — PostgREST's row cap cannot shorten an answer ───────────────
//
// Hosted Supabase cuts every PostgREST response to "Max rows" (1,000) and sends
// what is left with error: null. The batch used to read each table in ONE
// unordered request, and an unordered read keeps rows in storage order — the
// OLDEST first on these append-mostly tables — so once a coach's rows passed
// 1,000 it silently dropped the rows that decide the answer: the latest KPI
// snapshot, this week's review, the newest unread message. On 15 Sep 2026 the
// biggest read was 494 strategic_initiatives rows for the 27-client coach,
// growing ~50 a month; a sync_jobs read of the same shape had already left 12
// of 15 Xero sync clocks ~3 weeks stale that day.
//
// The mock enforces the cap in storage order. Each Group Q test first replays
// the old single request (unpagedRead) to show it losing the deciding rows,
// then asserts the route's answer through GET.

const DAY_MS = 24 * 60 * 60 * 1000
/** A `date` column `days` ago, as PostgREST sends it: YYYY-MM-DD. */
const daysAgoDate = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10)
/** A `timestamptz` column `days` ago. */
const daysAgoIso = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()
/** Zero-padded, so code-unit order is numeric order. */
const rowId = (prefix: string, n: number) => `${prefix}-${String(n).padStart(5, '0')}`

/** The pre-fix read of a table: one unordered request with no limit, cut to Max rows. */
async function unpagedRead(resp: TableResp): Promise<Array<Record<string, any>>> {
  const { data } = await (makeChainable(resp, 'unpaged').select('*') as PromiseLike<{
    data: Array<Record<string, any>>
  }>)
  return data
}

describe('Group Q — past 1,000 rows, the newest rows still decide', () => {
  it('kpiDashboard: this week\'s snapshot counts when 1,200 older snapshots were written first', async () => {
    // Storage order: Acme's first snapshot a year ago, 1,200 of other clients'
    // snapshots, then Acme's latest — this week's — written last.
    const acmeFirst = { id: rowId('wms', 0), business_id: 'prof-1', week_ending_date: daysAgoDate(365), created_at: daysAgoIso(365) }
    const others = Array.from({ length: 1200 }, (_, i) => ({
      id: rowId('wms', 1 + i),
      business_id: `prof-other-${i % 30}`,
      week_ending_date: daysAgoDate(400 - 7 * Math.floor(i / 30)),
      created_at: daysAgoIso(400 - 7 * Math.floor(i / 30)),
    }))
    const acmeLatest = { id: rowId('wms', 9999), business_id: 'prof-1', week_ending_date: daysAgoDate(3), created_at: daysAgoIso(3) }
    const snapshots: TableResp = { data: [acmeFirst, ...others, acmeLatest], error: null }

    // The old read kept the year-old snapshot and lost this week's: 'in_progress'.
    const capped = await unpagedRead(snapshots)
    expect(capped).toHaveLength(1000)
    expect(capped).toContainEqual(acmeFirst)
    expect(capped).not.toContainEqual(acmeLatest)

    const client = await getFirstClient({ defaults: { weekly_metrics_snapshots: snapshots } })
    expect(client.modules.kpiDashboard).toBe('completed')
    expect(client.modules.monthlyReport).toBe('completed')
  })

  it('unreadMessages: the newest unread messages count when 1,050 read ones came first', async () => {
    const older = Array.from({ length: 1050 }, (_, i) => ({
      id: rowId('msg', i),
      business_id: i % 2 === 0 ? 'biz-1' : 'biz-other',
      sender_id: 'owner-1',
      read: true,
      created_at: daysAgoIso(300 - i / 10),
    }))
    const newest = [
      ...Array.from({ length: 4 }, (_, i) => ({
        id: rowId('msg', 2000 + i), business_id: 'biz-1', sender_id: 'owner-1', read: false, created_at: daysAgoIso(1),
      })),
      // Unread, but the coach sent it — not unread FOR the coach.
      { id: rowId('msg', 2004), business_id: 'biz-1', sender_id: 'coach-1', read: false, created_at: daysAgoIso(1) },
    ]
    const messages: TableResp = { data: [...older, ...newest], error: null }

    const capped = await unpagedRead(messages)
    expect(capped.filter((m) => m.business_id === 'biz-1' && !m.read)).toEqual([])

    const client = await getFirstClient({ defaults: { messages } })
    expect(client.engagement.unreadMessages).toBe(4)
    expect(client.modules.messages).toBe('completed')
  })

  it('weeklyReviewStreak: the last 8 weeks in a row count, not an old run the capped read happened to keep', async () => {
    // Acme's 5-week run a year ago, written first; 1,100 other clients' reviews
    // (one a week each); then Acme's last 8 weeks in a row, written last.
    const acmeYearAgo = Array.from({ length: 5 }, (_, i) => ({
      id: rowId('wr', i), business_id: 'prof-1', user_id: 'owner-1', is_completed: true, week_start_date: daysAgoDate(7 * (52 + i)),
    }))
    const others = Array.from({ length: 1100 }, (_, i) => ({
      id: rowId('wr', 100 + i),
      business_id: `prof-other-${i % 25}`,
      user_id: `user-other-${i % 25}`,
      is_completed: true,
      week_start_date: daysAgoDate(7 * (1 + Math.floor(i / 25))),
    }))
    const acmeRecent = Array.from({ length: 8 }, (_, i) => ({
      id: rowId('wr', 5000 + i), business_id: 'prof-1', user_id: 'owner-1', is_completed: true, week_start_date: daysAgoDate(7 * i),
    }))
    const reviews: TableResp = { data: [...acmeYearAgo, ...others, ...acmeRecent], error: null }

    // The old read kept the year-old run and none of the last 8 weeks: a streak of 5.
    const capped = await unpagedRead(reviews)
    expect(capped.filter((r) => r.business_id === 'prof-1')).toEqual(acmeYearAgo)

    const client = await getFirstClient({ defaults: { weekly_reviews: reviews } })
    expect(client.engagement.weeklyReviewStreak).toBe(8)
    expect(client.modules.weeklyReviews).toBe('completed')
  })

  it('ideas_*: 1,050 ideas are counted exactly, whatever order their ids take', async () => {
    // The ids are a permutation of storage order (677 is coprime with 1,050), so
    // paging by id cannot lean on ids arriving oldest-first.
    const ideas = Array.from({ length: 1050 }, (_, i) => ({
      id: rowId('idea', (i * 677) % 1050),
      user_id: 'owner-1',
      business_id: 'biz-1',
      shared_with_all: i % 3 === 0,
      shared_with: [],
    }))

    expect(await unpagedRead({ data: ideas, error: null })).toHaveLength(1000)

    const client = await getFirstClient({ ideas: { data: ideas, error: null } })
    expect(client.ideas_total).toBe(1050)
    expect(client.ideas_private).toBe(700)
    expect(client.ideas_team_shared).toBe(350)
    expect(client.ideas_breakdown).toEqual({ owned: 700, team_shared: 350, total: 1050 })
  })

  it('strategicInitiatives: a client\'s first initiative counts behind 1,100 of other clients\'', async () => {
    const others = Array.from({ length: 1100 }, (_, i) => ({ id: rowId('si', i), business_id: `prof-other-${i % 26}` }))
    const acme = { id: rowId('si', 9000), business_id: 'prof-1' }
    const initiatives: TableResp = { data: [...others, acme], error: null }

    expect(await unpagedRead(initiatives)).not.toContainEqual(acme)

    const client = await getFirstClient({ defaults: { strategic_initiatives: initiatives } })
    expect(client.modules.strategicInitiatives).toBe('completed')
    expect(client.modules.onePagePlan).toBe('in_progress')
  })
})

describe('Group R — how a read pages', () => {
  it('keeps reading past a SHORT page: a project whose Max rows is below the page size', async () => {
    // Max rows set to 300, so every page comes back short of the 1,000 asked
    // for. A reader that stopped on a short page would never see the newest message.
    const rows = [
      ...Array.from({ length: 700 }, (_, i) => ({
        id: rowId('msg', i), business_id: 'biz-1', sender_id: 'owner-1', read: true, created_at: daysAgoIso(200 - i / 10),
      })),
      { id: rowId('msg', 700), business_id: 'biz-1', sender_id: 'owner-1', read: false, created_at: daysAgoIso(0) },
    ]
    const client = await getFirstClient({ defaults: { messages: { data: rows, error: null, maxRows: 300 } } })
    expect(client.engagement.unreadMessages).toBe(1)

    // 300 + 300 + 101 rows, then the empty page that ends the read — each page
    // starting after the last id the one before it returned.
    expect(selectCalls.filter((c) => c.table === 'messages')).toHaveLength(4)
    expect(gtCalls.filter((c) => c.table === 'messages').map((c) => c.val)).toEqual([
      rowId('msg', 299), rowId('msg', 599), rowId('msg', 700),
    ])
  })

  it('exactly 1,000 rows: one full page, then the empty page that proves it was all of them', async () => {
    const ideas = Array.from({ length: 1000 }, (_, i) => ({
      id: rowId('idea', i), user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: [],
    }))
    const client = await getFirstClient({ ideas: { data: ideas, error: null } })
    expect(client.ideas_total).toBe(1000)
    expect(selectCalls.filter((c) => c.table === 'ideas')).toHaveLength(2)
  })

  it('a page that fails part-way makes the whole read unknown, not the rows before it', async () => {
    // The first page shows Acme has messages, but the unread ones are on the
    // page that failed — a partial read is not an answer.
    const rows = Array.from({ length: 1500 }, (_, i) => ({
      id: rowId('msg', i), business_id: 'biz-1', sender_id: 'owner-1', read: i < 1400, created_at: daysAgoIso(100 - i / 20),
    }))
    const client = await getFirstClient({ defaults: { messages: { data: rows, error: null, failOnRequest: 1 } } })
    expect(client.modules.messages).toBe('unknown')
    expect(client.engagement.unknown).toEqual(['unreadMessages'])
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      '[client-completion] query error: simulated messages failure on request 1',
      expect.objectContaining({
        tags: expect.objectContaining({ source: 'messages', invariant: 'client-completion-load' }),
      })
    )
  })

  it('a read that never reaches an empty page stops after 50 pages and is unknown', async () => {
    const client = await getFirstClient({ defaults: { messages: { data: [], error: null, endless: true } } })
    expect(client.modules.messages).toBe('unknown')
    expect(client.engagement.unknown).toEqual(['unreadMessages'])
    // Messages feed neither the score nor an alert, so those still answer.
    expect(typeof client.engagement.engagementScore).toBe('number')
    expect(client.alertsComplete).toBe(true)
    expect(selectCalls.filter((c) => c.table === 'messages')).toHaveLength(50)
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      '[client-completion] read did not reach its end in 50 pages',
      expect.objectContaining({
        tags: expect.objectContaining({ source: 'messages', invariant: 'client-completion-load' }),
      })
    )
  })

  it('rows with no id cannot be paged from: the read is unknown, not the rows it got', async () => {
    const client = await getFirstClient({
      defaults: { stop_doing_items: { data: [{ user_id: 'owner-1' }], error: null } },
    })
    expect(client.modules.stopDoing).toBe('unknown')
  })

  it('daysSinceSession: the latest completed session decides, wherever it falls in id order', async () => {
    // Pages arrive in id order, and the latest session has neither the first id nor the last.
    const client = await getFirstClient({
      defaults: {
        coaching_sessions: {
          data: [
            { id: 'cs-1', business_id: 'biz-1', scheduled_at: daysAgoIso(40), status: 'completed' },
            { id: 'cs-2', business_id: 'biz-1', scheduled_at: daysAgoIso(3), status: 'completed' },
            { id: 'cs-3', business_id: 'biz-1', scheduled_at: daysAgoIso(20), status: 'completed' },
          ],
          error: null,
        },
      },
    })
    expect(client.engagement.daysSinceSession).toBe(3)
    expect(client.alerts.filter((a: string) => a.startsWith('No session'))).toEqual([])
  })

  it('every batched read selects id, orders by id alone, asks for 1,000 and ends on an empty page', async () => {
    // Two rows in every table: one page of rows, then the empty page that ends the read.
    const twoRows = (table: string): TableResp => ({
      data: [
        { id: `${table}-a`, business_id: 'biz-1', user_id: 'owner-1' },
        { id: `${table}-b`, business_id: 'biz-1', user_id: 'owner-1' },
      ],
      error: null,
    })
    await getFirstClient({
      business_profiles: twoRows('business_profiles'),
      ideas: twoRows('ideas'),
      defaults: Object.fromEntries(BATCH_TABLES.map((t) => [t, twoRows(t)])),
    })

    for (const table of [...BATCH_TABLES, 'business_profiles', 'ideas']) {
      const selects = selectCalls.filter((c) => c.table === table)
      expect(selects, table).toHaveLength(2)
      for (const s of selects) expect(s.cols.split(',').map((c) => c.trim()), table).toContain('id')
      // No read brings an order of its own: a second sort key would break paging by id.
      expect(orderCalls.filter((c) => c.table === table), table).toEqual([
        { table, col: 'id', ascending: true },
        { table, col: 'id', ascending: true },
      ])
      expect(limitCalls.filter((c) => c.table === table).map((c) => c.count), table).toEqual([1000, 1000])
      expect(gtCalls.filter((c) => c.table === table), table).toEqual([{ table, col: 'id', val: `${table}-b` }])
    }
  })
})

// ─── Group S — the quarterly review is read by the id its writer stores ──────
//
// quarterly_reviews.business_id is a foreign key to businesses.id (validated in
// prod), and the workshop stores the businesses.id that resolveBusinessId
// returns. The route read the table by business_profiles.id and the owner's
// user_id — ids that column can never hold — so on 15 Sep 2026 it matched none
// of the 13 reviews under the 27-client coach, and every client read
// 'not_started', including the 6 with a completed review. No id translation is
// needed: the route holds each client's businesses.id from the businesses read,
// as session notes and messages already use it.

describe('Group S — the quarterly review is read by businesses.id, the id its writer stores', () => {
  const reviews = (...rows: Array<{ business_id: string; status: string }>): TableResp => ({
    data: rows.map((row, i) => ({ id: rowId('qr', i), ...row })),
    error: null,
  })

  it('a completed review keyed by businesses.id reads completed', async () => {
    const client = await getFirstClient({
      defaults: { quarterly_reviews: reviews({ business_id: 'biz-1', status: 'completed' }) },
    })
    expect(client.modules.quarterlyReview).toBe('completed')
  })

  it.each(['not_started', 'prework_complete', 'in_progress'])(
    'a review keyed by businesses.id at status %s reads in_progress',
    async (status) => {
      // The workshop inserts the row, at not_started, when the client presses Start.
      const client = await getFirstClient({
        defaults: { quarterly_reviews: reviews({ business_id: 'biz-1', status }) },
      })
      expect(client.modules.quarterlyReview).toBe('in_progress')
    }
  )

  it('filters quarterly_reviews by the businesses\' ids, not profile ids or owners\' user_ids', async () => {
    await getFirstClient()
    const filters = inCalls.filter((c) => c.table === 'quarterly_reviews')
    expect(filters.length).toBeGreaterThan(0)
    for (const c of filters) expect(c).toEqual({ table: 'quarterly_reviews', col: 'business_id', vals: ['biz-1'] })
    expect(orCalls.filter((c) => c.table === 'quarterly_reviews')).toEqual([])
  })

  it('each client reads its own reviews (the shapes found on prod, 15 Sep 2026)', async () => {
    const names = ['Acme', 'Bolt', 'Crane', 'Delta']
    createRouteHandlerClientMock.mockResolvedValueOnce(
      makeSupabase({
        businesses: {
          data: names.map((name, i) => ({ id: `biz-${i + 1}`, business_name: name, name, owner_id: `owner-${i + 1}`, status: 'active' })),
          error: null,
        },
        business_profiles: {
          data: names.map((name, i) => ({ id: `prof-${i + 1}`, business_id: `biz-${i + 1}`, user_id: `owner-${i + 1}`, business_name: name })),
          error: null,
        },
        defaults: {
          quarterly_reviews: reviews(
            // Two completed quarters and this one under way: still completed.
            { business_id: 'biz-1', status: 'completed' },
            { business_id: 'biz-1', status: 'completed' },
            { business_id: 'biz-1', status: 'in_progress' },
            { business_id: 'biz-2', status: 'in_progress' },
            // Pressed Start, pre-work not yet done.
            { business_id: 'biz-3', status: 'not_started' },
          ),
        },
      })
    )
    const res = await GET(new Request('http://localhost/api/coach/client-completion'))
    expect(res.status).toBe(200)
    const { clients } = await res.json()

    expect(Object.fromEntries(clients.map((c: any) => [c.businessId, c.modules.quarterlyReview]))).toEqual({
      'biz-1': 'completed',
      'biz-2': 'in_progress',
      'biz-3': 'in_progress',
      'biz-4': 'not_started',
    })
  })

  it('needs no profile id: with business_profiles unread, the review still answers', async () => {
    let client = await getFirstClient({
      business_profiles: FAILED,
      defaults: { quarterly_reviews: reviews({ business_id: 'biz-1', status: 'in_progress' }) },
    })
    expect(client.modules.quarterlyReview).toBe('in_progress')

    client = await getFirstClient({ business_profiles: FAILED })
    expect(client.modules.quarterlyReview).toBe('not_started')
  })
})
