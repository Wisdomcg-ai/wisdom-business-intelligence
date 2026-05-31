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

function makeChainable(result: TableResp): Record<string, any> {
  const b: Record<string, any> = {}
  const ret = () => b
  b.select = vi.fn(ret)
  b.eq = vi.fn(ret)
  b.in = vi.fn(ret)
  b.or = vi.fn(ret)
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
        { id: 'prof-1', business_id: 'biz-1', user_id: 'owner-1', business_name: 'Acme', mission: null, vision: null, owner_info: null },
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
    if (table === 'system_roles') return makeChainable(systemRole)
    if (table === 'businesses') return makeChainable(businesses)
    if (table === 'business_profiles') return makeChainable(business_profiles)
    if (table === 'ideas') return makeChainable(ideasResp)
    if (defaults[table]) return makeChainable(defaults[table])
    return makeChainable({ data: [], error: null })
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
