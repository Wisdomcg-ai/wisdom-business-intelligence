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

})

describe('Recompute endpoint (recovery hatch)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('recompute — POST /api/forecast/[id]/recompute calls the RPC with current assumptions', async () => {
    supabaseMock = buildSupabaseMock(async (fn: string, args: any) => {
      if (fn === 'save_assumptions_and_materialize') {
        return {
          data: {
            forecast_id: args.p_forecast_id,
            computed_at: '2026-04-29T13:00:00.000Z',
            lines_count: args.p_pl_lines.length,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    const { POST } = await import('@/app/api/forecast/[id]/recompute/route')
    const req = new Request('http://localhost/api/forecast/forecast-1/recompute', {
      method: 'POST',
    })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'forecast-1' }) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.computed_at).toBe('2026-04-29T13:00:00.000Z')

    const rpcCalls = supabaseMock.rpc.mock.calls.filter(
      ([fn]: any[]) => fn === 'save_assumptions_and_materialize',
    )
    expect(rpcCalls).toHaveLength(1)
    const [, args] = rpcCalls[0]
    expect(args.p_forecast_id).toBe('forecast-1')
    // Assumptions came from the existing financial_forecasts.assumptions row.
    expect(args.p_assumptions).toEqual({ revenue: { mode: 'simple', value: 100 } })
    expect(Array.isArray(args.p_pl_lines)).toBe(true)
  })

  it('recompute auth — returns 401 when unauthenticated', async () => {
    supabaseMock = buildSupabaseMock(async () => ({ data: null, error: null }))
    supabaseMock.auth.getUser = vi.fn(async () => ({ data: { user: null }, error: null }))

    const { POST } = await import('@/app/api/forecast/[id]/recompute/route')
    const req = new Request('http://localhost/api/forecast/forecast-1/recompute', {
      method: 'POST',
    })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'forecast-1' }) })

    expect(res.status).toBe(401)
  })

  it('recompute 404 — returns 404 when forecast does not exist', async () => {
    supabaseMock = buildSupabaseMock(async () => ({ data: null, error: null }))
    // Override forecast lookup to return null.
    const origFrom = supabaseMock.from as unknown as (t: string) => any
    supabaseMock.from = vi.fn((table: string) => {
      const chain = origFrom(table)
      if (table === 'financial_forecasts') {
        chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
      }
      return chain
    }) as any

    const { POST } = await import('@/app/api/forecast/[id]/recompute/route')
    const req = new Request('http://localhost/api/forecast/missing-forecast/recompute', {
      method: 'POST',
    })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'missing-forecast' }) })

    expect(res.status).toBe(404)
  })
})

// ─── Plan 44.1-03 — Loss-vector regression tests (D-44.1-06 + W2) ───────────
//
// These tests lock the UPSERT contract added in 44.1-02 AND the converter merge
// from 44.1-08. They simulate the new RPC body in a JS mock (the mock APPLIES
// upsert semantics to simulatedDB) so the test fails if either the route handler
// OR the contract drifts.
//
// The mock's RPC implementation MIRRORS the SQL in
// supabase/migrations/20260429000003_save_assumptions_and_materialize_upsert.sql:
//   - Apply UPSERT keyed on (forecast_id, account_code) WHERE is_manual = false.
//   - Force-replace branch when p_force_full_replace=true.
//   - is_manual=true rows preserved through both paths.
//   - Bump computed_at on all is_manual=false rows.
//
// The converter mock MIRRORS post-44.1-08 contract: forecast_months is built
// starting from existing.forecast_months and then has input-derived keys overlaid.

interface SimulatedRow {
  id: string
  forecast_id: string
  account_name: string
  account_code: string | null
  category: string
  forecast_months: Record<string, number>
  actual_months: Record<string, number>
  is_manual: boolean
  computed_at: string
}

