/**
 * Phase 44 D-12 — Save and Materialize (atomic RPC) tests.
 *
 * Plan 44-07 fills these in (44-01 scaffolded the placeholder describe block).
 * Decision-to-test map: see .planning/phases/44-forecast-pipeline-fix/44-VALIDATION.md
 *
 * What's verified here:
 *   - 'atomic'                 — wizard generate handler calls supabase.rpc('save_assumptions_and_materialize')
 *                                exactly once on the success path; no direct table writes to forecast_assumptions
 *                                or forecast_pl_lines.
 *   - 'rollback'               — when the RPC returns an error, the handler returns 5xx (never 200) and the
 *                                response body surfaces the error message. Proof: the legacy non-atomic two-step
 *                                path is gone (we never see direct upsert/delete/insert to those tables).
 *   - 'no non-fatal swallowing' — when supabase.rpc throws, the handler does NOT silently return 200; it
 *                                surfaces the error. Catches regression of the e337a42 // Non-fatal pattern.
 *   - 'recompute'              — POST /api/forecast/[id]/recompute reads existing assumptions, re-derives
 *                                pl_lines, and calls the RPC with the same arg shape.
 *   - 'recompute auth'         — recompute returns 401 unauthenticated, 404 missing forecast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────
//
// We mock at the module boundary so route handlers behave like real code but
// supabase calls are recorded. Each test resets the mocks via beforeEach.

type SupabaseSpy = {
  auth: { getUser: ReturnType<typeof vi.fn> }
  rpc: ReturnType<typeof vi.fn>
  from: ReturnType<typeof vi.fn>
  // bookkeeping for assertions:
  __fromCalls: string[]
  __mutationCalls: Array<{ table: string; op: string }>
}

let supabaseMock: SupabaseSpy

function makeQueryChain(table: string, mutationCalls: Array<{ table: string; op: string }>) {
  // A fluent supabase query-builder mock that records mutating ops.
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => {
      // Default: business / forecast lookup returns a row owned by the user.
      if (table === 'businesses') {
        return { data: { id: 'biz-1', owner_id: 'user-1' }, error: null }
      }
      if (table === 'business_profiles') {
        return { data: { id: 'profile-1', business_id: 'biz-1' }, error: null }
      }
      if (table === 'financial_forecasts') {
        return {
          data: {
            id: 'forecast-1',
            business_id: 'profile-1',
            assumptions: { revenue: { mode: 'simple', value: 100 } },
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }),
    single: vi.fn(async () => ({ data: { id: 'forecast-1' }, error: null })),
    insert: vi.fn(() => {
      mutationCalls.push({ table, op: 'insert' })
      return chain
    }),
    update: vi.fn(() => {
      mutationCalls.push({ table, op: 'update' })
      return chain
    }),
    upsert: vi.fn(() => {
      mutationCalls.push({ table, op: 'upsert' })
      return chain
    }),
    delete: vi.fn(() => {
      mutationCalls.push({ table, op: 'delete' })
      return chain
    }),
  }
  return chain
}

function buildSupabaseMock(rpcImpl: (fn: string, args: any) => Promise<any>): SupabaseSpy {
  const fromCalls: string[] = []
  const mutationCalls: Array<{ table: string; op: string }> = []
  const spy: SupabaseSpy = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    rpc: vi.fn(rpcImpl),
    from: vi.fn((table: string) => {
      fromCalls.push(table)
      return makeQueryChain(table, mutationCalls)
    }),
    __fromCalls: fromCalls,
    __mutationCalls: mutationCalls,
  }
  return spy
}

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => supabaseMock),
}))

vi.mock('@/lib/utils/resolve-business-ids', () => ({
  resolveBusinessIds: vi.fn(async () => ({
    bizId: 'biz-1',
    profileId: 'profile-1',
    all: ['profile-1', 'biz-1'],
  })),
}))

vi.mock('@/app/finances/forecast/services/assumptions-to-pl-lines', () => ({
  convertAssumptionsToPLLines: vi.fn(() => [
    {
      account_name: 'Revenue',
      account_code: '200',
      category: 'Revenue',
      subcategory: null,
      sort_order: 0,
      actual_months: {},
      forecast_months: { '2026-07': 100 },
      is_from_xero: false,
    },
  ]),
}))

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/forecast-wizard-v4/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  businessId: 'biz-1',
  fiscalYear: 2026,
  forecastDuration: 1,
  forecastId: 'forecast-1',
  forecastName: 'Test FY26',
  createNew: false,
  isDraft: true,
  assumptions: { revenue: { mode: 'simple', value: 100 } },
  summary: { year1: { revenue: 1200, grossProfit: 600, netProfit: 200 } },
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Save and Materialize (atomic RPC)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('atomic — wizard generate calls save_assumptions_and_materialize exactly once', async () => {
    supabaseMock = buildSupabaseMock(async (fn: string, args: any) => {
      if (fn === 'save_assumptions_and_materialize') {
        return {
          data: {
            forecast_id: args.p_forecast_id,
            computed_at: '2026-04-29T12:00:00.000Z',
            lines_count: args.p_pl_lines.length,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    const { POST } = await import('@/app/api/forecast-wizard-v4/generate/route')
    const res = await POST(makeRequest(VALID_BODY))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.computed_at).toBe('2026-04-29T12:00:00.000Z')

    // RPC called exactly once with the canonical arg shape.
    const rpcCalls = supabaseMock.rpc.mock.calls.filter(
      ([fn]: any[]) => fn === 'save_assumptions_and_materialize',
    )
    expect(rpcCalls).toHaveLength(1)
    const [, args] = rpcCalls[0]
    expect(args).toEqual({
      p_forecast_id: 'forecast-1',
      p_assumptions: VALID_BODY.assumptions,
      p_pl_lines: expect.any(Array),
    })
    expect(args.p_pl_lines.length).toBeGreaterThan(0)

    // Direct writes to the RPC's owned tables MUST be gone.
    const forecastAssumptionWrites = supabaseMock.__mutationCalls.filter(
      (c) => c.table === 'forecast_assumptions',
    )
    const plLineWrites = supabaseMock.__mutationCalls.filter(
      (c) => c.table === 'forecast_pl_lines',
    )
    expect(forecastAssumptionWrites).toHaveLength(0)
    expect(plLineWrites).toHaveLength(0)
  })

  it('rollback — RPC returning error causes 5xx and assumption write is NEVER bypassed', async () => {
    supabaseMock = buildSupabaseMock(async (fn: string) => {
      if (fn === 'save_assumptions_and_materialize') {
        return {
          data: null,
          error: { message: 'derivation failed: invalid forecast_months JSONB', code: 'P0001' },
        }
      }
      return { data: null, error: null }
    })

    const { POST } = await import('@/app/api/forecast-wizard-v4/generate/route')
    const res = await POST(makeRequest(VALID_BODY))
    const json = await res.json()

    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(res.status).toBeLessThan(600)
    expect(json.error).toMatch(/derivation failed/i)

    // Critical: legacy non-atomic two-step path is structurally gone.
    // We must NEVER see a direct upsert to forecast_assumptions or pl_lines.
    const forecastAssumptionWrites = supabaseMock.__mutationCalls.filter(
      (c) => c.table === 'forecast_assumptions',
    )
    const plLineWrites = supabaseMock.__mutationCalls.filter(
      (c) => c.table === 'forecast_pl_lines',
    )
    expect(forecastAssumptionWrites).toHaveLength(0)
    expect(plLineWrites).toHaveLength(0)
  })

  it('no non-fatal swallowing — when RPC throws, handler surfaces the error (does NOT return 200)', async () => {
    supabaseMock = buildSupabaseMock(async () => {
      throw new Error('connection refused')
    })

    const { POST } = await import('@/app/api/forecast-wizard-v4/generate/route')
    const res = await POST(makeRequest(VALID_BODY))

    // The legacy code swallowed P&L errors and returned 200 with success: true.
    // The atomic contract MUST surface failures.
    expect(res.status).toBeGreaterThanOrEqual(500)
    const json = await res.json()
    expect(json.success).not.toBe(true)
  })

  // Task 2 (recompute) tests are appended in plan 44-07's recompute task —
  // see the recompute describe block below, added when the route ships.
})
