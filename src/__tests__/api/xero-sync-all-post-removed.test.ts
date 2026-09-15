/**
 * AUTHZ-A (app-authz audit, 24 Aug 2026) — POST /api/Xero/sync-all is gone.
 *
 * The POST checked only that a session existed, so any signed-in user could run
 * syncBusinessXeroPL for a business they have no link to, or the fleet-wide
 * runSyncForAllBusinesses loop with { all: true }. Nothing called it, so it was
 * deleted rather than gated.
 *
 * With no POST export there is no handler to call directly, so these dispatch
 * through Next's own method table for the route module: Next 14.2's
 * AppRouteRouteModule builds `methods = autoImplementMethods(userland)` and
 * serves every request from it. That is what production does with a POST here.
 * (Next 15 moves the helper to next/dist/server/route-modules/... — update the
 * import on upgrade.)
 *
 * The session is mocked as a signed-in client owner of another business, so a
 * revert that restores the ungated POST fails on the orchestrator call itself
 * rather than on a missing cookie store.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { autoImplementMethods } from 'next/dist/server/future/route-modules/app-route/helpers/auto-implement-methods'
import * as route from '@/app/api/Xero/sync-all/route'
import { runSyncForAllBusinesses, syncBusinessXeroPL } from '@/lib/xero/sync-orchestrator'

vi.mock('@/lib/xero/sync-orchestrator', () => ({
  runSyncForAllBusinesses: vi.fn().mockName('runSyncForAllBusinesses').mockResolvedValue([]),
  syncBusinessXeroPL: vi.fn().mockName('syncBusinessXeroPL').mockResolvedValue({ status: 'success' }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'client-owner-of-another-business' } },
        error: null,
      }),
    },
    // auth_is_super_admin → false
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
  })),
}))

const SOMEONE_ELSES_BUSINESS_ID = '9b1c2d3e-0000-4000-8000-000000000001'

function postSyncAll(body: unknown) {
  return new NextRequest('http://localhost/api/Xero/sync-all', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('AUTHZ-A: POST /api/Xero/sync-all is gone', () => {
  const methods = autoImplementMethods(route)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports GET as its only HTTP handler', () => {
    const handlers = Object.keys(route).filter((key) =>
      ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(key),
    )
    expect(handlers).toEqual(['GET'])
  })

  it('a signed-in non-admin POSTing { all: true } gets 405 and the fleet loop never starts', async () => {
    const res = (await methods.POST(postSyncAll({ all: true }), {})) as Response

    expect(runSyncForAllBusinesses).not.toHaveBeenCalled()
    expect(syncBusinessXeroPL).not.toHaveBeenCalled()
    expect(res.status).toBe(405)
  })

  it("a signed-in non-admin POSTing someone else's businessId gets 405 and that business is never synced", async () => {
    const res = (await methods.POST(
      postSyncAll({ businessId: SOMEONE_ELSES_BUSINESS_ID }),
      {},
    )) as Response

    expect(syncBusinessXeroPL).not.toHaveBeenCalled()
    expect(runSyncForAllBusinesses).not.toHaveBeenCalled()
    expect(res.status).toBe(405)
  })
})
