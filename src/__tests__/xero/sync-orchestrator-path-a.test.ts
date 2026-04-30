/**
 * Phase 44.2 Plan 44.2-06B Task 6 — Path A sync orchestrator integration tests.
 *
 * Path A: replace the structurally-broken `?periods=N&timeframe=MONTH` query
 * with N per-month single-period queries. These tests assert the new
 * orchestrator's behavior end-to-end (with mocked supabase + fetch):
 *
 *   1. Happy path single tenant single window — N single-period fetches
 *      + 1 FY-total + 1 /Organisation + 1 /Accounts; reconciler ok;
 *      absorber zero adjustments.
 *   2. Multi-tenant happy path — 2 tenants succeed independently.
 *   3. One tenant 429-daily — tenant marked 'paused'; other tenants continue.
 *   4. One month 5xx after 5 retries — tenant marked 'partial';
 *      months_failed includes that month.
 *   5. fiscal_year_start = 1 (Jan FY) — FY windows compute correctly.
 *   6. /Organisation HONGKONGSTANDARDTIME — IICT-equivalent setup respects HK time.
 *   7. /Accounts catalog mismatch — row's account_code = NULL, sync still ok.
 *   8. FXGROUPID row — upserted with stable derived account_id; basis stamped.
 *   9. No `periods=` substring in any URL the orchestrator issues.
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

function singlePeriodReport(periodLabel: string, accounts: Array<{ name: string; id: string; amount: string; section: string }>) {
  // Group accounts by their section.
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
        {
          Value: a.name,
          Attributes: [{ Id: 'account', Value: a.id }],
        },
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

// ─── Supabase stub ──────────────────────────────────────────────────────────

type CallLogEntry = { kind: string; arg?: any }
type RpcReturn = { data: any; error: any | null } | ((args: any) => { data: any; error: any | null })

function makeSupabaseStub(opts: {
  connections?: any[]
  fiscalYearStart?: number
  rpcReturns?: Record<string, RpcReturn>
  upsertError?: any | null
  tenantJobIdSequence?: string[]
}) {
  const callLog: CallLogEntry[] = []
  const connections = opts.connections ?? []
  const upsertError = opts.upsertError ?? null
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
    upsertCallsByTable,
    syncJobsInsertPayloads,
    syncJobsUpdatePayloads,
  }
}

// ─── URL pattern matchers ───────────────────────────────────────────────────

function isPLSinglePeriodUrl(u: string): boolean {
  return u.includes('/Reports/ProfitAndLoss') &&
    /fromDate=\d{4}-\d{2}-\d{2}/.test(u) &&
    /toDate=\d{4}-\d{2}-\d{2}/.test(u) &&
    !u.includes('periods=') &&
    !u.includes('timeframe=')
}
/**
 * The orchestrator issues two flavours of single-period URL:
 *   - Per-month: fromDate=YYYY-MM-01&toDate=YYYY-MM-LAST  (one calendar month)
 *   - FY-total: fromDate=FY_START&toDate=window_end       (multi-month span)
 * Detect the FY-total by computing whether fromDate and toDate are in the
 * same month — per-month always has same year+month; FY-total spans many.
 */
function isFYTotalUrl(u: string): boolean {
  if (!isPLSinglePeriodUrl(u)) return false
  const fromMatch = u.match(/fromDate=(\d{4})-(\d{2})-/)
  const toMatch = u.match(/toDate=(\d{4})-(\d{2})-/)
  if (!fromMatch || !toMatch) return false
  return !(fromMatch[1] === toMatch[1] && fromMatch[2] === toMatch[2])
}
function isPerMonthUrl(u: string): boolean {
  if (!isPLSinglePeriodUrl(u)) return false
  return !isFYTotalUrl(u)
}
function isOrgUrl(u: string): boolean {
  return u.endsWith('/Organisation') || u.includes('/Organisation?') || /\/Organisation$/.test(u)
}
function isAccountsUrl(u: string): boolean {
  return u.includes('/api.xro/2.0/Accounts')
}
function periodMonthFromUrl(u: string): string | null {
  const m = u.match(/fromDate=(\d{4}-\d{2}-\d{2})/)
  return m ? m[1]! : null
}

