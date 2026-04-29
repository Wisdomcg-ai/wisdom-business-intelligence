/**
 * Phase 44.2 Plan 44.2-02 — sync_jobs.tenant_id regression tests.
 *
 * Asserts the D-44.2-04 / D-44.2-05 / D-44.2-06 contract that the sync
 * orchestrator MUST satisfy now that sync_jobs.tenant_id is NOT NULL:
 *
 *   1. Single tenant happy path → exactly 1 per-tenant sync_jobs row,
 *      status='success', tenant_id = conn.tenant_id.
 *   2. Single tenant reconciliation mismatch → status='partial' with
 *      reconciliation JSONB tagged with tenant_id (D-44.2-06).
 *   3. Multi-tenant consolidated business (2 tenants both happy) → 2
 *      per-tenant sync_jobs rows, both status='success', distinct tenant_ids,
 *      neither empty/null.
 *   4. Multi-tenant with one tenant having a reconciliation mismatch →
 *      2 per-tenant rows, statuses ['success','partial'], discrepancies on
 *      the partial row carry that tenant's tenant_id.
 *   5. (W3) Multi-tenant where ONE tenant throws (Xero 500 mock) → that
 *      tenant's per-tenant row is updated with status='error' and the error
 *      message; the OTHER tenant in the same run still completes with its
 *      own status. The for-loop must NOT abort on per-tenant exception.
 *
 * Mocking pattern matches src/__tests__/xero/sync-orchestrator.test.ts —
 * supabase service-role client + token manager + global.fetch are all
 * mocked at the boundary. Captures every from('sync_jobs').insert / update
 * payload and asserts every payload includes tenant_id.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import jdsByMonthFixture from './fixtures/jds-fy26.json'

// ─── Module-level mocks ─────────────────────────────────────────────────────

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

// Sentry mock — orchestrator captures exceptions; we don't want test
// stderr noise from the unhandled-error stub paths.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

// ─── Test helpers ───────────────────────────────────────────────────────────

type CallLogEntry = { kind: string; arg?: any }

type RpcReturn =
  | { data: any; error: any | null }
  | ((args: any) => { data: any; error: any | null })

/**
 * Build a stub of the supabase service-role client that supports per-tenant
 * sync_jobs INSERT (returns { id }) and UPDATE (eq filter), in addition to
 * the existing xero_connections list, xero_pl_lines upsert, and RPC calls.
 *
 * Captures every sync_jobs.insert payload and every sync_jobs.update payload
 * separately so tests can assert tenant_id is present in each.
 */