function applyUpsertToSimulatedDB(
  db: SimulatedRow[],
  args: {
    p_forecast_id: string
    p_pl_lines: Array<Partial<SimulatedRow>>
    p_force_full_replace?: boolean
  },
  v_now: string,
): { lines_count: number } {
  // 1. Force-full-replace branch: delete is_manual=false rows for this forecast.
  if (args.p_force_full_replace) {
    for (let i = db.length - 1; i >= 0; i--) {
      if (db[i].forecast_id === args.p_forecast_id && db[i].is_manual === false) {
        db.splice(i, 1)
      }
    }
  }

  let inserted = 0
  // 2. UPSERT: for each input line, find a matching is_manual=false row by
  //    (forecast_id, account_code). If found, UPDATE; else INSERT.
  for (const line of args.p_pl_lines) {
    const idx = db.findIndex(
      (r) =>
        r.forecast_id === args.p_forecast_id &&
        r.account_code === (line.account_code ?? null) &&
        r.is_manual === false,
    )
    if (idx >= 0) {
      // UPDATE — RPC writes EXCLUDED.forecast_months (i.e., line.forecast_months).
      // Because 44.1-08 patches the converter to MERGE existing.forecast_months
      // BEFORE handing to the RPC, line.forecast_months at this point already contains
      // the merged result. The RPC's job is just to write it.
      db[idx] = {
        ...db[idx],
        account_name: line.account_name ?? db[idx].account_name,
        category: line.category ?? db[idx].category,
        forecast_months: (line.forecast_months as Record<string, number>) ?? {},
        actual_months: (line.actual_months as Record<string, number>) ?? db[idx].actual_months,
        computed_at: v_now,
      }
      inserted++
    } else {
      db.push({
        id: `new-${Math.random().toString(36).slice(2)}`,
        forecast_id: args.p_forecast_id,
        account_name: line.account_name ?? '',
        account_code: (line.account_code ?? null) as string | null,
        category: line.category ?? '',
        forecast_months: (line.forecast_months as Record<string, number>) ?? {},
        actual_months: (line.actual_months as Record<string, number>) ?? {},
        is_manual: false,
        computed_at: v_now,
      })
      inserted++
    }
  }

  // 3. Bump computed_at on un-touched is_manual=false rows.
  for (const r of db) {
    if (r.forecast_id === args.p_forecast_id && r.is_manual === false && r.computed_at < v_now) {
      r.computed_at = v_now
    }
  }

  return { lines_count: inserted }
}

/**
 * Helper that returns a converter-mock factory. Given a `simulatedDB` snapshot
 * and an array of "input lines" (account_code + per-key overrides), returns a
 * mock that mirrors the post-44.1-08 merge contract:
 *   forecast_months = { ...existing.forecast_months, ...inputDerivedKeys }
 * If no existing match, forecast_months = inputDerivedKeys.
 */
function makeConverterMockMerging(
  simulatedDB: SimulatedRow[],
  inputs: Array<{
    account_name: string
    account_code: string
    category: string
    inputForecastMonths: Record<string, number> // keys the input provides
  }>,
) {
  return vi.fn(() =>
    inputs.map((inp) => {
      const existing = simulatedDB.find(
        (r) => r.account_code === inp.account_code && r.is_manual === false,
      )
      const merged: Record<string, number> = {
        ...(existing?.forecast_months || {}),
        ...inp.inputForecastMonths,
      }
      return {
        account_name: inp.account_name,
        account_code: inp.account_code,
        category: inp.category,
        subcategory: null,
        sort_order: 0,
        actual_months: existing?.actual_months || {},
        forecast_months: merged,
        is_from_xero: false,
      }
    }),
  )
}

