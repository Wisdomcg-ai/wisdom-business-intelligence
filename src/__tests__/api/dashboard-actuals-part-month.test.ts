/**
 * GET /api/forecast/dashboard-actuals — a part month is not an actual.
 *
 * xero_pl_lines carries the month in progress, part-billed. The forecast
 * dashboard's KPI strip and trajectory chart already cap at the last closed
 * month (getExpectedLastActualIndex, #483/#484), but they do it in the browser
 * — the route itself still returned the open month's figures, and the business
 * dashboard's charts (useXeroActuals → FinancialSummaryCharts) plot the
 * response verbatim. On 8 Sep 2026 that was Urban Road's $111k September
 * against a $450k plan, drawn as an actual under a card reading "on track".
 *
 * The cap now lives in the route, so every reader inherits it. The clock is
 * pinned: an unpinned "current month" test passes in September and fails in
 * October.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Row = Record<string, unknown>
type Read = { table: string; columns: string; filters: Array<[string, string, unknown]> }

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  reads: [] as Read[],
}))

const SERVICE_ROLE = vi.hoisted(() => ({ role: 'service-role-client' }))

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'owner-1' } }, error: null }) },
    from: (table: string) => stubQuery(table),
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({ createServiceRoleClient: vi.fn(() => SERVICE_ROLE) }))
vi.mock('@/lib/health-checks', () => ({ getLastSyncByTenant: vi.fn(async () => ({ ok: true, byTenant: new Map() })) }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allow: true, reason: 'owner' })),
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { GET } from '@/app/api/forecast/dashboard-actuals/route'

/** A PostgREST-shaped query over db.tables that honours the filters it is given. */
function stubQuery(table: string) {
  const read: Read = { table, columns: '*', filters: [] }
  db.reads.push(read)
  let limit: number | null = null

  const run = () => {
    let rows = (db.tables[table] ?? []).filter((r) =>
      read.filters.every(([op, column, value]) =>
        op === 'eq' ? r[column] === value : (value as unknown[]).includes(r[column]),
      ),
    )
    if (limit !== null) rows = rows.slice(0, limit)
    return { data: rows, error: null }
  }

  const builder: Record<string, unknown> = {
    select: (columns = '*') => { read.columns = columns; return builder },
    eq: (column: string, value: unknown) => { read.filters.push(['eq', column, value]); return builder },
    in: (column: string, values: unknown[]) => { read.filters.push(['in', column, values]); return builder },
    order: () => builder,
    limit: (n: number) => { limit = n; return builder },
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  }
  return builder
}
;(SERVICE_ROLE as unknown as { from: (table: string) => unknown }).from = (table: string) => stubQuery(table)

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PROFILE_ID = '04e9b68f-0000-4d05-8e9c-87f4254ef11f'
const BUSINESS_ID = '3203832b-0000-4da6-9a2c-7c29cb564ffd'

/** Mid-September 2026: the same calendar day in UTC and in Sydney. */
const TODAY = new Date('2026-09-15T12:00:00Z')

const JUL = '2026-07'
const AUG = '2026-08'
const SEP = '2026-09' // the month in progress
const OCT = '2026-10'

function mirrorRow(month: string, revenue: number): Row {
  return {
    business_id: PROFILE_ID,
    tenant_id: 'tenant-1',
    account_id: `acc-${month}`,
    account_name: 'Sales',
    account_type: 'revenue',
    monthly_values: { [month]: revenue },
    updated_at: TODAY.toISOString(),
  }
}

async function getCharts(query = '') {
  const response = await GET(
    new Request(`http://localhost/api/forecast/dashboard-actuals?businessId=${PROFILE_ID}${query}`),
  )
  return { status: response.status, json: await response.json() }
}