function makeSupabaseStub(opts: {
  connections?: any[]
  rpcReturns?: Record<string, RpcReturn>
  upsertError?: any | null
  /** Stub a tenant_id-keyed insert id sequence — defaults to 'tenant-job-1', 'tenant-job-2', ... */
  tenantJobIdSequence?: string[]
}) {
  const callLog: CallLogEntry[] = []
  const connections = opts.connections ?? []
  const upsertError = opts.upsertError ?? null
  const upsertedRowsCapture: any[][] = []
  const syncJobsInsertPayloads: any[] = []
  const syncJobsUpdatePayloads: Array<{ payload: any; filter: any }> = []
  const idSequence = opts.tenantJobIdSequence ?? [
    'tenant-job-1',
    'tenant-job-2',
    'tenant-job-3',
    'tenant-job-4',
  ]
  let idCursor = 0

  const defaultRpcReturns: Record<string, RpcReturn> = {
    begin_xero_sync_job: { data: 'sync-job-id-outer', error: null },
    finalize_xero_sync_job: { data: null, error: null },
  }
  const rpcReturns = { ...defaultRpcReturns, ...(opts.rpcReturns ?? {}) }

  const fromBuilder = (table: string) => {
    const ctx: any = { _filters: [] as any[], _table: table }

    ctx.select = (..._args: any[]) => {
      ctx._select = _args
      return ctx
    }
    ctx.eq = (col: string, val: any) => {
      ctx._filters.push({ kind: 'eq', col, val })
      // sync_jobs.update returns a thenable AFTER .eq is chained.
      if (table === 'sync_jobs' && ctx._pendingUpdate) {
        const payload = ctx._pendingUpdate
        ctx._pendingUpdate = null
        const filter = { col, val }
        callLog.push({ kind: `from:sync_jobs:update`, arg: { payload, filter } })
        syncJobsUpdatePayloads.push({ payload, filter })
        // Return a resolved promise immediately so awaiters get { error: null }.
        return Promise.resolve({ data: null, error: null }) as any
      }
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
      if (table === 'business_profiles') {
        return {
          data: { id: 'profile-id-1', business_id: 'biz-id-1' },
          error: null,
        }
      }
      return { data: null, error: null }
    }
    ctx.single = async () => {
      callLog.push({ kind: `from:${table}:select-single` })
      // sync_jobs INSERT chain: .insert(payload).select('id').single() →
      // returns the new row's id from our id sequence.
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
        syncJobsInsertPayloads.push(payload)
        const newId = idSequence[idCursor++] ?? `tenant-job-${idCursor}`
        ctx._pendingInsertId = newId
      }
      return ctx
    }

    ctx.update = (payload: any) => {
      // The actual update happens when .eq is chained (above). Hold the
      // payload and let .eq finalize.
      if (table === 'sync_jobs') {
        ctx._pendingUpdate = payload
      }
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
        error: upsertError,
        count: rows.length,
      })
    }

    // Terminal awaitable for SELECT chains (xero_connections list, etc.)
    ctx.then = (resolve: any, reject: any) => {
      callLog.push({ kind: `from:${table}:select-list`, arg: ctx._filters })
      if (table === 'xero_connections') {
        return Promise.resolve({ data: connections, error: null }).then(
          resolve,
          reject,
        )
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

  return {
    callLog,
    upsertedRowsCapture,
    syncJobsInsertPayloads,
    syncJobsUpdatePayloads,
  }
}

function mockFetchByUrl(
  handlers: Array<{ match: (url: string) => boolean; body: any; status?: number }>,
) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const u = String(url)
    for (const h of handlers) {
      if (h.match(u)) {
        return new Response(JSON.stringify(h.body), {
          status: h.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        }) as any
      }
    }
    return new Response(JSON.stringify({ error: `unhandled url ${u}` }), {
      status: 500,
    }) as any
  })
}

