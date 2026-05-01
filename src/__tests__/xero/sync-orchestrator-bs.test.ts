/**
 * Phase 44.2 Plan 44.2-06D Task 2 — Balance Sheet sync orchestrator integration tests.
 *
 * Mirrors the mock-supabase + mock-fetch pattern from
 * sync-orchestrator-path-a.test.ts. Asserts the BS extension's behavior
 * end-to-end, in particular:
 *
 *   1. Happy path BS sync — per-month-end Reports/BalanceSheet?date=
 *      fetches; xero_bs_lines populated; reconciliation.bs.unbalanced_dates
 *      empty; reconciliation has both pl: and bs: sub-objects.
 *   2. One BS month-end 5xx after retries → tenant 'partial';
 *      bs.months_failed contains the date.
 *   3. Net Assets ≠ Equity by $5 → tenant 'partial';
 *      bs.unbalanced_dates contains that date; rows for that date are NOT
 *      written; rows for other (balanced) dates ARE written.
 *   4. BS-only failure (P&L succeeds, BS fails) → P&L rows still upserted;
 *      bs sub-object reflects the failure.
 *   5. Multi-tenant: one tenant's BS fails, the other's succeeds.
 *   6. FXGROUPID in BS (e.g. Currency Revaluation Reserve) → upserted with
 *      stable derived account_id.
 *   7. Catalog reuse — only one /Accounts call per tenant per sync (P&L and
 *      BS share the catalog).
 *   8. URL discipline — every BS URL uses ?date=YYYY-MM-LAST and no BS URL
 *      ever includes periods= or timeframe=.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

// ─── Fixture helpers ────────────────────────────────────────────────────────

function makeJsonResponse(body: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function singlePeriodPLReport(periodLabel: string, accounts: Array<{ name: string; id: string; amount: string; section: string }>) {
  const bySection = new Map<string, typeof accounts>()
  for (const a of accounts) {
    const arr = bySection.get(a.section) ?? []
    arr.push(a)
    bySection.set(a.section, arr)
  }
  const sections = Array.from(bySection.entries()).map(([title, rows]) => ({
    RowType: 'Section',
    Title: title,
    Rows: rows.map((a) => ({
      RowType: 'Row',
      Cells: [
        { Value: a.name, Attributes: [{ Id: 'account', Value: a.id }] },
        { Value: a.amount },
      ],
    })),
  }))
  return {
    Reports: [
      {
        Rows: [
          { RowType: 'Header', Cells: [{ Value: '' }, { Value: periodLabel }] },
          ...sections,
        ],
      },
    ],
  }
}

/**
 * Build a single-period BS response. Sections derived from each account's
 * `section` field — must be one of 'Assets', 'Liabilities', 'Equity' for the
 * parser's exact-match top-level classifier. To plant a sub-section (Bank,
 * Reserves, etc.) just nest manually outside this helper.
 */
type BSAccount = { name: string; id: string; amount: string; section: 'Assets' | 'Liabilities' | 'Equity' }
function singlePeriodBSReport(balanceDate: string, accounts: BSAccount[]) {
  const bySection = new Map<string, BSAccount[]>()
  for (const a of accounts) {
    const arr = bySection.get(a.section) ?? []
    arr.push(a)
    bySection.set(a.section, arr)
  }
  const sections = Array.from(bySection.entries()).map(([title, rows]) => ({
    RowType: 'Section',
    Title: title,
    Rows: rows.map((a) => ({
      RowType: 'Row',
      Cells: [
        { Value: a.name, Attributes: [{ Id: 'account', Value: a.id }] },
        { Value: a.amount },
      ],
    })),
  }))
  return {
    Reports: [
      {
        Rows: [
          { RowType: 'Header', Cells: [{ Value: '' }, { Value: balanceDate }] },
          ...sections,
        ],
      },
    ],
  }
}

function organisationResponse(timezone: string, country: string) {
  return {
    Organisations: [{ OrganisationID: 'org-1', Timezone: timezone, CountryCode: country }],
  }
}

function accountsResponse(accounts: Array<{ id: string; code: string; name: string; type: string }>) {
  return {
    Accounts: accounts.map((a) => ({
      AccountID: a.id,
      Code: a.code,
      Name: a.name,
      Type: a.type,
      Status: 'ACTIVE',
    })),
  }
}

// ─── Supabase stub (copy of path-a's pattern) ───────────────────────────────

type CallLogEntry = { kind: string; arg?: any }
type RpcReturn = { data: any; error: any | null } | ((args: any) => { data: any; error: any | null })

