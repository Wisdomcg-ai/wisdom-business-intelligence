/**
 * Phase 44.2 Plan 44.2-02 / 44.2-06B — sync_jobs.tenant_id regression tests.
 *
 * Asserts the D-44.2-04 / D-44.2-05 / D-44.2-06 contract under the Path A
 * orchestrator (44.2-06B):
 *
 *   1. Single-tenant happy path → exactly 1 per-tenant sync_jobs row,
 *      status='success', tenant_id = conn.tenant_id.
 *   2. Reconciliation mismatch (FY oracle disagrees with monthly sums) →
 *      status='partial' with reconciliation JSONB tagged with tenant_id.
 *   3. Multi-tenant consolidated business (2 happy tenants) → 2 distinct
 *      per-tenant rows.
 *   4. Multi-tenant where one tenant has a reconciliation mismatch →
 *      ['success','partial'], discrepancy carries that tenant's id.
 *   5. Multi-tenant where one tenant errors (Xero 4xx mock that no retry
 *      handler can absorb) → that tenant's row is updated with
 *      status='error'; the other completes with its own status.
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
  tenantJobIdSequence?: string[]
}) {
  const callLog: CallLogEntry[] = []
  const connections = opts.connections ?? []
  const upsertError = opts.upsertError ?? null
  const upsertedRowsCapture: any[][] = []
  const syncJobsInsertPayloads: any[] = []
  const syncJobsUpdatePayloads: Array<{ payload: any; filter: any }> = []
  const idSequence = opts.tenantJobIdSequence ?? [
    'tenant-job-1', 'tenant-job-2', 'tenant-job-3', 'tenant-job-4',
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
      if (table === 'sync_jobs' && ctx._pendingUpdate) {
        const payload = ctx._pendingUpdate
        ctx._pendingUpdate = null
        const filter = { col, val }
        callLog.push({ kind: 'from:sync_jobs:update', arg: { payload, filter } })
        syncJobsUpdatePayloads.push({ payload, filter })
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
        syncJobsInsertPayloads.push(payload)
        const newId = idSequence[idCursor++] ?? `tenant-job-${idCursor}`
        ctx._pendingInsertId = newId
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

  return {
    callLog,
    upsertedRowsCapture,
    syncJobsInsertPayloads,
    syncJobsUpdatePayloads,
  }
}

// ─── URL pattern matchers (Path A) ──────────────────────────────────────────

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
function defaultPathAFetch(amount = 50, fyOverride?: string) {
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
          { name: 'Sales', id: ACC_ID, amount: fyOverride ?? (amount * months).toFixed(2) },
        ]),
      )
    }
    if (isPerMonthUrl(u)) {
      const p = periodMonthFromUrl(u)!
      return makeJsonResponse(
        singlePeriodReport(p, [{ name: 'Sales', id: ACC_ID, amount: amount.toFixed(2) }]),
      )
    }
    return makeJsonResponse({}, 500)
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

describe('Sync orchestrator — per-tenant sync_jobs.tenant_id (44.2-02 / 44.2-06B)', () => {
  it('Test 1 — single-tenant happy path writes 1 per-tenant row with tenant_id', async () => {
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    defaultPathAFetch()
    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    expect(syncJobsInsertPayloads.length).toBe(1)
    expect(syncJobsInsertPayloads[0].tenant_id).toBe('tenant-A-uuid')
    expect(syncJobsInsertPayloads[0].business_id).toBe('profile-id-1')
    expect(syncJobsInsertPayloads[0].status).toBe('running')

    expect(syncJobsUpdatePayloads.length).toBe(1)
    expect(syncJobsUpdatePayloads[0].payload.status).toBe('success')
    expect(syncJobsUpdatePayloads[0].filter.col).toBe('id')
    expect(syncJobsUpdatePayloads[0].filter.val).toBe('tenant-job-1')

    for (const ins of syncJobsInsertPayloads) {
      expect(ins.tenant_id).toBeTruthy()
      expect(ins.tenant_id).not.toBe('')
    }
  })

  it('Test 2 — single-tenant reconciliation mismatch → status=partial with tenant_id-tagged discrepancies', async () => {
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    // Plant the FY-total to disagree with the monthly_sum.
    defaultPathAFetch(50, '999999.99')

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    expect(syncJobsInsertPayloads.length).toBe(1)
    expect(syncJobsInsertPayloads[0].tenant_id).toBe('tenant-A-uuid')

    expect(syncJobsUpdatePayloads.length).toBe(1)
    const update = syncJobsUpdatePayloads[0].payload
    expect(update.status).toBe('partial')
    expect(update.reconciliation).toBeTruthy()
    expect(update.reconciliation.tenant_id).toBe('tenant-A-uuid')
    expect(Array.isArray(update.reconciliation.discrepant_accounts)).toBe(true)
    expect(update.reconciliation.discrepant_accounts.length).toBeGreaterThan(0)

    expect(update.error).toMatch(/tenant-A-uuid|partial|reconciliation|discrepancies/i)
  })

  it('Test 3 — multi-tenant consolidated business (2 happy tenants) writes 2 distinct per-tenant rows', async () => {
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
        { id: 'conn-2', tenant_id: 'tenant-B-uuid', tenant_name: 'Envisage', business_id: 'profile-id-1' },
      ],
    })
    defaultPathAFetch()
    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    expect(syncJobsInsertPayloads.length).toBe(2)
    const insertedTenantIds = syncJobsInsertPayloads.map((p) => p.tenant_id)
    expect(new Set(insertedTenantIds).size).toBe(2)
    expect(insertedTenantIds).toContain('tenant-A-uuid')
    expect(insertedTenantIds).toContain('tenant-B-uuid')

    expect(syncJobsUpdatePayloads.length).toBe(2)
    const statuses = syncJobsUpdatePayloads.map((u) => u.payload.status).sort()
    expect(statuses).toEqual(['success', 'success'])
  })

  it('Test 4 — multi-tenant; one tenant reconciliation mismatch → mixed statuses', async () => {
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
        { id: 'conn-2', tenant_id: 'tenant-B-uuid', tenant_name: 'Envisage', business_id: 'profile-id-1' },
      ],
    })
    // Plant a per-tenant variation: tenant A sees a mismatched FY total
    // (we route by call order — first /Organisation = tenant A, etc.).
    let tenantSeen = ''
    let orgCallCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url)
      const bs = bsHandlerOrNull(u); if (bs) return bs as any
      if (isOrgUrl(u)) {
        orgCallCount++
        tenantSeen = orgCallCount === 1 ? 'A' : 'B'
        return makeJsonResponse(organisationResponse())
      }
      if (isAccountsUrl(u)) {
        return makeJsonResponse(
          accountsResponse([{ id: ACC_ID, code: '200', name: 'Sales', type: 'REVENUE' }]),
        )
      }
      if (isFYTotalUrl(u)) {
        const months = monthsInUrlRange(u)
        // Tenant A's FY total mismatches; tenant B's matches.
        const total = tenantSeen === 'A' ? '999999.99' : (50 * months).toFixed(2)
        return makeJsonResponse(
          singlePeriodReport('FY Total', [{ name: 'Sales', id: ACC_ID, amount: total }]),
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
    await syncBusinessXeroPL('biz-id-1')

    expect(syncJobsInsertPayloads.length).toBe(2)
    expect(syncJobsUpdatePayloads.length).toBe(2)
    const statuses = syncJobsUpdatePayloads.map((u) => u.payload.status).sort()
    expect(statuses).toEqual(['partial', 'success'])
    // The 'partial' carries tenant_id A.
    const partialUpdate = syncJobsUpdatePayloads.find((u) => u.payload.status === 'partial')!
    expect(partialUpdate.payload.reconciliation.tenant_id).toBe('tenant-A-uuid')
  })

  it('Test 5 — multi-tenant; one tenant 4xx during /Organisation marks tenant error; other completes', async () => {
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
        { id: 'conn-2', tenant_id: 'tenant-B-uuid', tenant_name: 'Envisage', business_id: 'profile-id-1' },
      ],
    })
    let orgCalls = 0
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url)
      const bs = bsHandlerOrNull(u); if (bs) return bs as any
      if (isOrgUrl(u)) {
        orgCalls++
        if (orgCalls === 1) {
          return makeJsonResponse({ error: 'forbidden' }, 403) // tenant A errors
        }
        return makeJsonResponse(organisationResponse())
      }
      if (isAccountsUrl(u)) {
        return makeJsonResponse(
          accountsResponse([{ id: ACC_ID, code: '200', name: 'Sales', type: 'REVENUE' }]),
        )
      }
      if (isFYTotalUrl(u)) {
        const months = monthsInUrlRange(u)
        return makeJsonResponse(
          singlePeriodReport('FY Total', [
            { name: 'Sales', id: ACC_ID, amount: (50 * months).toFixed(2) },
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
    await syncBusinessXeroPL('biz-id-1')

    expect(syncJobsInsertPayloads.length).toBe(2)
    expect(syncJobsUpdatePayloads.length).toBe(2)
    const statuses = syncJobsUpdatePayloads.map((u) => u.payload.status).sort()
    expect(statuses).toEqual(['error', 'success'])
    // Tenant A's row carries the error message; tenant B's still ran.
    const errorUpdate = syncJobsUpdatePayloads.find((u) => u.payload.status === 'error')!
    expect(String(errorUpdate.payload.error)).toMatch(/403|forbidden|xero/i)
  })
})
