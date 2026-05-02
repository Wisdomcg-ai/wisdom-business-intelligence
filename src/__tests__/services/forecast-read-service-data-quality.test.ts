/**
 * Phase 44.2 Plan 44.2-07 — ForecastReadService.computeDataQuality tests.
 *
 * Verifies the read-path quality gate (D-44.2-03) per-tenant + worst-of
 * rollup (D-44.2-04). Each enum value gets one test; one multi-tenant test
 * exercises the worst-of severity logic; one test asserts per_tenant_quality
 * is populated for the 44.2-09 banner detail drawer.
 *
 * Mocking: chain stub modeled after sync_jobs / xero_connections query
 * shapes. The service builds queries via .from(table).select(cols).in(...)
 * .eq(...).order(...).limit(1).maybeSingle() — the stub matches that shape
 * and routes responses based on table + the .in/.eq filters.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// resolveBusinessIds is called inside getMonthlyComposite. We stub it to
// pass through the business_id verbatim so tests don't need to mock the
// dual-ID resolution path.
vi.mock('@/lib/utils/resolve-business-ids', () => ({
  resolveBusinessIds: vi.fn(async (_supabase: any, id: string) => ({
    bizId: id,
    profileId: id,
    all: [id],
  })),
}))

import { ForecastReadService } from '@/lib/services/forecast-read-service'

// ─── Mock supabase chain ───────────────────────────────────────────────────

type LatestSyncJob = {
  status: 'success' | 'partial' | 'error' | 'running'
  started_at: string
  finished_at?: string | null
  reconciliation?: any
} | null

interface MockOpts {
  forecast: { id: string; business_id: string; fiscal_year: number; updated_at: string } | null
  forecastPlLines?: Array<{ account_code: string | null; account_name: string; category: string; forecast_months: any; computed_at: string | null }>
  xeroPlLines?: Array<{ account_code: string | null; account_name: string; account_type: string; period_month: string; amount: number; tenant_id: string }>
  xeroConnections: Array<{ tenant_id: string; business_id: string }>
  latestSyncJobsByTenant: Record<string, LatestSyncJob>
}

function makeMockSupabase(opts: MockOpts) {
  // Each .from(table) returns a chainable that records its filter chain
  // and resolves to the appropriate dataset on the terminal method
  // (.maybeSingle / .then).
  const fromBuilder = (table: string) => {
    const ctx: any = { _table: table, _filters: [] as Array<{ kind: string; col: string; val: any }> }
    ctx.select = (..._args: any[]) => ctx
    ctx.eq = (col: string, val: any) => {
      ctx._filters.push({ kind: 'eq', col, val })
      return ctx
    }
    ctx.in = (col: string, val: any[]) => {
      ctx._filters.push({ kind: 'in', col, val })
      return ctx
    }
    ctx.order = () => ctx
    ctx.limit = () => ctx
    ctx.range = () => ctx
    ctx.maybeSingle = async () => {
      if (table === 'financial_forecasts') return { data: opts.forecast, error: opts.forecast ? null : new Error('not found') }
      if (table === 'sync_jobs') {
        const tenantFilter = ctx._filters.find((f: any) => f.kind === 'eq' && f.col === 'tenant_id')
        const tenantId = tenantFilter?.val
        if (!tenantId) return { data: null, error: null }
        return { data: opts.latestSyncJobsByTenant[tenantId] ?? null, error: null }
      }
      return { data: null, error: null }
    }
    ctx.then = (resolve: any, reject: any) => {
      let data: any[] = []
      if (table === 'forecast_pl_lines') data = opts.forecastPlLines ?? []
      if (table === 'xero_pl_lines') data = opts.xeroPlLines ?? []
      if (table === 'xero_connections') data = opts.xeroConnections
      return Promise.resolve({ data, error: null }).then(resolve, reject)
    }
    return ctx
  }
  return { from: (table: string) => fromBuilder(table) } as any
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const FORECAST_ID = 'forecast-id-1'
const BIZ_ID = 'biz-id-1'

function defaultForecast() {
  return { id: FORECAST_ID, business_id: BIZ_ID, fiscal_year: 2026, updated_at: '2026-04-01T00:00:00Z' }
}

function recentTimestamp(): string {
  return new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // 1h ago
}
function staleTimestamp(): string {
  return new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25h ago
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ForecastReadService.computeDataQuality (44.2-07)', () => {
  it('Test 1 — single tenant, latest success within 24h → verified', async () => {
    const supabase = makeMockSupabase({
      forecast: defaultForecast(),
      xeroConnections: [{ tenant_id: 'tenant-A', business_id: BIZ_ID }],
      latestSyncJobsByTenant: {
        'tenant-A': { status: 'success', started_at: recentTimestamp() },
      },
    })
    const result = await new ForecastReadService(supabase).getMonthlyComposite(FORECAST_ID)
    expect(result.data_quality).toBe('verified')
    expect(result.per_tenant_quality.length).toBe(1)
    expect(result.per_tenant_quality[0]!.data_quality).toBe('verified')
  })

  it('Test 2 — single tenant, latest partial → partial', async () => {
    const supabase = makeMockSupabase({
      forecast: defaultForecast(),
      xeroConnections: [{ tenant_id: 'tenant-A', business_id: BIZ_ID }],
      latestSyncJobsByTenant: {
        'tenant-A': {
          status: 'partial',
          started_at: recentTimestamp(),
          reconciliation: { pl: { discrepant_accounts: [{ account_name: 'Sales' }] }, bs: { unbalanced_dates: [] } },
        },
      },
    })
    const result = await new ForecastReadService(supabase).getMonthlyComposite(FORECAST_ID)
    expect(result.data_quality).toBe('partial')
    expect(result.per_tenant_quality[0]!.discrepancy_count).toBe(1)
  })

  it('Test 3 — single tenant, latest error → failed', async () => {
    const supabase = makeMockSupabase({
      forecast: defaultForecast(),
      xeroConnections: [{ tenant_id: 'tenant-A', business_id: BIZ_ID }],
      latestSyncJobsByTenant: {
        'tenant-A': { status: 'error', started_at: recentTimestamp() },
      },
    })
    const result = await new ForecastReadService(supabase).getMonthlyComposite(FORECAST_ID)
    expect(result.data_quality).toBe('failed')
  })

  it('Test 4 — no sync_jobs row for the active tenant → no_sync', async () => {
    const supabase = makeMockSupabase({
      forecast: defaultForecast(),
      xeroConnections: [{ tenant_id: 'tenant-A', business_id: BIZ_ID }],
      latestSyncJobsByTenant: { 'tenant-A': null },
    })
    const result = await new ForecastReadService(supabase).getMonthlyComposite(FORECAST_ID)
    expect(result.data_quality).toBe('no_sync')
  })

  it('Test 5 — single tenant, latest success >24h ago → stale', async () => {
    const supabase = makeMockSupabase({
      forecast: defaultForecast(),
      xeroConnections: [{ tenant_id: 'tenant-A', business_id: BIZ_ID }],
      latestSyncJobsByTenant: {
        'tenant-A': { status: 'success', started_at: staleTimestamp() },
      },
    })
    const result = await new ForecastReadService(supabase).getMonthlyComposite(FORECAST_ID)
    expect(result.data_quality).toBe('stale')
  })

  it('Test 6 — 2 tenants A=success B=partial → business=partial (worst-of)', async () => {
    const supabase = makeMockSupabase({
      forecast: defaultForecast(),
      xeroConnections: [
        { tenant_id: 'tenant-A', business_id: BIZ_ID },
        { tenant_id: 'tenant-B', business_id: BIZ_ID },
      ],
      latestSyncJobsByTenant: {
        'tenant-A': { status: 'success', started_at: recentTimestamp() },
        'tenant-B': { status: 'partial', started_at: recentTimestamp() },
      },
    })
    const result = await new ForecastReadService(supabase).getMonthlyComposite(FORECAST_ID)
    expect(result.data_quality).toBe('partial')
    expect(result.per_tenant_quality.length).toBe(2)
  })

  it('Test 7 — per_tenant_quality breakdown exposes each tenant individually', async () => {
    const supabase = makeMockSupabase({
      forecast: defaultForecast(),
      xeroConnections: [
        { tenant_id: 'tenant-A', business_id: BIZ_ID },
        { tenant_id: 'tenant-B', business_id: BIZ_ID },
        { tenant_id: 'tenant-C', business_id: BIZ_ID },
      ],
      latestSyncJobsByTenant: {
        'tenant-A': { status: 'success', started_at: recentTimestamp() },
        'tenant-B': { status: 'partial', started_at: recentTimestamp() },
        'tenant-C': { status: 'error', started_at: recentTimestamp() },
      },
    })
    const result = await new ForecastReadService(supabase).getMonthlyComposite(FORECAST_ID)
    // worst-of across A/B/C = failed
    expect(result.data_quality).toBe('failed')
    // per_tenant_quality must surface all 3 with their individual statuses
    const qualityById = Object.fromEntries(
      result.per_tenant_quality.map((p) => [p.tenant_id, p.data_quality]),
    )
    expect(qualityById['tenant-A']).toBe('verified')
    expect(qualityById['tenant-B']).toBe('partial')
    expect(qualityById['tenant-C']).toBe('failed')
    // Legacy fields (rows / forecast_rows / coverage) still populated.
    expect(result.rows).toEqual([])
    expect(result.forecast_rows).toEqual([])
    expect(result.coverage.months_covered).toBe(0)
  })

  it('Test 8 — getDataQualityForBusiness public wrapper returns the same shape without a forecast', async () => {
    const supabase = makeMockSupabase({
      forecast: defaultForecast(), // not used by the public wrapper
      xeroConnections: [{ tenant_id: 'tenant-A', business_id: BIZ_ID }],
      latestSyncJobsByTenant: {
        'tenant-A': { status: 'success', started_at: recentTimestamp() },
      },
    })
    const service = new ForecastReadService(supabase)
    const result = await service.getDataQualityForBusiness([BIZ_ID])
    expect(result.data_quality).toBe('verified')
    expect(result.per_tenant_quality.length).toBe(1)
  })
})
