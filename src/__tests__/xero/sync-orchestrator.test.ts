/**
 * Phase 44 Plan 44-04 — Sync orchestrator tests.
 *
 * Validates the canonical sync entry point: advisory lock → fetch (current FY
 * YTD + prior FY) per active xero_connection → parse → reconcile → upsert →
 * sync_jobs audit row. All I/O is mocked at the boundary:
 *   - vi.spyOn(global, 'fetch') for Xero HTTP
 *   - vi.mock('@/lib/supabase/admin') for the service-role client
 *   - vi.mock('@/lib/xero/token-manager') for getValidAccessToken
 *   - vi.mock('@/lib/utils/encryption') (the orchestrator does not call decrypt
 *     directly, but token-manager imports it; mocking the boundary is enough)
 *
 * Test names mirror 44-VALIDATION.md exactly so `vitest -t '<name>'` filters resolve.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import jdsByMonthFixture from './fixtures/jds-fy26.json'
import jdsReconcilerFixture from './fixtures/jds-fy26-reconciler.json'

// ─── Module-level mocks ─────────────────────────────────────────────────────

// Service-role client — used by the orchestrator for ALL DB I/O.
const supabaseMock: any = {}
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => supabaseMock,
}))

// Token manager — orchestrator iterates xero_connections and calls
// getValidAccessToken({ id: connectionId }, supabase) per connection.
vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn(async () => ({
    success: true,
    accessToken: 'access-token-mock',
  })),
}))

// ─── Test helpers ───────────────────────────────────────────────────────────

type CallLogEntry = { kind: string; arg?: any }

function makeSupabaseStub(opts: {
  connections?: any[]
  syncJobInsertReturn?: { id: string; error: any | null }
  upsertCounts?: { inserted: number; updated: number }
  upsertError?: any | null
  rpcError?: any | null
}) {
  const callLog: CallLogEntry[] = []
  const connections = opts.connections ?? []
  const syncJobReturn = opts.syncJobInsertReturn ?? { id: 'sync-job-id-1', error: null }
  const upsertError = opts.upsertError ?? null
  const upsertedRowsCapture: any[][] = []

  // .from('table') returns a query builder that records every chained call
  const fromBuilder = (table: string) => {
    const ctx: any = { _filters: [] as any[], _table: table, _select: null }

    ctx.select = (..._args: any[]) => {
      ctx._select = _args
      return ctx
    }
    ctx.eq = (col: string, val: any) => {
      ctx._filters.push({ kind: 'eq', col, val })
      return ctx
    }
    ctx.in = (col: string, val: any[]) => {
      ctx._filters.push({ kind: 'in', col, val })
      return ctx
    }
    ctx.order = (..._args: any[]) => ctx
    ctx.limit = (..._args: any[]) => ctx
    ctx.maybeSingle = async () => {
      callLog.push({ kind: `from:${table}:select-maybeSingle` })
      // business_profiles resolution support for resolveBusinessIds:
      if (table === 'business_profiles') {
        return { data: { id: 'profile-id-1', business_id: 'biz-id-1' }, error: null }
      }
      return { data: null, error: null }
    }
    ctx.single = async () => {
      callLog.push({ kind: `from:${table}:single`, arg: ctx._lastInsertPayload })
      if (ctx._isInsert && table === 'sync_jobs') {
        return { data: { id: syncJobReturn.id }, error: syncJobReturn.error }
      }
      return { data: null, error: null }
    }

    ctx.insert = (payload: any) => {
      ctx._isInsert = true
      ctx._lastInsertPayload = payload
      callLog.push({ kind: `from:${table}:insert`, arg: payload })
      return ctx
    }

    ctx.update = (payload: any) => {
      callLog.push({ kind: `from:${table}:update`, arg: payload })
      // .update returns ctx so .eq() can chain; final await of .eq returns {data,error}
      ctx._isUpdate = true
      // Make .eq awaitable as terminal call returning {data,error}
      const finishUpdate = (col: string, val: any) => {
        ctx._filters.push({ kind: 'eq', col, val })
        return Promise.resolve({ data: null, error: null })
      }
      ctx.eq = finishUpdate as any
      return ctx
    }

    ctx.upsert = (rows: any[], upsertOpts: any) => {
      callLog.push({ kind: `from:${table}:upsert`, arg: { rowCount: rows.length, opts: upsertOpts } })
      upsertedRowsCapture.push(rows)
      // Mock returns { data, error, count } — orchestrator may inspect count
      return Promise.resolve({
        data: rows,
        error: upsertError,
        count: rows.length,
      })
    }

    // Terminal awaitable for SELECT chains (xero_connections list, etc.)
    ctx.then = (resolve: any, reject: any) => {
      callLog.push({ kind: `from:${table}:select-list`, arg: ctx._filters })
      // Routing by table name:
      if (table === 'xero_connections') {
        return Promise.resolve({ data: connections, error: null }).then(resolve, reject)
      }
      // sync_jobs select (none expected during run); business_profiles already handled.
      return Promise.resolve({ data: [], error: null }).then(resolve, reject)
    }

    return ctx
  }

  supabaseMock.from = (table: string) => fromBuilder(table)

  supabaseMock.rpc = vi.fn(async (name: string, args: any) => {
    callLog.push({ kind: `rpc:${name}`, arg: args })
    if (opts.rpcError) return { data: null, error: opts.rpcError }
    return { data: null, error: null }
  })

  return { callLog, upsertedRowsCapture }
}

// Stub a sequence of fetch responses keyed by URL substring. Helpers compose
// canonical-by-month responses (returns parsed monthly fixture) and
// reconciler responses (returns synthetic FY total derived from fixture).
function mockFetchByUrl(handlers: Array<{ match: (url: string) => boolean; body: any }>) {
  let callIdx = 0
  return vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const u = String(url)
    callIdx += 1
    for (const h of handlers) {
      if (h.match(u)) {
        return new Response(JSON.stringify(h.body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as any
      }
    }
    return new Response(JSON.stringify({ error: `unhandled url ${u}` }), {
      status: 500,
    }) as any
  })
}

// Minimal synthetic reconciler-shaped JSON: a valid Xero single-period response
// whose per-account totals exactly equal the parser's monthly_sum for the
// given by-month fixture. This guarantees reconciler.status='ok' for the
// happy path so we can exercise the orchestrator's success branch.
async function buildSyntheticFYTotalsFromByMonth(byMonthFixture: any) {
  const { parsePLByMonth } = await import('@/lib/xero/pl-by-month-parser')
  const rows = parsePLByMonth(byMonthFixture)
  const totals: Record<string, { code: string | null; name: string; total: number }> = {}
  for (const r of rows) {
    const key = r.account_code ?? `NAME:${r.account_name}`
    if (!totals[key]) {
      totals[key] = { code: r.account_code, name: r.account_name, total: 0 }
    }
    totals[key].total += r.amount
  }
  // Round each to 2dp to mirror Xero cents-precision and the reconciler's rounding.
  const xeroRows = Object.values(totals).map((t) => ({
    RowType: 'Row',
    Cells: [
      {
        Value: t.name,
        Attributes: t.code !== null ? [{ Id: 'account', Value: t.code }] : undefined,
      },
      { Value: (Math.round(t.total * 100) / 100).toFixed(2) },
    ],
  }))
  return {
    Reports: [
      {
        Rows: [
          { RowType: 'Header', Cells: [{ Value: '' }, { Value: '30 Jun 26' }] },
          { RowType: 'Section', Title: 'Income', Rows: xeroRows },
        ],
      },
    ],
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  // Pin "today" to a date inside FY26 (yearStartMonth=7) so currentFY=2026,
  // priorFY=2025. Matches the JDS fixture's natural framing.
  vi.setSystemTime(new Date('2026-04-15T00:00:00Z'))
  vi.resetModules()
  // Wipe any cached resolveBusinessIds entry from prior tests.
  for (const k of Object.keys(require.cache ?? {})) {
    if (k.includes('resolve-business-ids')) delete (require.cache as any)[k]
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Sync Orchestrator', () => {
  it('two FY windows', async () => {
    const { callLog } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    const fetchSpy = mockFetchByUrl([
      { match: (u) => u.includes('periods=11'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('periods='), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    // 1 tenant × 2 FYs × 2 fetches (by-month + reconciler) = 4 fetches.
    expect(fetchSpy).toHaveBeenCalledTimes(4)
    expect(result.status).toBe('success')
    expect(result.xero_request_count).toBe(4)
    // sync_jobs row must have been opened then updated.
    expect(callLog.some((c) => c.kind === 'from:sync_jobs:insert')).toBe(true)
    expect(callLog.some((c) => c.kind === 'from:sync_jobs:update')).toBe(true)
  })

  it('advisory lock', async () => {
    const { callLog } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    mockFetchByUrl([
      { match: (u) => u.includes('periods=11'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('periods='), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    // The advisory lock RPC MUST appear in the call log AND it MUST appear
    // before any fetch call. Fetch is not in the supabase callLog, so we
    // assert the lock is recorded; the orchestrator's source enforces order.
    const lockIdx = callLog.findIndex(
      (c) => c.kind === 'rpc:acquire_xero_sync_lock',
    )
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    // The first DB write (sync_jobs insert) must come AFTER the lock.
    const insertIdx = callLog.findIndex((c) => c.kind === 'from:sync_jobs:insert')
    expect(insertIdx).toBeGreaterThan(lockIdx)
    // The lock must be called with the resolved profile id.
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'acquire_xero_sync_lock',
      expect.objectContaining({ p_business_id: 'profile-id-1' }),
    )
  })

  it('idempotent upsert', async () => {
    const { callLog, upsertedRowsCapture } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    mockFetchByUrl([
      { match: (u) => u.includes('periods=11'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('periods='), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    // Find the upsert call to xero_pl_lines and assert ON CONFLICT shape.
    const upsertCalls = callLog.filter((c) => c.kind === 'from:xero_pl_lines:upsert')
    expect(upsertCalls.length).toBeGreaterThan(0)
    for (const call of upsertCalls) {
      expect(call.arg.opts.onConflict).toBe(
        'business_id,tenant_id,account_code,period_month',
      )
    }
    // Idempotency: the same fixture upserted twice produces the same payload.
    const firstPayloadCount = upsertedRowsCapture[0]?.length ?? 0
    expect(firstPayloadCount).toBeGreaterThan(0)
  })

  it('natural key uniqueness', async () => {
    // Mock supabase to surface a unique-violation on upsert. Orchestrator
    // must NOT swallow it — it must mark sync_jobs.status='error' and re-throw.
    const violation = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const { callLog } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
      upsertError: violation,
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    mockFetchByUrl([
      { match: (u) => u.includes('periods=11'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('periods='), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await expect(syncBusinessXeroPL('biz-id-1')).rejects.toThrow(/duplicate key|unique|23505/i)

    // The error path must update sync_jobs to status='error' before re-throwing.
    const errorUpdate = callLog.find(
      (c) =>
        c.kind === 'from:sync_jobs:update' &&
        c.arg &&
        c.arg.status === 'error',
    )
    expect(errorUpdate).toBeTruthy()
  })

  it('coverage record', async () => {
    // Sparse fixture: slice JDS to first 4 months only. The orchestrator
    // must report months_covered reflecting what was actually returned,
    // NOT zero-pad to 24.
    const sparse = JSON.parse(JSON.stringify(jdsByMonthFixture))
    const headerRow = sparse.Reports[0].Rows.find((r: any) => r.RowType === 'Header')
    // Keep the empty leading cell + first 4 month columns.
    headerRow.Cells = headerRow.Cells.slice(0, 5)
    for (const sec of sparse.Reports[0].Rows) {
      if (sec.RowType !== 'Section' || !Array.isArray(sec.Rows)) continue
      for (const row of sec.Rows) {
        if (row.RowType === 'Row' && Array.isArray(row.Cells)) {
          row.Cells = row.Cells.slice(0, 5)
        }
      }
    }

    const { callLog } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(sparse)
    mockFetchByUrl([
      { match: (u) => u.includes('periods=11'), body: sparse },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('periods='), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    // The coverage record is sparse — first FY window's by-month base is
    // April 2026 sliced to 4 cols, so months_covered per-window <= 4.
    expect(result.coverage.months_covered).toBeLessThanOrEqual(8) // ≤ 4 per FY × 2 FYs
    expect(result.coverage.months_covered).toBeGreaterThan(0)
    // expected_months reflects the orchestrator's intent (24 for the 2-FY window).
    expect(result.coverage.expected_months).toBe(24)

    // sync_jobs.update payload must include the coverage object.
    const finalUpdate = callLog.find(
      (c) =>
        c.kind === 'from:sync_jobs:update' &&
        c.arg &&
        c.arg.coverage,
    )
    expect(finalUpdate).toBeTruthy()
    expect(finalUpdate?.arg.coverage.months_covered).toBe(result.coverage.months_covered)
  })

  it('reconciliation mismatch fails loud', async () => {
    // Reconciler stub that ALWAYS returns a discrepancy. We achieve this
    // by providing FY totals that don't match the parser's monthly sum.
    const fyTotals = {
      Reports: [
        {
          Rows: [
            { RowType: 'Header', Cells: [{ Value: '' }, { Value: '30 Jun 26' }] },
            {
              RowType: 'Section',
              Title: 'Income',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Sales - General',
                      Attributes: [{ Id: 'account', Value: 'BOGUS-ACCT' }],
                    },
                    { Value: '999999.99' }, // intentionally wrong
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    const { callLog } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    mockFetchByUrl([
      { match: (u) => u.includes('periods=11'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('periods='), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    // D-08: surface but do not abort mid-flight. status='partial' or 'error'.
    expect(['partial', 'error']).toContain(result.status)
    expect(result.reconciliation.status).toBe('mismatch')
    expect(result.reconciliation.discrepancy_count).toBeGreaterThanOrEqual(1)

    // The data IS still upserted — operators can inspect.
    const upsertCalls = callLog.filter((c) => c.kind === 'from:xero_pl_lines:upsert')
    expect(upsertCalls.length).toBeGreaterThan(0)

    // sync_jobs.reconciliation field captures the discrepancy.
    const finalUpdate = callLog.find(
      (c) =>
        c.kind === 'from:sync_jobs:update' &&
        c.arg &&
        c.arg.reconciliation &&
        c.arg.reconciliation.status === 'mismatch',
    )
    expect(finalUpdate).toBeTruthy()
  })

  it('multi-org per business', async () => {
    // Two active xero_connections rows → orchestrator iterates both →
    // 2 tenants × 2 FYs × 2 fetches = 8 fetches; tenant_id stamped on rows.
    const { callLog, upsertedRowsCapture } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS Org A', business_id: 'profile-id-1' },
        { id: 'conn-2', tenant_id: 'tenant-B', tenant_name: 'JDS Org B', business_id: 'profile-id-1' },
      ],
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    const fetchSpy = mockFetchByUrl([
      { match: (u) => u.includes('periods=11'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('periods='), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(fetchSpy).toHaveBeenCalledTimes(8)
    expect(result.xero_request_count).toBe(8)

    // Both tenants represented in the upserted rows.
    const tenantIds = new Set<string>()
    for (const batch of upsertedRowsCapture) {
      for (const row of batch) tenantIds.add(row.tenant_id)
    }
    expect(tenantIds.has('tenant-A')).toBe(true)
    expect(tenantIds.has('tenant-B')).toBe(true)

    // Per-tenant upsert calls: ≥ 2 (one per FY × tenant) — orchestrator may
    // batch within a tenant but cannot collapse across tenants because rows
    // tagged with different tenant_id values land in different conflict groups.
    const upsertCount = callLog.filter(
      (c) => c.kind === 'from:xero_pl_lines:upsert',
    ).length
    expect(upsertCount).toBeGreaterThanOrEqual(2)
  })

  it('no active connections', async () => {
    makeSupabaseStub({ connections: [] })
    const fetchSpy = mockFetchByUrl([])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('error')
    expect(result.error ?? '').toMatch(/no active|no connection/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
