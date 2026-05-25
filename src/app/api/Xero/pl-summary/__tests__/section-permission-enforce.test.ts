/**
 * Phase 65-04 — ENFORCE-mode integration tests for GET /api/Xero/pl-summary.
 *
 * Companion to section-permission.test.ts (LOG_ONLY tests from 65-02).
 *
 * Tests:
 *   A) Denied member + ENFORCE=true  → 403 + Sentry level 'warning' + enforced:true
 *   B) Owner       + ENFORCE=true  → 200 + Sentry NOT called for section_permission_check
 *   C) Denied member + ENFORCE=false → 200 + Sentry level 'info'  + enforced:false
 *      (Regression guard — pins the kill-switch rollback path.)
 *
 * Unlike the forecast/[id] and monthly-report/generate ENFORCE tests, this
 * file does NOT mock requireSectionPermission — it lets the real helper run
 * against the mocked auth client, so we also exercise the helper's DB-path
 * logic end-to-end in ENFORCE mode.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted state for the mock factory ───────────────────────────────────────
const { enforceFlag } = vi.hoisted(() => ({
  enforceFlag: { value: true },
}))

// ── Sentry spy ────────────────────────────────────────────────────────────────
const captureMessageSpy = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageSpy,
  captureException: vi.fn(),
}))

// ── sectionPermissionConfig: dynamic ENFORCE flag ────────────────────────────
vi.mock('@/lib/permissions/sectionPermissionConfig', async () => {
  const Sentry = await import('@sentry/nextjs')
  const { NextResponse } = await import('next/server')
  return {
    get SECTION_PERMISSION_ENFORCE() {
      return enforceFlag.value
    },
    enforceSectionPermission: (
      verdict: any,
      sectionKey: string,
      routeConst: string,
      userId: string,
      businessId: string,
    ) => {
      if (verdict.allow) return null
      Sentry.captureMessage('section_permission_check', {
        level: enforceFlag.value ? 'warning' : 'info',
        tags: {
          route: routeConst,
          section_key: sectionKey,
          verdict_reason: verdict.reason,
          enforced: enforceFlag.value,
        },
        extra: { user_id: userId, business_id: businessId },
      } as any)
      if (enforceFlag.value) {
        return NextResponse.json(
          { error: 'Insufficient permissions', section: sectionKey },
          { status: 403 },
        )
      }
      return null
    },
  }
})

// ── Supabase mocks ────────────────────────────────────────────────────────────
let currentAuthMock: any = {}

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => currentAuthMock),
}))

vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: vi.fn(async () => true),
}))

const FAKE_CONNECTION_ID = 'xero-conn-uuid-001'
vi.mock('@/lib/utils/resolve-xero-business-id', () => ({
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

function buildDeniedMemberAuthClient(userId: string) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'businesses') {
        return {
          select: (col: string) => ({
            eq: () => ({
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
            eq: () => ({
              eq: () => ({
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

function buildOwnerAuthClient(ownerId: string) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: ownerId } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'businesses') {
        return {
          select: (col: string) => ({
            eq: () => ({
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
  const { NextRequest } = await import('next/server')
  const req = new NextRequest(url)
  const res = await GET(req as any)
  return { status: res.status, json: (await res.json()) as any }
}

describe('GET /api/Xero/pl-summary — Phase 65-04 ENFORCE-mode wiring', () => {
  beforeEach(() => {
    captureMessageSpy.mockClear()
    enforceFlag.value = true
  })

  it('Test A: denied member + ENFORCE=true → 403 + warning Sentry + enforced:true', async () => {
    currentAuthMock = buildDeniedMemberAuthClient(MEMBER_ID)

    const { status, json } = await invokeRoute(BIZ_ID)

    expect(status).toBe(403)
    expect(json).toEqual({
      error: 'Insufficient permissions',
      section: 'finances',
    })

    const call = captureMessageSpy.mock.calls.find(
      (args: any[]) => args[0] === 'section_permission_check',
    )
    expect(call).toBeDefined()
    const opts = call![1]
    expect(opts.level).toBe('warning')
    expect(opts.tags.route).toBe('api/Xero/pl-summary')
    expect(opts.tags.section_key).toBe('finances')
    expect(opts.tags.verdict_reason).toBe('permission_denied')
    expect(opts.tags.enforced).toBe(true)
    expect(opts.extra.user_id).toBe(MEMBER_ID)
    expect(opts.extra.business_id).toBe(BIZ_ID)
  })

  it('Test B: owner + ENFORCE=true → 200 + Sentry NOT called for section_permission_check', async () => {
    currentAuthMock = buildOwnerAuthClient(OWNER_ID)

    const { status } = await invokeRoute(BIZ_ID)

    expect(status).toBe(200)

    const call = captureMessageSpy.mock.calls.find(
      (args: any[]) => args[0] === 'section_permission_check',
    )
    expect(call).toBeUndefined()
  })

  it('Test C (rollback guard): denied member + ENFORCE=false → 200 + info Sentry', async () => {
    enforceFlag.value = false
    currentAuthMock = buildDeniedMemberAuthClient(MEMBER_ID)

    const { status } = await invokeRoute(BIZ_ID)

    expect(status).not.toBe(403)
    expect(status).toBe(200)

    const call = captureMessageSpy.mock.calls.find(
      (args: any[]) => args[0] === 'section_permission_check',
    )
    expect(call).toBeDefined()
    const opts = call![1]
    expect(opts.level).toBe('info')
    expect(opts.tags.enforced).toBe(false)
  })
})
