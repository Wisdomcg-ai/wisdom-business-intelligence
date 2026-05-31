/**
 * R26 — cross-tenant write-IDOR guard for POST /api/forecasts/scenarios.
 *
 * Before the fix, POST authenticated the caller but never verified they could
 * access the business that owns `forecast_id`. Any logged-in user could create
 * scenarios against another tenant's forecast. These tests pin the new
 * `denyIfNoForecastAccess` check (shared with GET):
 *
 *   A) Authenticated user WITHOUT access to the forecast's business → 403,
 *      and NO row is inserted.
 *   B) Authenticated user WITH access → insert proceeds → scenario returned.
 *   C) Unauthenticated → 401 (regression guard).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted, per-test mutable state ──────────────────────────────────────────
const { state } = vi.hoisted(() => ({
  state: {
    user: { id: 'user-1' } as { id: string } | null,
    forecastRow: { business_id: 'biz-1' } as { business_id: string } | null,
    bizAccessRow: null as { id: string } | null, // non-null = caller can access
    insertCalls: [] as any[],
  },
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: () => 'test-secret-key',
}))

vi.mock('next/headers', () => ({
  cookies: () => ({}),
}))

// resolveBusinessProfileIds → echo the id into the id-set (mirrors prod shape)
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async (_supabase: any, id: string) => ({
    businessId: id,
    profileId: id,
    all: [id],
  })),
}))

// User-scoped client from auth-helpers: auth.getUser + businesses access query
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.user },
        error: state.user ? null : { message: 'no session' },
      }),
    },
    from: (table: string) => {
      if (table === 'businesses') {
        return {
          select: () => ({
            in: () => ({
              or: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: state.bizAccessRow, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected user-client table: ${table}`)
    },
  }),
}))

// Admin client (service role): financial_forecasts lookup + forecast_scenarios insert
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'financial_forecasts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.forecastRow, error: null }),
            }),
          }),
        }
      }
      if (table === 'forecast_scenarios') {
        return {
          insert: (row: any) => {
            state.insertCalls.push(row)
            return {
              select: () => ({
                single: async () => ({ data: { id: 'scenario-1', ...row }, error: null }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected admin-client table: ${table}`)
    },
  }),
}))

async function postScenario(body: any) {
  const { POST } = await import('../route')
  const req = new Request('http://localhost/api/forecasts/scenarios', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const res = await POST(req as any)
  return { status: res.status, json: (await res.json()) as any }
}

describe('POST /api/forecasts/scenarios — R26 cross-tenant write guard', () => {
  beforeEach(() => {
    state.user = { id: 'user-1' }
    state.forecastRow = { business_id: 'biz-1' }
    state.bizAccessRow = null
    state.insertCalls = []
  })

  it('A: rejects a user who cannot access the forecast’s business (403, no insert)', async () => {
    state.bizAccessRow = null // caller has no access to biz-1
    const { status, json } = await postScenario({
      forecast_id: 'forecast-other-tenant',
      name: 'Sneaky scenario',
    })
    expect(status).toBe(403)
    expect(json.error).toBe('Access denied')
    expect(state.insertCalls).toHaveLength(0)
  })

  it('B: allows a user with access to the forecast’s business (insert proceeds)', async () => {
    state.bizAccessRow = { id: 'biz-1' } // caller can access
    const { status, json } = await postScenario({
      forecast_id: 'forecast-mine',
      name: 'Best case',
      revenue_multiplier: 1.2,
    })
    expect(status).toBe(200)
    expect(json.scenario).toBeDefined()
    expect(state.insertCalls).toHaveLength(1)
    // Uses the authenticated user's id, never one from the body
    expect(state.insertCalls[0].user_id).toBe('user-1')
    expect(state.insertCalls[0].forecast_id).toBe('forecast-mine')
  })

  it('C: rejects an unauthenticated caller (401, no insert)', async () => {
    state.user = null
    const { status } = await postScenario({
      forecast_id: 'forecast-mine',
      name: 'Anon',
    })
    expect(status).toBe(401)
    expect(state.insertCalls).toHaveLength(0)
  })
})
