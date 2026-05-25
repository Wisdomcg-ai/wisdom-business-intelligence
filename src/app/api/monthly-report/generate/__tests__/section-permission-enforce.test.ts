/**
 * Phase 65-04 — ENFORCE-mode integration tests for
 * POST /api/monthly-report/generate.
 *
 * Companion to section-permission.test.ts (LOG_ONLY tests from 65-02).
 *
 * Tests:
 *   A) Denied member + ENFORCE=true  → 403 + Sentry level 'warning' + enforced:true tag
 *   B) Owner       + ENFORCE=true  → 200 + Sentry NOT called for section_permission_check
 *   C) Denied member + ENFORCE=false → 200 + Sentry level 'info'  + enforced:false tag
 *      (Regression guard — pins the kill-switch rollback path.)
 *
 * Strategy: re-implement enforceSectionPermission inside the mock so it reads
 * a hoisted mutable flag. This lets a single test file exercise both modes
 * without the env-var-at-module-load problem. The real helper has dedicated
 * unit tests in src/lib/permissions/__tests__/requireSectionPermission.test.ts.
 * What we're verifying here is the ROUTE WIRING: that the route correctly
 * short-circuits when enforceSectionPermission returns a 403 NextResponse, and
 * continues when it returns null.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted state so the mock factory can read it ────────────────────────────
const { enforceFlag } = vi.hoisted(() => ({
  enforceFlag: { value: true },
}))

// ── Sentry spy ────────────────────────────────────────────────────────────────
const captureMessageSpy = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageSpy,
  captureException: vi.fn(),
}))

// ── sectionPermissionConfig: dynamic ENFORCE flag via hoisted state ──────────
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

// ── requireSectionPermission: controlled verdict per test ────────────────────
const requireSectionPermissionMock = vi.fn()
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: requireSectionPermissionMock,
}))

// ── Supabase mocks ────────────────────────────────────────────────────────────
let currentAuthMock: any = {}
let currentServiceMock: any = { from: () => ({}) }

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => currentServiceMock.from(table),
  })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => currentAuthMock),
}))
vi.mock('@/lib/utils/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  createRateLimitKey: vi.fn((p: string, id: string) => `${p}:${id}`),
  RATE_LIMIT_CONFIGS: { report: {} },
}))
vi.mock('@/lib/utils/resolve-business-ids', () => ({
  resolveBusinessIds: vi.fn(async (_supabase: any, id: string) => ({
    bizId: id,
    profileId: id,
    all: [id],
  })),
}))
vi.mock('@/lib/services/forecast-read-service', () => ({
  createForecastReadService: vi.fn(() => ({
    getMonthlyComposite: vi.fn(async () => ({
      rows: [],
      data_quality: null,
      per_tenant_quality: [],
    })),
    getDataQualityForBusiness: vi.fn(async () => ({
      data_quality: null,
      per_tenant_quality: [],
    })),
  })),
}))

// ── Constants ─────────────────────────────────────────────────────────────────
const OWNER_ID = 'owner-uuid-0001'
const MEMBER_ID = 'member-uuid-0002'
const BIZ_ID = 'biz-uuid-0000-0000-0001'

function buildAuthClient(userId: string, bizId: string) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'businesses') {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                maybeSingle: async () => ({ data: { id: bizId }, error: null }),
              }),
              maybeSingle: async () => ({
                data: { owner_id: userId, assigned_coach_id: null },
                error: null,
              }),
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

function buildServiceMock(bizId: string) {
  const emptyQuery = (): any => ({
    select: () => emptyQuery(),
    eq: () => emptyQuery(),
    in: () => emptyQuery(),
    or: () => emptyQuery(),
    order: () => emptyQuery(),
    limit: () => ({
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: any) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    }),
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: (resolve: any) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  })

  const mappingQuery = (): any => ({
    select: () => mappingQuery(),
    eq: () => ({
      then: (resolve: any) =>
        Promise.resolve({
          data: [
            {
              id: 'map-uuid-001',
              business_id: bizId,
              xero_account_name: 'Sales',
              report_category: 'Revenue',
              forecast_pl_line_id: null,
              forecast_pl_line_name: null,
            },
          ],
          error: null,
        }).then(resolve),
    }),
  })

  return {
    from: (table: string) => {
      if (table === 'account_mappings') return mappingQuery()
      return emptyQuery()
    },
  }
}

async function invokeRoute(body: unknown) {
  const { POST } = await import('../route')
  const req = new Request('http://localhost/api/monthly-report/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await POST(req as any)
  return { status: res.status, json: (await res.json()) as any }
}

const REQUEST_BODY = {
  business_id: BIZ_ID,
  report_month: '2026-03',
  fiscal_year: 2026,
}

describe('POST /api/monthly-report/generate — Phase 65-04 ENFORCE-mode wiring', () => {
  beforeEach(() => {
    captureMessageSpy.mockClear()
    currentServiceMock = buildServiceMock(BIZ_ID)
    enforceFlag.value = true
  })

  it('Test A: denied member + ENFORCE=true → 403 + warning Sentry + enforced:true', async () => {
    currentAuthMock = buildAuthClient(MEMBER_ID, BIZ_ID)
    requireSectionPermissionMock.mockResolvedValueOnce({
      allow: false,
      reason: 'permission_denied',
      sectionKey: 'finances',
    })

    const { status, json } = await invokeRoute(REQUEST_BODY)

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
    expect(opts.tags.route).toBe('api/monthly-report/generate')
    expect(opts.tags.section_key).toBe('finances')
    expect(opts.tags.verdict_reason).toBe('permission_denied')
    expect(opts.tags.enforced).toBe(true)
    expect(opts.extra.user_id).toBe(MEMBER_ID)
    expect(opts.extra.business_id).toBe(BIZ_ID)
  })

  it('Test B: owner + ENFORCE=true → 200 + Sentry NOT called for section_permission_check', async () => {
    currentAuthMock = buildAuthClient(OWNER_ID, BIZ_ID)
    requireSectionPermissionMock.mockResolvedValueOnce({
      allow: true,
      reason: 'owner',
    })

    const { status } = await invokeRoute(REQUEST_BODY)

    expect(status).toBe(200)

    const call = captureMessageSpy.mock.calls.find(
      (args: any[]) => args[0] === 'section_permission_check',
    )
    expect(call).toBeUndefined()
  })

  it('Test C (rollback guard): denied member + ENFORCE=false → 200 + info Sentry', async () => {
    enforceFlag.value = false
    currentAuthMock = buildAuthClient(MEMBER_ID, BIZ_ID)
    requireSectionPermissionMock.mockResolvedValueOnce({
      allow: false,
      reason: 'permission_denied',
      sectionKey: 'finances',
    })

    const { status } = await invokeRoute(REQUEST_BODY)

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
