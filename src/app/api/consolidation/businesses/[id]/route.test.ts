/**
 * Integration tests for PATCH /api/consolidation/businesses/[id].
 *
 * Phase 34 Step 2 — hybrid budget mode toggle. Covers:
 *   - Auth gate (401 when unauthenticated)
 *   - Role gate (403 when not coach/super_admin)
 *   - Access gate (403 when coach doesn't own / isn't assigned to business)
 *   - Happy path (coach updates consolidation_budget_mode on own business)
 *   - Super admin bypass (any business)
 *   - Validation (bad mode → 400, no fields → 400, bad uuid → 400)
 *   - Update returns the persisted row
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@supabase/supabase-js', () => {
  const proxy = {
    from: (table: string) => currentServiceMock.from(table),
  }
  return { createClient: vi.fn(() => proxy) }
})
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => currentAuthMock),
}))

let currentServiceMock: any = { from: () => ({}) }
let currentAuthMock: any = {}

function setServiceMock(mock: any) {
  currentServiceMock = mock
}
function setAuthMock(mock: any) {
  currentAuthMock = mock
}

const BIZ = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER_BIZ = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const COACH_UID = 'coach-uid'
const SUPER_UID = 'super-uid'
const INTRUDER_UID = 'intruder-uid'

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Builds an auth client mock that answers the guard's three queries:
 *   1. auth.getUser() → user with `uid`, or null for unauthed
 *   2. .from('system_roles').select().eq('user_id', uid).maybeSingle() → role row
 *   3. .from('businesses').select().eq('id', bid).or(owner_id.eq.<uid>, assigned_coach_id.eq.<uid>).maybeSingle()
 *
 * `ownedBiz` controls which business UUIDs the coach has access to. When
 * `role === 'super_admin'`, the biz query is not consulted.
 */
