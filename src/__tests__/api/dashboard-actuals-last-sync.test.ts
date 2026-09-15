/**
 * GET /api/forecast/dashboard-actuals — the KPI dashboard charts' "Last synced".
 *
 * The route read `financial_metrics.updated_at` for it. financial_metrics has no
 * updated_at column (baseline schema; confirmed in prod information_schema), so
 * the query errored, the error was ignored, lastSyncedAt was always null and the
 * line never rendered. financial_metrics was never the charts' source either:
 * they read the xero_pl_lines mirror.
 *
 * `lastSync` is now the business's Xero data clock from the one definition
 * (`businessDataClock`): every org under both id forms, each on its own tenant's
 * clock, the stalest one. These tests go through the exported GET — the
 * withQuerySchema wrapper included — and post the business_profiles.id the
 * dashboard sends (useBusinessDashboard), while xero_connections rows live under
 * businesses.id. The database stand-in honours eq/in/order/limit and returns only
 * the selected columns, so a filter or column the route leaves out changes the
 * answer instead of hiding behind the fixture.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateFiscalMonthKeys, getCurrentFiscalYear } from '@/lib/utils/fiscal-year-utils'
import { ACCESS_TOKEN_TTL_MS } from '@/lib/xero/connection-status'

type Row = Record<string, unknown>
type TableAnswer = Row[] | { error: { message: string; code?: string } }

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[] | { error: { message: string; code?: string } }>,
  reads: [] as Array<{ table: string; columns: string; filters: Array<[string, string, unknown]> }>,
}))

const SERVICE_ROLE = vi.hoisted(() => ({ role: 'service-role-client' }))

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'owner-1' } }, error: null }) },
    from: (table: string) => stubQuery(table),
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({ createServiceRoleClient: vi.fn(() => SERVICE_ROLE) }))
vi.mock('@/lib/health-checks', () => ({ getLastSyncByTenant: vi.fn() }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allow: true, reason: 'owner' })),
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import * as Sentry from '@sentry/nextjs'
import { getLastSyncByTenant } from '@/lib/health-checks'
import { GET } from '@/app/api/forecast/dashboard-actuals/route'

/** A PostgREST-shaped query over db.tables that honours the filters it is given. */
function stubQuery(table: string) {
  const read = { table, columns: '*', filters: [] as Array<[string, string, unknown]> }
  db.reads.push(read)
  let order: Array<{ column: string; ascending: boolean }> = []
  let limit: number | null = null

  const run = (): { data: Row[] | null; error: { message: string; code?: string } | null } => {
    const answer: TableAnswer = db.tables[table] ?? []
    if (!Array.isArray(answer)) return { data: null, error: answer.error }
    let rows = answer.filter((r) =>
      read.filters.every(([op, column, value]) =>
        op === 'eq' ? r[column] === value : (value as unknown[]).includes(r[column]),
      ),
    )
    for (const { column, ascending } of [...order].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = String(a[column] ?? '')
        const y = String(b[column] ?? '')
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1)
      })
    }
    if (limit !== null) rows = rows.slice(0, limit)
    if (read.columns.trim() !== '*') {
      const columns = read.columns.split(',').map((c) => c.trim())
      rows = rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])))
    }
    return { data: rows, error: null }
  }

  const builder = {
    select: (columns = '*') => {
      read.columns = columns
      return builder
    },
    eq: (column: string, value: unknown) => {
      read.filters.push(['eq', column, value])
      return builder
    },
    in: (column: string, values: unknown[]) => {
      read.filters.push(['in', column, values])
      return builder
    },
    order: (column: string, opts?: { ascending?: boolean }) => {
      order = [...order, { column, ascending: opts?.ascending !== false }]
      return builder
    },
    limit: (n: number) => {
      limit = n
      return builder
    },
    maybeSingle: async () => {
      const result = run()
      return result.error ? result : { data: result.data?.[0] ?? null, error: null }
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  }
  return builder
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PROFILE_ID = '04e9b68f-0000-4d05-8e9c-87f4254ef11f' // what the dashboard posts
const BUSINESS_ID = '3203832b-0000-4da6-9a2c-7c29cb564ffd' // what xero_connections is keyed by

const HOUR = 60 * 60 * 1000
let NOW = 0
const hoursAgo = (hours: number) => new Date(NOW - hours * HOUR).toISOString()
/** expires_at for a token Xero granted `hours` ago. */
const tokenGrantedHoursAgo = (hours: number) => new Date(NOW - hours * HOUR + ACCESS_TOKEN_TTL_MS).toISOString()

function connection(over: Row & { id: string; tenant_id: string; tenant_name: string }): Row {
  return {
    business_id: BUSINESS_ID,
    include_in_consolidation: true,
    is_active: true,
    last_synced_at: null,
    updated_at: hoursAgo(0),
    expires_at: tokenGrantedHoursAgo(0.2),
    created_at: hoursAgo(24 * 90),
    access_token: 'never-selected',
    ...over,
  }
}

function syncClock(byTenant: Record<string, string>, ok = true) {
  return { ok, byTenant: new Map(Object.entries(byTenant).map(([tenant, iso]) => [tenant, Date.parse(iso)])) }
}

function seedCharts() {
  const [firstMonth] = generateFiscalMonthKeys(getCurrentFiscalYear(7), 7)
  db.tables.business_profiles = [{ id: PROFILE_ID, business_id: BUSINESS_ID }]
  db.tables.financial_forecasts = [
    { id: 'fc-1', business_id: PROFILE_ID, fiscal_year: getCurrentFiscalYear(7), is_active: true, updated_at: hoursAgo(5) },
  ]
  db.tables.forecast_pl_lines = [
    {
      forecast_id: 'fc-1',
      account_name: 'Sales',
      category: 'Revenue',
      account_type: 'revenue',
      actual_months: {},
      forecast_months: { [firstMonth]: 1000 },
      is_from_xero: false,
    },
  ]
  db.tables.xero_pl_lines_wide_compat = [
    { business_id: PROFILE_ID, account_name: 'Sales', account_type: 'revenue', monthly_values: { [firstMonth]: 900 } },
  ]
}

async function getCharts(businessId = PROFILE_ID) {
  const response = await GET(
    new Request(`http://localhost/api/forecast/dashboard-actuals?businessId=${encodeURIComponent(businessId)}`),
  )
  return { status: response.status, json: await response.json() }
}

const connectionReads = () => db.reads.filter((r) => r.table === 'xero_connections')

beforeEach(() => {
  NOW = Date.now()
  db.tables = {}
  db.reads = []
  vi.mocked(getLastSyncByTenant).mockReset()
  vi.mocked(Sentry.captureException).mockClear()
  seedCharts()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('dashboard-actuals lastSync — the one data clock, stalest org', () => {
  it("a multi-org business reads its stalest org's clock, not the headline org's — found under the id the dashboard does not send", async () => {
    // IICT Group Limited's token stopped refreshing 20h ago but its data synced an
    // hour ago, so it is the business's headline status (auth_stale). IICT Group
    // Pty Ltd is connected and last synced 40h ago: the charts are 40h old.
    db.tables.xero_connections = [
      connection({
        id: 'conn-limited',
        tenant_id: 'tenant-limited',
        tenant_name: 'IICT Group Limited',
        last_synced_at: hoursAgo(1),
        expires_at: tokenGrantedHoursAgo(20),
      }),
      connection({ id: 'conn-pty', tenant_id: 'tenant-pty', tenant_name: 'IICT Group Pty Ltd', last_synced_at: hoursAgo(40) }),
    ]
    vi.mocked(getLastSyncByTenant).mockResolvedValue(syncClock({}))

    const { status, json } = await getCharts()

    expect(status).toBe(200)
    expect(json.data.lastSync).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(40),
      orgs: [
        { tenantName: 'IICT Group Pty Ltd', lastSyncAt: hoursAgo(40) },
        { tenantName: 'IICT Group Limited', lastSyncAt: hoursAgo(1) },
      ],
    })
    // The dead financial_metrics query is gone, and so is the ambiguous field.
    expect(db.reads.some((r) => r.table === 'financial_metrics')).toBe(false)
    expect(json.data).not.toHaveProperty('lastSyncedAt')

    // Both id forms were asked for; the rows were under businesses.id.
    const [read] = connectionReads()
    expect(read.filters).toEqual([['in', 'business_id', expect.arrayContaining([PROFILE_ID, BUSINESS_ID])]])
    expect(read.columns).not.toContain('token')

    // The sync clock is the shared lookup, read as the service role over the same
    // 60-day window as the pill and the board.
    expect(getLastSyncByTenant).toHaveBeenCalledTimes(1)
    expect(getLastSyncByTenant).toHaveBeenCalledWith(SERVICE_ROLE, 60)

    // The charts themselves are unchanged.
    expect(json.hasData).toBe(true)
    expect(json.data.months).toHaveLength(12)
    expect(json.data.months[0]).toMatchObject({ revenueActual: 900, revenueForecast: 1000 })
  })

  it("each org's clock is the fresher of its stamped column and its tenant's sync_jobs", async () => {
    // A: stamped 3h ago, last job 50h ago → 3h. B: stamped 60h ago, last job 5h ago → 5h.
    // Stalest is B at 5h. Without the column A reads 50h; without the jobs B reads 60h.
    db.tables.xero_connections = [
      connection({ id: 'conn-a', tenant_id: 'tenant-a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(3) }),
      connection({ id: 'conn-b', tenant_id: 'tenant-b', tenant_name: 'B Pty Ltd', last_synced_at: hoursAgo(60) }),
    ]
    vi.mocked(getLastSyncByTenant).mockResolvedValue(syncClock({ 'tenant-a': hoursAgo(50), 'tenant-b': hoursAgo(5) }))

    const { json } = await getCharts()

    expect(json.data.lastSync).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(5),
      orgs: [
        { tenantName: 'B Pty Ltd', lastSyncAt: hoursAgo(5) },
        { tenantName: 'A Pty Ltd', lastSyncAt: hoursAgo(3) },
      ],
    })
  })

  it('a retired org sets nothing and a dead row superseded by its reconnect is not an org', async () => {
    db.tables.xero_connections = [
      connection({ id: 'conn-live', tenant_id: 'tenant-live', tenant_name: 'Live Pty Ltd', last_synced_at: hoursAgo(2) }),
      // The same org's pre-reconnect row, switched off, never stamped.
      connection({ id: 'conn-old', tenant_id: 'tenant-live', tenant_name: 'Live Pty Ltd', is_active: false, last_synced_at: hoursAgo(24 * 40) }),
      // Wound up on purpose: off AND excluded from consolidation.
      connection({
        id: 'conn-retired',
        tenant_id: 'tenant-retired',
        tenant_name: 'Wound Up Pty Ltd',
        is_active: false,
        include_in_consolidation: false,
        last_synced_at: hoursAgo(24 * 55),
      }),
    ]
    vi.mocked(getLastSyncByTenant).mockResolvedValue(syncClock({}))

    const { json } = await getCharts()

    expect(json.data.lastSync).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(2),
      orgs: [{ tenantName: 'Live Pty Ltd', lastSyncAt: hoursAgo(2) }],
    })
  })

  it('an org that has never synced makes the charts never_synced', async () => {
    db.tables.xero_connections = [
      connection({ id: 'conn-roofing', tenant_id: 'tenant-roofing', tenant_name: 'Dragon Roofing Pty Ltd', last_synced_at: hoursAgo(2) }),
      connection({ id: 'conn-hail', tenant_id: 'tenant-hail', tenant_name: 'EASY HAIL CLAIM PTY LTD', created_at: hoursAgo(1) }),
    ]
    vi.mocked(getLastSyncByTenant).mockResolvedValue(syncClock({ 'tenant-roofing': hoursAgo(2) }))

    const { json } = await getCharts()

    expect(json.data.lastSync).toEqual({
      status: 'never_synced',
      orgs: [
        { tenantName: 'EASY HAIL CLAIM PTY LTD', lastSyncAt: null },
        { tenantName: 'Dragon Roofing Pty Ltd', lastSyncAt: hoursAgo(2) },
      ],
    })
  })

  it('no Xero connection is none, and the fleet sync clock is not read', async () => {
    db.tables.xero_connections = []

    const { status, json } = await getCharts()

    expect(status).toBe(200)
    expect(json.data.lastSync).toEqual({ status: 'none' })
    expect(getLastSyncByTenant).not.toHaveBeenCalled()
  })
})