function makeSupabaseStub(opts: {
  connections?: any[]
  fiscalYearStart?: number
  rpcReturns?: Record<string, RpcReturn>
  upsertError?: any | null
  bsUpsertError?: any | null
  tenantJobIdSequence?: string[]
}) {
  const callLog: CallLogEntry[] = []
  const connections = opts.connections ?? []
  const upsertError = opts.upsertError ?? null
  const bsUpsertError = opts.bsUpsertError ?? null
  const upsertedRowsCapture: any[][] = []
  const upsertCallsByTable: Record<string, any[]> = {}
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
          data: {
            id: 'profile-id-1',
            business_id: 'biz-id-1',
            fiscal_year_start: opts.fiscalYearStart ?? 7,
          },
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
      ;(upsertCallsByTable[table] ??= []).push(...rows)
      upsertedRowsCapture.push(rows)
      const tableErr = table === 'xero_pl_lines'
        ? upsertError
        : table === 'xero_bs_lines'
          ? bsUpsertError
          : null
      return Promise.resolve({ data: rows, error: tableErr, count: rows.length })
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
    upsertCallsByTable,
    syncJobsInsertPayloads,
    syncJobsUpdatePayloads,
  }
}

// ─── URL pattern matchers ───────────────────────────────────────────────────

function isPLPerMonthUrl(u: string): boolean {
  if (!u.includes('/Reports/ProfitAndLoss')) return false
  const fromMatch = u.match(/fromDate=(\d{4})-(\d{2})-/)
  const toMatch = u.match(/toDate=(\d{4})-(\d{2})-/)
  if (!fromMatch || !toMatch) return false
  return fromMatch[1] === toMatch[1] && fromMatch[2] === toMatch[2]
}
function isPLFYTotalUrl(u: string): boolean {
  if (!u.includes('/Reports/ProfitAndLoss')) return false
  return !isPLPerMonthUrl(u)
}
function isBSUrl(u: string): boolean {
  return u.includes('/Reports/BalanceSheet')
}
function isOrgUrl(u: string): boolean {
  return u.endsWith('/Organisation') || u.includes('/Organisation?') || /\/Organisation$/.test(u)
}
function isAccountsUrl(u: string): boolean {
  return u.includes('/api.xro/2.0/Accounts')
}
function periodMonthFromPLUrl(u: string): string | null {
  const m = u.match(/fromDate=(\d{4}-\d{2}-\d{2})/)
  return m ? m[1]! : null
}
function balanceDateFromBSUrl(u: string): string | null {
  const m = u.match(/date=(\d{4}-\d{2}-\d{2})/)
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

type FetchHandler = (url: string) => Response | Promise<Response>

function mockFetchRouted(handler: FetchHandler) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const u = String(url)
    return handler(u) as any
  })
}

// ─── Default PL handler — covers Org, Accounts, PL per-month, PL FY-total ───

function defaultPLHandlers(opts: {
  accountId?: string
  accountCode?: string
  accountName?: string
  accountType?: string
  perMonthAmount?: number
}): (u: string) => Response | null {
  const id = opts.accountId ?? 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'
  const code = opts.accountCode ?? '200'
  const name = opts.accountName ?? 'Sales'
  const type = opts.accountType ?? 'REVENUE'
  const amt = opts.perMonthAmount ?? 100
  return (u: string) => {
    if (isOrgUrl(u)) return makeJsonResponse(organisationResponse('AUSEASTERNSTANDARDTIME', 'AU'))
    if (isAccountsUrl(u)) return makeJsonResponse(accountsResponse([{ id, code, name, type }]))
    if (isPLFYTotalUrl(u)) {
      const months = monthsInUrlRange(u)
      return makeJsonResponse(singlePeriodPLReport('FY Total', [{ name, id, amount: (amt * months).toFixed(2), section: 'Income' }]))
    }
    if (isPLPerMonthUrl(u)) {
      const p = periodMonthFromPLUrl(u)!
      return makeJsonResponse(singlePeriodPLReport(p, [{ name, id, amount: amt.toFixed(2), section: 'Income' }]))
    }
    return null
  }
}

// ─── Default BS handler — covers BS per-month-end with one balanced row set

const BS_ASSET_ID = 'bbbb1111-1111-1111-1111-bbbbbbbbbbbb'
const BS_LIAB_ID = 'cccc1111-1111-1111-1111-cccccccccccc'
const BS_EQUITY_ID = 'dddd1111-1111-1111-1111-dddddddddddd'

