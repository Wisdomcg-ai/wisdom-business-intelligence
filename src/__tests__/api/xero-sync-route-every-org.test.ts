/**
 * POST /api/Xero/sync end to end: the exported route over the REAL orchestrator,
 * with only Xero (fetch) and Supabase stubbed at their I/O boundaries, posting
 * what the dashboard posts — the business_profiles.id.
 *
 * The defect this pins: the dashboard's Sync Xero button synced one org of a
 * multi-org business and then stamped xero_connections.last_synced_at = now
 * whatever Xero said. last_synced_at is the data clock the connection pill,
 * the /cfo board and /api/Xero/status classify, so pressing the button on IICT
 * Group — whose Pty Ltd org has returned 403 since 10 Sep 2026 — made the
 * refused org read fresh for 48 hours. These tests assert on what was written:
 * which orgs Xero was asked about, which connection rows had their clock
 * moved, and that nothing reached financial_metrics.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  installSupabaseStub,
  routeXero,
  urbanRoadBook,
  jsonResponse,
  UR_BIZ,
  UR_PROFILE,
  UR_TENANT,
  UR_CONNECTION,
  SECOND_CONNECTION,
  SECOND_TENANT,
  ACC_SALES,
  type DbEvent,
  type FetchRecord,
  type TenantBook,
} from '../xero/helpers/fx-split-harness'

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
  getValidAccessToken: vi.fn(async () => ({ success: true, accessToken: 'access-token-mock' })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } }, error: null })) },
  })),
}))

const verifyBusinessAccess = vi.fn(async (..._args: unknown[]) => true)
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...args: unknown[]) => verifyBusinessAccess(...args),
}))

type Row = Record<string, unknown>

const PROFILE_ROW = { id: UR_PROFILE, business_id: UR_BIZ, fiscal_year_start: 7 }

/** A connection row as xero_connections holds it: switched on unless said otherwise. */
function row(conn: { id: string; tenant_id: string; tenant_name: string; business_id: string }, over: Row = {}): Row {
  return {
    ...conn,
    is_active: true,
    include_in_consolidation: true,
    last_synced_at: null,
    updated_at: null,
    expires_at: null,
    created_at: null,
    ...over,
  }
}

const secondBook: TenantBook = {
  catalog: [{ id: ACC_SALES, code: '200', name: 'Sales', type: 'REVENUE' }],
  monthRows: () => [{ name: 'Sales', id: ACC_SALES, amount: 250, section: 'Income' }],
}

/**
 * Install the harness, then answer reads of the given tables from the given rows
 * with their eq / in filters honoured. The harness answers every read with the
 * same rows whatever the filters; these tests depend on them — resolving the
 * posted business_profiles.id, and the orchestrator leaving a switched-off org
 * alone. Writes still go through the harness, which records them.
 */
function stubDatabase(connections: Row[], tables: Record<string, Row[] | { error: { message: string } }> = {}) {
  const stub = installSupabaseStub(supabaseMock, { connections: connections as any })
  const answers: Record<string, Row[] | { error: { message: string } }> = {
    business_profiles: [PROFILE_ROW],
    xero_connections: connections,
    ...tables,
  }
  const stubFrom = supabaseMock.from
  supabaseMock.from = (table: string) => {
    const b = stubFrom(table)
    const answer = answers[table]
    if (!answer) return b
    const filters: Array<[string, string, unknown]> = []
    let writing = false
    for (const method of ['insert', 'update', 'upsert', 'delete'] as const) {
      const original = b[method]
      b[method] = (...args: unknown[]) => {
        writing = true
        return original(...args)
      }
    }
    const { eq, in: inFilter, then, maybeSingle, single } = b
    b.eq = (col: string, val: unknown) => {
      filters.push(['eq', col, val])
      return eq(col, val)
    }
    b.in = (col: string, vals: unknown) => {
      filters.push(['in', col, vals])
      return inFilter(col, vals)
    }
    const read = (r: Row) => {
      if ('error' in answer) return { ...r, data: null, error: answer.error }
      const data = answer.filter((x) =>
        filters.every(([op, col, val]) => (op === 'eq' ? x[col] === val : (val as unknown[]).includes(x[col]))),
      )
      return { ...r, data, count: data.length, error: null }
    }
    b.then = (resolve: any, reject: any) => (writing ? then(resolve, reject) : then((r: Row) => resolve(read(r)), reject))
    const first = async (original: () => Promise<Row>) => {
      const r = read(await original())
      return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }
    }
    b.maybeSingle = () => (writing ? maybeSingle() : first(maybeSingle))
    b.single = () => (writing ? single() : first(single))
    return b
  }
  return stub
}

