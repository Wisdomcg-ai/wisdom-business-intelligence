/**
 * GET /api/forecast/dashboard-actuals — the KPI dashboard charts' "Last synced".
 *
 * The route read `financial_metrics.updated_at` for it. financial_metrics has no
 * updated_at column (baseline schema; confirmed in prod information_schema), so
 * the query errored, the error was ignored, lastSyncedAt was always null and the
 * line never rendered. financial_metrics was never the charts' source either:
 * they read the xero_pl_lines mirror.
 *
 * `lastSync` is now the Xero data clock from the one definition
 * (`businessDataClock`) over every org behind the figures: the business's
 * connection rows under both id forms, and every tenant whose mirror rows the
 * charts drew — disconnecting keeps those rows, and IICT Group's charts still
 * summed an org with no connection row on 16 Sep 2026. The stalest clock wins.
 *
 * These tests go through the exported GET — the withQuerySchema wrapper
 * included — and post the business_profiles.id the dashboard sends
 * (useBusinessDashboard), while xero_connections rows live under businesses.id.
 * The database stand-in honours eq/in/order/limit and returns only the selected
 * columns, so a filter or column the route leaves out changes the answer instead
 * of hiding behind the fixture.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateFiscalMonthKeys, getCurrentFiscalYear } from '@/lib/utils/fiscal-year-utils'
import { ACCESS_TOKEN_TTL_MS } from '@/lib/xero/connection-status'

type Row = Record<string, unknown>
type Read = { table: string; columns: string; filters: Array<[string, string, unknown]> }

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>> | { error: { message: string; code?: string } }>,
  /** Fail only the reads of a table that match — e.g. one of two queries on it. */
  failWhen: {} as Record<string, (read: { table: string; columns: string; filters: Array<[string, string, unknown]> }) => boolean>,
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
  const read: Read = { table, columns: '*', filters: [] }
  db.reads.push(read)
  let order: Array<{ column: string; ascending: boolean }> = []
  let limit: number | null = null

  const run = (): { data: Row[] | null; error: { message: string; code?: string } | null } => {
    const answer = db.tables[table] ?? []
    if (!Array.isArray(answer)) return { data: null, error: answer.error }
    if (db.failWhen[table]?.(read)) return { data: null, error: { message: `${table} read failed`, code: '57014' } }
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

const FY = getCurrentFiscalYear(7)
const [FIRST_MONTH] = generateFiscalMonthKeys(FY, 7)
const [LAST_YEAR_FIRST_MONTH] = generateFiscalMonthKeys(FY - 1, 7)

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

/**
 * Revenue rows in the P&L mirror, one per tenant, in the requested year unless a
 * month is given, written just now unless `written` says when.
 */
function mirror(...lines: Array<{ tenant_id: string | null; revenue: number; month?: string; written?: string }>): Row[] {
  return lines.map((line, i) => ({
    business_id: PROFILE_ID,
    tenant_id: line.tenant_id,
    account_id: `acc-${i}`,
    account_name: `Sales ${i}`,
    account_type: 'revenue',
    monthly_values: { [line.month ?? FIRST_MONTH]: line.revenue },
    updated_at: line.written ?? hoursAgo(0),
  }))
}

function syncClock(byTenant: Record<string, string>, ok = true) {
  return { ok, byTenant: new Map(Object.entries(byTenant).map(([tenant, iso]) => [tenant, Date.parse(iso)])) }
}

async function getCharts(businessId = PROFILE_ID) {
  const response = await GET(
    new Request(`http://localhost/api/forecast/dashboard-actuals?businessId=${encodeURIComponent(businessId)}`),
  )
  return { status: response.status, json: await response.json() }
}

const readsOf = (table: string) => db.reads.filter((r) => r.table === table)

beforeEach(() => {
  NOW = Date.now()
  db.reads = []
  db.failWhen = {}
  db.tables = {
    business_profiles: [{ id: PROFILE_ID, business_id: BUSINESS_ID }],
    financial_forecasts: [{ id: 'fc-1', business_id: PROFILE_ID, fiscal_year: FY, is_active: true, updated_at: hoursAgo(5) }],
    forecast_pl_lines: [
      {
        forecast_id: 'fc-1',
        account_name: 'Sales',
        category: 'Revenue',
        account_type: 'revenue',
        actual_months: { [FIRST_MONTH]: 777 },
        forecast_months: { [FIRST_MONTH]: 1000 },
        is_from_xero: false,
      },
    ],
    xero_pl_lines_wide_compat: [],
    xero_connections: [],
  }
  vi.mocked(getLastSyncByTenant).mockReset()
  vi.mocked(Sentry.captureException).mockClear()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('dashboard-actuals lastSync — the stalest clock behind the figures', () => {
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
    db.tables.xero_pl_lines_wide_compat = mirror({ tenant_id: 'tenant-limited', revenue: 600 }, { tenant_id: 'tenant-pty', revenue: 300 })
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
    const [read] = readsOf('xero_connections')
    expect(read.filters).toEqual([['in', 'business_id', expect.arrayContaining([PROFILE_ID, BUSINESS_ID])]])
    expect(read.columns).not.toContain('token')

    // The sync clock is the shared lookup, read once as the service role over the
    // same 60-day window as the pill and the board.
    expect(getLastSyncByTenant).toHaveBeenCalledTimes(1)
    expect(getLastSyncByTenant).toHaveBeenCalledWith(SERVICE_ROLE, 60)

    // The charts themselves: Xero's actuals replace the forecast's stored ones.
    expect(json.hasData).toBe(true)
    expect(json.data.months).toHaveLength(12)
    expect(json.data.months[0]).toMatchObject({ revenueActual: 900, revenueForecast: 1000 })
  })

  it('figures still drawn from an org whose connection is gone are dated by when they were written — the IICT case', async () => {
    // Two orgs reconnected and synced an hour ago. IICT Group Pty Ltd has no
    // connection row any more, but its rows are still in the mirror and in the
    // charts, written 1,500h (62 days) ago — past the sync lookup's window, so
    // sync_jobs no longer knows it. The line must not print the fresh date, nor
    // give up on a date the rows themselves carry.
    db.tables.xero_connections = [
      connection({ id: 'conn-aust', tenant_id: 'tenant-aust', tenant_name: 'IICT (Aust) Pty Ltd', last_synced_at: hoursAgo(1) }),
      connection({ id: 'conn-limited', tenant_id: 'tenant-limited', tenant_name: 'IICT Group Limited', last_synced_at: hoursAgo(1) }),
    ]
    db.tables.xero_pl_lines_wide_compat = mirror(
      { tenant_id: 'tenant-aust', revenue: 100, written: hoursAgo(1) },
      { tenant_id: 'tenant-limited', revenue: 200, written: hoursAgo(1) },
      { tenant_id: 'tenant-pty', revenue: 400, written: hoursAgo(1500) },
    )
    vi.mocked(getLastSyncByTenant).mockResolvedValue(syncClock({ 'tenant-aust': hoursAgo(1), 'tenant-limited': hoursAgo(1) }))

    const { json } = await getCharts()

    expect(json.data.months[0]).toMatchObject({ revenueActual: 700 })
    expect(json.data.lastSync).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(1500),
      orgs: [
        { tenantName: null, lastSyncAt: hoursAgo(1500) },
        { tenantName: 'IICT (Aust) Pty Ltd', lastSyncAt: hoursAgo(1) },
        { tenantName: 'IICT Group Limited', lastSyncAt: hoursAgo(1) },
      ],
    })
    // The mirror read asked for each row's tenant and write time.
    expect(readsOf('xero_pl_lines_wide_compat')[0].columns).toContain('tenant_id')
    expect(readsOf('xero_pl_lines_wide_compat')[0].columns).toContain('updated_at')
  })

  it('a connection stamped fresh without new figures reads the figures’ last write, not the stamp', async () => {
    // A writer stamped last_synced_at six minutes ago without writing a row; the
    // figures on the page were written 30h ago.
    db.tables.xero_connections = [
      connection({ id: 'conn-a', tenant_id: 'tenant-a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(0.1) }),
    ]
    db.tables.xero_pl_lines_wide_compat = mirror({ tenant_id: 'tenant-a', revenue: 100, written: hoursAgo(30) })
    vi.mocked(getLastSyncByTenant).mockResolvedValue(syncClock({ 'tenant-a': hoursAgo(30) }))

    const { json } = await getCharts()

    expect(json.data.lastSync).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(30),
      orgs: [{ tenantName: 'A Pty Ltd', lastSyncAt: hoursAgo(30) }],
    })
  })

  it('an org whose rows are all outside the requested year is not in these charts, so it does not date them', async () => {
    db.tables.xero_connections = [
      connection({ id: 'conn-aust', tenant_id: 'tenant-aust', tenant_name: 'IICT (Aust) Pty Ltd', last_synced_at: hoursAgo(1) }),
    ]
    db.tables.xero_pl_lines_wide_compat = mirror(
      { tenant_id: 'tenant-aust', revenue: 100 },
      { tenant_id: 'tenant-old', revenue: 400, month: LAST_YEAR_FIRST_MONTH },
    )
    vi.mocked(getLastSyncByTenant).mockResolvedValue(syncClock({ 'tenant-aust': hoursAgo(1) }))

    const { json } = await getCharts()

    expect(json.data.months[0]).toMatchObject({ revenueActual: 100 })
    expect(json.data.lastSync).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(1),
      orgs: [{ tenantName: 'IICT (Aust) Pty Ltd', lastSyncAt: hoursAgo(1) }],
    })
  })

  it('a business with no connection left, whose charts still draw Xero figures, gets a date — not none', async () => {
    db.tables.xero_connections = []
    db.tables.xero_pl_lines_wide_compat = mirror({ tenant_id: 'tenant-gone', revenue: 500, written: hoursAgo(20) })
    vi.mocked(getLastSyncByTenant).mockResolvedValue(syncClock({ 'tenant-gone': hoursAgo(20) }))

    const { json } = await getCharts()

    expect(json.data.lastSync).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(20),
      orgs: [{ tenantName: null, lastSyncAt: hoursAgo(20) }],
    })
    expect(getLastSyncByTenant).toHaveBeenCalledTimes(1)
    expect(getLastSyncByTenant).toHaveBeenCalledWith(SERVICE_ROLE, 60)
  })

  it("each org's clock is the fresher of its stamped column and its tenant's sync_jobs", async () => {
    // A: stamped 3h ago, last job 50h ago → 3h. B: stamped 60h ago, last job 5h ago → 5h.
    // Stalest is B at 5h. Without the column A reads 50h; without the jobs B reads 60h.
    db.tables.xero_connections = [
      connection({ id: 'conn-a', tenant_id: 'tenant-a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(3) }),
      connection({ id: 'conn-b', tenant_id: 'tenant-b', tenant_name: 'B Pty Ltd', last_synced_at: hoursAgo(60) }),
    ]
    db.tables.xero_pl_lines_wide_compat = mirror({ tenant_id: 'tenant-a', revenue: 1 }, { tenant_id: 'tenant-b', revenue: 1 })
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

  it('a retired org with no figures in the charts sets nothing, and a dead row superseded by its reconnect is not an org', async () => {
    db.tables.xero_connections = [
      connection({ id: 'conn-live', tenant_id: 'tenant-live', tenant_name: 'Live Pty Ltd', last_synced_at: hoursAgo(2) }),
      // The same org's pre-reconnect row, switched off.
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
    db.tables.xero_pl_lines_wide_compat = mirror({ tenant_id: 'tenant-live', revenue: 1 })
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
    db.tables.xero_pl_lines_wide_compat = mirror({ tenant_id: 'tenant-roofing', revenue: 1 })
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

  it('no Xero connection and no Xero figures is none, and the fleet sync clock is not read', async () => {
    const { status, json } = await getCharts()

    expect(status).toBe(200)
    expect(json.data.lastSync).toEqual({ status: 'none' })
    expect(json.data.months[0]).toMatchObject({ revenueActual: 777 })
    expect(getLastSyncByTenant).not.toHaveBeenCalled()
  })
})

describe('dashboard-actuals lastSync — a failed check is unknown, never a date', () => {
  it('a failed sync_jobs lookup is unknown however fresh the stamped columns are — and the charts still load', async () => {
    db.tables.xero_connections = [
      connection({ id: 'conn-a', tenant_id: 'tenant-a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(1) }),
    ]
    db.tables.xero_pl_lines_wide_compat = mirror({ tenant_id: 'tenant-a', revenue: 1 })
    vi.mocked(getLastSyncByTenant).mockResolvedValue(syncClock({}, false))

    const { status, json } = await getCharts()

    expect(status).toBe(200)
    expect(json.data.lastSync).toEqual({ status: 'unknown' })
    expect(json.hasData).toBe(true)
  })

  it('a failed xero_connections read is unknown, goes to Sentry, and reads no sync clock', async () => {
    db.tables.xero_connections = { error: { message: 'permission denied for table xero_connections', code: '42501' } }
    db.tables.xero_pl_lines_wide_compat = mirror({ tenant_id: 'tenant-a', revenue: 1 })

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

  it('a sync clock lookup that throws for figures with no connection left is unknown too', async () => {
    db.tables.xero_pl_lines_wide_compat = mirror({ tenant_id: 'tenant-gone', revenue: 1 })
    vi.mocked(getLastSyncByTenant).mockRejectedValue(new Error('fetch failed'))

    const { status, json } = await getCharts()

    expect(status).toBe(200)
    expect(json.data.lastSync).toEqual({ status: 'unknown' })
  })

  it('an id the resolver could not map finds no connection rows — unknown, even with figures drawn', async () => {
    // xero_connections is keyed by businesses.id. With no business_profiles row to
    // map the posted profile id, the resolver echoes it back alone: nothing under
    // it proves the business has no connection, or which orgs it has.
    db.tables.business_profiles = []
    db.tables.xero_connections = [
      connection({ id: 'conn-a', tenant_id: 'tenant-a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(1) }),
    ]
    db.tables.xero_pl_lines_wide_compat = mirror({ tenant_id: 'tenant-a', revenue: 1 })
    vi.mocked(getLastSyncByTenant).mockResolvedValue(syncClock({ 'tenant-a': hoursAgo(1) }))

    const { status, json } = await getCharts()

    expect(status).toBe(200)
    expect(readsOf('xero_connections')[0].filters).toEqual([['in', 'business_id', [PROFILE_ID]]])
    expect(json.data.lastSync).toEqual({ status: 'unknown' })
  })
})

describe('dashboard-actuals — a failed read is a 500, never charts that quietly lost something', () => {
  it('a failed Xero mirror read is a 500 — the forecast’s stored actuals are not passed off as Xero’s', async () => {
    db.tables.xero_pl_lines_wide_compat = { error: { message: 'canceling statement due to statement timeout', code: '57014' } }

    const { status, json } = await getCharts()

    expect(status).toBe(500)
    expect(json).not.toHaveProperty('data')
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ code: '57014' }),
      expect.objectContaining({ tags: expect.objectContaining({ route: 'forecast/dashboard-actuals' }) }),
    )
  })

  it("a failed read of the year's forecast is a 500, not charts without the plan", async () => {
    db.failWhen.financial_forecasts = (read) => read.filters.some(([, column]) => column === 'fiscal_year')

    const { status } = await getCharts()

    expect(status).toBe(500)
  })

  it('a failed read of the latest forecast is a 500, not charts without its actuals', async () => {
    db.tables.financial_forecasts = [
      { id: 'fc-old', business_id: PROFILE_ID, fiscal_year: FY - 1, is_active: true, updated_at: hoursAgo(5) },
    ]
    db.failWhen.financial_forecasts = (read) => !read.filters.some(([, column]) => column === 'fiscal_year')

    const { status } = await getCharts()

    expect(readsOf('financial_forecasts')).toHaveLength(2)
    expect(status).toBe(500)
  })
})
