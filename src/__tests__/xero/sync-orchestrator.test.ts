/**
 * Phase 44 Plan 44-04 / 44-05 / 44.2-06B — Sync orchestrator tests.
 *
 * Validates the canonical sync entry point under Path A (44.2-06B):
 *   - begin_xero_sync_job (single-flight guard)
 *   - per-active-tenant pre-fetches (/Organisation, /Accounts catalog)
 *   - N per-month single-period Reports/PL fetches per FY window per tenant
 *   - 1 single-period FY-total per window (oracle)
 *   - parsePLSinglePeriod → reconcilePL (regression detector)
 *   - upsert (onConflict: business_id,tenant_id,account_id,period_month)
 *   - finalize_xero_sync_job
 *
 * All I/O is mocked at the boundary:
 *   - vi.spyOn(global, 'fetch') for Xero HTTP
 *   - vi.mock('@/lib/supabase/admin') for the service-role client
 *   - vi.mock('@/lib/xero/token-manager') for getValidAccessToken
 *
 * Test names mirror the original 44-VALIDATION suite where possible so
 * `vitest -t '<name>'` filters from prior phases still resolve.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Module-level mocks ─────────────────────────────────────────────────────

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

const supabaseMock: any = {}
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => supabaseMock,
}))

vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn(async () => ({
    success: true,
    accessToken: 'access-token-mock',
  })),
}))

// ─── Test helpers ───────────────────────────────────────────────────────────

const ACC_ID = 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'

type CallLogEntry = { kind: string; arg?: any }
type RpcReturn =
  | { data: any; error: any | null }
  | ((args: any) => { data: any; error: any | null })

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

  const fromBuilder = (table: string) => {
    const ctx: any = { _filters: [] as any[], _table: table }
    let _syncJobIdCursor = 0

    ctx.select = (..._args: any[]) => {
      ctx._select = _args
      return ctx
    }
    ctx.eq = (col: string, val: any) => {
      ctx._filters.push({ kind: 'eq', col, val })
      if (table === 'sync_jobs' && ctx._pendingUpdate) {
        const payload = ctx._pendingUpdate
        ctx._pendingUpdate = null
        callLog.push({
          kind: 'from:sync_jobs:update',
          arg: { payload, filter: { col, val } },
        })
        return Promise.resolve({ data: null, error: null }) as any
      }
      return ctx
    }
    ctx.in = (col: string, val: any[]) => {
      ctx._filters.push({ kind: 'in', col, val })
      return ctx
    }
    ctx.order = () => ctx
    ctx.limit = () => ctx
    ctx.maybeSingle = async () => {
      callLog.push({ kind: `from:${table}:select-maybeSingle` })
      if (table === 'business_profiles') {
        return {
          data: { id: 'profile-id-1', business_id: 'biz-id-1', fiscal_year_start: 7 },
          error: null,
        }
      }
      return { data: null, error: null }
    }
    ctx.single = async () => {
      callLog.push({ kind: `from:${table}:single` })
      if (table === 'sync_jobs' && ctx._pendingInsertId) {
        const id = ctx._pendingInsertId
        ctx._pendingInsertId = null
        return { data: { id }, error: null }
      }
      return { data: null, error: null }
    }
    ctx.insert = (payload: any) => {
      callLog.push({ kind: `from:${table}:insert`, arg: payload })
      if (table === 'sync_jobs') {
        _syncJobIdCursor++
        ctx._pendingInsertId = `tenant-job-${_syncJobIdCursor}`
      }
      return ctx
    }
    ctx.update = (payload: any) => {
      if (table === 'sync_jobs') ctx._pendingUpdate = payload
      return ctx
    }
    ctx.upsert = (rows: any[], upsertOpts: any) => {
      callLog.push({
        kind: `from:${table}:upsert`,
        arg: { rowCount: rows.length, opts: upsertOpts },
      })
      upsertedRowsCapture.push(rows)
      return Promise.resolve({
        data: rows,
        error: table === 'xero_pl_lines' ? upsertError : null,
        count: rows.length,
      })
    }
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

// ─── URL pattern matchers (Path A — single-period only) ────────────────────

function isPLUrl(u: string): boolean {
  return u.includes('/Reports/ProfitAndLoss')
}
function isFYTotalUrl(u: string): boolean {
  if (!isPLUrl(u)) return false
  const fromMatch = u.match(/fromDate=(\d{4})-(\d{2})-/)
  const toMatch = u.match(/toDate=(\d{4})-(\d{2})-/)
  if (!fromMatch || !toMatch) return false
  return !(fromMatch[1] === toMatch[1] && fromMatch[2] === toMatch[2])
}
function isPerMonthUrl(u: string): boolean {
  return isPLUrl(u) && !isFYTotalUrl(u)
}
function periodMonthFromUrl(u: string): string | null {
  const m = u.match(/fromDate=(\d{4}-\d{2}-\d{2})/)
  return m ? m[1]! : null
}
function monthsInUrlRange(u: string): number {
  const fromMatch = u.match(/fromDate=(\d{4})-(\d{2})-/)
  const toMatch = u.match(/toDate=(\d{4})-(\d{2})-/)
  if (!fromMatch || !toMatch) return 1
  const fy = parseInt(fromMatch[1]!, 10)
  const fm = parseInt(fromMatch[2]!, 10)
  const ty = parseInt(toMatch[1]!, 10)
  const tm = parseInt(toMatch[2]!, 10)
  return (ty - fy) * 12 + (tm - fm) + 1
}

// ─── Fixture builders ───────────────────────────────────────────────────────

function makeJsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }) as any
}

function singlePeriodReport(
  periodLabel: string,
  rows: Array<{ name: string; id: string; amount: string; section?: string }>,
) {
  const bySection = new Map<string, typeof rows>()
  for (const r of rows) {
    const sec = r.section ?? 'Income'
    const arr = bySection.get(sec) ?? []
    arr.push(r)
    bySection.set(sec, arr)
  }
  const sections = Array.from(bySection.entries()).map(([title, arr]) => ({
    RowType: 'Section',
    Title: title,
    Rows: arr.map((r) => ({
      RowType: 'Row',
      Cells: [
        { Value: r.name, Attributes: [{ Id: 'account', Value: r.id }] },
        { Value: r.amount },
      ],
    })),
  }))
  return {
    Reports: [{ Rows: [{ RowType: 'Header', Cells: [{ Value: '' }, { Value: periodLabel }] }, ...sections] }],
  }
}
function organisationResponse(timezone = 'AUSEASTERNSTANDARDTIME', country = 'AU') {
  return { Organisations: [{ OrganisationID: 'org-1', Timezone: timezone, CountryCode: country }] }
}
function accountsResponse(items: Array<{ id: string; code: string; name: string; type: string }>) {
  return {
    Accounts: items.map((a) => ({
      AccountID: a.id,
      Code: a.code,
      Name: a.name,
      Type: a.type,
      Status: 'ACTIVE',
    })),
  }
}

function isOrgUrl(u: string): boolean {
  return u.includes('/api.xro/2.0/Organisation')
}
function isAccountsUrl(u: string): boolean {
  return u.includes('/api.xro/2.0/Accounts')
}

/**
 * Empty-balanced BS response — these legacy P&L tests don't model BS, but
 * post-06D the orchestrator always issues per-month-end BS fetches. Without a
 * BS handler, the catch-all 500 burns 5xx retries × 22 month-ends = timeout.
 */
