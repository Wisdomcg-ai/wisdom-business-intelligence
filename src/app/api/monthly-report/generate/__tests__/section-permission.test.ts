/**
 * Integration tests: Phase 65-02 — LOG_ONLY section-permission wiring
 * for POST /api/monthly-report/generate.
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
 * unset in tests → always LOG_ONLY=false → always returns null).  The route
 * handler then proceeds to its data-fetching layer; service-client queries are
 * stubbed to return minimal valid data so the route reaches its 200 return.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Sentry spy ────────────────────────────────────────────────────────────────
const captureMessageSpy = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageSpy,
  captureException: vi.fn(),
}))

// ── sectionPermissionConfig: ensure LOG_ONLY mode is active ──────────────────
// SECTION_PERMISSION_ENFORCE is read at module load time. We override it to
// false here so the real enforceSectionPermission() always returns null.
vi.mock('@/lib/permissions/sectionPermissionConfig', async (importOriginal) => {
  const real = (await importOriginal()) as any
  return { ...real, SECTION_PERMISSION_ENFORCE: false }
})

// ── requireSectionPermission: controlled verdict per test ────────────────────
// The route uses requireSectionPermission to determine the verdict then passes
// it to enforceSectionPermission. By controlling the verdict here we can test
// both the allow-path (Test B) and the deny-path (Test A) independently of the
// DB layer.
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
// Mock the forecast read service so the route doesn't need a real DB
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

// ── Auth client builders ──────────────────────────────────────────────────────

/**
 * Minimal auth client: authenticates as userId and passes the
 * bizAccess check (the route queries businesses with .or() for
 * owner_id/assigned_coach_id — we return the business row regardless).
 * requireSectionPermission is mocked so the businesses table query
 * inside that helper is irrelevant.
 */
function buildAuthClient(userId: string, bizId: string) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'businesses') {
        return {
          select: (_col: string) => ({
            eq: (_c: string, _v: string) => ({
              // bizAccess check: .or().maybeSingle()
              or: () => ({
                maybeSingle: async () => ({ data: { id: bizId }, error: null }),
              }),
              // requireSectionPermission owner/coach checks: .maybeSingle() directly
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

/** Minimal service-role mock for the generate route's data fetching.
 *  Returns one account mapping so the route proceeds past the NO_MAPPINGS gate
 *  and eventually reaches the 200 return path.
 *
 *  emptyQuery supports arbitrary chaining depth:
 *    .select().eq().eq().eq().order().limit().maybeSingle() → { data: null }
 *    .select().eq()  (awaited directly via .then)           → { data: [], error: null }
 */
function buildServiceMock(bizId: string) {
  const emptyQuery = (): any => ({
    select: () => emptyQuery(),
    eq: () => emptyQuery(),
    in: () => emptyQuery(),
    or: () => emptyQuery(),
    order: () => emptyQuery(),
    // limit() must return an object that has .maybeSingle() (not a bare Promise)
    limit: () => ({
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    }),
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
  })

  const mappingQuery = (): any => ({
    select: () => mappingQuery(),
    eq: (_c: string, _v: string) => ({
      // Returns one mapping row so we pass the NO_MAPPINGS gate.
      // Awaiting `.eq()` directly triggers this .then() handler.
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

describe('POST /api/monthly-report/generate — Phase 65-02 section-permission gate', () => {
  beforeEach(() => {
    captureMessageSpy.mockClear()
    currentServiceMock = buildServiceMock(BIZ_ID)
  })

  it('Test A: denied member gets 200 in LOG_ONLY mode and Sentry fires', async () => {
    currentAuthMock = buildAuthClient(MEMBER_ID, BIZ_ID)
    // Denied verdict — section_permissions.finances = false
    requireSectionPermissionMock.mockResolvedValueOnce({
      allow: false,
      reason: 'permission_denied',
      sectionKey: 'finances',
    })

    const { status } = await invokeRoute(REQUEST_BODY)

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
    expect(opts.tags.route).toBe('api/monthly-report/generate')
    expect(opts.tags.section_key).toBe('finances')
    expect(opts.tags.verdict_reason).toBe('permission_denied')
    expect(opts.tags.enforced).toBe(false)
    expect(opts.extra.user_id).toBe(MEMBER_ID)
    expect(opts.extra.business_id).toBe(BIZ_ID)
  })

  it('Test B: owner gets 200 and Sentry.captureMessage is NOT called', async () => {
    currentAuthMock = buildAuthClient(OWNER_ID, BIZ_ID)
    // Allow verdict — owner
    requireSectionPermissionMock.mockResolvedValueOnce({
      allow: true,
      reason: 'owner',
    })

    const { status } = await invokeRoute(REQUEST_BODY)

    expect(status).toBe(200)

    // Allow path must be silent — no section_permission_check event
    const call = captureMessageSpy.mock.calls.find(
      (args: any[]) => args[0] === 'section_permission_check',
    )
    expect(call).toBeUndefined()
  })
})
