/**
 * Integration tests: Phase 65-02 — LOG_ONLY section-permission wiring
 * for GET /api/forecast/[id].
 *
 * Asserts:
 *   A) A member with section_permissions.finances = false still gets a 200 in
 *      LOG_ONLY mode (SECTION_PERMISSION_ENFORCE unset / false), AND
 *      Sentry.captureMessage fires with the expected tags.
 *   B) The business owner gets a 200 and Sentry.captureMessage is NOT called
 *      with 'section_permission_check' (allow path is silent).
 *
 * Strategy: mock requireSectionPermission to return a controlled verdict and
 * rely on the real enforceSectionPermission (SECTION_PERMISSION_ENFORCE is
 * unset in tests → always LOG_ONLY=false → always returns null).  The auth
 * client mock is kept minimal — it just needs to pass the route's own access
 * check so the section-permission gate is actually reached.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Sentry spy ────────────────────────────────────────────────────────────────
const captureMessageSpy = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageSpy,
  captureException: vi.fn(),
}))

// ── sectionPermissionConfig: ensure LOG_ONLY mode is active ──────────────────
vi.mock('@/lib/permissions/sectionPermissionConfig', async (importOriginal) => {
  const real = (await importOriginal()) as any
  return { ...real, SECTION_PERMISSION_ENFORCE: false }
})

// ── requireSectionPermission: controlled verdict per test ────────────────────
const requireSectionPermissionMock = vi.fn()
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: requireSectionPermissionMock,
}))

// ── Supabase mocks ────────────────────────────────────────────────────────────
let currentAuthMock: any = {}
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => currentAuthMock),
}))

// ── Constants ─────────────────────────────────────────────────────────────────
const OWNER_ID = 'owner-uuid-forecast-01'
const MEMBER_ID = 'member-uuid-forecast-02'
const BIZ_ID = 'biz-uuid-forecast-0001'
const FORECAST_ID = 'forecast-uuid-0001-0001'

// ── Forecast row fixture ──────────────────────────────────────────────────────
const FORECAST_ROW = {
  id: FORECAST_ID,
  business_id: BIZ_ID,
  fiscal_year: 2026,
  forecast_start_month: '2025-07',
  forecast_end_month: '2026-06',
  forecast_duration: 1,
  is_active: true,
  is_locked: false,
  assumptions: {},
  computed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  actual_start_month: null,
  actual_end_month: null,
}

// ── Auth client builders ──────────────────────────────────────────────────────

/**
 * Builds a combined auth client that handles all table queries made by the
 * forecast/[id] GET route's own access check.
 *
 * Route access flow (simplified):
 *   1. supabase.auth.getUser()
 *   2. financial_forecasts: .select(*).eq('id', forecastId).maybeSingle()
 *   3. businesses: .select('id, owner_id').eq('id', forecast.business_id).maybeSingle()
 *      → if no direct match, fallback via business_profiles
 *   4. if !isOwner → business_users: .select('id').eq(biz).eq(user).eq('status','active').maybeSingle()
 *      → if no team member → system_roles check
 *
 * For the OWNER path: businesses.owner_id === userId → isOwner = true → skip steps 3-4.
 * For the MEMBER path: make businesses return owner_id ≠ userId, and
 *   return a team-member row from business_users so the route passes the access check
 *   (requireSectionPermission is mocked so no further DB calls are needed for it).
 */
function buildAuthClient(userId: string, isOwner: boolean) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'financial_forecasts') {
        return {
          select: () => ({
            eq: (_c: string, _v: string) => ({
              maybeSingle: async () => ({ data: FORECAST_ROW, error: null }),
            }),
          }),
        }
      }
      if (table === 'businesses') {
        const ownerId = isOwner ? userId : 'someone-else'
        return {
          select: () => ({
            eq: (_c: string, _v: string) => ({
              // Route access check: .select('id, owner_id').eq(...).maybeSingle()
              maybeSingle: async () => ({
                data: { id: BIZ_ID, owner_id: ownerId },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'business_users') {
        // Route access check: .select('id').eq(biz).eq(user).eq('status','active').maybeSingle()
        // Return an active member row so the route passes the access check for the member path
        const memberRow = { id: 'bu-uuid-001' }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: memberRow, error: null }),
                }),
                maybeSingle: async () => ({ data: memberRow, error: null }),
              }),
              maybeSingle: async () => ({ data: memberRow, error: null }),
            }),
          }),
        }
      }
      if (table === 'system_roles') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }
    },
  }
}

async function invokeRoute(forecastId: string) {
  const { GET } = await import('../route')
  const req = new Request(`http://localhost/api/forecast/${forecastId}`)
  const ctx = { params: Promise.resolve({ id: forecastId }) }
  const res = await GET(req as any, ctx as any)
  return { status: res.status, json: (await res.json()) as any }
}

describe('GET /api/forecast/[id] — Phase 65-02 section-permission gate', () => {
  beforeEach(() => {
    captureMessageSpy.mockClear()
  })

  it('Test A: denied member gets 200 in LOG_ONLY mode and Sentry fires', async () => {
    currentAuthMock = buildAuthClient(MEMBER_ID, false)
    // Denied verdict — section_permissions.finances = false
    requireSectionPermissionMock.mockResolvedValueOnce({
      allow: false,
      reason: 'permission_denied',
      sectionKey: 'finances',
    })

    const { status } = await invokeRoute(FORECAST_ID)

    // LOG_ONLY: route proceeds — must NOT return 403
    expect(status).not.toBe(403)
    expect(status).toBe(200)

    // Sentry.captureMessage should have been called with section_permission_check
    const call = captureMessageSpy.mock.calls.find(
      (args: any[]) => args[0] === 'section_permission_check',
    )
    expect(call).toBeDefined()
    const opts = call![1]
    expect(opts.level).toBe('info')
    expect(opts.tags.route).toBe('api/forecast/[id]')
    expect(opts.tags.section_key).toBe('finances')
    expect(opts.tags.verdict_reason).toBe('permission_denied')
    expect(opts.tags.enforced).toBe(false)
    expect(opts.extra.user_id).toBe(MEMBER_ID)
    expect(opts.extra.business_id).toBe(BIZ_ID)
  })

  it('Test B: owner gets 200 and Sentry.captureMessage is NOT called', async () => {
    currentAuthMock = buildAuthClient(OWNER_ID, true)
    // Allow verdict — owner
    requireSectionPermissionMock.mockResolvedValueOnce({
      allow: true,
      reason: 'owner',
    })

    const { status } = await invokeRoute(FORECAST_ID)

    expect(status).toBe(200)

    // Allow path must be silent — no section_permission_check event
    const call = captureMessageSpy.mock.calls.find(
      (args: any[]) => args[0] === 'section_permission_check',
    )
    expect(call).toBeUndefined()
  })
})