/** Xero, with chosen calls answered by a fixed failure instead of the books. */
function xero(
  books: Record<string, TenantBook>,
  fetches: FetchRecord[],
  fail: (url: string, tenant: string) => Response | null = () => null,
) {
  const route = routeXero(books, fetches)
  return (async (input: any, init?: any) => {
    const url = String(input)
    const tenant = String(init?.headers?.['xero-tenant-id'] ?? '')
    const failure = fail(url, tenant)
    if (failure) {
      fetches.push({ url, tenant })
      return failure
    }
    return route(input, init)
  }) as typeof fetch
}

const forbidden = () => jsonResponse({ Title: 'Forbidden', Detail: 'AuthorizationUnsuccessful' }, 403)
const dailyLimit = () => jsonResponse({}, 429, { 'X-Rate-Limit-Problem': 'daily' })

/** Connection ids whose last_synced_at the run stamped. */
function clockStamps(events: DbEvent[]): unknown[] {
  return events
    .filter((e) => e.table === 'xero_connections' && e.op === 'update' && (e.payload as any)?.last_synced_at)
    .map((e) => e.filters.find(([op, col]) => op === 'eq' && col === 'id')?.[2])
}

function plUpsertTenants(events: DbEvent[]): Set<string> {
  return new Set(
    events
      .filter((e) => e.table === 'xero_pl_lines' && e.op === 'upsert')
      .flatMap((e) => (e.payload as Array<{ tenant_id: string }>).map((r) => r.tenant_id)),
  )
}

async function pressSync(businessId: string = UR_PROFILE) {
  const { POST } = await import('@/app/api/Xero/sync/route')
  const req = new NextRequest('http://localhost/api/Xero/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_id: businessId }),
  })
  const res = await (POST as (req: Request, ctx: unknown) => Promise<Response>)(req, { params: {} })
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-14T02:00:00Z'))
  vi.resetModules()
  verifyBusinessAccess.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Sync Xero on a two-org business, one org refused by Xero', () => {
  it("syncs every org, moves only the healthy org's clock, and says partial naming the refused org", async () => {
    // The refused org comes first — the one a single-connection sync picked.
    const stub = stubDatabase([row(SECOND_CONNECTION), row(UR_CONNECTION)])
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(
      xero({ [UR_TENANT]: urbanRoadBook() }, fetches, (_url, tenant) => (tenant === SECOND_TENANT ? forbidden() : null)),
    )

    const { status, json } = await pressSync()

    expect(status).toBe(200)
    expect(json).toEqual({
      outcome: 'partial',
      orgs: [
        { name: 'Second Org', status: 'error' },
        { name: 'Urban Road Pty Ltd', status: 'success' },
      ],
    })
    // Access is checked against the business the posted profile id belongs to.
    expect(verifyBusinessAccess).toHaveBeenCalledWith('owner-1', UR_BIZ)

    // Both orgs were attempted — not just connections[0].
    expect(fetches.some((f) => f.tenant === SECOND_TENANT)).toBe(true)
    expect(fetches.some((f) => f.tenant === UR_TENANT)).toBe(true)

    // The refused org's clock did not move. This is the 48-hour false fresh.
    expect(clockStamps(stub.events)).toEqual([UR_CONNECTION.id])

    // The mirror the dashboard charts was refreshed — for the org that answered.
    expect(plUpsertTenants(stub.events)).toEqual(new Set([UR_TENANT]))

    // Retired: the financial_metrics write (zeros on a failed fetch) and the
    // BankSummary call that was never a Xero endpoint.
    expect(stub.events.filter((e) => e.table === 'financial_metrics')).toEqual([])
    expect(fetches.filter((f) => f.url.includes('BankSummary'))).toEqual([])

    // Auto-map looked for mappings under businesses.id — account_mappings' key —
    // never under the posted profile id.
    const mappingReads = stub.events.filter((e) => e.table === 'account_mappings')
    expect(mappingReads.length).toBeGreaterThan(0)
    for (const e of mappingReads) {
      expect(e.filters).toContainEqual(['eq', 'business_id', UR_BIZ])
    }
  })
})

