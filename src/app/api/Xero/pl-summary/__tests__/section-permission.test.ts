/**
 * Integration tests: Phase 65-02 — LOG_ONLY section-permission wiring
 * for GET /api/Xero/pl-summary.
 *
 * Asserts:
 *   A) A member with section_permissions.finances = false still gets a 200 in
 *      LOG_ONLY mode (SECTION_PERMISSION_ENFORCE unset / false), AND
 *      Sentry.captureMessage fires with the expected tags.
 *   B) The business owner gets a 200 and Sentry.captureMessage is NOT called
 *      with 'section_permission_check' (allow path is silent).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Sentry spy ────────────────────────────────────────────────────────────────
const captureMessageSpy = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageSpy,
  captureException: vi.fn(),
}))

// ── Supabase mocks ────────────────────────────────────────────────────────────
let currentAuthMock: any = {}

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => currentAuthMock),
}))

// mock verifyBusinessAccess so we don't need a real DB for that
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: vi.fn(async () => true),
}))

// mock resolveXeroBusinessId — return a fake connection so route proceeds
const FAKE_CONNECTION_ID = 'xero-conn-uuid-001'
vi.mock('@/lib/business/resolveXeroBusinessId', () => ({
  resolveXeroBusinessId: vi.fn(async (_supabase: any, businessId: string) => ({
    connection: {
      id: FAKE_CONNECTION_ID,
      business_id: businessId,
      tenant_id: 'tenant-001',
      is_active: true,
    },
    connectionBusinessId: businessId,
  })),
}))

// mock getHistoricalSummary so route returns quickly without hitting Xero/DB
vi.mock('@/lib/services/historical-pl-summary', () => ({
  getHistoricalSummary: vi.fn(async () => ({
    has_xero_data: true,
    prior_fy: null,
    current_ytd: null,
  })),
}))

// ── Constants ─────────────────────────────────────────────────────────────────
const OWNER_ID = 'owner-uuid-xero-pl-01'
const MEMBER_ID = 'member-uuid-xero-pl-02'
const BIZ_ID = 'biz-uuid-xero-pl-0001'

// ── Auth client builders ──────────────────────────────────────────────────────

/**
 * Auth client for a denied member (finances: false).
 * Needs to satisfy requireSectionPermission's DB queries:
 *   businesses.owner_id, businesses.assigned_coach_id,
 *   business_users, system_roles
 */
function buildDeniedMemberAuthClient(userId: string) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'businesses') {
        return {
          select: (col: string) => ({
            eq: (_c: string, _v: string) => ({
              maybeSingle: async () => ({
                data: col.includes('assigned_coach_id')
                  ? { assigned_coach_id: null }
                  : { owner_id: 'someone-else' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'business_users') {
        return {
          select: () => ({
            eq: (_c1: string, _v1: string) => ({
              eq: (_c2: string, _v2: string) => ({
                maybeSingle: async () => ({
                  data: {
                    role: 'member',
                    status: 'active',
                    section_permissions: { finances: false },
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'system_roles') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
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

/**
 * Auth client for the business owner.
 * businesses.owner_id === userId → immediate allow.
 */
function buildOwnerAuthClient(ownerId: string) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: ownerId } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'businesses') {
        return {
          select: (col: string) => ({
            eq: (_c: string, _v: string) => ({
              maybeSingle: async () => ({
                data: col.includes('assigned_coach_id')
                  ? { assigned_coach_id: null }
                  : { owner_id: ownerId },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'system_roles') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
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

async function invokeRoute(businessId: string) {
  const { GET } = await import('../route')
  const url = `http://localhost/api/Xero/pl-summary?business_id=${businessId}&fiscal_year=2026`
  // Use NextRequest so request.nextUrl.searchParams is available
  const { NextRequest } = await import('next/server')
  const req = new NextRequest(url)
  const res = await GET(req as any)
  return { status: res.status, json: (await res.json()) as any }
}

describe('GET /api/Xero/pl-summary — Phase 65-02 section-permission gate', () => {
  beforeEach(() => {
    captureMessageSpy.mockClear()
  })

  it('Test A: denied member gets 200 in LOG_ONLY mode and Sentry fires', async () => {
    currentAuthMock = buildDeniedMemberAuthClient(MEMBER_ID)

    const { status } = await invokeRoute(BIZ_ID)

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
    expect(opts.tags.route).toBe('api/Xero/pl-summary')
    expect(opts.tags.section_key).toBe('finances')
    expect(opts.tags.verdict_reason).toBe('permission_denied')
    expect(opts.tags.enforced).toBe(false)
    expect(opts.extra.user_id).toBe(MEMBER_ID)
    expect(opts.extra.business_id).toBe(BIZ_ID)
  })

  it('Test B: owner gets 200 and Sentry.captureMessage is NOT called', async () => {
    currentAuthMock = buildOwnerAuthClient(OWNER_ID)

    const { status } = await invokeRoute(BIZ_ID)

    expect(status).toBe(200)

    // Allow path must be silent — no section_permission_check event
    const call = captureMessageSpy.mock.calls.find(
      (args: any[]) => args[0] === 'section_permission_check',
    )
    expect(call).toBeUndefined()
  })
})