describe('dashboard-actuals lastSync — a failed check is unknown, never a date', () => {
  it('a failed sync_jobs lookup is unknown however fresh the stamped columns are — and the charts still load', async () => {
    db.tables.xero_connections = [
      connection({ id: 'conn-a', tenant_id: 'tenant-a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(1) }),
    ]
    vi.mocked(getLastSyncByTenant).mockResolvedValue(syncClock({}, false))

    const { status, json } = await getCharts()

    expect(status).toBe(200)
    expect(json.data.lastSync).toEqual({ status: 'unknown' })
    expect(json.hasData).toBe(true)
  })

  it('a failed xero_connections read is unknown, goes to Sentry, and reads no sync clock', async () => {
    db.tables.xero_connections = { error: { message: 'permission denied for table xero_connections', code: '42501' } }

    const { status, json } = await getCharts()

    expect(status).toBe(200)
    expect(json.data.lastSync).toEqual({ status: 'unknown' })
    expect(json.hasData).toBe(true)
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ code: '42501' }),
      expect.objectContaining({ tags: expect.objectContaining({ route: 'forecast/dashboard-actuals' }) }),
    )
    expect(getLastSyncByTenant).not.toHaveBeenCalled()
  })

  it('a sync clock lookup that throws is unknown, and the route still answers', async () => {
    db.tables.xero_connections = [
      connection({ id: 'conn-a', tenant_id: 'tenant-a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(1) }),
    ]
    vi.mocked(getLastSyncByTenant).mockRejectedValue(new Error('fetch failed'))

    const { status, json } = await getCharts()

    expect(status).toBe(200)
    expect(json.data.lastSync).toEqual({ status: 'unknown' })
    expect(Sentry.captureException).toHaveBeenCalled()
  })

  it('an id the resolver could not map finds no connection rows — unknown, not "no Xero"', async () => {
    // xero_connections is keyed by businesses.id. With no business_profiles row to
    // map the posted profile id, the resolver echoes it back alone, and nothing
    // under it proves the business has no connection.
    db.tables.business_profiles = []
    db.tables.xero_connections = [
      connection({ id: 'conn-a', tenant_id: 'tenant-a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(1) }),
    ]

    const { status, json } = await getCharts()

    expect(status).toBe(200)
    expect(connectionReads()[0].filters).toEqual([['in', 'business_id', [PROFILE_ID]]])
    expect(json.data.lastSync).toEqual({ status: 'unknown' })
    expect(getLastSyncByTenant).not.toHaveBeenCalled()
  })
})
