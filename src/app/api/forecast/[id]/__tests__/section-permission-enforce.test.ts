/**
 * Phase 65-04 — ENFORCE-mode integration tests for GET /api/forecast/[id].
 *
 * Companion to section-permission.test.ts (LOG_ONLY tests from 65-02).
 *
 * Tests:
 *   A) Denied member + ENFORCE=true  → 403 + Sentry level 'warning' + enforced:true
 *   B) Owner       + ENFORCE=true  → 200 + Sentry NOT called for section_permission_check
 *   C) Denied member + ENFORCE=false → 200 + Sentry level 'info'  + enforced:false
 *      (Regression guard — pins the kill-switch rollback path.)
 *
 * Strategy: re-implement enforceSectionPermission inside the mock so it reads
 * a hoisted mutable flag (vi.hoisted). This lets a single test file exercise
 * both modes without the env-var-at-module-load problem.
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
vi.mock('@/lib/utils/resolve-business-ids', () => ({
  resolveBusinessIds: vi.fn(async (_supabase: any, id: string) => ({
    bizId: id,
    profileId: id,
    all: [id],
  })),
}))

// ── Constants ─────────────────────────────────────────────────────────────────
const OWNER_ID = 'owner-uuid-forecast-01'
const MEMBER_ID = 'member-uuid-forecast-02'
const BIZ_ID = 'biz-uuid-forecast-0001'
const FORECAST_ID = 'forecast-uuid-0001-0001'

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

function buildAuthClient(userId: string, isOwner: boolean) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'financial_forecasts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: FORECAST_ROW, error: null }),
            }),
          }),
        }
      }
      if (table === 'businesses') {
        const ownerId = isOwner ? userId : 'someone-else'
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: BIZ_ID, owner_id: ownerId },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'business_users') {
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

describe('GET /api/forecast/[id] — Phase 65-04 ENFORCE-mode wiring', () => {
  beforeEach(() => {
    captureMessageSpy.mockClear()
    enforceFlag.value = true
  })

  it('Test A: denied member + ENFORCE=true → 403 + warning Sentry + enforced:true', async () => {
    currentAuthMock = buildAuthClient(MEMBER_ID, false)
    requireSectionPermissionMock.mockResolvedValueOnce({
      allow: false,
      reason: 'permission_denied',
      sectionKey: 'finances',
    })

    const { status, json } = await invokeRoute(FORECAST_ID)

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
    expect(opts.tags.route).toBe('api/forecast/[id]')
    expect(opts.tags.section_key).toBe('finances')
    expect(opts.tags.verdict_reason).toBe('permission_denied')
    expect(opts.tags.enforced).toBe(true)
    expect(opts.extra.user_id).toBe(MEMBER_ID)
    expect(opts.extra.business_id).toBe(BIZ_ID)
  })

  it('Test B: owner + ENFORCE=true → 200 + Sentry NOT called for section_permission_check', async () => {
    currentAuthMock = buildAuthClient(OWNER_ID, true)
    requireSectionPermissionMock.mockResolvedValueOnce({
      allow: true,
      reason: 'owner',
    })

    const { status } = await invokeRoute(FORECAST_ID)

    expect(status).toBe(200)

    const call = captureMessageSpy.mock.calls.find(
      (args: any[]) => args[0] === 'section_permission_check',
    )
    expect(call).toBeUndefined()
  })

  it('Test C (rollback guard): denied member + ENFORCE=false → 200 + info Sentry', async () => {
    enforceFlag.value = false
    currentAuthMock = buildAuthClient(MEMBER_ID, false)
    requireSectionPermissionMock.mockResolvedValueOnce({
      allow: false,
      reason: 'permission_denied',
      sectionKey: 'finances',
    })

    const { status } = await invokeRoute(FORECAST_ID)

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