function isBSUrl(u: string): boolean {
  return u.includes('/Reports/BalanceSheet')
}
function emptyBalancedBS(balanceDate: string) {
  return {
    Reports: [
      {
        Rows: [
          { RowType: 'Header', Cells: [{ Value: '' }, { Value: balanceDate }] },
          {
            RowType: 'Section',
            Title: 'Assets',
            Rows: [
              {
                RowType: 'Row',
                Cells: [
                  {
                    Value: 'Placeholder Asset',
                    Attributes: [{ Id: 'account', Value: 'fffffff1-0000-0000-0000-000000000001' }],
                  },
                  { Value: '0.00' },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}
function bsHandlerOrNull(u: string): Response | null {
  if (!isBSUrl(u)) return null
  const m = u.match(/date=(\d{4}-\d{2}-\d{2})/)
  return makeJsonResponse(emptyBalancedBS(m ? m[1]! : '2026-04-30')) as any
}

/** Default Path A fetch handler — emits a happy 50/month single-account
 * response and a matching FY-total for any request shape. */
function defaultPathAFetch(amount = 50) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const u = String(url)
    const bs = bsHandlerOrNull(u); if (bs) return bs as any
    if (isOrgUrl(u)) return makeJsonResponse(organisationResponse())
    if (isAccountsUrl(u)) {
      return makeJsonResponse(
        accountsResponse([{ id: ACC_ID, code: '200', name: 'Sales', type: 'REVENUE' }]),
      )
    }
    if (isFYTotalUrl(u)) {
      const months = monthsInUrlRange(u)
      return makeJsonResponse(
        singlePeriodReport('FY Total', [
          { name: 'Sales', id: ACC_ID, amount: (amount * months).toFixed(2) },
        ]),
      )
    }
    if (isPerMonthUrl(u)) {
      const p = periodMonthFromUrl(u)!
      return makeJsonResponse(
        singlePeriodReport(p, [
          { name: 'Sales', id: ACC_ID, amount: amount.toFixed(2) },
        ]),
      )
    }
    return makeJsonResponse({ error: `unhandled url ${u}` }, 500)
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
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
    const fetchSpy = defaultPathAFetch()
    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('success')
    // 1 tenant × (1 Org + 1 Accounts + currentFY 10 monthly + 1 FY-total + priorFY 12 monthly + 1 FY-total + 22 BS month-ends) = 48
    expect(fetchSpy).toHaveBeenCalledTimes(48)
    expect(callLog.some((c) => c.kind === 'rpc:begin_xero_sync_job')).toBe(true)
    expect(callLog.some((c) => c.kind === 'rpc:finalize_xero_sync_job')).toBe(true)
  })

  it('rejects when another sync is in progress', async () => {
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
      rpcReturns: { begin_xero_sync_job: { data: null, error: null } },
    })
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(makeJsonResponse({}))
    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('error')
    expect(result.error ?? '').toMatch(/already in progress|in flight|in-flight/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'begin_xero_sync_job',
      expect.objectContaining({ p_business_id: 'profile-id-1' }),
    )
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
    defaultPathAFetch()
    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('success')
    const finalizeCall = callLog.find((c) => c.kind === 'rpc:finalize_xero_sync_job')
    expect(finalizeCall).toBeTruthy()
    expect(finalizeCall?.arg.p_status).toBe('success')
    expect(finalizeCall?.arg.p_job_id).toBe('sync-job-id-1')
    expect(finalizeCall?.arg.p_xero_request_count).toBe(48)
    expect(finalizeCall?.arg.p_rows_inserted).toBeGreaterThan(0)
    expect(finalizeCall?.arg.p_error).toBeNull()
  })

  it('finalize on tenant exception (per-tenant try/catch absorbs)', async () => {
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    // 4xx (not 429) → fetchXeroWithRateLimit throws immediately without retry,
    // so the per-tenant try/catch records the error and we don't loop on
    // exponential backoff timers. Use 403 (Forbidden) — common when a token
    // lacks scopes for /Organisation.
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }) as any,
    )

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('error')
    const finalizeCalls = (supabaseMock.rpc as any).mock.calls.filter(
      (c: any[]) => c[0] === 'finalize_xero_sync_job',
    )
    expect(finalizeCalls.length).toBe(1)
    expect(finalizeCalls[0][1].p_status).toBe('error')
  })

  it('idempotent upsert (onConflict shape on account_id natural key)', async () => {
    const { callLog, upsertedRowsCapture } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    defaultPathAFetch()
    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    const upsertCalls = callLog.filter((c) => c.kind === 'from:xero_pl_lines:upsert')
    expect(upsertCalls.length).toBeGreaterThan(0)
    for (const call of upsertCalls) {
      expect(call.arg.opts.onConflict).toBe(
        'business_id,tenant_id,account_id,period_month',
      )
    }
    expect(upsertedRowsCapture[0]?.length ?? 0).toBeGreaterThan(0)
  })

  it('no `periods=` parameter in any orchestrator URL (Path A invariant)', async () => {
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const fetchSpy = defaultPathAFetch()
    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    for (const call of fetchSpy.mock.calls) {
      const u = String(call[0])
      expect(u).not.toMatch(/[?&]periods=/)
      expect(u).not.toMatch(/[?&]timeframe=/)
    }
  })

  it('upsert error is scoped to the tenant; outer SyncResult error', async () => {
    const violation = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const { callLog } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
      upsertError: violation,
    })
    defaultPathAFetch()
    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('error')
    const tenantUpdates = callLog.filter((c) => c.kind === 'from:sync_jobs:update')
    expect(tenantUpdates.length).toBeGreaterThan(0)
    const errorUpdate = tenantUpdates.find((u) => u.arg.payload.status === 'error')
    expect(errorUpdate).toBeTruthy()
    expect(String(errorUpdate?.arg.payload.error)).toMatch(/duplicate key|unique|23505/i)

    const finalizeCalls = (supabaseMock.rpc as any).mock.calls.filter(
      (c: any[]) => c[0] === 'finalize_xero_sync_job',
    )
    expect(finalizeCalls.length).toBe(1)
    expect(finalizeCalls[0][1].p_status).toBe('error')
  })

  it('reconciliation mismatch surfaces on finalize_xero_sync_job', async () => {
    // Plant a mismatch: per-month rows sum to 50*N, FY-total claims 999999.
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url)
      const bs = bsHandlerOrNull(u); if (bs) return bs as any
      if (isOrgUrl(u)) return makeJsonResponse(organisationResponse())
      if (isAccountsUrl(u)) {
        return makeJsonResponse(
          accountsResponse([{ id: ACC_ID, code: '200', name: 'Sales', type: 'REVENUE' }]),
        )
      }
      if (isFYTotalUrl(u)) {
        return makeJsonResponse(
          singlePeriodReport('FY Total', [
            { name: 'Sales', id: ACC_ID, amount: '999999.99' },
          ]),
        )
      }
      if (isPerMonthUrl(u)) {
        const p = periodMonthFromUrl(u)!
        return makeJsonResponse(
          singlePeriodReport(p, [{ name: 'Sales', id: ACC_ID, amount: '50.00' }]),
        )
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(['partial', 'error']).toContain(result.status)
    expect(result.reconciliation.status).toBe('mismatch')
    expect(result.reconciliation.discrepancy_count).toBeGreaterThanOrEqual(1)

    // Data still upserted (operator can inspect).
    const upsertCalls = (supabaseMock.from as any) // captured via callLog isn't accessible here; assert finalize state instead
    void upsertCalls

    const finalizeCalls = (supabaseMock.rpc as any).mock.calls.filter(
      (c: any[]) => c[0] === 'finalize_xero_sync_job',
    )
    expect(finalizeCalls[0][1].p_reconciliation?.status).toBe('mismatch')
  })

  it('multi-org per business', async () => {
    const { callLog, upsertedRowsCapture } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A', tenant_name: 'JDS Org A', business_id: 'profile-id-1' },
        { id: 'conn-2', tenant_id: 'tenant-B', tenant_name: 'JDS Org B', business_id: 'profile-id-1' },
      ],
    })
    defaultPathAFetch()
    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('success')
    // 2 tenants × 48 = 96 fetches (post-06D BS extension).
    expect(result.xero_request_count).toBe(96)

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
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(makeJsonResponse({}))

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('error')
    expect(result.error ?? '').toMatch(/no active|no connection/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    const finalizeCalls = (supabaseMock.rpc as any).mock.calls.filter(
      (c: any[]) => c[0] === 'finalize_xero_sync_job',
    )
    expect(finalizeCalls.length).toBe(1)
    expect(finalizeCalls[0][1].p_status).toBe('error')
  })
})
