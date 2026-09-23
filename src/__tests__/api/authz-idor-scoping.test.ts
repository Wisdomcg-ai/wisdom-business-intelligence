/**
 * App-authz audit (24 Aug 2026) — regression tests for the two Tier-A IDOR
 * holes reachable by ANY authenticated user via the service-role client (RLS
 * bypassed, so there is no DB backstop):
 *
 *   AUTHZ-SR-01  goals/save          — client-supplied profileId used as the
 *                                       write key without checking it belongs
 *                                       to the authorized businessId.
 *   AUTHZ-SR-02  team/remove-member  — memberId deleted without scoping to the
 *                                       authorized businessId.
 *
 * Each test drives the real route with a CROSS-TENANT id and asserts (a) the
 * request is rejected and (b) the service-role query carries the business_id
 * scoping filter — so removing the fix would fail the test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@/lib/security/csrf', () => ({ csrfProtection: vi.fn().mockResolvedValue({ valid: true }) }))

const routeHandlerClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: (...a: unknown[]) => routeHandlerClientMock(...a),
}))
const serviceRoleClientMock = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: (...a: unknown[]) => serviceRoleClientMock(...a),
}))

import { POST as GOALS_POST } from '@/app/api/goals/save/route'
import { POST as REMOVE_POST } from '@/app/api/team/remove-member/route'

type Result = { data: unknown; error: unknown }

function recorder(result: Result) {
  const eqCalls: [string, unknown][] = []
  const b: Record<string, unknown> = { eqCalls }
  b.select = () => b
  b.delete = () => b
  b.update = () => b
  b.insert = () => b
  b.upsert = () => b
  b.eq = (col: string, val: unknown) => { eqCalls.push([col, val]); return b }
  b.maybeSingle = () => Promise.resolve(result)
  b.single = () => Promise.resolve(result)
  b.then = (onF: (v: Result) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(result).then(onF, onR)
  return b as Record<string, unknown> & { eqCalls: [string, unknown][] }
}

function makeAdmin(queues: Record<string, Result[]>) {
  const created: Array<{ table: string; rec: ReturnType<typeof recorder> }> = []
  const idx: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    const q = queues[table] ?? []
    const i = idx[table] ?? 0
    idx[table] = i + 1
    const rec = recorder(q[i] ?? { data: null, error: null })
    created.push({ table, rec })
    return rec
  })
  return { client: { from }, created }
}

const authedUser = () => ({
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
})
const jsonReq = (body: unknown) =>
  new Request('http://test/local', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

beforeEach(() => { vi.clearAllMocks() })

describe('AUTHZ-SR-02 — team/remove-member scopes memberId to the authorized business', () => {
  it('a cross-tenant memberId resolves to 404 (not found under the business scope)', async () => {
    routeHandlerClientMock.mockResolvedValue(authedUser())
    const { client, created } = makeAdmin({
      system_roles: [{ data: { role: 'client' }, error: null }],       // not super_admin
      businesses: [{ data: { id: 'biz-A', owner_id: 'user-1', assigned_coach_id: null }, error: null }], // caller owns biz-A
      business_users: [
        { data: null, error: null },  // auth membership check
        { data: null, error: null },  // member lookup scoped to biz-A → cross-tenant memberId NOT found
      ],
    })
    serviceRoleClientMock.mockReturnValue(client)

    const res = await REMOVE_POST(jsonReq({ memberId: 'member-of-biz-B', businessId: 'biz-A' }))
    expect(res.status).toBe(404)

    // the member lookup MUST be scoped by business_id (the fix)
    const memberLookup = created
      .filter((c) => c.table === 'business_users')
      .find((c) => c.rec.eqCalls.some(([k]) => k === 'id'))
    expect(memberLookup).toBeDefined()
    expect(memberLookup!.rec.eqCalls).toContainEqual(['id', 'member-of-biz-B'])
    expect(memberLookup!.rec.eqCalls).toContainEqual(['business_id', 'biz-A'])
  })

  it('a same-business member is found and the delete is also business-scoped', async () => {
    routeHandlerClientMock.mockResolvedValue(authedUser())
    const { client, created } = makeAdmin({
      system_roles: [{ data: { role: 'client' }, error: null }],
      businesses: [{ data: { id: 'biz-A', owner_id: 'user-1', assigned_coach_id: null }, error: null }],
      business_users: [
        { data: null, error: null },                        // auth membership check
        { data: { user_id: 'other-user' }, error: null },   // member lookup → found (belongs to biz-A)
        { data: null, error: null },                        // delete → ok
      ],
    })
    serviceRoleClientMock.mockReturnValue(client)

    const res = await REMOVE_POST(jsonReq({ memberId: 'member-of-biz-A', businessId: 'biz-A' }))
    expect(res.status).toBe(200)

    // EVERY business_users query that targets a specific member id is business-scoped
    const idScoped = created.filter(
      (c) => c.table === 'business_users' && c.rec.eqCalls.some(([k]) => k === 'id'),
    )
    expect(idScoped.length).toBeGreaterThanOrEqual(2) // lookup + delete
    for (const c of idScoped) expect(c.rec.eqCalls).toContainEqual(['business_id', 'biz-A'])
  })
})

describe('AUTHZ-SR-01 — goals/save rejects a profileId that is not part of the authorized business', () => {
  it('a cross-tenant profileId returns 403 and the check is business-scoped', async () => {
    routeHandlerClientMock.mockResolvedValue(authedUser())
    const { client, created } = makeAdmin({
      businesses: [{ data: { id: 'biz-A', owner_id: 'user-1', assigned_coach_id: null }, error: null }], // caller owns biz-A
      system_roles: [{ data: null, error: null }],           // not super_admin
      business_profiles: [{ data: null, error: null }],      // profile-of-B does NOT belong to biz-A
    })
    serviceRoleClientMock.mockReturnValue(client)

    const res = await GOALS_POST(jsonReq({ businessId: 'biz-A', profileId: 'profile-of-biz-B', data: {} }))
    expect(res.status).toBe(403)

    const profLookup = created.find((c) => c.table === 'business_profiles')
    expect(profLookup).toBeDefined()
    expect(profLookup!.rec.eqCalls).toContainEqual(['id', 'profile-of-biz-B'])
    expect(profLookup!.rec.eqCalls).toContainEqual(['business_id', 'biz-A'])
  })
})