describe('Sync Xero — every answer, from the real orchestrator', () => {
  it('both orgs answer: synced, and both clocks move', async () => {
    const stub = stubDatabase([row(UR_CONNECTION), row(SECOND_CONNECTION)])
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(
      xero({ [UR_TENANT]: urbanRoadBook(), [SECOND_TENANT]: secondBook }, fetches),
    )

    const { status, json } = await pressSync()

    expect(status).toBe(200)
    expect(json.outcome).toBe('synced')
    expect(clockStamps(stub.events)).toEqual([UR_CONNECTION.id, SECOND_CONNECTION.id])
  })

  it('a month that failed while the rest landed: partial for that org, and its clock moves — its data did land', async () => {
    const stub = stubDatabase([row(UR_CONNECTION)])
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(
      xero({ [UR_TENANT]: urbanRoadBook() }, fetches, (url) =>
        url.includes('ProfitAndLoss?fromDate=2026-08-01&toDate=2026-08-31')
          ? jsonResponse({ Message: 'Bad request' }, 400)
          : null,
      ),
    )

    const { status, json } = await pressSync()

    expect(status).toBe(200)
    expect(json).toEqual({ outcome: 'partial', orgs: [{ name: 'Urban Road Pty Ltd', status: 'partial' }] })
    expect(clockStamps(stub.events)).toEqual([UR_CONNECTION.id])
  })

  it('Xero answers /Organisation and /Accounts but refuses every report: nothing landed — failed, clock unmoved', async () => {
    const stub = stubDatabase([row(UR_CONNECTION)])
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(
      xero({ [UR_TENANT]: urbanRoadBook() }, fetches, (url) => (url.includes('/Reports/') ? forbidden() : null)),
    )

    const { status, json } = await pressSync()

    expect(status).toBe(502)
    expect(json).toEqual({ outcome: 'failed', orgs: [{ name: 'Urban Road Pty Ltd', status: 'error' }] })
    expect(plUpsertTenants(stub.events)).toEqual(new Set())
    expect(clockStamps(stub.events)).toEqual([])
  })

  it("the only org stopped by Xero's daily limit: failed, and its clock does not move", async () => {
    const stub = stubDatabase([row(UR_CONNECTION)])
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero({}, fetches, (_url, tenant) => (tenant === UR_TENANT ? dailyLimit() : null)))

    const { status, json } = await pressSync()

    expect(status).toBe(502)
    expect(json).toEqual({ outcome: 'failed', orgs: [{ name: 'Urban Road Pty Ltd', status: 'paused' }] })
    expect(clockStamps(stub.events)).toEqual([])
  })

  it('a connection with a blank tenant is reported as not synced, not left out', async () => {
    const blank = { id: 'conn-blank', tenant_id: '', tenant_name: 'Blank Org', business_id: UR_BIZ }
    const stub = stubDatabase([row(UR_CONNECTION), row(blank)])
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero({ [UR_TENANT]: urbanRoadBook() }, fetches))

    const { json } = await pressSync()

    expect(json).toEqual({
      outcome: 'partial',
      orgs: [
        { name: 'Urban Road Pty Ltd', status: 'success' },
        { name: 'Blank Org', status: 'error' },
      ],
    })
    expect(clockStamps(stub.events)).toEqual([UR_CONNECTION.id])
  })

  it('a switched-off sibling org is never synced, and keeps the answer from being green', async () => {
    const stub = stubDatabase([row(UR_CONNECTION), row(SECOND_CONNECTION, { is_active: false })])
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(
      xero({ [UR_TENANT]: urbanRoadBook(), [SECOND_TENANT]: secondBook }, fetches),
    )

    const { status, json } = await pressSync()

    expect(status).toBe(200)
    expect(json).toEqual({
      outcome: 'partial',
      orgs: [
        { name: 'Urban Road Pty Ltd', status: 'success' },
        { name: 'Second Org', status: 'disconnected' },
      ],
    })
    expect(fetches.some((f) => f.tenant === SECOND_TENANT)).toBe(false)
    expect(clockStamps(stub.events)).toEqual([UR_CONNECTION.id])
  })

  it('a business with no mappings is auto-mapped under businesses.id, not the posted profile id', async () => {
    const stub = stubDatabase([row(UR_CONNECTION)], {
      account_mappings: [],
      xero_pl_lines_wide_compat: [
        { business_id: UR_PROFILE, account_name: 'Sales', account_code: '200', account_type: 'revenue', section: 'Revenue' },
      ],
    })
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero({ [UR_TENANT]: urbanRoadBook() }, fetches))

    const { json } = await pressSync()

    expect(json.outcome).toBe('synced')
    const inserts = stub.events.filter((e) => e.table === 'account_mappings' && e.op === 'upsert')
    expect(inserts).toHaveLength(1)
    expect((inserts[0]!.payload as Array<{ business_id: string }>).map((r) => r.business_id)).toEqual([UR_BIZ])
  })

  it('a failed connection read is a failed sync — never "not connected"', async () => {
    const stub = stubDatabase([row(UR_CONNECTION)], {
      xero_connections: { error: { message: 'canceling statement due to statement timeout' } },
    })
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero({ [UR_TENANT]: urbanRoadBook() }, fetches))

    const { status, json } = await pressSync()

    expect(status).toBe(500)
    expect(json.outcome).toBe('failed')
    expect(fetches).toEqual([])
    expect(clockStamps(stub.events)).toEqual([])
  })

  it('another sync holding the lock: in_progress, with no Xero call and no clock moved', async () => {
    const stub = stubDatabase([row(UR_CONNECTION)])
    const stubRpc = supabaseMock.rpc
    supabaseMock.rpc = async (name: string, args: unknown) =>
      name === 'begin_xero_sync_job' ? { data: null, error: null } : stubRpc(name, args)
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero({ [UR_TENANT]: urbanRoadBook() }, fetches))

    const { status, json } = await pressSync()

    expect(status).toBe(409)
    expect(json).toEqual({ outcome: 'in_progress', orgs: [] })
    expect(fetches).toEqual([])
    expect(clockStamps(stub.events)).toEqual([])
  })

  it('only a switched-off org: not_connected naming it, without claiming a sync job', async () => {
    const stub = stubDatabase([row(UR_CONNECTION, { is_active: false })])
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero({}, fetches))

    const { status, json } = await pressSync()

    expect(status).toBe(404)
    expect(json).toEqual({ outcome: 'not_connected', orgs: [{ name: 'Urban Road Pty Ltd', status: 'disconnected' }] })
    expect(fetches).toEqual([])
    expect(stub.events.filter((e) => e.table === 'rpc:begin_xero_sync_job')).toEqual([])
  })

  it('never connected: not_connected with no orgs', async () => {
    stubDatabase([])
    const fetches: FetchRecord[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero({}, fetches))

    const { status, json } = await pressSync()

    expect(status).toBe(404)
    expect(json).toEqual({ outcome: 'not_connected', orgs: [] })
    expect(fetches).toEqual([])
  })
})

describe("the orchestrator's own guarantees behind the button", () => {
  it('a throwing onTenantOutcome never fails the sync or skips a clock', async () => {
    const stub = stubDatabase([row(UR_CONNECTION)])
    vi.spyOn(global, 'fetch').mockImplementation(xero({ [UR_TENANT]: urbanRoadBook() }, []))
    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')

    const result = await syncBusinessXeroPL(UR_BIZ, {
      onTenantOutcome: () => {
        throw new Error('reporting hook exploded')
      },
    })

    expect(result.status).toBe('success')
    expect(clockStamps(stub.events)).toEqual([UR_CONNECTION.id])
  })

  it('a failed connection lookup throws — and still releases the sync job — instead of "no active connections"', async () => {
    const stub = stubDatabase([], { xero_connections: { error: { message: 'connection reset' } } })
    vi.spyOn(global, 'fetch').mockImplementation(xero({}, []))
    const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')

    await expect(syncBusinessXeroPL(UR_BIZ)).rejects.toThrow(/xero_connections lookup failed: connection reset/)
    const finalize = stub.events.find((e) => e.table === 'rpc:finalize_xero_sync_job')
    expect((finalize?.payload as { p_status: string })?.p_status).toBe('error')
  })
})
