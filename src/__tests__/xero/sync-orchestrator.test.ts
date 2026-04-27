/**
 * Phase 44 Plan 44-04 / 44-05 — Sync orchestrator tests.
 *
 * Validates the canonical sync entry point: begin_xero_sync_job (single-flight
 * guard) → fetch (current FY YTD + prior FY) per active xero_connection →
 * parse → reconcile → upsert → finalize_xero_sync_job. All I/O is mocked at
 * the boundary:
 *   - vi.spyOn(global, 'fetch') for Xero HTTP
 *   - vi.mock('@/lib/supabase/admin') for the service-role client
 *   - vi.mock('@/lib/xero/token-manager') for getValidAccessToken
 *
 * Test names mirror 44-VALIDATION.md exactly so `vitest -t '<name>'` filters
 * still resolve. The 'advisory lock' test from the original 44-04 suite
 * was renamed/reshaped to 'rejects when another sync is in progress' because
 * 44-05 migration 5 dropped the broken pg_advisory_xact_lock RPC and replaced
 * it with the begin_xero_sync_job DB-state guard. The orchestrator now asserts
 * single-flight via NULL return from begin_xero_sync_job, not via lock RPC.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import jdsByMonthFixture from './fixtures/jds-fy26.json'

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

type RpcReturn =
  | { data: any; error: any | null }
  | ((args: any) => { data: any; error: any | null })

/**
 * Build a stub of the supabase service-role client.
 *
 * `rpcReturns` lets tests dictate per-RPC behaviour. By default:
 *   - begin_xero_sync_job returns 'sync-job-id-1' (a fresh job claim).
 *   - finalize_xero_sync_job returns void (success).
 * Tests override either one to simulate "another sync in flight" (begin
 * returns NULL) or finalize errors.
 */
function makeSupabaseStub(opts: {
  connections?: any[]
  rpcReturns?: Record<string, RpcReturn>
  upsertError?: any | null
}) {
  const callLog: CallLogEntry[] = []
  const connections = opts.connections ?? []
  const upsertError = opts.upsertError ?? null
  const upsertedRowsCapture: any[][] = []

  const defaultRpcReturns: Record<string, RpcReturn> = {
    begin_xero_sync_job: { data: 'sync-job-id-1', error: null },
    finalize_xero_sync_job: { data: null, error: null },
  }
  const rpcReturns = { ...defaultRpcReturns, ...(opts.rpcReturns ?? {}) }

  // .from('table') returns a query builder that records every chained call.
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
      callLog.push({ kind: `from:${table}:single` })
      return { data: null, error: null }
    }

    ctx.upsert = (rows: any[], upsertOpts: any) => {
      callLog.push({
        kind: `from:${table}:upsert`,
        arg: { rowCount: rows.length, opts: upsertOpts },
      })
      upsertedRowsCapture.push(rows)
      return Promise.resolve({
        data: rows,
        error: upsertError,
        count: rows.length,
      })
    }

    // Terminal awaitable for SELECT chains (xero_connections list, etc.)
    ctx.then = (resolve: any, reject: any) => {
      callLog.push({ kind: `from:${table}:select-list`, arg: ctx._filters })
      if (table === 'xero_connections') {
        return Promise.resolve({ data: connections, error: null }).then(resolve, reject)
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject)
    }

    return ctx
  }

  supabaseMock.from = (table: string) => fromBuilder(table)

  supabaseMock.rpc = vi.fn(async (name: string, args: any) => {
    callLog.push({ kind: `rpc:${name}`, arg: args })
    const ret = rpcReturns[name]
    if (typeof ret === 'function') return ret(args)
    if (ret) return ret
    return { data: null, error: null }
  })

  return { callLog, upsertedRowsCapture }
}

