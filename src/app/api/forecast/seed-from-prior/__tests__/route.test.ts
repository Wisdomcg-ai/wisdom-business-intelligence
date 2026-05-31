/**
 * Phase 59 Plan 02 — POST /api/forecast/seed-from-prior route tests
 *
 * TDD RED phase: all tests fail because the route file does not exist yet.
 *
 * Groups:
 *  A. Auth gate (401, 403)
 *  B. Validation (400)
 *  C. Prior forecast lookup (404)
 *  D. Target forecast lookup (404)
 *  E. Idempotency (409)
 *  F. Success path (200)
 *  G. Failure paths (RPC error, unexpected throws)
 *  H. Console hygiene (no console.error calls)
 *  I. subscription_budgets is never touched
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Sentry mock ─────────────────────────────────────────────────────────────
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

// ─── Seed service — let real service run (it is pure) ─────────────────────
// We DO mock isForecastSeedable selectively in tests that need to control it.
// The real seedForecastFromPrior is pure so we let it run in success tests.

// ─── convertAssumptionsToPLLines — mock for determinism ──────────────────
vi.mock('@/app/finances/forecast/services/assumptions-to-pl-lines', () => ({
  convertAssumptionsToPLLines: vi.fn().mockReturnValue([
    {
      account_name: 'Test Revenue',
      account_code: null,
      category: 'Revenue',
      subcategory: null,
      sort_order: 0,
      actual_months: {},
      forecast_months: { '2026-07': 100 },
      is_from_xero: false,
    },
  ]),
}))

// ─── resolveBusinessProfileIds mock ───────────────────────────────────────
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn().mockResolvedValue({
    businessId: 'biz-1',
    profileId: 'profile-1',
    all: ['biz-1', 'profile-1'],
  }),
}))

// ─── Supabase chainable mock factory ─────────────────────────────────────
//
// Returns a supabase-like object where .from(table) returns a chainable
// builder. Resolution is controlled by per-table data/error overrides.
//
// Usage:
//   const sb = makeSupabase({ businesses: { data: { id: 'b1', owner_id: 'u1' } } })
//   vi.mocked(createRouteHandlerClient).mockResolvedValue(sb as any)

type TableResult = { data: unknown; error?: unknown; count?: number | null }
type TableMap = Record<string, TableResult>

// Spy holders — reset per test
let fromSpy: ReturnType<typeof vi.fn>
let updateSpy: ReturnType<typeof vi.fn>
let rpcSpy: ReturnType<typeof vi.fn>

function makeSupabase(tables: TableMap, rpcResult: { data?: unknown; error?: unknown } = {}) {
  fromSpy = vi.fn((table: string) => {
    const tableResult: TableResult = tables[table] ?? { data: null }
    const result = {
      data: tableResult.data,
      error: tableResult.error ?? null,
      count: tableResult.count ?? null,
    }

    updateSpy = vi.fn(() => {
      const updateBuilder: Record<string, unknown> = {}
      updateBuilder.eq = vi.fn(() => Promise.resolve({ data: null, error: null }))
      return updateBuilder
    })

    const b = makeThenableBuilder(result)
    b.update = updateSpy
    return b
  })

  rpcSpy = vi.fn(() => Promise.resolve({ data: rpcResult.data ?? null, error: rpcResult.error ?? null }))

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: fromSpy,
    rpc: rpcSpy,
  }
}

// Supabase mock — we replace it per-test
const createRouteHandlerClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────
const PRIOR_ASSUMPTIONS = {
  version: 1,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  fiscalYearStart: '07',
  revenue: {
    lines: [
      {
        id: 'rev-1',
        name: 'Consulting',
        category: 'Revenue',
        year1Monthly: { '2025-07': 5000, '2025-08': 5000 },
      },
    ],
    seasonalityPattern: 'flat',
    seasonalitySource: 'manual',
  },
  cogs: { lines: [] },
  team: {
    existingTeam: [{ id: 'emp-1', name: 'Alice', annualSalary: 80000, startDate: '2024-01-01' }],
    plannedHires: [],
    superannuationPct: 11,
    workCoverPct: 1,
    payrollTaxPct: 4.85,
  },
  opex: { lines: [] },
  capex: { items: [] },
}

const PRIOR_FORECAST = {
  id: 'prior-forecast-id',
  assumptions: PRIOR_ASSUMPTIONS,
  fiscal_year: 2026,
  forecast_duration: 1,
}

const TARGET_FORECAST = {
  id: 'target-forecast-id',
  assumptions: null,
  forecast_start_month: '2026-07',
  forecast_end_month: '2027-06',
  fiscal_year: 2027,
  forecast_duration: 1,
}

// Helper: POST request factory
function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/forecast/seed-from-prior', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Helper: make a thenable builder that resolves with `result` when awaited
// and still supports chaining calls before the await.
function makeThenableBuilder(result: unknown): Record<string, unknown> {
  const b: Record<string, unknown> = {}
  const chain = () => b
  b.select = vi.fn(chain)
  b.insert = vi.fn(chain)
  b.eq = vi.fn(chain)
  b.in = vi.fn(chain)
  b.order = vi.fn(chain)
  b.limit = vi.fn(chain)
  b.gt = vi.fn(chain)
  b.maybeSingle = vi.fn(() => Promise.resolve(result))
  // Make the builder itself awaitable (thenable) for `const { count } = await builder`
  ;(b as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    Promise.resolve(result).then(resolve, reject)
  }
  return b
}

// Helper: build a supabase mock set up for the happy-path success scenario
// Each call to .from() must return the right table data in the right order.
// Because the route calls .from('financial_forecasts') twice (prior + target)
// and .from('forecast_pl_lines') once (count), we need per-table routing.
function makeSuccessSupabase(overrides: {
  targetAssumptions?: unknown
  targetPlLineCount?: number
  priorForecastDuration?: number
  rpcError?: unknown
  updateError?: unknown
} = {}) {
  const { targetAssumptions = null, targetPlLineCount = 0, priorForecastDuration = 1, rpcError = null, updateError = null } = overrides

  const priorForecast = { ...PRIOR_FORECAST, forecast_duration: priorForecastDuration }
  const targetForecast = { ...TARGET_FORECAST, assumptions: targetAssumptions }

  // We need to track which call to financial_forecasts we are on
  let forecastCallCount = 0

  const supabase: Record<string, unknown> = {}
  fromSpy = vi.fn((table: string) => {
    updateSpy = vi.fn(() => {
      const updateBuilder: Record<string, unknown> = {}
      updateBuilder.eq = vi.fn(() => Promise.resolve({ data: null, error: updateError ?? null }))
      return updateBuilder
    })

    if (table === 'businesses') {
      const b = makeThenableBuilder({ data: { id: 'biz-1', owner_id: 'user-1' }, error: null })
      b.update = updateSpy
      return b
    } else if (table === 'financial_forecasts') {
      forecastCallCount++
      const callNum = forecastCallCount
      const result = callNum === 1
        ? { data: priorForecast, error: null }
        : { data: targetForecast, error: null }
      const b = makeThenableBuilder(result)
      b.update = updateSpy
      return b
    } else if (table === 'forecast_pl_lines') {
      // The route does: const { count } = await supabase.from('forecast_pl_lines').select(...).eq(...)
      // No .maybeSingle() — awaited directly. Use a thenable builder.
      return makeThenableBuilder({ data: null, error: null, count: targetPlLineCount })
    } else {
      const b = makeThenableBuilder({ data: null, error: null })
      b.update = updateSpy
      return b
    }
  })

  rpcSpy = vi.fn(() => Promise.resolve({ data: null, error: rpcError ?? null }))

  supabase.auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
  }
  supabase.from = fromSpy
  supabase.rpc = rpcSpy

  return supabase
}

// Import POST after all vi.mock declarations so the module picks up mocks
import { POST } from '../route'

// ═══════════════════════════════════════════════════════════════════════════
// Group H — console.error spy (wraps entire suite)
// ═══════════════════════════════════════════════════════════════════════════
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  // H: The route uses Sentry, NEVER console.error
  expect(consoleErrorSpy.mock.calls.length, 'console.error must not be called (Sentry only)').toBe(0)
  consoleErrorSpy.mockRestore()
})

// ═══════════════════════════════════════════════════════════════════════════
// Group A — Auth gate
// ═══════════════════════════════════════════════════════════════════════════
describe('A: Auth gate', () => {
  it('returns 401 when no authenticated user', async () => {
    const sb = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      from: vi.fn(),
      rpc: vi.fn(),
    }
    createRouteHandlerClientMock.mockResolvedValue(sb)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/Unauthorized/i)
  })

  it('returns 401 when getUser returns an error', async () => {
    const sb = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('auth error') }) },
      from: vi.fn(),
      rpc: vi.fn(),
    }
    createRouteHandlerClientMock.mockResolvedValue(sb)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when business not found', async () => {
    const sb = makeSupabase({ businesses: { data: null } })
    sb.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    }
    createRouteHandlerClientMock.mockResolvedValue(sb)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/Business not found or access denied/i)
  })

  it('returns 403 when user is not owner, not team member, not coach/admin', async () => {
    // Business exists but owner_id !== user-1
    const sb = makeSupabase({
      businesses: { data: { id: 'biz-1', owner_id: 'other-user' } },
      business_users: { data: null }, // not a team member
      system_roles: { data: { role: 'viewer' } }, // not coach or super_admin
    })
    sb.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    }
    createRouteHandlerClientMock.mockResolvedValue(sb)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(403)
  })

  it('proceeds when user IS the owner (skips team/role checks)', async () => {
    // Owner path: should get past auth and hit the 404 for no prior forecast
    const supabase: Record<string, unknown> = {}
    supabase.auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) }
    supabase.rpc = vi.fn(() => Promise.resolve({ data: null, error: null }))
    ;(supabase as any).from = vi.fn((table: string) => {
      if (table === 'forecast_pl_lines') {
        return makeThenableBuilder({ data: null, error: null, count: 0 })
      }
      const b = makeThenableBuilder({ data: null, error: null })
      b.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
      if (table === 'businesses') {
        const result = { data: { id: 'biz-1', owner_id: 'user-1' }, error: null }
        b.maybeSingle = vi.fn(() => Promise.resolve(result))
        ;(b as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          Promise.resolve(result).then(resolve, reject)
        }
      }
      // financial_forecasts: return null (no prior) to stop early
      return b
    })
    createRouteHandlerClientMock.mockResolvedValue(supabase)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    // Should get past auth gate (owner) and hit 404 for missing prior forecast
    expect(res.status).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group B — Validation
// ═══════════════════════════════════════════════════════════════════════════
describe('B: Validation', () => {
  beforeEach(() => {
    const sb = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn(),
      rpc: vi.fn(),
    }
    createRouteHandlerClientMock.mockResolvedValue(sb)
  })

  it('returns 400 when businessId is missing', async () => {
    const res = await POST(makeRequest({ targetFiscalYear: 2027 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/businessId and targetFiscalYear/i)
  })

  it('returns 400 when targetFiscalYear is missing', async () => {
    const res = await POST(makeRequest({ businessId: 'biz-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/businessId and targetFiscalYear/i)
  })

  it('returns 400 for completely empty body', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group C — Prior forecast lookup
// ═══════════════════════════════════════════════════════════════════════════
describe('C: Prior forecast lookup', () => {
  function makeAuthPassSupabase(forecastData: unknown) {
    let fCallCount = 0
    const sb: Record<string, unknown> = {}
    sb.auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) }
    sb.rpc = vi.fn(() => Promise.resolve({ data: null, error: null }))
    sb.from = vi.fn((table: string) => {
      if (table === 'forecast_pl_lines') {
        return makeThenableBuilder({ data: null, error: null, count: 0 })
      }
      const b = makeThenableBuilder({ data: null, error: null })
      b.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
      if (table === 'businesses') {
        const result = { data: { id: 'biz-1', owner_id: 'user-1' }, error: null }
        b.maybeSingle = vi.fn(() => Promise.resolve(result))
        ;(b as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          Promise.resolve(result).then(resolve, reject)
        }
      } else if (table === 'financial_forecasts') {
        fCallCount++
        const callNum = fCallCount
        const result = callNum === 1
          ? { data: forecastData, error: null }
          : { data: null, error: null }
        b.maybeSingle = vi.fn(() => Promise.resolve(result))
        ;(b as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          Promise.resolve(result).then(resolve, reject)
        }
      }
      return b
    })
    return sb
  }

  it('returns 404 when no prior FY forecast exists', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeAuthPassSupabase(null))
    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/No prior FY2026 forecast/i)
  })

  it('returns 404 when prior forecast exists but assumptions JSONB is null', async () => {
    createRouteHandlerClientMock.mockResolvedValue(
      makeAuthPassSupabase({ id: 'prior-id', assumptions: null, fiscal_year: 2026, forecast_duration: 1 }),
    )
    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/No prior FY2026 forecast/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group D — Target forecast lookup
// ═══════════════════════════════════════════════════════════════════════════
describe('D: Target forecast lookup', () => {
  it('returns 404 when target FY forecast row does not exist', async () => {
    let fCallCount = 0
    const sb: Record<string, unknown> = {}
    sb.auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) }
    sb.rpc = vi.fn(() => Promise.resolve({ data: null, error: null }))
    sb.from = vi.fn((table: string) => {
      if (table === 'forecast_pl_lines') {
        return makeThenableBuilder({ data: null, error: null, count: 0 })
      }
      const b = makeThenableBuilder({ data: null, error: null })
      b.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
      if (table === 'businesses') {
        const result = { data: { id: 'biz-1', owner_id: 'user-1' }, error: null }
        b.maybeSingle = vi.fn(() => Promise.resolve(result))
        ;(b as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          Promise.resolve(result).then(resolve, reject)
        }
      } else if (table === 'financial_forecasts') {
        fCallCount++
        const callNum = fCallCount
        const result = callNum === 1
          ? { data: PRIOR_FORECAST, error: null }  // prior exists
          : { data: null, error: null }             // target missing
        b.maybeSingle = vi.fn(() => Promise.resolve(result))
        ;(b as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          Promise.resolve(result).then(resolve, reject)
        }
      }
      return b
    })
    createRouteHandlerClientMock.mockResolvedValue(sb)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/No FY2027 forecast row found/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group E — Idempotency
// ═══════════════════════════════════════════════════════════════════════════
describe('E: Idempotency', () => {
  function makeIdempotencySupabase(targetAssumptions: unknown, plLineCount: number) {
    let fCallCount = 0
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }))

    const sb: Record<string, unknown> = {}
    sb.auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) }
    sb.rpc = rpc
    sb.from = vi.fn((table: string) => {
      if (table === 'forecast_pl_lines') {
        // Route awaits the builder directly (no .maybeSingle) — use thenable
        return makeThenableBuilder({ data: null, error: null, count: plLineCount })
      }
      const b = makeThenableBuilder({ data: null, error: null })
      b.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
      if (table === 'businesses') {
        b.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: 'biz-1', owner_id: 'user-1' }, error: null }))
        ;(b as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          Promise.resolve({ data: { id: 'biz-1', owner_id: 'user-1' }, error: null }).then(resolve, reject)
        }
      } else if (table === 'financial_forecasts') {
        fCallCount++
        const callNum = fCallCount
        const result = callNum === 1
          ? { data: PRIOR_FORECAST, error: null }
          : { data: { ...TARGET_FORECAST, assumptions: targetAssumptions }, error: null }
        b.maybeSingle = vi.fn(() => Promise.resolve(result))
        ;(b as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          Promise.resolve(result).then(resolve, reject)
        }
      }
      return b
    })
    return { sb, rpc }
  }

  it('returns 409 when target has revenue lines (non-empty assumptions)', async () => {
    const targetAssumptions = {
      ...PRIOR_ASSUMPTIONS,
      revenue: { ...PRIOR_ASSUMPTIONS.revenue, lines: [{ id: 'rev-2', name: 'Existing' }] },
    }
    const { sb, rpc } = makeIdempotencySupabase(targetAssumptions, 0)
    createRouteHandlerClientMock.mockResolvedValue(sb)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Target forecast already has data. Seed refused.')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 409 when target has empty revenue lines but pl_lines count > 0', async () => {
    const targetAssumptions = { ...PRIOR_ASSUMPTIONS, revenue: { ...PRIOR_ASSUMPTIONS.revenue, lines: [] } }
    const { sb, rpc } = makeIdempotencySupabase(targetAssumptions, 5) // 5 pl_lines rows
    createRouteHandlerClientMock.mockResolvedValue(sb)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(409)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('proceeds (not 409) when target has null assumptions AND 0 pl_lines', async () => {
    const { sb } = makeIdempotencySupabase(null, 0)
    createRouteHandlerClientMock.mockResolvedValue(sb)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    // Should not be 409 — proceed to success
    expect(res.status).not.toBe(409)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group F — Success path
// ═══════════════════════════════════════════════════════════════════════════
describe('F: Success path', () => {
  it('returns 200 { success: true, forecastId } on success', async () => {
    const supabase = makeSuccessSupabase()
    createRouteHandlerClientMock.mockResolvedValue(supabase)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.forecastId).toBe('target-forecast-id')
  })

  it('calls save_assumptions_and_materialize RPC exactly once with correct args', async () => {
    const supabase = makeSuccessSupabase()
    createRouteHandlerClientMock.mockResolvedValue(supabase)

    await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))

    expect(rpcSpy).toHaveBeenCalledTimes(1)
    const [rpcName, rpcArgs] = rpcSpy.mock.calls[0]
    expect(rpcName).toBe('save_assumptions_and_materialize')
    expect(rpcArgs.p_forecast_id).toBe('target-forecast-id')
    expect(Array.isArray(rpcArgs.p_pl_lines)).toBe(true)
    // Seeded assumptions should not have goals
    expect(rpcArgs.p_assumptions.goals).toBeUndefined()
    // capex should be reset
    expect(rpcArgs.p_assumptions.capex).toEqual({ items: [] })
    // plannedHires should be cleared
    expect(rpcArgs.p_assumptions.team.plannedHires).toEqual([])
    // revenue lines should be shifted (year1Monthly keys should be in 2026-* range)
    const revLine = rpcArgs.p_assumptions.revenue.lines[0]
    const monthKeys = Object.keys(revLine.year1Monthly || {})
    monthKeys.forEach((k: string) => {
      const year = parseInt(k.split('-')[0], 10)
      expect(year).toBeGreaterThanOrEqual(2026)
    })
  })

  it('calls financial_forecasts UPDATE unconditionally when prior duration = 1', async () => {
    const supabase = makeSuccessSupabase({ priorForecastDuration: 1 })
    createRouteHandlerClientMock.mockResolvedValue(supabase)

    await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))

    // updateSpy should have been called exactly once
    expect(updateSpy).toHaveBeenCalledTimes(1)
    const updateArg = updateSpy.mock.calls[0][0]
    expect(updateArg).toEqual({ forecast_duration: 1 })
  })

  it('calls financial_forecasts UPDATE unconditionally when prior duration = 2', async () => {
    const supabase = makeSuccessSupabase({ priorForecastDuration: 2 })
    createRouteHandlerClientMock.mockResolvedValue(supabase)

    await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))

    expect(updateSpy).toHaveBeenCalledTimes(1)
    const updateArg = updateSpy.mock.calls[0][0]
    expect(updateArg).toEqual({ forecast_duration: 2 })
  })

  it('subscription_budgets is NEVER touched on success path', async () => {
    const supabase = makeSuccessSupabase()
    createRouteHandlerClientMock.mockResolvedValue(supabase)

    await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))

    const tables = fromSpy.mock.calls.map((c: unknown[]) => c[0])
    expect(tables).not.toContain('subscription_budgets')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group G — Failure paths
// ═══════════════════════════════════════════════════════════════════════════
describe('G: Failure paths', () => {
  it('returns 500 and calls Sentry when RPC returns an error', async () => {
    const rpcErr = { message: 'RPC exploded', code: 'P0001' }
    const supabase = makeSuccessSupabase({ rpcError: rpcErr })
    createRouteHandlerClientMock.mockResolvedValue(supabase)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/Seed failed/i)
    expect(body.code).toBe('P0001')

    const Sentry = await import('@sentry/nextjs')
    expect((Sentry.captureException as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
    const sentryCall = (Sentry.captureException as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[1] as { tags?: { route?: string } })?.tags?.route === 'forecast/seed-from-prior',
    )
    expect(sentryCall).toBeDefined()
  })

  it('returns 500 and calls Sentry when an unexpected error throws', async () => {
    // Make createRouteHandlerClient throw
    createRouteHandlerClientMock.mockRejectedValue(new Error('unexpected kaboom'))

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/Internal server error/i)

    const Sentry = await import('@sentry/nextjs')
    expect((Sentry.captureException as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('returns 500 and calls Sentry when forecast_duration UPDATE fails', async () => {
    const updateErr = { message: 'update constraint violation', code: '23505' }
    const supabase = makeSuccessSupabase({ updateError: updateErr })
    createRouteHandlerClientMock.mockResolvedValue(supabase)

    const res = await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))
    expect(res.status).toBe(500)

    const Sentry = await import('@sentry/nextjs')
    expect((Sentry.captureException as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group I — subscription_budgets is never touched
// ═══════════════════════════════════════════════════════════════════════════
describe('I: subscription_budgets never accessed', () => {
  it('does not call supabase.from("subscription_budgets") across all success-path scenarios', async () => {
    const supabase = makeSuccessSupabase()
    createRouteHandlerClientMock.mockResolvedValue(supabase)

    await POST(makeRequest({ businessId: 'biz-1', targetFiscalYear: 2027 }))

    const tablesCalled = fromSpy.mock.calls.map((c: unknown[]) => c[0])
    expect(tablesCalled).not.toContain('subscription_budgets')
  })
})