const monthOf = (json: any, key: string) => json.data.months.find((m: any) => m.month === key)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  db.reads = []
  db.tables = {
    business_profiles: [{ id: PROFILE_ID, business_id: BUSINESS_ID }],
    financial_forecasts: [{ id: 'fc-1', business_id: PROFILE_ID, fiscal_year: 2027, is_active: true, updated_at: TODAY.toISOString() }],
    forecast_pl_lines: [
      {
        forecast_id: 'fc-1',
        account_name: 'Sales',
        category: 'Revenue',
        account_type: 'revenue',
        actual_months: {},
        forecast_months: { [JUL]: 450_000, [AUG]: 450_000, [SEP]: 450_000, [OCT]: 450_000 },
        is_from_xero: false,
      },
    ],
    // July and August have closed; September is eight days of a $450k month.
    xero_pl_lines_wide_compat: [mirrorRow(JUL, 460_000), mirrorRow(AUG, 440_000), mirrorRow(SEP, 111_000)],
    xero_connections: [
      {
        id: 'conn-1',
        business_id: BUSINESS_ID,
        tenant_id: 'tenant-1',
        tenant_name: 'Urban Road',
        is_active: true,
        include_in_consolidation: true,
        last_synced_at: TODAY.toISOString(),
        updated_at: TODAY.toISOString(),
        created_at: TODAY.toISOString(),
        expires_at: new Date(TODAY.getTime() + 20 * 60_000).toISOString(),
      },
    ],
    fx_rates: [],
  }
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('a month that has not closed carries no actuals', () => {
  it('draws July and August as actuals and leaves September to the plan', async () => {
    const { status, json } = await getCharts()

    expect(status).toBe(200)
    expect(monthOf(json, JUL).revenueActual).toBe(460_000)
    expect(monthOf(json, AUG).revenueActual).toBe(440_000)

    // The eight days of September are in xero_pl_lines and must not surface.
    expect(monthOf(json, SEP).revenueActual).toBeNull()
    expect(monthOf(json, SEP).gpActual).toBeNull()
    expect(monthOf(json, SEP).npActual).toBeNull()

    // The plan for the open month is still drawn — the chart shows a forecast
    // September, not a hole.
    expect(monthOf(json, SEP).revenueForecast).toBe(450_000)
  })

  it('says where the actuals stop', async () => {
    const { json } = await getCharts()
    expect(json.data.lastClosedMonth).toBe(AUG)
  })

  it('leaves a month beyond the open one alone', async () => {
    const { json } = await getCharts()
    expect(monthOf(json, OCT).revenueActual).toBeNull()
    expect(monthOf(json, OCT).revenueForecast).toBe(450_000)
  })

  it('still reports data, so the charts render rather than showing "no Xero data yet"', async () => {
    const { json } = await getCharts()
    expect(json.hasData).toBe(true)
  })
})

describe('a year that has already ended', () => {
  it('keeps every month, including its last', async () => {
    // FY2026 ran Jul 2025 – Jun 2026 and is closed; nothing is in progress.
    db.tables.financial_forecasts = [
      { id: 'fc-old', business_id: PROFILE_ID, fiscal_year: 2026, is_active: true, updated_at: TODAY.toISOString() },
    ]
    db.tables.forecast_pl_lines = [
      {
        forecast_id: 'fc-old',
        account_name: 'Sales',
        category: 'Revenue',
        account_type: 'revenue',
        actual_months: {},
        forecast_months: { '2026-06': 400_000 },
        is_from_xero: false,
      },
    ]
    db.tables.xero_pl_lines_wide_compat = [mirrorRow('2026-06', 395_000)]

    const { json } = await getCharts('&fiscalYear=2026')

    expect(monthOf(json, '2026-06').revenueActual).toBe(395_000)
    expect(json.data.lastClosedMonth).toBe('2026-06')
  })
})

describe('a year that has not started', () => {
  it('draws no actuals at all', async () => {
    db.tables.financial_forecasts = [
      { id: 'fc-next', business_id: PROFILE_ID, fiscal_year: 2028, is_active: true, updated_at: TODAY.toISOString() },
    ]
    db.tables.forecast_pl_lines = [
      {
        forecast_id: 'fc-next',
        account_name: 'Sales',
        category: 'Revenue',
        account_type: 'revenue',
        actual_months: {},
        forecast_months: { '2027-07': 500_000 },
        is_from_xero: false,
      },
    ]
    // Rows exist for a month of that year — a sync ran early, or a stray row.
    db.tables.xero_pl_lines_wide_compat = [mirrorRow('2027-07', 12_000)]

    const { json } = await getCharts('&fiscalYear=2028')

    expect(monthOf(json, '2027-07').revenueActual).toBeNull()
    expect(json.data.lastClosedMonth).toBeNull()
  })
})