function buildAuthMock(args: {
  uid: string | null
  role: 'coach' | 'super_admin' | null
  ownedBiz?: string[]
}) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: args.uid ? { id: args.uid } : null },
        error: args.uid ? null : new Error('not authed'),
      }),
    },
    from: (table: string) => {
      if (table === 'system_roles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: args.role ? { role: args.role } : null,
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'businesses') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              or: () => ({
                maybeSingle: async () => ({
                  data:
                    (args.ownedBiz ?? []).includes(val) ? { id: val } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }
    },
  }
}

/**
 * Builds a service-role client mock for the .update() call. Captures the
 * last patch sent so tests can assert the exact column values.
 */
function buildServiceMock(initialRows: any[] = [{ id: BIZ, name: 'Test', consolidation_budget_mode: 'single' }]) {
  const rows = [...initialRows]
  const captured: { patch?: any; id?: string } = {}
  return {
    captured,
    mock: {
      from: (table: string) => {
        if (table !== 'businesses') {
          throw new Error(`[test] unexpected service from(${table})`)
        }
        return {
          update: (patch: any) => {
            captured.patch = patch
            return {
              eq: (_col: string, id: string) => {
                captured.id = id
                return {
                  select: () => ({
                    maybeSingle: async () => {
                      const row = rows.find((r) => r.id === id)
                      if (!row) return { data: null, error: null }
                      Object.assign(row, patch)
                      return {
                        data: {
                          id: row.id,
                          name: row.name,
                          consolidation_budget_mode: row.consolidation_budget_mode,
                        },
                        error: null,
                      }
                    },
                  }),
                }
              },
            }
          },
        }
      },
    },
  }
}

async function invokeRoute(id: string, body: unknown) {
  const { PATCH } = await import('./route')
  const req = new Request(
    `http://localhost/api/consolidation/businesses/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const res = await PATCH(req as any, { params: Promise.resolve({ id }) })
  return {
    status: res.status,
    json: (await res.json()) as any,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PATCH /api/consolidation/businesses/[id]', () => {
  beforeEach(() => {
    const svc = buildServiceMock()
    setServiceMock(svc.mock)
  })

  it('returns 400 when id is not a UUID', async () => {
    setAuthMock(buildAuthMock({ uid: COACH_UID, role: 'coach', ownedBiz: [BIZ] }))
    const { status } = await invokeRoute('not-a-uuid', {
      consolidation_budget_mode: 'per_tenant',
    })
    expect(status).toBe(400)
  })

  it('returns 401 when the request is not authenticated', async () => {
    setAuthMock(buildAuthMock({ uid: null, role: null }))
    const { status, json } = await invokeRoute(BIZ, {
      consolidation_budget_mode: 'per_tenant',
    })
    expect(status).toBe(401)
    expect(json.error).toMatch(/unauthorized/i)
  })

  it('returns 403 when user lacks coach/super_admin role', async () => {
    setAuthMock(buildAuthMock({ uid: INTRUDER_UID, role: null, ownedBiz: [] }))
    const { status, json } = await invokeRoute(BIZ, {
      consolidation_budget_mode: 'per_tenant',
    })
    expect(status).toBe(403)
    expect(json.error).toMatch(/coach or super_admin/i)
  })

  it('returns 403 when coach does not own / is not assigned to the business', async () => {
    setAuthMock(
      buildAuthMock({ uid: COACH_UID, role: 'coach', ownedBiz: [OTHER_BIZ] }),
    )
    const { status, json } = await invokeRoute(BIZ, {
      consolidation_budget_mode: 'per_tenant',
    })
    expect(status).toBe(403)
    expect(json.error).toMatch(/not owner/i)
  })

  it('coach with ownership → updates mode to per_tenant (200 + persisted)', async () => {
    const svc = buildServiceMock([
      { id: BIZ, name: 'Dragon', consolidation_budget_mode: 'single' },
    ])
    setServiceMock(svc.mock)
    setAuthMock(buildAuthMock({ uid: COACH_UID, role: 'coach', ownedBiz: [BIZ] }))

    const { status, json } = await invokeRoute(BIZ, {
      consolidation_budget_mode: 'per_tenant',
    })
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.business.consolidation_budget_mode).toBe('per_tenant')
    expect(svc.captured.patch).toEqual({
      consolidation_budget_mode: 'per_tenant',
    })
    expect(svc.captured.id).toBe(BIZ)
  })

  it('super_admin bypasses ownership check and updates any business', async () => {
    const svc = buildServiceMock([
      { id: BIZ, name: 'Dragon', consolidation_budget_mode: 'per_tenant' },
    ])
    setServiceMock(svc.mock)
    setAuthMock(
      buildAuthMock({ uid: SUPER_UID, role: 'super_admin', ownedBiz: [] }),
    )

    const { status, json } = await invokeRoute(BIZ, {
      consolidation_budget_mode: 'single',
    })
    expect(status).toBe(200)
    expect(json.business.consolidation_budget_mode).toBe('single')
  })

  it('rejects invalid budget_mode values with 400', async () => {
    setAuthMock(buildAuthMock({ uid: COACH_UID, role: 'coach', ownedBiz: [BIZ] }))
    const { status, json } = await invokeRoute(BIZ, {
      consolidation_budget_mode: 'bogus',
    })
    expect(status).toBe(400)
    expect(json.error).toMatch(/single \| per_tenant/)
  })

  it('rejects empty payload with 400 (no updatable fields)', async () => {
    setAuthMock(buildAuthMock({ uid: COACH_UID, role: 'coach', ownedBiz: [BIZ] }))
    const { status, json } = await invokeRoute(BIZ, {})
    expect(status).toBe(400)
    expect(json.error).toMatch(/no updatable fields/i)
  })

  it('rejects non-object body with 400', async () => {
    setAuthMock(buildAuthMock({ uid: COACH_UID, role: 'coach', ownedBiz: [BIZ] }))
    const { PATCH } = await import('./route')
    const req = new Request(
      `http://localhost/api/consolidation/businesses/${BIZ}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      },
    )
    const res = await PATCH(req as any, { params: Promise.resolve({ id: BIZ }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 when business row is not found by service-role update', async () => {
    // Service mock has no rows — update returns null data.
    const svc = buildServiceMock([])
    setServiceMock(svc.mock)
    setAuthMock(buildAuthMock({ uid: SUPER_UID, role: 'super_admin' }))

    const { status, json } = await invokeRoute(BIZ, {
      consolidation_budget_mode: 'per_tenant',
    })
    expect(status).toBe(404)
    expect(json.error).toMatch(/not found/i)
  })
})