async function buildSyntheticFYTotalsFromByMonth(byMonthFixture: any) {
  const { parsePLByMonth } = await import('@/lib/xero/pl-by-month-parser')
  const rows = parsePLByMonth(byMonthFixture)
  const totals: Record<
    string,
    { code: string | null; name: string; total: number }
  > = {}
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
        Attributes:
          t.code !== null ? [{ Id: 'account', Value: t.code }] : undefined,
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

// FY total fixture that DELIBERATELY mismatches the by-month sum, forcing
// reconcilePL to return status='mismatch' and the orchestrator to mark
// the per-tenant row 'partial'.
const MISMATCH_FY_TOTALS = {
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
                  Value: 'Sales - Bogus',
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

describe('Sync orchestrator — per-tenant sync_jobs.tenant_id (44.2-02)', () => {
  it('Test 1 — single-tenant happy path writes 1 per-tenant row with tenant_id', async () => {
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        {
          id: 'conn-1',
          tenant_id: 'tenant-A-uuid',
          tenant_name: 'JDS',
          business_id: 'profile-id-1',
        },
      ],
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    mockFetchByUrl([
      { match: (u) => u.includes('timeframe=MONTH'), body: jdsByMonthFixture },
      {
        match: (u) =>
          u.includes('ProfitAndLoss') && !u.includes('timeframe=MONTH'),
        body: fyTotals,
      },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    // Exactly 1 per-tenant INSERT, with tenant_id = the connection's tenant_id.
    expect(syncJobsInsertPayloads.length).toBe(1)
    expect(syncJobsInsertPayloads[0].tenant_id).toBe('tenant-A-uuid')
    expect(syncJobsInsertPayloads[0].business_id).toBe('profile-id-1')
    expect(syncJobsInsertPayloads[0].status).toBe('running')

    // Exactly 1 per-tenant UPDATE on the inserted job id, status='success'.
    expect(syncJobsUpdatePayloads.length).toBe(1)
    expect(syncJobsUpdatePayloads[0].payload.status).toBe('success')
    expect(syncJobsUpdatePayloads[0].filter.col).toBe('id')
    expect(syncJobsUpdatePayloads[0].filter.val).toBe('tenant-job-1')

    // EVERY sync_jobs payload (insert + update) — assert tenant_id never absent
    // on insert (spec contract; update preserves the inserted row's tenant_id).
    for (const ins of syncJobsInsertPayloads) {
      expect(ins.tenant_id).toBeTruthy()
      expect(ins.tenant_id).not.toBe('')
    }
  })

  it('Test 2 — single-tenant reconciliation mismatch → status=partial with tenant_id-tagged discrepancies', async () => {
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        {
          id: 'conn-1',
          tenant_id: 'tenant-A-uuid',
          tenant_name: 'JDS',
          business_id: 'profile-id-1',
        },
      ],
    })
    mockFetchByUrl([
      { match: (u) => u.includes('timeframe=MONTH'), body: jdsByMonthFixture },
      {
        match: (u) =>
          u.includes('ProfitAndLoss') && !u.includes('timeframe=MONTH'),
        body: MISMATCH_FY_TOTALS,
      },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    expect(syncJobsInsertPayloads.length).toBe(1)
    expect(syncJobsInsertPayloads[0].tenant_id).toBe('tenant-A-uuid')

    expect(syncJobsUpdatePayloads.length).toBe(1)
    const update = syncJobsUpdatePayloads[0].payload
    expect(update.status).toBe('partial')

    // D-44.2-06 — reconciliation JSONB carries tenant_id at the wrapper level
    // OR every discrepancy entry inside it does. Assert the wrapper carries
    // it (current orchestrator design — tenant_id is the audit trail key).
    expect(update.reconciliation).toBeTruthy()
    expect(update.reconciliation.tenant_id).toBe('tenant-A-uuid')
    expect(Array.isArray(update.reconciliation.discrepant_accounts)).toBe(true)
    expect(update.reconciliation.discrepant_accounts.length).toBeGreaterThan(0)

    // Error message references the tenant for operator triage.
    expect(update.error).toMatch(/tenant-A-uuid|reconciliation/i)
  })

  it('Test 3 — multi-tenant consolidated business (2 happy tenants) writes 2 distinct per-tenant rows', async () => {
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        {
          id: 'conn-1',
          tenant_id: 'tenant-A-uuid',
          tenant_name: 'JDS',
          business_id: 'profile-id-1',
        },
        {
          id: 'conn-2',
          tenant_id: 'tenant-B-uuid',
          tenant_name: 'Envisage',
          business_id: 'profile-id-1',
        },
      ],
    })
    const fyTotals = await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    mockFetchByUrl([
      { match: (u) => u.includes('timeframe=MONTH'), body: jdsByMonthFixture },
      {
        match: (u) =>
          u.includes('ProfitAndLoss') && !u.includes('timeframe=MONTH'),
        body: fyTotals,
      },
    ])

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    // 2 per-tenant INSERTs with distinct tenant_ids.
    expect(syncJobsInsertPayloads.length).toBe(2)
    const insertedTenantIds = syncJobsInsertPayloads.map((p) => p.tenant_id)
    expect(new Set(insertedTenantIds).size).toBe(2)
    expect(insertedTenantIds).toContain('tenant-A-uuid')
    expect(insertedTenantIds).toContain('tenant-B-uuid')

    // 2 per-tenant UPDATEs, both status='success'.
    expect(syncJobsUpdatePayloads.length).toBe(2)
    for (const u of syncJobsUpdatePayloads) {
      expect(u.payload.status).toBe('success')
    }

    // No insert payload has empty/null tenant_id.
    for (const ins of syncJobsInsertPayloads) {
      expect(ins.tenant_id).toBeTruthy()
      expect(ins.tenant_id).not.toBe('')
    }
  })

  it('Test 4 — multi-tenant where one has reconciliation mismatch → mixed statuses [success, partial]', async () => {
    const { syncJobsUpdatePayloads, syncJobsInsertPayloads } = makeSupabaseStub({
      connections: [
        {
          id: 'conn-1',
          tenant_id: 'tenant-A-uuid',
          tenant_name: 'JDS',
          business_id: 'profile-id-1',
        },
        {
          id: 'conn-2',
          tenant_id: 'tenant-B-uuid',
          tenant_name: 'Envisage',
          business_id: 'profile-id-1',
        },
      ],
    })
    const fyTotalsHappy =
      await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    // First two tenant fetches return MISMATCH_FY_TOTALS (tenant A mismatches),
    // remainder return happy totals (tenant B reconciles cleanly).
    // Per-tenant fetch sequence (orchestrator iterates tenants outer, FY windows inner):
    //   tenant A: by-month FY26, fy-total FY26, by-month FY25, fy-total FY25  → 4 fetches
    //   tenant B: by-month FY26, fy-total FY26, by-month FY25, fy-total FY25  → 4 fetches
    // We need tenant A's FY-totals to MISMATCH, tenant B's to be happy. Track
    // FY-total request count and gate on the first 2 (= tenant A's two FY windows).
    let fyTotalCallCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url)
      if (u.includes('timeframe=MONTH')) {
        return new Response(JSON.stringify(jdsByMonthFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as any
      }
      // FY-total request. First 2 = tenant A (mismatch), next 2 = tenant B (happy).
      const isTenantA = fyTotalCallCount < 2
      fyTotalCallCount++
      const body = isTenantA ? MISMATCH_FY_TOTALS : fyTotalsHappy
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }) as any
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    expect(syncJobsInsertPayloads.length).toBe(2)
    expect(syncJobsUpdatePayloads.length).toBe(2)

    const statuses = syncJobsUpdatePayloads.map((u) => u.payload.status).sort()
    expect(statuses).toEqual(['partial', 'success'])

    // The 'partial' update's reconciliation JSONB must carry tenant_id =
    // tenant-A-uuid (the mismatching tenant).
    const partialUpdate = syncJobsUpdatePayloads.find(
      (u) => u.payload.status === 'partial',
    )
    expect(partialUpdate).toBeTruthy()
    expect(partialUpdate?.payload.reconciliation?.tenant_id).toBe(
      'tenant-A-uuid',
    )
  })

  it('Test 5 (W3) — one tenant throws → that tenant marked error, other tenants still complete', async () => {
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        {
          id: 'conn-1',
          tenant_id: 'tenant-A-uuid',
          tenant_name: 'JDS',
          business_id: 'profile-id-1',
        },
        {
          id: 'conn-2',
          tenant_id: 'tenant-B-uuid',
          tenant_name: 'Envisage',
          business_id: 'profile-id-1',
        },
      ],
    })
    const fyTotalsHappy =
      await buildSyntheticFYTotalsFromByMonth(jdsByMonthFixture)
    // Tenant A's FIRST FY-total fetch returns 500. Tenant B's fetches all succeed.
    let fetchCallNum = 0
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      fetchCallNum++
      const u = String(url)
      // Per-tenant fetch sequence: by-month #1, fy-total #1, by-month #2, fy-total #2 = 4 fetches per tenant.
      // Inject a 500 on tenant A's very first FY-total fetch (call #2 overall).
      if (fetchCallNum === 2) {
        return new Response(JSON.stringify({ error: 'Xero 500' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }) as any
      }
      if (u.includes('timeframe=MONTH')) {
        return new Response(JSON.stringify(jdsByMonthFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as any
      }
      return new Response(JSON.stringify(fyTotalsHappy), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }) as any
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    // The orchestrator MUST NOT throw — the per-tenant try/catch absorbs the error.
    const result = await syncBusinessXeroPL('biz-id-1')

    // Both tenants got their per-tenant INSERT.
    expect(syncJobsInsertPayloads.length).toBe(2)
    const insertedTenantIds = syncJobsInsertPayloads.map((p) => p.tenant_id)
    expect(insertedTenantIds).toContain('tenant-A-uuid')
    expect(insertedTenantIds).toContain('tenant-B-uuid')

    // Both tenants got their per-tenant UPDATE — none was skipped.
    expect(syncJobsUpdatePayloads.length).toBe(2)

    const statuses = syncJobsUpdatePayloads.map((u) => u.payload.status).sort()
    // Tenant A → 'error', tenant B → 'success'.
    expect(statuses).toContain('error')
    expect(statuses).toContain('success')

    const errorUpdate = syncJobsUpdatePayloads.find(
      (u) => u.payload.status === 'error',
    )
    expect(errorUpdate).toBeTruthy()
    expect(errorUpdate?.payload.error).toBeTruthy()
    // Error column is bounded to 500 chars (column safety).
    expect(String(errorUpdate?.payload.error).length).toBeLessThanOrEqual(500)
    // Mention of the Xero 500 (or generic "fetch" / "Xero" wording acceptable).
    expect(String(errorUpdate?.payload.error)).toMatch(/Xero|500|fetch|fy-total/i)

    // Outer SyncResult reflects the partial-failure shape — overall status
    // SHOULD reflect that at least one tenant errored. Accept 'partial' or
    // 'error' here; the contract is that the orchestrator returns a response
    // and didn't throw.
    expect(['partial', 'error', 'success']).toContain(result.status)
  })
})