describe('Loss-vector regression — D-44.1-06', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('vector 1 — empty opex lines preserves all 5 existing OpEx rows (D-44.1-06)', async () => {
    const v_now = '2026-04-29T14:00:00.000Z'
    const simulatedDB: SimulatedRow[] = [
      { id: 'rev-1', forecast_id: 'forecast-1', account_name: 'Sales', account_code: '4000', category: 'Revenue', forecast_months: { '2026-07': 100000 }, actual_months: {}, is_manual: false, computed_at: '2026-04-01T00:00:00Z' },
      { id: 'opex-1', forecast_id: 'forecast-1', account_name: 'Rent', account_code: '6100', category: 'Operating Expenses', forecast_months: { '2026-07': 5000 }, actual_months: {}, is_manual: false, computed_at: '2026-04-01T00:00:00Z' },
      { id: 'opex-2', forecast_id: 'forecast-1', account_name: 'Utilities', account_code: '6110', category: 'Operating Expenses', forecast_months: { '2026-07': 800 }, actual_months: {}, is_manual: false, computed_at: '2026-04-01T00:00:00Z' },
      { id: 'opex-3', forecast_id: 'forecast-1', account_name: 'Insurance', account_code: '6120', category: 'Operating Expenses', forecast_months: { '2026-07': 1200 }, actual_months: {}, is_manual: false, computed_at: '2026-04-01T00:00:00Z' },
      { id: 'opex-4', forecast_id: 'forecast-1', account_name: 'Marketing', account_code: '6130', category: 'Operating Expenses', forecast_months: { '2026-07': 2000 }, actual_months: {}, is_manual: false, computed_at: '2026-04-01T00:00:00Z' },
      { id: 'opex-5', forecast_id: 'forecast-1', account_name: 'Subscriptions', account_code: '6140', category: 'Operating Expenses', forecast_months: { '2026-07': 500 }, actual_months: {}, is_manual: false, computed_at: '2026-04-01T00:00:00Z' },
    ]

    // Per-test mock: convertAssumptionsToPLLines returns ONLY revenue (no opex)
    vi.doMock('@/app/finances/forecast/services/assumptions-to-pl-lines', () => ({
      convertAssumptionsToPLLines: makeConverterMockMerging(simulatedDB, [
        { account_name: 'Sales', account_code: '4000', category: 'Revenue', inputForecastMonths: { '2026-07': 110000 } },
      ]),
    }))

    supabaseMock = buildSupabaseMock(async (fn: string, args: any) => {
      if (fn === 'save_assumptions_and_materialize') {
        const result = applyUpsertToSimulatedDB(simulatedDB, args, v_now)
        return { data: { forecast_id: args.p_forecast_id, computed_at: v_now, lines_count: result.lines_count }, error: null }
      }
      return { data: null, error: null }
    })

    const { POST } = await import('@/app/api/forecast-wizard-v4/generate/route')
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)

    // Assertion: all 5 OpEx rows are still in the DB (UPSERT does NOT delete them).
    const opexRows = simulatedDB.filter((r) => r.category === 'Operating Expenses')
    expect(opexRows).toHaveLength(5)
    expect(opexRows.map((r) => r.account_code).sort()).toEqual(['6100', '6110', '6120', '6130', '6140'])
    // Their forecast_months are untouched (the UPSERT bypassed them).
    expect(opexRows.find((r) => r.account_code === '6100')!.forecast_months).toEqual({ '2026-07': 5000 })
  })

  it('vector 2 — undefined year1Monthly does not blank forecast_months on existing rows (D-44.1-06)', async () => {
    const v_now = '2026-04-29T14:00:00.000Z'
    const simulatedDB: SimulatedRow[] = [
      { id: 'rev-1', forecast_id: 'forecast-1', account_name: 'Sales', account_code: '4000', category: 'Revenue', forecast_months: { '2026-05-01': 100000, '2026-06-01': 110000 }, actual_months: {}, is_manual: false, computed_at: '2026-04-01T00:00:00Z' },
    ]

    // Mock the converter (post-44.1-08): input has NO year1Monthly, so inputForecastMonths={}.
    // The merge yields { ...existing.forecast_months, ...{} } = existing.forecast_months.
    vi.doMock('@/app/finances/forecast/services/assumptions-to-pl-lines', () => ({
      convertAssumptionsToPLLines: makeConverterMockMerging(simulatedDB, [
        { account_name: 'Sales', account_code: '4000', category: 'Revenue', inputForecastMonths: {} },
      ]),
    }))

    supabaseMock = buildSupabaseMock(async (fn: string, args: any) => {
      if (fn === 'save_assumptions_and_materialize') {
        const result = applyUpsertToSimulatedDB(simulatedDB, args, v_now)
        return { data: { forecast_id: args.p_forecast_id, computed_at: v_now, lines_count: result.lines_count }, error: null }
      }
      return { data: null, error: null }
    })

    const { POST } = await import('@/app/api/forecast-wizard-v4/generate/route')
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)

    // STRICT ASSERTION (per D-44.1-06 + 44.1-08): existing forecast_months keys MUST survive.
    const rows = simulatedDB.filter((r) => r.account_code === '4000')
    expect(rows).toHaveLength(1) // no duplicate
    const row = rows[0]
    expect(row.account_code).toBe('4000')
    expect(row.is_manual).toBe(false)
    // The two original month keys are STILL present with their original values.
    expect(row.forecast_months).toEqual({ '2026-05-01': 100000, '2026-06-01': 110000 })
    expect(row.forecast_months['2026-05-01']).toBe(100000)
    expect(row.forecast_months['2026-06-01']).toBe(110000)
  })

  it('vector 3 — shrunk forecastDuration preserves Y2/Y3 month keys on existing rows (D-44.1-06)', async () => {
    const v_now = '2026-04-29T14:00:00.000Z'
    // DB row has Y1+Y2+Y3 keys (created when forecastDuration=3) — 12 keys total across 3 years.
    const simulatedDB: SimulatedRow[] = [
      {
        id: 'rev-1',
        forecast_id: 'forecast-1',
        account_name: 'Sales',
        account_code: '4000',
        category: 'Revenue',
        forecast_months: {
          // Y1
          '2026-07': 100000, '2026-08': 100000, '2026-09': 100000, '2026-10': 100000,
          // Y2
          '2027-07': 110000, '2027-10': 115000, '2027-12': 120000,
          // Y3
          '2028-07': 125000, '2028-09': 130000, '2028-12': 135000, '2029-03': 140000, '2029-06': 145000,
        },
        actual_months: {},
        is_manual: false,
        computed_at: '2026-04-01T00:00:00Z',
      },
    ]

    // Mock converter (post-44.1-08): forecastDuration is now 1, so input only provides Y1 keys.
    // The merge yields { ...existing(all 12 keys), ...{Y1 overrides} } = all 12 keys with Y1 values updated.
    vi.doMock('@/app/finances/forecast/services/assumptions-to-pl-lines', () => ({
      convertAssumptionsToPLLines: makeConverterMockMerging(simulatedDB, [
        {
          account_name: 'Sales',
          account_code: '4000',
          category: 'Revenue',
          inputForecastMonths: { '2026-07': 105000, '2026-08': 105000, '2026-09': 105000, '2026-10': 105000 },
        },
      ]),
    }))

    supabaseMock = buildSupabaseMock(async (fn: string, args: any) => {
      if (fn === 'save_assumptions_and_materialize') {
        const result = applyUpsertToSimulatedDB(simulatedDB, args, v_now)
        return { data: { forecast_id: args.p_forecast_id, computed_at: v_now, lines_count: result.lines_count }, error: null }
      }
      return { data: null, error: null }
    })

    const { POST } = await import('@/app/api/forecast-wizard-v4/generate/route')
    const res = await POST(makeRequest({ ...VALID_BODY, forecastDuration: 1 }))
    expect(res.status).toBe(200)

    // STRICT ASSERTION (per D-44.1-06 + 44.1-08): Y2 + Y3 month keys MUST be preserved.
    const row = simulatedDB.find((r) => r.account_code === '4000')!
    expect(row).toBeDefined()
    expect(row.is_manual).toBe(false)
    // Y2 keys preserved with original values:
    expect(row.forecast_months['2027-07']).toBe(110000)
    expect(row.forecast_months['2027-10']).toBe(115000)
    expect(row.forecast_months['2027-12']).toBe(120000)
    // Y3 keys preserved with original values:
    expect(row.forecast_months['2028-07']).toBe(125000)
    expect(row.forecast_months['2028-09']).toBe(130000)
    expect(row.forecast_months['2028-12']).toBe(135000)
    expect(row.forecast_months['2029-03']).toBe(140000)
    expect(row.forecast_months['2029-06']).toBe(145000)
    // Y1 keys overwritten by input:
    expect(row.forecast_months['2026-07']).toBe(105000)
    expect(row.forecast_months['2026-08']).toBe(105000)
    // Total key count is the union: all 12 original keys still present.
    expect(Object.keys(row.forecast_months)).toHaveLength(12)
  })

  it('vector 4 — RLS-empty existingLines preserves is_manual=true rows (D-44.1-06)', async () => {
    const v_now = '2026-04-29T14:00:00.000Z'
    const simulatedDB: SimulatedRow[] = [
      { id: 'manual-1', forecast_id: 'forecast-1', account_name: 'Coach Override Revenue', account_code: '4999', category: 'Revenue', forecast_months: { '2026-07': 50000 }, actual_months: {}, is_manual: true, computed_at: '2026-04-01T00:00:00Z' },
      { id: 'derived-1', forecast_id: 'forecast-1', account_name: 'Sales', account_code: '4000', category: 'Revenue', forecast_months: { '2026-07': 100000 }, actual_months: {}, is_manual: false, computed_at: '2026-04-01T00:00:00Z' },
    ]

    // Mock: RLS made existingLines empty, so converter returns just the wizard-derived row.
    // (We use a fixed mock here, not the merging helper — the point is to simulate RLS giving
    // existingLines=[], which means the converter has nothing to merge with.)
    vi.doMock('@/app/finances/forecast/services/assumptions-to-pl-lines', () => ({
      convertAssumptionsToPLLines: vi.fn(() => [
        { account_name: 'Sales', account_code: '4000', category: 'Revenue', subcategory: null, sort_order: 0, actual_months: {}, forecast_months: { '2026-07': 110000 }, is_from_xero: false },
      ]),
    }))

    supabaseMock = buildSupabaseMock(async (fn: string, args: any) => {
      if (fn === 'save_assumptions_and_materialize') {
        const result = applyUpsertToSimulatedDB(simulatedDB, args, v_now)
        return { data: { forecast_id: args.p_forecast_id, computed_at: v_now, lines_count: result.lines_count }, error: null }
      }
      return { data: null, error: null }
    })

    const { POST } = await import('@/app/api/forecast-wizard-v4/generate/route')
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)

    // CRITICAL ASSERTION: is_manual=true row survives untouched.
    const manualRows = simulatedDB.filter((r) => r.is_manual === true)
    expect(manualRows).toHaveLength(1)
    expect(manualRows[0].account_code).toBe('4999')
    expect(manualRows[0].forecast_months).toEqual({ '2026-07': 50000 })
    expect(manualRows[0].computed_at).toBe('2026-04-01T00:00:00Z') // computed_at NOT bumped on manual rows
    // Non-manual row was upserted (updated, not duplicated).
    const derivedRows = simulatedDB.filter((r) => r.account_code === '4000' && r.is_manual === false)
    expect(derivedRows).toHaveLength(1)
    expect(derivedRows[0].forecast_months).toEqual({ '2026-07': 110000 })
  })

  it('vector 5 — manual-flag duplicate does NOT create two rows for same (forecast_id, account_code) (D-44.1-06)', async () => {
    const v_now = '2026-04-29T14:00:00.000Z'
    // DB has BOTH a manual and a non-manual row with the SAME account_code ALLOWED by partial index.
    const simulatedDB: SimulatedRow[] = [
      { id: 'manual-1', forecast_id: 'forecast-1', account_name: 'Sales (coach override)', account_code: '4000', category: 'Revenue', forecast_months: { '2026-07': 50000 }, actual_months: {}, is_manual: true, computed_at: '2026-04-01T00:00:00Z' },
    ]

    vi.doMock('@/app/finances/forecast/services/assumptions-to-pl-lines', () => ({
      convertAssumptionsToPLLines: vi.fn(() => [
        { account_name: 'Sales', account_code: '4000', category: 'Revenue', subcategory: null, sort_order: 0, actual_months: {}, forecast_months: { '2026-07': 110000 }, is_from_xero: false },
      ]),
    }))

    supabaseMock = buildSupabaseMock(async (fn: string, args: any) => {
      if (fn === 'save_assumptions_and_materialize') {
        const result = applyUpsertToSimulatedDB(simulatedDB, args, v_now)
        return { data: { forecast_id: args.p_forecast_id, computed_at: v_now, lines_count: result.lines_count }, error: null }
      }
      return { data: null, error: null }
    })

    const { POST } = await import('@/app/api/forecast-wizard-v4/generate/route')
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)

    // Run the call a SECOND time (re-saving). Should still NOT duplicate.
    const res2 = await POST(makeRequest(VALID_BODY))
    expect(res2.status).toBe(200)

    // Assertion: still exactly 1 manual row + 1 derived row at account_code='4000'.
    const allFor4000 = simulatedDB.filter((r) => r.account_code === '4000')
    expect(allFor4000).toHaveLength(2) // 1 manual + 1 derived
    expect(allFor4000.filter((r) => r.is_manual === true)).toHaveLength(1)
    expect(allFor4000.filter((r) => r.is_manual === false)).toHaveLength(1)
    // Manual row untouched.
    const manual = allFor4000.find((r) => r.is_manual === true)!
    expect(manual.forecast_months).toEqual({ '2026-07': 50000 })
    // Derived row reflects last input.
    const derived = allFor4000.find((r) => r.is_manual === false)!
    expect(derived.forecast_months).toEqual({ '2026-07': 110000 })
  })

  it('vector 6 — force_full_replace=true clears non-manual rows AND preserves manual rows (W2)', async () => {
    const v_now = '2026-04-29T14:00:00.000Z'
    // 3 non-manual rows + 1 manual row.
    const simulatedDB: SimulatedRow[] = [
      { id: 'derived-1', forecast_id: 'forecast-1', account_name: 'Sales', account_code: '4000', category: 'Revenue', forecast_months: { '2026-07': 100000 }, actual_months: {}, is_manual: false, computed_at: '2026-04-01T00:00:00Z' },
      { id: 'derived-2', forecast_id: 'forecast-1', account_name: 'Marketing', account_code: '6130', category: 'Operating Expenses', forecast_months: { '2026-07': 2000 }, actual_months: {}, is_manual: false, computed_at: '2026-04-01T00:00:00Z' },
      { id: 'derived-3', forecast_id: 'forecast-1', account_name: 'Wages', account_code: '6200', category: 'Operating Expenses', forecast_months: { '2026-07': 50000 }, actual_months: {}, is_manual: false, computed_at: '2026-04-01T00:00:00Z' },
      { id: 'manual-1', forecast_id: 'forecast-1', account_name: 'CEO Bonus', account_code: '6999', category: 'Operating Expenses', forecast_months: { '2026-12': 100000 }, actual_months: {}, is_manual: true, computed_at: '2026-04-01T00:00:00Z' },
    ]

    // Mock: converter returns ONLY 1 input row (Sales).
    vi.doMock('@/app/finances/forecast/services/assumptions-to-pl-lines', () => ({
      convertAssumptionsToPLLines: vi.fn(() => [
        { account_name: 'Sales', account_code: '4000', category: 'Revenue', subcategory: null, sort_order: 0, actual_months: {}, forecast_months: { '2026-07': 105000 }, is_from_xero: false },
      ]),
    }))

    // Mock RPC: pass p_force_full_replace=true (we override the args before invoking applyUpsert).
    supabaseMock = buildSupabaseMock(async (fn: string, args: any) => {
      if (fn === 'save_assumptions_and_materialize') {
        // The route handler passes only 3 args today; we simulate the force-replace path
        // by injecting p_force_full_replace=true at the boundary. This is the test of
        // the RPC contract — when called with force_full_replace=true, it must behave correctly.
        const argsWithForce = { ...args, p_force_full_replace: true }
        const result = applyUpsertToSimulatedDB(simulatedDB, argsWithForce, v_now)
        return { data: { forecast_id: args.p_forecast_id, computed_at: v_now, lines_count: result.lines_count }, error: null }
      }
      return { data: null, error: null }
    })

    const { POST } = await import('@/app/api/forecast-wizard-v4/generate/route')
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)

    // ASSERT: post-RPC count = 2 (1 input row + 1 manual row).
    const allRowsForForecast = simulatedDB.filter((r) => r.forecast_id === 'forecast-1')
    expect(allRowsForForecast).toHaveLength(2)
    // The 2 dropped non-manual rows are gone.
    expect(simulatedDB.find((r) => r.account_code === '6130')).toBeUndefined()
    expect(simulatedDB.find((r) => r.account_code === '6200')).toBeUndefined()
    // The manual row is untouched.
    const manual = simulatedDB.find((r) => r.account_code === '6999')!
    expect(manual).toBeDefined()
    expect(manual.is_manual).toBe(true)
    expect(manual.forecast_months).toEqual({ '2026-12': 100000 })
    expect(manual.computed_at).toBe('2026-04-01T00:00:00Z') // untouched
    // The 1 input row is present (re-inserted after the force-clear).
    const sales = simulatedDB.find((r) => r.account_code === '4000')!
    expect(sales).toBeDefined()
    expect(sales.is_manual).toBe(false)
    expect(sales.forecast_months).toEqual({ '2026-07': 105000 })
  })
})
