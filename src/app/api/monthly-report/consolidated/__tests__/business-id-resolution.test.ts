/**
 * Regression tests: Phase 66-02 — resolveBusinessProfileIds normalization
 * for POST /api/monthly-report/consolidated.
 *
 * Pins that:
 *   Test 1: When the request body sends a business_profiles.id,
 *           resolveBusinessProfileIds is invoked with the raw input and the
 *           section-permission gate receives ids.businessId (the resolved
 *           businesses.id), NOT the raw input id.
 *
 *   Test 2: When the body sends a businesses.id (the live-tenant case),
 *           ids.businessId equals the input — no behavior change for Dragon/IICT.
 *
 * R1 PR-4: the route imports the canonical branded resolver
 * (`@/lib/business/resolveBusinessProfileIds`), now the sole resolver after the
 * legacy `resolveBusinessIds` shim was deleted in the R1 cleanup. These tests
 * mock the branded module directly.
 *
 * Strategy: mock resolveBusinessProfileIds to return a controlled shape,
 * mock requireSectionPermission to spy on its third argument,
 * mock the engine and FX helpers so the route reaches 200 without a real DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── resolveBusinessProfileIds mock ────────────────────────────────────────────
const resolveBusinessProfileIdsMock = vi.fn()
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: resolveBusinessProfileIdsMock,
}))

// ── requireSectionPermission spy ──────────────────────────────────────────────
const requireSectionPermissionMock = vi.fn()
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: requireSectionPermissionMock,
}))

// ── sectionPermissionConfig: force LOG_ONLY mode ──────────────────────────────
vi.mock('@/lib/permissions/sectionPermissionConfig', async (importOriginal) => {
  const real = (await importOriginal()) as any
  return { ...real, SECTION_PERMISSION_ENFORCE: false }
})

// ── Sentry stub (required — route imports Sentry) ─────────────────────────────
vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

// ── Rate-limiter stub ─────────────────────────────────────────────────────────
vi.mock('@/lib/utils/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  createRateLimitKey: vi.fn((p: string, id: string) => `${p}:${id}`),
  RATE_LIMIT_CONFIGS: { report: {} },
}))

// ── Engine + FX stubs so route returns 200 ────────────────────────────────────
vi.mock('@/lib/consolidation/engine', () => ({
  buildConsolidation: vi.fn(async () => ({
    byTenant: [],
    consolidated: { lines: [], budgetLines: [] },
    diagnostics: {
      report_month: '2026-03',
      fiscal_year: 2026,
      tenants_with_budget: 0,
      tenants_without_budget: [],
    },
  })),
}))

vi.mock('@/lib/consolidation/fx', () => ({
  loadFxRates: vi.fn(async () => new Map()),
  translatePLAtMonthlyAverage: vi.fn(() => ({ translated: [], missing: [] })),
  loadClosingSpotRate: vi.fn(async () => null),
  translateBSAtClosingSpot: vi.fn((lines: any[]) => lines),
}))

vi.mock('@/lib/utils/fiscal-year-utils', () => ({
  generateFiscalMonthKeys: vi.fn(() => ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06']),
  DEFAULT_YEAR_START_MONTH: 7,
}))

// ── Supabase mocks ────────────────────────────────────────────────────────────
// The service-role client (createClient) is used for business_profiles and engine.
// The auth-bound client (createRouteHandlerClient) is used for auth + access check.

let currentAuthMock: any = {}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    // business_profiles lookup — return minimal profile with fiscal_year_start
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          maybeSingle: async () =>
            table === 'business_profiles'
              ? { data: { fiscal_year_start: 7 }, error: null }
              : { data: null, error: null },
        }),
      }),
    }),
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => currentAuthMock),
}))

// ── Constants ─────────────────────────────────────────────────────────────────
const USER_ID = 'user-uuid-0001'
const PROFILE_ID = 'profile-uuid-different'   // business_profiles.id (different from bizId)
const BIZ_ID = 'biz-uuid-0000-0000-0001'       // businesses.id

// ── Auth client builder ───────────────────────────────────────────────────────
function buildAuthClient(userId: string, bizIdForAccessCheck: string) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => ({
      select: (_cols: string) => {
        if (table === 'businesses') {
          return {
            eq: (_col: string, _val: unknown) => ({
              or: () => ({
                maybeSingle: async () => ({ data: { id: bizIdForAccessCheck }, error: null }),
              }),
              maybeSingle: async () => ({
                data: { owner_id: userId, assigned_coach_id: null },
                error: null,
              }),
            }),
          }
        }
        if (table === 'system_roles') {
          // Consolidation's coach/admin role gate reads system_roles before the
          // section/access checks these tests assert on — resolve the caller as
          // a coach so the gate passes and the route proceeds.
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: { role: 'coach' }, error: null }),
            }),
          }
        }
        return {
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }
      },
    }),
  }
}

// ── Route invoker ─────────────────────────────────────────────────────────────
async function invokeRoute(body: unknown) {
  const { POST } = await import('../route')
  const req = new Request('http://localhost/api/monthly-report/consolidated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await POST(req as any)
  return { status: res.status, json: (await res.json()) as any }
}

const BASE_BODY = {
  report_month: '2026-03',
  fiscal_year: 2026,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/monthly-report/consolidated — Phase 66-02 ID resolution', () => {
  beforeEach(() => {
    requireSectionPermissionMock.mockResolvedValue({ allow: true, reason: 'owner' })
    currentAuthMock = buildAuthClient(USER_ID, BIZ_ID)
  })

  it('Test 1: when body sends a business_profiles.id, section gate receives the resolved businesses.id', async () => {
    // The body sends PROFILE_ID (business_profiles.id form — different from BIZ_ID)
    resolveBusinessProfileIdsMock.mockResolvedValueOnce({
      businessId: BIZ_ID,
      profileId: PROFILE_ID,
      all: [PROFILE_ID, BIZ_ID],
    })

    const { status } = await invokeRoute({ ...BASE_BODY, business_id: PROFILE_ID })

    expect(status).toBe(200)

    // resolveBusinessProfileIds was called with the RAW input from the request body
    expect(resolveBusinessProfileIdsMock).toHaveBeenCalledWith(
      expect.anything(),  // service-role supabase client
      PROFILE_ID,         // the raw body business_id
    )

    // requireSectionPermission received ids.businessId (the RESOLVED businesses.id)
    // NOT the raw PROFILE_ID that was in the request body
    expect(requireSectionPermissionMock).toHaveBeenCalledWith(
      expect.anything(),  // auth-bound client
      USER_ID,
      BIZ_ID,             // third arg must be the resolved businessId, NOT PROFILE_ID
      'finances',
    )

    // The third argument is specifically the resolved BIZ_ID, not the raw PROFILE_ID
    const thirdArg = requireSectionPermissionMock.mock.calls[0][2]
    expect(thirdArg).toBe(BIZ_ID)
    expect(thirdArg).not.toBe(PROFILE_ID)
  })

  it('Test 2: when body sends businesses.id (live-tenant case), behavior is unchanged — ids.businessId equals the input', async () => {
    // For live tenants (Dragon, IICT), the frontend sends businesses.id.
    // resolveBusinessProfileIds resolves it to the same businessId — no behavior change.
    resolveBusinessProfileIdsMock.mockResolvedValueOnce({
      businessId: BIZ_ID,
      profileId: 'some-profile-id',
      all: ['some-profile-id', BIZ_ID],
    })

    const { status } = await invokeRoute({ ...BASE_BODY, business_id: BIZ_ID })

    expect(status).toBe(200)

    // resolveBusinessProfileIds was called with the businesses.id input
    expect(resolveBusinessProfileIdsMock).toHaveBeenCalledWith(
      expect.anything(),
      BIZ_ID,
    )

    // requireSectionPermission receives ids.businessId which equals the input — no change
    const thirdArg = requireSectionPermissionMock.mock.calls[0][2]
    expect(thirdArg).toBe(BIZ_ID)
  })
})
