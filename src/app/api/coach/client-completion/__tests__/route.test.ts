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
 *      with the breakdown zeroed for that client (degraded but non-broken).
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

type TableResp = { data: unknown; error?: unknown }

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

/** Every query-shape call the route makes, for assertions on the SQL it would send. */
const selectCalls: Array<{ table: string; cols: string }> = []
const inCalls: Array<{ table: string; col: string; vals: unknown[] }> = []
const orCalls: Array<{ table: string; filter: string }> = []

function makeChainable(result: TableResp, table = ''): Record<string, any> {
  const b: Record<string, any> = {}
  const ret = () => b
  b.select = vi.fn((cols: string) => { selectCalls.push({ table, cols }); return b })
  b.eq = vi.fn(ret)
  b.in = vi.fn((col: string, vals: unknown[]) => { inCalls.push({ table, col, vals }); return b })
  b.or = vi.fn((filter: string) => { orCalls.push({ table, filter }); return b })
  b.order = vi.fn(ret)
  b.limit = vi.fn(ret)
  b.single = vi.fn(() => Promise.resolve(result))
  b.maybeSingle = vi.fn(() => Promise.resolve(result))
  ;(b as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    Promise.resolve(result).then(resolve, reject)
  }
  return b
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

  const fromSpy = vi.fn((table: string) => {
    if (table === 'system_roles') return makeChainable(systemRole, table)
    if (table === 'businesses') return makeChainable(businesses, table)
    if (table === 'business_profiles') return makeChainable(business_profiles, table)
    if (table === 'ideas') return makeChainable(ideasResp, table)
    if (defaults[table]) return makeChainable(defaults[table], table)
    return makeChainable({ data: [], error: null }, table)
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
  it('returns 200 with zeroed breakdown and does not crash when the ideas query errors', async () => {
    createRouteHandlerClientMock.mockResolvedValueOnce(
      makeSupabase({ ideas_error: { message: 'simulated db error' } })
    )

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
        defaults: { strategy_data: { data: [{ user_id: 'owner-1', vision_mission: fullVisionMission }], error: null } },
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
            data: [{ user_id: 'owner-1', vision_mission: { ...fullVisionMission, core_values: [] } }],
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
