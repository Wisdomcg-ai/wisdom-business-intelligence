/**
 * Phase 46 Plan 46-04 — SEC-07 wiring canary test.
 *
 * Asserts that the canary API route (src/app/api/coach/stats/route.ts)
 * calls Sentry.captureException when its error path is triggered.
 *
 * RED state: the route currently uses `console.error('Coach stats API error:', error)`
 * in its catch block (line 168) — NO Sentry call yet.
 *
 * GREEN state after Task 7 batch 8 (api/coach) sweep: catch block also
 * calls Sentry.captureException.
 *
 * Canary route selection: coach/stats/route.ts has a clean try/catch with
 * a single console.error in the catch path. To trigger it deterministically
 * we make `supabase.auth.getUser()` throw (rather than returning
 * `{ data: null, error }` — that path only returns a 401 and does NOT
 * exercise the catch block, which is the path SEC-07 must wire to Sentry).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

// Mock Supabase client so auth.getUser THROWS — this drops control into
// the route's `catch (error)` block, which is the path SEC-07 wires to Sentry.
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockRejectedValue(new Error('simulated supabase auth failure')),
    },
  }),
}))

describe('SEC-07: canary route (coach/stats) routes errors to Sentry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls Sentry.captureException when the route catches an unexpected error', async () => {
    const { GET } = await import('@/app/api/coach/stats/route')
    const Sentry = await import('@sentry/nextjs')
    const res = await GET()
    // Route returns 500 from its catch block — regression-check the status
    // alongside the Sentry assertion so the canary is meaningful.
    expect(res.status).toBe(500)
    expect((Sentry.captureException as any).mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})