// Stub a sequence of fetch responses keyed by URL substring.
function mockFetchByUrl(handlers: Array<{ match: (url: string) => boolean; body: any }>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const u = String(url)
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
// given by-month fixture. Guarantees reconciler.status='ok' for the happy path.
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
  // Fake timers MUST advance real time too — orchestrator awaits a polite
  // 300ms sleep between Xero calls; without `shouldAdvanceTime` the test
  // hangs on the awaited setTimeout.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  // Pin "today" to a date inside FY26 (yearStartMonth=7) so currentFY=2026,
  // priorFY=2025. Matches the JDS fixture's natural framing.
  vi.setSystemTime(new Date('2026-04-15T00:00:00Z'))
  vi.resetModules()
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
      { match: (u) => u.includes('timeframe=MONTH'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('timeframe=MONTH'), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    // 1 tenant × 2 FYs × 2 fetches (by-month + reconciler) = 4 fetches.
    expect(fetchSpy).toHaveBeenCalledTimes(4)
    expect(result.status).toBe('success')
    expect(result.xero_request_count).toBe(4)
    // begin + finalize RPCs MUST both have been recorded.
    expect(callLog.some((c) => c.kind === 'rpc:begin_xero_sync_job')).toBe(true)
    expect(callLog.some((c) => c.kind === 'rpc:finalize_xero_sync_job')).toBe(true)
  })

  it('rejects when another sync is in progress', async () => {
    // begin_xero_sync_job returns NULL → orchestrator must short-circuit.
    // No fetches, no upserts, no finalize call (the in-flight sync owns the
    // existing sync_jobs row).
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
      rpcReturns: {
        begin_xero_sync_job: { data: null, error: null },
      },
    })
    const fetchSpy = mockFetchByUrl([])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('error')
    expect(result.error ?? '').toMatch(/already in progress|in flight|in-flight/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    // begin RPC was called with the resolved profile id.
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'begin_xero_sync_job',
      expect.objectContaining({ p_business_id: 'profile-id-1' }),
    )
    // finalize MUST NOT be called — the existing in-flight sync owns the row.
    const finalizeCalls = (supabaseMock.rpc as any).mock.calls.filter(
      (c: any[]) => c[0] === 'finalize_xero_sync_job',
    )
    expect(finalizeCalls.length).toBe(0)
  })

  it('finalize on success', async () => {
    const { callLog } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    mockFetchByUrl([
      { match: (u) => u.includes('timeframe=MONTH'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('timeframe=MONTH'), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('success')
    // finalize_xero_sync_job called with status='success', rows_inserted > 0,
    // matching xero_request_count.
    const finalizeCall = callLog.find((c) => c.kind === 'rpc:finalize_xero_sync_job')
    expect(finalizeCall).toBeTruthy()
    expect(finalizeCall?.arg.p_status).toBe('success')
    expect(finalizeCall?.arg.p_job_id).toBe('sync-job-id-1')
    expect(finalizeCall?.arg.p_xero_request_count).toBe(4)
    expect(finalizeCall?.arg.p_rows_inserted).toBeGreaterThan(0)
    expect(finalizeCall?.arg.p_error).toBeNull()
  })

  it('finalize on thrown error', async () => {
    // Mock fetch to throw on the first call → orchestrator catches in the try
    // block, calls finalize_xero_sync_job with status='error' from the finally
    // block, and re-throws.
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      throw new Error('synthetic xero fetch failure')
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await expect(syncBusinessXeroPL('biz-id-1')).rejects.toThrow(
      /synthetic xero fetch failure/,
    )

    // finalize MUST have been called with status='error' + the error message.
    const finalizeCalls = (supabaseMock.rpc as any).mock.calls.filter(
      (c: any[]) => c[0] === 'finalize_xero_sync_job',
    )
    expect(finalizeCalls.length).toBe(1)
    const args = finalizeCalls[0][1]
    expect(args.p_status).toBe('error')
    expect(args.p_error).toMatch(/synthetic xero fetch failure/)
  })

  it('idempotent upsert', async () => {
    const { callLog, upsertedRowsCapture } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    mockFetchByUrl([
      { match: (u) => u.includes('timeframe=MONTH'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('timeframe=MONTH'), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    // Find the upsert call to xero_pl_lines and assert ON CONFLICT shape.
    // 44-05 migration 4 made the constraint plain (no COALESCE); the
    // onConflict column list reaches it directly.
    const upsertCalls = callLog.filter((c) => c.kind === 'from:xero_pl_lines:upsert')
    expect(upsertCalls.length).toBeGreaterThan(0)
    for (const call of upsertCalls) {
      expect(call.arg.opts.onConflict).toBe(
        'business_id,tenant_id,account_code,period_month',
      )
    }
    const firstPayloadCount = upsertedRowsCapture[0]?.length ?? 0
    expect(firstPayloadCount).toBeGreaterThan(0)
  })

  it('natural key uniqueness', async () => {
    // Mock supabase to surface a unique-violation on upsert. Orchestrator
    // must NOT swallow it — it must finalize sync_jobs with status='error'
    // and re-throw.
    const violation = { code: '23505', message: 'duplicate key value violates unique constraint' }
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
      upsertError: violation,
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    mockFetchByUrl([
      { match: (u) => u.includes('timeframe=MONTH'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('timeframe=MONTH'), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await expect(syncBusinessXeroPL('biz-id-1')).rejects.toThrow(/duplicate key|unique|23505/i)

    // finalize MUST be called with status='error' (no silent swallow).
    const finalizeCalls = (supabaseMock.rpc as any).mock.calls.filter(
      (c: any[]) => c[0] === 'finalize_xero_sync_job',
    )
    expect(finalizeCalls.length).toBe(1)
    expect(finalizeCalls[0][1].p_status).toBe('error')
  })

  it('coverage record', async () => {
    // Sparse fixture: slice JDS to first 4 months only.
    const sparse = JSON.parse(JSON.stringify(jdsByMonthFixture))
    const headerRow = sparse.Reports[0].Rows.find((r: any) => r.RowType === 'Header')
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
      { match: (u) => u.includes('timeframe=MONTH'), body: sparse },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('timeframe=MONTH'), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.coverage.months_covered).toBeLessThanOrEqual(8) // ≤ 4 per FY × 2 FYs
    expect(result.coverage.months_covered).toBeGreaterThan(0)
    // expected_months = current FY YTD (months elapsed in FY) + prior FY (12).
    // Range: 13 (just after FY start, 1 month elapsed) up to 24 (mid-FY end, 12 months).
    // Asserted as a range, not a literal, since the orchestrator computes from `today`
    // (the periods=11 cross-FY-boundary bug is fixed in 44-05.5).
    expect(result.coverage.expected_months).toBeGreaterThanOrEqual(13)
    expect(result.coverage.expected_months).toBeLessThanOrEqual(24)

    // finalize call carries the coverage record.
    const finalizeCall = callLog.find((c) => c.kind === 'rpc:finalize_xero_sync_job')
    expect(finalizeCall).toBeTruthy()
    expect(finalizeCall?.arg.p_coverage?.months_covered).toBe(
      result.coverage.months_covered,
    )
  })

  it('reconciliation mismatch fails loud', async () => {
    // Reconciler stub that ALWAYS returns a discrepancy (FY totals don't
    // match parser output).
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
                    { Value: '999999.99' },
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
      { match: (u) => u.includes('timeframe=MONTH'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('timeframe=MONTH'), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(['partial', 'error']).toContain(result.status)
    expect(result.reconciliation.status).toBe('mismatch')
    expect(result.reconciliation.discrepancy_count).toBeGreaterThanOrEqual(1)

    // The data IS still upserted — operators can inspect.
    const upsertCalls = callLog.filter((c) => c.kind === 'from:xero_pl_lines:upsert')
    expect(upsertCalls.length).toBeGreaterThan(0)

    // finalize.p_reconciliation captures the discrepancy.
    const finalizeCall = callLog.find((c) => c.kind === 'rpc:finalize_xero_sync_job')
    expect(finalizeCall).toBeTruthy()
    expect(finalizeCall?.arg.p_reconciliation?.status).toBe('mismatch')
  })

  it('multi-org per business', async () => {
    const { callLog, upsertedRowsCapture } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS Org A', business_id: 'profile-id-1' },
        { id: 'conn-2', tenant_id: 'tenant-B', tenant_name: 'JDS Org B', business_id: 'profile-id-1' },
      ],
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    const fetchSpy = mockFetchByUrl([
      { match: (u) => u.includes('timeframe=MONTH'), body: jdsByMonthFixture },
      { match: (u) => u.includes('ProfitAndLoss') && !u.includes('timeframe=MONTH'), body: fyTotals },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(fetchSpy).toHaveBeenCalledTimes(8)
    expect(result.xero_request_count).toBe(8)

    const tenantIds = new Set<string>()
    for (const batch of upsertedRowsCapture) {
      for (const row of batch) tenantIds.add(row.tenant_id)
    }
    expect(tenantIds.has('tenant-A')).toBe(true)
    expect(tenantIds.has('tenant-B')).toBe(true)

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
    // finalize MUST be called even on the no-connections path (we claimed a
    // sync_jobs row via begin and need to finalize it to terminal state).
    const finalizeCalls = (supabaseMock.rpc as any).mock.calls.filter(
      (c: any[]) => c[0] === 'finalize_xero_sync_job',
    )
    expect(finalizeCalls.length).toBe(1)
    expect(finalizeCalls[0][1].p_status).toBe('error')
  })
})
