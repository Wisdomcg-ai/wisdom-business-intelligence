/**
 * R24 (MNT-N1) — auth guard regression for /api/monthly-report/templates.
 *
 * This route uses a module-level service-role client. Before R24 every verb
 * (GET/POST/PUT/DELETE) gated only on `business_id` presence, so any caller
 * with a valid business_id could read/create/overwrite/delete ANY tenant's
 * report templates.
 *
 * The contract these tests lock:
 *   - unauthenticated (no session)        → 401 on every verb
 *   - authenticated but not authorized     → 403 on every verb
 *   - the verb short-circuits BEFORE doing any DB work
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Module-level service-role client must not touch the network at import ─────
const serviceFrom = vi.fn(() => {
  throw new Error('service-role DB must not be reached when auth/authz fails')
})
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: serviceFrom })),
}))
vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: vi.fn(() => 'test-secret-key'),
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

// ── Auth + authz mocks (the surfaces under test) ──────────────────────────────
let currentUser: any = null
let currentAccess = false
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: currentUser }, error: null })) },
  })),
}))
const verifyBusinessAccess = vi.fn(async (_userId: string, _businessId: string) => currentAccess)
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (userId: string, businessId: string) =>
    verifyBusinessAccess(userId, businessId),
}))

const BIZ_ID = 'biz-templates-guard-0001'
const USER_ID = 'user-templates-guard-0001'

async function callVerb(verb: 'GET' | 'POST' | 'PUT' | 'DELETE') {
  const route = await import('../route')
  if (verb === 'GET') {
    return route.GET(
      new NextRequest(`http://localhost/api/monthly-report/templates?business_id=${BIZ_ID}`),
    )
  }
  if (verb === 'DELETE') {
    return route.DELETE(
      new NextRequest(
        `http://localhost/api/monthly-report/templates?id=tpl-1&business_id=${BIZ_ID}`,
        { method: 'DELETE' },
      ),
    )
  }
  // POST / PUT carry the business_id (and required fields) in the JSON body.
  const body =
    verb === 'POST'
      ? { business_id: BIZ_ID, name: 'X', sections: {}, column_settings: {} }
      : { id: 'tpl-1', business_id: BIZ_ID, name: 'X' }
  return (route as any)[verb](
    new NextRequest('http://localhost/api/monthly-report/templates', {
      method: verb,
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  )
}

const VERBS = ['GET', 'POST', 'PUT', 'DELETE'] as const

describe('monthly-report/templates auth guard (R24)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentUser = null
    currentAccess = false
  })

  for (const verb of VERBS) {
    it(`${verb} returns 401 when unauthenticated`, async () => {
      currentUser = null
      const res = await callVerb(verb)
      expect(res.status).toBe(401)
      expect(serviceFrom).not.toHaveBeenCalled()
    })

    it(`${verb} returns 403 when authenticated but not authorized`, async () => {
      currentUser = { id: USER_ID }
      currentAccess = false
      const res = await callVerb(verb)
      expect(res.status).toBe(403)
      expect(verifyBusinessAccess).toHaveBeenCalledWith(USER_ID, BIZ_ID)
      expect(serviceFrom).not.toHaveBeenCalled()
    })
  }
})
