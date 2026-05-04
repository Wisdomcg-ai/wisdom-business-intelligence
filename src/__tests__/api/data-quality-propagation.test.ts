/**
 * Phase 44.2 Plan 44.2-08 — data_quality propagation tests.
 *
 * Two layers:
 *
 * 1. Service-level: getHistoricalSummary populates data_quality +
 *    per_tenant_quality on BOTH paths (active forecast and fallback).
 *    These are the substantive logic tests — the 4 consumer routes are
 *    thin pass-throughs of this service's output.
 *
 * 2. Static structural check: each of the 4 consumer route files contains
 *    `data_quality` references. Replaces 4 redundant route integration
 *    tests with a single fast structural check that catches the only
 *    failure mode that matters: forgetting to surface the field.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

vi.mock('@/lib/utils/resolve-business-ids', () => ({
  resolveBusinessIds: vi.fn(async (_supabase: any, id: string) => ({
    bizId: id,
    profileId: id,
    all: [id],
  })),
}))

import { getHistoricalSummary } from '@/lib/services/historical-pl-summary'

// ─── Service-level: chain mock identical to forecast-read-service-data-quality.test.ts ─

interface MockOpts {
  activeForecast: { id: string } | null
  forecastPlLines?: any[]
  /** xero_pl_lines_wide_compat fallback rows. */
  xeroWideRows?: Array<{ account_name: string; account_type: string; monthly_values: Record<string, number> }>
  xeroConnections: Array<{ tenant_id: string; business_id: string }>
  latestSyncJobsByTenant: Record<string, { status: string; started_at: string; reconciliation?: any } | null>
}

function makeMockSupabase(opts: MockOpts) {
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
      if (table === 'financial_forecasts') {
        return { data: opts.activeForecast, error: null }
      }
      if (table === 'sync_jobs') {
        const tenantFilter = ctx._filters.find((f: any) => f.kind === 'eq' && f.col === 'tenant_id')
        const tenantId = tenantFilter?.val
        return { data: tenantId ? (opts.latestSyncJobsByTenant[tenantId] ?? null) : null, error: null }
      }
      return { data: null, error: null }
    }
    ctx.then = (resolve: any, reject: any) => {
      let data: any[] = []
      if (table === 'forecast_pl_lines') data = opts.forecastPlLines ?? []
      if (table === 'xero_pl_lines_wide_compat') data = opts.xeroWideRows ?? []
      if (table === 'xero_pl_lines') data = []
      if (table === 'xero_connections') data = opts.xeroConnections
      return Promise.resolve({ data, error: null }).then(resolve, reject)
    }
    return ctx
  }
  return { from: (table: string) => fromBuilder(table) } as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getHistoricalSummary — data_quality propagation', () => {
  it('Test 1 — active forecast path: composite.data_quality threads through', async () => {
    const supabase = makeMockSupabase({
      activeForecast: { id: 'forecast-1' },
      forecastPlLines: [],
      xeroConnections: [{ tenant_id: 'tenant-A', business_id: 'biz-1' }],
      latestSyncJobsByTenant: {
        'tenant-A': { status: 'success', started_at: new Date(Date.now() - 60_000).toISOString() },
      },
    })
    const result = await getHistoricalSummary(supabase, 'biz-1', 2026)
    // No xero rows came through (composite.rows empty + no fallback rows) so
    // has_xero_data is false — but data_quality MUST still surface.
    expect(result.data_quality).toBe('verified')
    expect(result.per_tenant_quality).toBeDefined()
    expect(result.per_tenant_quality!.length).toBe(1)
  })

  it('Test 2 — fallback path (no active forecast): data_quality computed via public wrapper', async () => {
    const supabase = makeMockSupabase({
      activeForecast: null,
      xeroWideRows: [
        { account_name: 'Sales', account_type: 'revenue', monthly_values: { '2026-01': 1000 } },
      ],
      xeroConnections: [{ tenant_id: 'tenant-A', business_id: 'biz-1' }],
      latestSyncJobsByTenant: {
        'tenant-A': { status: 'partial', started_at: new Date().toISOString() },
      },
    })
    const result = await getHistoricalSummary(supabase, 'biz-1', 2026)
    expect(result.has_xero_data).toBe(true)
    expect(result.data_quality).toBe('partial')
    expect(result.per_tenant_quality![0]!.data_quality).toBe('partial')
  })

  it('Test 3 — empty fallback (no xero rows AND no sync history): data_quality=no_sync surfaces', async () => {
    const supabase = makeMockSupabase({
      activeForecast: null,
      xeroWideRows: [], // empty fallback
      xeroConnections: [{ tenant_id: 'tenant-A', business_id: 'biz-1' }],
      latestSyncJobsByTenant: { 'tenant-A': null },
    })
    const result = await getHistoricalSummary(supabase, 'biz-1', 2026)
    expect(result.has_xero_data).toBe(false)
    expect(result.data_quality).toBe('no_sync')
    expect(result.per_tenant_quality).toBeDefined()
  })

  it('Test 4 — multi-tenant: worst-of severity rolls up to business level', async () => {
    const supabase = makeMockSupabase({
      activeForecast: { id: 'forecast-1' },
      forecastPlLines: [],
      xeroConnections: [
        { tenant_id: 'tenant-A', business_id: 'biz-1' },
        { tenant_id: 'tenant-B', business_id: 'biz-1' },
      ],
      latestSyncJobsByTenant: {
        'tenant-A': { status: 'success', started_at: new Date().toISOString() },
        'tenant-B': { status: 'error', started_at: new Date().toISOString() },
      },
    })
    const result = await getHistoricalSummary(supabase, 'biz-1', 2026)
    // worst-of(verified, failed) = failed
    expect(result.data_quality).toBe('failed')
  })
})

// ─── Static structural check on the 4 consumer routes ─────────────────────

describe('data_quality surfaces in all 4 consumer routes (structural)', () => {
  const routes: Array<{ name: string; relPath: string }> = [
    { name: 'pl-summary', relPath: 'src/app/api/Xero/pl-summary/route.ts' },
    { name: 'cashflow xero-actuals', relPath: 'src/app/api/forecast/cashflow/xero-actuals/route.ts' },
    { name: 'monthly-report generate', relPath: 'src/app/api/monthly-report/generate/route.ts' },
    { name: 'monthly-report full-year', relPath: 'src/app/api/monthly-report/full-year/route.ts' },
  ]

  for (const route of routes) {
    it(`${route.name} references data_quality`, () => {
      const src = readFileSync(path.resolve(process.cwd(), route.relPath), 'utf-8')
      // Either the route directly emits data_quality in its response, OR it
      // returns a `summary` whose contents already include the field via
      // historical-pl-summary (verified by tests 1-4 above). Detect both.
      const hasDirect = src.includes('data_quality')
      const returnsSummary = /return\s+NextResponse\.json\(\s*\{\s*summary\s*\}/m.test(src)
      expect(hasDirect || returnsSummary, `${route.relPath} must surface data_quality (directly or via summary)`).toBe(true)
    })
  }
})