function defaultBSHandler(amounts: { asset: number; liability: number; equity: number }): (u: string) => Response | null {
  return (u: string) => {
    if (!isBSUrl(u)) return null
    const date = balanceDateFromBSUrl(u)!
    return makeJsonResponse(
      singlePeriodBSReport(date, [
        { name: 'NAB Bank', id: BS_ASSET_ID, amount: amounts.asset.toFixed(2), section: 'Assets' },
        { name: 'GST Payable', id: BS_LIAB_ID, amount: amounts.liability.toFixed(2), section: 'Liabilities' },
        { name: 'Retained Earnings', id: BS_EQUITY_ID, amount: amounts.equity.toFixed(2), section: 'Equity' },
      ]),
    )
  }
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

describe('Path A BS sync orchestrator', () => {
  it('Test 1 — happy path BS sync: per-month-end fetches; xero_bs_lines populated; reconciliation has pl + bs sub-objects', async () => {
    const ACC_ID = 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'
    const { upsertCallsByTable, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const plH = defaultPLHandlers({ accountId: ACC_ID })
    // Asset 1000, Liability 400, Equity 600 → Net Assets 600 == Equity 600.
    const bsH = defaultBSHandler({ asset: 1000, liability: 400, equity: 600 })
    const fetchSpy = mockFetchRouted((u) => {
      const pl = plH(u); if (pl) return pl
      const bs = bsH(u); if (bs) return bs
      return makeJsonResponse({ error: `unhandled ${u}` }, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('success')

    // BS month-ends: current FY YTD (Jul..Apr = 10) + prior FY (Jul..Jun = 12) = 22.
    const bsCalls = fetchSpy.mock.calls.filter((c) => isBSUrl(String(c[0])))
    expect(bsCalls.length).toBe(22)

    // Each BS URL uses ?date=YYYY-MM-LAST and never periods= or timeframe=.
    for (const call of bsCalls) {
      const u = String(call[0])
      expect(u).toMatch(/[?&]date=\d{4}-\d{2}-\d{2}/)
      expect(u).not.toMatch(/[?&]periods=/)
      expect(u).not.toMatch(/[?&]timeframe=/)
    }

    // BS rows landed in xero_bs_lines with all three account types.
    const bsRows = upsertCallsByTable['xero_bs_lines'] ?? []
    expect(bsRows.length).toBe(22 * 3) // 3 rows per month-end
    const types = new Set(bsRows.map((r: any) => r.account_type))
    expect(types).toEqual(new Set(['asset', 'liability', 'equity']))
    for (const r of bsRows) {
      expect(r.basis).toBe('accruals')
      expect(r.tenant_id).toBe('tenant-A-uuid')
      expect(r.business_id).toBe('profile-id-1')
      expect(typeof r.balance_date).toBe('string')
    }

    // sync_jobs.reconciliation has both pl + bs sub-objects.
    const tenantUpdate = syncJobsUpdatePayloads[0]!
    expect(tenantUpdate.payload.status).toBe('success')
    expect(tenantUpdate.payload.reconciliation.pl).toBeDefined()
    expect(tenantUpdate.payload.reconciliation.bs).toBeDefined()
    expect(tenantUpdate.payload.reconciliation.bs.unbalanced_dates).toEqual([])
    expect(tenantUpdate.payload.reconciliation.bs.months_failed).toEqual([])
    expect(tenantUpdate.payload.reconciliation.bs.months_fetched).toBe(22)
  })

  it('Test 2 — one BS month-end 5xx after retries: tenant partial; bs.months_failed contains date', async () => {
    const FAILING_DATE = '2025-09-30'
    const { syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const plH = defaultPLHandlers({})
    const bsOk = defaultBSHandler({ asset: 1000, liability: 400, equity: 600 })
    let failingHits = 0
    const fetchSpy = mockFetchRouted((u) => {
      const pl = plH(u); if (pl) return pl
      if (isBSUrl(u)) {
        const d = balanceDateFromBSUrl(u)!
        if (d === FAILING_DATE) {
          failingHits++
          return makeJsonResponse({ error: 'svc' }, 503)
        }
        return bsOk(u)!
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const promise = syncBusinessXeroPL('biz-id-1')
    // Fast-forward through 5xx backoffs (1+2+5+15 = 23s).
    await vi.advanceTimersByTimeAsync(60_000)
    const result = await promise

    expect(['partial', 'error']).toContain(result.status)
    expect(failingHits).toBeGreaterThanOrEqual(5)
    const tu = syncJobsUpdatePayloads[0]!
    expect(tu.payload.status).toBe('partial')
    expect(tu.payload.reconciliation.bs.months_failed).toContain(FAILING_DATE)
    void fetchSpy
  })

  it('Test 3 — Net Assets ≠ Equity by $5: tenant partial; that date is in unbalanced_dates AND its rows are NOT written; balanced dates ARE written', async () => {
    const UNBALANCED_DATE = '2025-12-31'
    const { upsertCallsByTable, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const plH = defaultPLHandlers({})
    const fetchSpy = mockFetchRouted((u) => {
      const pl = plH(u); if (pl) return pl
      if (isBSUrl(u)) {
        const d = balanceDateFromBSUrl(u)!
        // Plant a $5 imbalance on UNBALANCED_DATE (equity short by $5).
        const equity = d === UNBALANCED_DATE ? 595 : 600
        return makeJsonResponse(
          singlePeriodBSReport(d, [
            { name: 'NAB Bank', id: BS_ASSET_ID, amount: '1000.00', section: 'Assets' },
            { name: 'GST Payable', id: BS_LIAB_ID, amount: '400.00', section: 'Liabilities' },
            { name: 'Retained Earnings', id: BS_EQUITY_ID, amount: equity.toFixed(2), section: 'Equity' },
          ]),
        )
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(['partial', 'error']).toContain(result.status)
    const tu = syncJobsUpdatePayloads[0]!
    expect(tu.payload.status).toBe('partial')
    expect(tu.payload.reconciliation.bs.unbalanced_dates.length).toBeGreaterThanOrEqual(1)
    const unbalancedEntry = tu.payload.reconciliation.bs.unbalanced_dates.find(
      (e: any) => e.balance_date === UNBALANCED_DATE,
    )
    expect(unbalancedEntry).toBeDefined()
    expect(Math.abs(unbalancedEntry.delta - 5)).toBeLessThan(0.011)

    // Verify that the unbalanced date's rows are NOT in xero_bs_lines, but balanced dates' rows ARE.
    const bsRows = upsertCallsByTable['xero_bs_lines'] ?? []
    const unbalancedRows = bsRows.filter((r: any) => r.balance_date === UNBALANCED_DATE)
    const balancedRows = bsRows.filter((r: any) => r.balance_date !== UNBALANCED_DATE)
    expect(unbalancedRows.length).toBe(0)
    expect(balancedRows.length).toBe(21 * 3) // 22 months minus 1 unbalanced × 3 rows each

    // Reconciliation status is 'mismatch' at the tenant level.
    expect(tu.payload.reconciliation.status).toBe('mismatch')
    void fetchSpy
  })

  it('Test 4 — BS-only failure (P&L ok, all BS month-ends 503): P&L rows still written; bs sub-object reflects failure', async () => {
    const ACC_ID = 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'
    const { upsertCallsByTable, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const plH = defaultPLHandlers({ accountId: ACC_ID })
    const fetchSpy = mockFetchRouted((u) => {
      const pl = plH(u); if (pl) return pl
      if (isBSUrl(u)) return makeJsonResponse({ error: 'svc' }, 503)
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const promise = syncBusinessXeroPL('biz-id-1')
    // Fast-forward through MANY 5xx backoffs (22 month-ends × 23s worst-case).
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
    const result = await promise

    expect(['partial', 'error']).toContain(result.status)
    const plRows = upsertCallsByTable['xero_pl_lines'] ?? []
    expect(plRows.length).toBeGreaterThan(0)
    for (const r of plRows) {
      expect(r.account_id).toBe(ACC_ID)
    }
    const tu = syncJobsUpdatePayloads[0]!
    expect(tu.payload.status).toBe('partial')
    expect(tu.payload.reconciliation.bs.months_failed.length).toBeGreaterThan(0)
    void fetchSpy
  }, 30_000)

  it('Test 5 — multi-tenant: tenant A BS unbalanced, tenant B BS balanced; both PL ok; per-tenant statuses independent', async () => {
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
        { id: 'conn-2', tenant_id: 'tenant-B-uuid', tenant_name: 'IICT', business_id: 'profile-id-1' },
      ],
    })
    const plH = defaultPLHandlers({})
    let bsCallSeq = 0
    mockFetchRouted((u) => {
      const pl = plH(u); if (pl) return pl
      if (isBSUrl(u)) {
        const d = balanceDateFromBSUrl(u)!
        bsCallSeq++
        // First 22 BS calls = tenant A (sequential per-tenant). Plant a $10 imbalance every call.
        const isTenantA = bsCallSeq <= 22
        const equity = isTenantA ? 590 : 600
        return makeJsonResponse(
          singlePeriodBSReport(d, [
            { name: 'NAB Bank', id: BS_ASSET_ID, amount: '1000.00', section: 'Assets' },
            { name: 'GST Payable', id: BS_LIAB_ID, amount: '400.00', section: 'Liabilities' },
            { name: 'Retained Earnings', id: BS_EQUITY_ID, amount: equity.toFixed(2), section: 'Equity' },
          ]),
        )
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    expect(syncJobsInsertPayloads.length).toBe(2)
    expect(syncJobsUpdatePayloads.length).toBe(2)
    // tenant A is partial (BS unbalanced); tenant B is success.
    const tA = syncJobsUpdatePayloads.find((u) => u.payload.reconciliation?.tenant_id === 'tenant-A-uuid')!
    const tB = syncJobsUpdatePayloads.find((u) => u.payload.reconciliation?.tenant_id === 'tenant-B-uuid')!
    expect(tA.payload.status).toBe('partial')
    expect(tA.payload.reconciliation.bs.unbalanced_dates.length).toBeGreaterThan(0)
    expect(tB.payload.status).toBe('success')
    expect(tB.payload.reconciliation.bs.unbalanced_dates).toEqual([])
  })

  it('Test 6 — FXGROUPID in BS (Currency Revaluation Reserve): upserted with stable derived account_id', async () => {
    const { upsertCallsByTable } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const plH = defaultPLHandlers({})
    mockFetchRouted((u) => {
      const pl = plH(u); if (pl) return pl
      if (isBSUrl(u)) {
        const d = balanceDateFromBSUrl(u)!
        // Equity has a real account + a Currency Revaluation Reserve via FXGROUPID.
        // Net Assets (1000-400=600) == Equity (550 + 50 = 600). Balanced.
        return makeJsonResponse(
          singlePeriodBSReport(d, [
            { name: 'NAB Bank', id: BS_ASSET_ID, amount: '1000.00', section: 'Assets' },
            { name: 'GST Payable', id: BS_LIAB_ID, amount: '400.00', section: 'Liabilities' },
            { name: 'Retained Earnings', id: BS_EQUITY_ID, amount: '550.00', section: 'Equity' },
            { name: 'Currency Revaluation Reserve', id: 'FXGROUPID', amount: '50.00', section: 'Equity' },
          ]),
        )
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('success')
    const bsRows = upsertCallsByTable['xero_bs_lines'] ?? []
    expect(bsRows.length).toBeGreaterThan(0)
    const fxRows = bsRows.filter((r: any) => r.account_name === 'Currency Revaluation Reserve')
    expect(fxRows.length).toBeGreaterThan(0)
    for (const r of fxRows) {
      // Never literal 'FXGROUPID' — must be a derived UUID.
      expect(r.account_id).not.toBe('FXGROUPID')
      expect(r.account_id).toMatch(/^[0-9a-f-]{36}$/i)
      expect(r.account_type).toBe('equity')
    }
    // Stable: every monthly upsert of FX maps to the same derived id.
    const uniqueFxIds = new Set(fxRows.map((r: any) => r.account_id))
    expect(uniqueFxIds.size).toBe(1)
  })

  it('Test 7 — catalog reuse: only one /Accounts call per tenant per sync (P&L + BS share the catalog)', async () => {
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const plH = defaultPLHandlers({})
    const bsH = defaultBSHandler({ asset: 1000, liability: 400, equity: 600 })
    const fetchSpy = mockFetchRouted((u) => {
      const pl = plH(u); if (pl) return pl
      const bs = bsH(u); if (bs) return bs
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    const accountsCalls = fetchSpy.mock.calls.filter((c) => isAccountsUrl(String(c[0])))
    expect(accountsCalls.length).toBe(1) // single tenant, single sync, one /Accounts call
  })

  it('Test 8 — URL discipline: every BS URL uses ?date=YYYY-MM-LAST and never periods= or timeframe=', async () => {
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const plH = defaultPLHandlers({})
    const bsH = defaultBSHandler({ asset: 1000, liability: 400, equity: 600 })
    const fetchSpy = mockFetchRouted((u) => {
      const pl = plH(u); if (pl) return pl
      const bs = bsH(u); if (bs) return bs
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    const bsCalls = fetchSpy.mock.calls.filter((c) => isBSUrl(String(c[0])))
    expect(bsCalls.length).toBe(22)
    for (const call of bsCalls) {
      const u = String(call[0])
      expect(u).toMatch(/Reports\/BalanceSheet\?date=\d{4}-\d{2}-\d{2}/)
      expect(u).not.toMatch(/[?&]periods=/)
      expect(u).not.toMatch(/[?&]timeframe=/)
      // Date should be a month-end (last day of month).
      const d = balanceDateFromBSUrl(u)!
      const [, , dayStr] = d.split('-')
      const day = parseInt(dayStr!, 10)
      expect(day).toBeGreaterThanOrEqual(28) // last day of any month
    }
  })
})