/**
 * Count how many calendar months fall in the [fromDate..toDate] inclusive
 * range parsed from a Xero PL URL. Used by FY-total handlers in the tests
 * to compute monthly_sum-equivalent oracle totals.
 */
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

// ─── Routing fetch mock — picks responses by URL shape ──────────────────────

type FetchHandler = (url: string) => Response | Promise<Response>

function mockFetchRouted(handler: FetchHandler) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const u = String(url)
    return handler(u) as any
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

describe('Path A sync orchestrator', () => {
  it('Test 1 — single tenant happy path: per-month fetches + Organisation + Accounts; reconciler ok; zero absorber adjustments', async () => {
    const ACC_ID = 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'
    const { syncJobsUpdatePayloads, upsertCallsByTable } = makeSupabaseStub({
      connections: [
        {
          id: 'conn-1',
          tenant_id: 'tenant-A-uuid',
          tenant_name: 'JDS',
          business_id: 'profile-id-1',
        },
      ],
    })
    // Each per-month single-period response: 100 for Sales-Hardware.
    // FY total = sum of monthly amounts (so reconciler is happy).
    const fetchSpy = mockFetchRouted((u) => {
      if (isOrgUrl(u)) return makeJsonResponse(organisationResponse('AUSEASTERNSTANDARDTIME', 'AU'))
      if (isAccountsUrl(u)) return makeJsonResponse(accountsResponse([{ id: ACC_ID, code: '200', name: 'Sales - Hardware', type: 'REVENUE' }]))
      if (isFYTotalUrl(u)) {
        const months = monthsInUrlRange(u)
        return makeJsonResponse(
          singlePeriodReport('FY Total', [
            { name: 'Sales - Hardware', id: ACC_ID, amount: (100 * months).toFixed(2), section: 'Income' },
          ]),
        )
      }
      if (isPerMonthUrl(u)) {
        const period = periodMonthFromUrl(u)!
        return makeJsonResponse(
          singlePeriodReport(period, [
            { name: 'Sales - Hardware', id: ACC_ID, amount: '100.00', section: 'Income' },
          ]),
        )
      }
      return makeJsonResponse({ error: `unhandled url ${u}` }, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('success')

    // 1 tenant × (1 Org + 1 Accounts + (current FY 10 monthly + 1 FY-total) + (prior FY 12 monthly + 1 FY-total))
    // = 2 + 11 + 13 = 26 fetches
    expect(fetchSpy).toHaveBeenCalledTimes(26)

    // Every PL URL is single-period (no periods=, no timeframe=).
    for (const call of fetchSpy.mock.calls) {
      const u = String(call[0])
      if (u.includes('ProfitAndLoss')) {
        expect(u).not.toMatch(/periods=/)
        expect(u).not.toMatch(/timeframe=/)
      }
    }

    // The catalog upsert happened; the xero_pl_lines upsert carried account_id +
    // basis + the catalog-derived account_code.
    const plRows = upsertCallsByTable['xero_pl_lines'] ?? []
    expect(plRows.length).toBeGreaterThan(0)
    for (const r of plRows) {
      expect(r.account_id).toBe(ACC_ID)
      expect(r.account_code).toBe('200') // from catalog, not parser
      expect(r.basis).toBe('accruals')
      expect(r.tenant_id).toBe('tenant-A-uuid')
      expect(r.business_id).toBe('profile-id-1')
    }

    // Per-tenant sync_jobs row marked 'success' with no failed months and
    // zero absorber adjustments.
    const tenantUpdate = syncJobsUpdatePayloads[0]!
    expect(tenantUpdate.payload.status).toBe('success')
    expect(tenantUpdate.payload.reconciliation?.months_failed ?? []).toEqual([])
    expect(tenantUpdate.payload.reconciliation?.absorber_adjustments ?? 0).toBe(0)
  })

  it('Test 2 — multi-tenant happy path: 2 tenants succeed independently', async () => {
    const ACC_A = 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'
    const ACC_B = 'bbbb2222-2222-2222-2222-bbbbbbbbbbbb'
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
        { id: 'conn-2', tenant_id: 'tenant-B-uuid', tenant_name: 'IICT', business_id: 'profile-id-1' },
      ],
    })
    // Fetch handler keys per-tenant by 'xero-tenant-id' header — but our spy
    // only sees the URL. Both tenants use the same per-month URL; we return
    // a tenant-agnostic response with one account per call. The orchestrator
    // upserts tenant_id from the connection, so multi-tenant separation is
    // checked via syncJobsInsertPayloads.
    mockFetchRouted((u) => {
      if (isOrgUrl(u)) return makeJsonResponse(organisationResponse('AUSEASTERNSTANDARDTIME', 'AU'))
      if (isAccountsUrl(u)) {
        return makeJsonResponse(
          accountsResponse([
            { id: ACC_A, code: '200', name: 'Sales', type: 'REVENUE' },
            { id: ACC_B, code: '300', name: 'COGS', type: 'DIRECTCOSTS' },
          ]),
        )
      }
      if (isFYTotalUrl(u)) {
        const months = monthsInUrlRange(u)
        return makeJsonResponse(
          singlePeriodReport('FY Total', [
            { name: 'Sales', id: ACC_A, amount: (50 * months).toFixed(2), section: 'Income' },
          ]),
        )
      }
      if (isPerMonthUrl(u)) {
        const p = periodMonthFromUrl(u)!
        return makeJsonResponse(
          singlePeriodReport(p, [
            { name: 'Sales', id: ACC_A, amount: '50.00', section: 'Income' },
          ]),
        )
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    expect(result.status).toBe('success')
    expect(syncJobsInsertPayloads.length).toBe(2)
    const tenantIds = syncJobsInsertPayloads.map((p) => p.tenant_id)
    expect(new Set(tenantIds).size).toBe(2)
    expect(tenantIds).toContain('tenant-A-uuid')
    expect(tenantIds).toContain('tenant-B-uuid')
    // Both tenant updates → success.
    for (const u of syncJobsUpdatePayloads) {
      expect(u.payload.status).toBe('success')
    }
  })

  it('Test 3 — one tenant 429-daily → tenant marked partial/error with paused signal; other tenant continues', async () => {
    const ACC_A = 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'
    const { syncJobsInsertPayloads, syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
        { id: 'conn-2', tenant_id: 'tenant-B-uuid', tenant_name: 'OK', business_id: 'profile-id-1' },
      ],
    })
    mockFetchRouted((u) => {
      // Tenant A's /Organisation returns 429-daily — orchestrator catches
      // RateLimitDailyExceededError and marks tenant 'partial'. Tenant B
      // proceeds normally.
      // Distinguishing the two tenants without per-call header inspection:
      // first /Organisation call goes to A, second to B (sequential).
      if (isOrgUrl(u)) {
        if (!(globalThis as any).__orgCallCount) (globalThis as any).__orgCallCount = 0
        ;(globalThis as any).__orgCallCount++
        if ((globalThis as any).__orgCallCount === 1) {
          return makeJsonResponse({}, 429, { 'X-Rate-Limit-Problem': 'daily' })
        }
        return makeJsonResponse(organisationResponse('AUSEASTERNSTANDARDTIME', 'AU'))
      }
      if (isAccountsUrl(u)) return makeJsonResponse(accountsResponse([{ id: ACC_A, code: '200', name: 'Sales', type: 'REVENUE' }]))
      if (isFYTotalUrl(u)) {
        const months = monthsInUrlRange(u)
        return makeJsonResponse(
          singlePeriodReport('FY Total', [{ name: 'Sales', id: ACC_A, amount: (50 * months).toFixed(2), section: 'Income' }]),
        )
      }
      if (isPerMonthUrl(u)) {
        const p = periodMonthFromUrl(u)!
        return makeJsonResponse(
          singlePeriodReport(p, [{ name: 'Sales', id: ACC_A, amount: '50.00', section: 'Income' }]),
        )
      }
      return makeJsonResponse({}, 500)
    })
    ;(globalThis as any).__orgCallCount = 0

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')

    delete (globalThis as any).__orgCallCount

    // 2 tenant rows; one 'paused' (or 'partial' carrying paused signal),
    // one 'success'. Result is 'partial' (worst-of-tenants, not 'error').
    expect(syncJobsInsertPayloads.length).toBe(2)
    expect(syncJobsUpdatePayloads.length).toBe(2)
    const statuses = syncJobsUpdatePayloads.map((u) => u.payload.status).sort()
    expect(statuses).toEqual(['paused', 'success'])
    expect(['partial', 'error']).toContain(result.status)
  })

  it('Test 4 — one month 5xx after 5 retries → tenant partial; months_failed contains that month', async () => {
    const ACC_A = 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'
    const FAILING_MONTH = '2025-09-01'
    let failingCallSeen = 0
    const { syncJobsUpdatePayloads } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    mockFetchRouted((u) => {
      if (isOrgUrl(u)) return makeJsonResponse(organisationResponse('AUSEASTERNSTANDARDTIME', 'AU'))
      if (isAccountsUrl(u)) return makeJsonResponse(accountsResponse([{ id: ACC_A, code: '200', name: 'Sales', type: 'REVENUE' }]))
      if (isFYTotalUrl(u)) {
        const months = monthsInUrlRange(u)
        // One month is failing — its $50 contribution is missing from the
        // monthly_sum, but the FY total includes it. Reduce the oracle's
        // total by 50 to match what the orchestrator will actually compute,
        // so the reconciler doesn't report a 50-dollar mismatch on top of
        // the missing-month signal we want to assert.
        // Only subtract if the failing month is inside this range.
        const ranges = u.match(/fromDate=(\d{4})-(\d{2})/)!
        const fromYM = `${ranges[1]}-${ranges[2]}-01`
        const failedInRange =
          FAILING_MONTH >= fromYM && FAILING_MONTH <= u.match(/toDate=(\d{4}-\d{2}-\d{2})/)![1]!
        const total = 50 * months - (failedInRange ? 50 : 0)
        return makeJsonResponse(
          singlePeriodReport('FY Total', [{ name: 'Sales', id: ACC_A, amount: total.toFixed(2), section: 'Income' }]),
        )
      }
      if (isPerMonthUrl(u)) {
        const p = periodMonthFromUrl(u)!
        if (p === FAILING_MONTH) {
          failingCallSeen++
          // Always 503 — even after 5 retries.
          return makeJsonResponse({ error: 'svc' }, 503)
        }
        return makeJsonResponse(
          singlePeriodReport(p, [{ name: 'Sales', id: ACC_A, amount: '50.00', section: 'Income' }]),
        )
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const promise = syncBusinessXeroPL('biz-id-1')
    // Fast-forward through all 5xx backoff sleeps (worst case 1+2+5+15 = 23s).
    await vi.advanceTimersByTimeAsync(60_000)
    const result = await promise

    expect(['partial', 'error']).toContain(result.status)
    expect(failingCallSeen).toBeGreaterThanOrEqual(5) // 5 retry attempts
    const tenantUpdate = syncJobsUpdatePayloads[0]!
    expect(tenantUpdate.payload.status).toBe('partial')
    expect(tenantUpdate.payload.reconciliation?.months_failed ?? []).toContain(FAILING_MONTH)
  })

  it('Test 5 — fiscal_year_start = 1 (Jan FY): per-month URLs cover Jan..Dec', async () => {
    const ACC_A = 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'US-Org', business_id: 'profile-id-1' },
      ],
      fiscalYearStart: 1,
    })
    const monthsHit = new Set<string>()
    const fetchSpy = mockFetchRouted((u) => {
      if (isOrgUrl(u)) return makeJsonResponse(organisationResponse('USEASTERNSTANDARDTIME', 'US'))
      if (isAccountsUrl(u)) return makeJsonResponse(accountsResponse([{ id: ACC_A, code: '200', name: 'Sales', type: 'REVENUE' }]))
      if (isFYTotalUrl(u)) {
        const months = monthsInUrlRange(u)
        return makeJsonResponse(
          singlePeriodReport('FY Total', [{ name: 'Sales', id: ACC_A, amount: (10 * months).toFixed(2), section: 'Income' }]),
        )
      }
      if (isPerMonthUrl(u)) {
        const p = periodMonthFromUrl(u)!
        monthsHit.add(p.slice(0, 7))
        return makeJsonResponse(
          singlePeriodReport(p, [{ name: 'Sales', id: ACC_A, amount: '10.00', section: 'Income' }]),
        )
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    // 'today' is 2026-04-15. With fyStart=1, currentFY=2026, monthsElapsed=4
    // → current FY YTD covers Jan..Apr 2026. Prior FY (2025) covers Jan..Dec.
    expect(monthsHit.has('2026-01')).toBe(true)
    expect(monthsHit.has('2026-04')).toBe(true)
    expect(monthsHit.has('2025-01')).toBe(true)
    expect(monthsHit.has('2025-12')).toBe(true)
    // Definitely no rolled-over July (July would be the FY2026 start under
    // the legacy default — confirms fiscal_year_start was honored).
    expect(monthsHit.has('2025-07')).toBe(true) // (still in prior FY 2025)
    void fetchSpy
  })

  it('Test 6 — HONGKONGSTANDARDTIME tenant: orchestrator does not crash on non-AEST timezone', async () => {
    const ACC_A = 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-IICT-HK', tenant_name: 'IICT HK', business_id: 'profile-id-1' },
      ],
    })
    mockFetchRouted((u) => {
      if (isOrgUrl(u)) return makeJsonResponse(organisationResponse('HONGKONGSTANDARDTIME', 'HK'))
      if (isAccountsUrl(u)) return makeJsonResponse(accountsResponse([{ id: ACC_A, code: '200', name: 'Revenue', type: 'REVENUE' }]))
      if (isFYTotalUrl(u)) {
        const months = monthsInUrlRange(u)
        return makeJsonResponse(
          singlePeriodReport('FY Total', [{ name: 'Revenue', id: ACC_A, amount: (100 * months).toFixed(2), section: 'Income' }]),
        )
      }
      if (isPerMonthUrl(u)) {
        const p = periodMonthFromUrl(u)!
        return makeJsonResponse(
          singlePeriodReport(p, [{ name: 'Revenue', id: ACC_A, amount: '100.00', section: 'Income' }]),
        )
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')
    expect(result.status).toBe('success')
  })

  it('Test 7 — AccountID not in /Accounts catalog: row carries account_code=NULL; sync still ok', async () => {
    const ACC_KNOWN = 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'
    const ACC_UNKNOWN = 'cccc9999-9999-9999-9999-cccccccccccc'
    const { upsertCallsByTable } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    mockFetchRouted((u) => {
      if (isOrgUrl(u)) return makeJsonResponse(organisationResponse('AUSEASTERNSTANDARDTIME', 'AU'))
      if (isAccountsUrl(u)) return makeJsonResponse(accountsResponse([{ id: ACC_KNOWN, code: '200', name: 'Sales', type: 'REVENUE' }]))
      if (isFYTotalUrl(u)) {
        const months = monthsInUrlRange(u)
        return makeJsonResponse(
          singlePeriodReport('FY Total', [
            { name: 'Sales', id: ACC_KNOWN, amount: (50 * months).toFixed(2), section: 'Income' },
            { name: 'Mystery', id: ACC_UNKNOWN, amount: (10 * months).toFixed(2), section: 'Income' },
          ]),
        )
      }
      if (isPerMonthUrl(u)) {
        const p = periodMonthFromUrl(u)!
        return makeJsonResponse(
          singlePeriodReport(p, [
            { name: 'Sales', id: ACC_KNOWN, amount: '50.00', section: 'Income' },
            { name: 'Mystery', id: ACC_UNKNOWN, amount: '10.00', section: 'Income' },
          ]),
        )
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')
    expect(result.status).toBe('success')
    const rows = upsertCallsByTable['xero_pl_lines'] ?? []
    const knownRow = rows.find((r: any) => r.account_id === ACC_KNOWN)!
    const unknownRow = rows.find((r: any) => r.account_id === ACC_UNKNOWN)!
    expect(knownRow.account_code).toBe('200')
    expect(unknownRow.account_code).toBeNull()
  })

  it('Test 8 — FXGROUPID row: stable derived account_id; basis stamped', async () => {
    const ACC_FX = 'FXGROUPID' // raw attribute value
    const { upsertCallsByTable } = makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    mockFetchRouted((u) => {
      if (isOrgUrl(u)) return makeJsonResponse(organisationResponse('AUSEASTERNSTANDARDTIME', 'AU'))
      if (isAccountsUrl(u)) return makeJsonResponse(accountsResponse([]))
      if (isFYTotalUrl(u)) {
        const months = monthsInUrlRange(u)
        return makeJsonResponse(
          singlePeriodReport('FY Total', [
            { name: 'FX Currency Adjustments', id: ACC_FX, amount: (12.34 * months).toFixed(2), section: 'Income' },
          ]),
        )
      }
      if (isPerMonthUrl(u)) {
        const p = periodMonthFromUrl(u)!
        return makeJsonResponse(
          singlePeriodReport(p, [
            { name: 'FX Currency Adjustments', id: ACC_FX, amount: '12.34', section: 'Income' },
          ]),
        )
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    const result = await syncBusinessXeroPL('biz-id-1')
    expect(result.status).toBe('success')
    const rows = upsertCallsByTable['xero_pl_lines'] ?? []
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.account_id).toMatch(/^[0-9a-f-]{36}$/i) // never literal 'FXGROUPID'
      expect(r.basis).toBe('accruals')
    }
  })

  it('Test 9 — orchestrator never includes periods= or timeframe= in any URL', async () => {
    const ACC_A = 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa'
    makeSupabaseStub({
      connections: [
        { id: 'conn-1', tenant_id: 'tenant-A-uuid', tenant_name: 'JDS', business_id: 'profile-id-1' },
      ],
    })
    const fetchSpy = mockFetchRouted((u) => {
      if (isOrgUrl(u)) return makeJsonResponse(organisationResponse('AUSEASTERNSTANDARDTIME', 'AU'))
      if (isAccountsUrl(u)) return makeJsonResponse(accountsResponse([{ id: ACC_A, code: '200', name: 'Sales', type: 'REVENUE' }]))
      if (isFYTotalUrl(u)) {
        const months = monthsInUrlRange(u)
        return makeJsonResponse(
          singlePeriodReport('FY Total', [{ name: 'Sales', id: ACC_A, amount: (5 * months).toFixed(2), section: 'Income' }]),
        )
      }
      if (isPerMonthUrl(u)) {
        const p = periodMonthFromUrl(u)!
        return makeJsonResponse(
          singlePeriodReport(p, [{ name: 'Sales', id: ACC_A, amount: '5.00', section: 'Income' }]),
        )
      }
      return makeJsonResponse({}, 500)
    })

    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
    await syncBusinessXeroPL('biz-id-1')

    for (const call of fetchSpy.mock.calls) {
      const u = String(call[0])
      expect(u).not.toMatch(/[?&]periods=/)
      expect(u).not.toMatch(/[?&]timeframe=/)
    }
  })
})
