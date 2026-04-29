/**
 * Phase 44 — Plan 44-08 — RED→GREEN tests for ForecastReadService.
 *
 * Test names per 44-VALIDATION.md (canonical, do NOT rename):
 *   - 'multi-tenant aggregate'   (D-09 — long-format reads aggregate per-tenant)
 *   - 'parity'                   (D-13 — wide-DTO output matches legacy pl-summary)
 *   - 'invariant'                (D-18 — stale computed_at throws + Sentry tag)
 *   - 'negative coverage'        (D-18 — coverage.months_covered < 0 throws)
 *   - 'aggregates active forecast (D-14)' (D-14 — active forecast resolution)
 *
 * Note: in this codebase there is no `forecast_assumptions` table — the
 * wizard's assumptions are stored on `financial_forecasts.assumptions` (jsonb)
 * and freshness is tracked via `financial_forecasts.updated_at`. ForecastReadService
 * therefore compares forecast_pl_lines.computed_at against
 * financial_forecasts.updated_at (matching the save_assumptions_and_materialize
 * RPC contract from Wave 6, see 44-06-SUMMARY.md "Important deviation").
 *
 * Plan 44-07 (atomic save wiring) was abandoned and rolled back. The schema +
 * RPC from Wave 6 are still live, so the freshness invariant remains correct
 * for any forecast saved via the RPC path; legacy serial-save rows may have
 * computed_at < updated_at. The test asserts the contract; runtime risk for
 * Wave 9 consumers is documented in 44-08-SUMMARY.md.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Plan 44.1-04 — existing tests target strict-on behavior. Use vi.hoisted so the
// env var is set BEFORE the service module's top-level `STRICT_INVARIANTS`
// constant is evaluated (vi.mock + ESM imports hoist above plain statements).
vi.hoisted(() => {
  process.env.FORECAST_INVARIANTS_STRICT = 'true'
})

import * as Sentry from '@sentry/nextjs'

// Hoist the resolveBusinessIds mock so it applies before service import.
vi.mock('@/lib/utils/resolve-business-ids', () => ({
  resolveBusinessIds: vi.fn(async (_supabase: unknown, businessId: string) => ({
    bizId: businessId,
    profileId: businessId,
    all: [businessId],
  })),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

import { ForecastReadService, createForecastReadService } from '@/lib/services/forecast-read-service'
import type {
  MonthlyComposite,
  CategorySubtotals,
  CashflowProjection,
} from '@/lib/services/forecast-read-service'

// ───────────────────────────────────────────────────────────────────────────
// Mock supabase builder — an in-memory version of the chained query API.
// Each from(table) returns a builder whose terminal methods resolve with
// canned data. Per-table fixtures are passed in via setMockData().
// ───────────────────────────────────────────────────────────────────────────

type TableFixture = {
  data: unknown
  error?: { message: string } | null
}

class MockSupabase {
  private fixtures: Record<string, TableFixture | ((filters: any) => TableFixture)> = {}
  public capturedFilters: Record<string, any> = {}

  setFixture(table: string, fixture: TableFixture | ((filters: any) => TableFixture)) {
    this.fixtures[table] = fixture
  }

  from(table: string) {
    const filters: { eqs: Array<[string, any]>; ins: Array<[string, any[]]> } = {
      eqs: [],
      ins: [],
    }
    this.capturedFilters[table] = filters
    const resolveFixture = (): TableFixture => {
      const fx = this.fixtures[table]
      if (!fx) return { data: [], error: null }
      return typeof fx === 'function' ? fx(filters) : fx
    }
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => {
        filters.eqs.push([col, val])
        return builder
      },
      in: (col: string, vals: any[]) => {
        filters.ins.push([col, vals])
        return builder
      },
      // Plan 44.1 hotfix added .range() pagination to fetchAllXeroRows.
      // Fixtures are < 1000 rows so a single range(0, 999) call returns everything;
      // subsequent calls (from > 0) return [] so the paginator's break condition fires.
      range: (from: number, _to: number) => ({
        then: (onFulfilled: any, onRejected: any) => {
          const f = resolveFixture()
          const fullData = Array.isArray(f.data) ? f.data : []
          const data = from === 0 ? fullData : []
          return Promise.resolve({ data, error: f.error ?? null }).then(
            onFulfilled,
            onRejected,
          )
        },
      }),
      maybeSingle: async () => {
        const f = resolveFixture()
        const arr = Array.isArray(f.data) ? f.data : [f.data].filter(Boolean)
        return { data: arr[0] ?? null, error: f.error ?? null }
      },
      then: (onFulfilled: any, onRejected: any) => {
        // The chain is awaited directly when no terminal is called (default = list).
        const f = resolveFixture()
        return Promise.resolve({ data: f.data ?? [], error: f.error ?? null }).then(
          onFulfilled,
          onRejected,
        )
      },
    }
    return builder
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Test fixture helpers
// ───────────────────────────────────────────────────────────────────────────

const FORECAST_ID = '11111111-1111-1111-1111-111111111111'
const BUSINESS_ID = '22222222-2222-2222-2222-222222222222'
const FY = 2026

function activeForecastRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: FORECAST_ID,
    business_id: BUSINESS_ID,
    fiscal_year: FY,
    is_active: true,
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

function makeXeroRow(
  account_code: string,
  account_name: string,
  account_type: string,
  period_month: string, // 'YYYY-MM-01'
  amount: number,
  tenant_id: string,
) {
  return {
    account_code,
    account_name,
    account_type,
    period_month,
    amount,
    tenant_id,
    fiscal_year: FY,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ───────────────────────────────────────────────────────────────────────────
// D-09 — multi-tenant aggregate
// ───────────────────────────────────────────────────────────────────────────

describe('ForecastReadService', () => {
  it('multi-tenant aggregate', async () => {
    const supabase = new MockSupabase()
    supabase.setFixture('financial_forecasts', { data: [activeForecastRow()] })
    supabase.setFixture('forecast_pl_lines', {
      data: [
        {
          account_code: '200',
          account_name: 'Sales',
          category: 'Revenue',
          forecast_months: { '2025-07': 1000, '2025-08': 1000 },
          computed_at: '2026-04-02T00:00:00Z',
        },
      ],
    })

    // 2 tenants × 3 accounts × 2 months = 12 rows. Service must collapse
    // to 3 rows × 2 monthly_values entries (sum across tenants).
    const tenants = ['org-A', 'org-B']
    const accounts: Array<[string, string, string]> = [
      ['200', 'Sales', 'revenue'],
      ['400', 'COGS', 'cogs'],
      ['500', 'Rent', 'opex'],
    ]
    const months = ['2025-07-01', '2025-08-01']
    const rows: any[] = []
    for (const t of tenants) {
      for (const [code, name, type] of accounts) {
        for (const m of months) {
          rows.push(makeXeroRow(code, name, type, m, 100, t))
        }
      }
    }
    supabase.setFixture('xero_pl_lines', { data: rows })

    const svc = new ForecastReadService(supabase as any)
    const composite: MonthlyComposite = await svc.getMonthlyComposite(FORECAST_ID)

    expect(composite.rows).toHaveLength(3) // unique account_codes (NOT 6 = 3 codes × 2 tenants)
    for (const row of composite.rows) {
      // Each tenant contributes 100 per month — sum across 2 tenants = 200.
      expect(row.monthly_values['2025-07']).toBe(200)
      expect(row.monthly_values['2025-08']).toBe(200)
    }
    // Coverage reflects 2 distinct months.
    expect(composite.coverage.months_covered).toBe(2)
    expect(composite.coverage.first_period).toBe('2025-07')
    expect(composite.coverage.last_period).toBe('2025-08')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // D-13 — parity: ForecastReadService output preserves wide-DTO contract.
  // We assert the SHAPE that legacy /api/Xero/pl-summary delivered:
  //   - one row per (account_code, account_name, account_type)
  //   - monthly_values is a Record<YYYY-MM, number>
  //   - sums equal hand-computed totals
  // (A live JDS HTTP capture is out of scope here — the parser-fixture
  // capture lives in src/__tests__/xero/fixtures and was the Wave 0 work.
  // This is the structural parity check for the wide-DTO contract.)
  // ─────────────────────────────────────────────────────────────────────────
  it('parity', async () => {
    const supabase = new MockSupabase()
    supabase.setFixture('financial_forecasts', { data: [activeForecastRow()] })
    supabase.setFixture('forecast_pl_lines', {
      data: [
        {
          account_code: '200',
          account_name: 'Sales',
          category: 'Revenue',
          forecast_months: { '2025-07': 12000, '2025-08': 13000 },
          computed_at: '2026-04-02T00:00:00Z',
        },
      ],
    })
    supabase.setFixture('xero_pl_lines', {
      data: [
        makeXeroRow('200', 'Sales', 'revenue', '2025-07-01', 11500, 'org-A'),
        makeXeroRow('200', 'Sales', 'revenue', '2025-08-01', 12750.5, 'org-A'),
        makeXeroRow('400', 'COGS', 'cogs', '2025-07-01', 4000, 'org-A'),
        makeXeroRow('500', 'Rent', 'opex', '2025-07-01', 2500, 'org-A'),
      ],
    })

    const svc = new ForecastReadService(supabase as any)
    const composite = await svc.getMonthlyComposite(FORECAST_ID)

    // Wide-DTO contract: each row has account_code, account_name, account_type, monthly_values record.
    for (const row of composite.rows) {
      expect(typeof row.account_name).toBe('string')
      expect(['revenue', 'cogs', 'opex', 'other_income', 'other_expense']).toContain(row.account_type)
      expect(typeof row.monthly_values).toBe('object')
      // Keys are YYYY-MM.
      for (const k of Object.keys(row.monthly_values)) {
        expect(k).toMatch(/^\d{4}-\d{2}$/)
      }
    }
    // Hand-computed: revenue Jul=11500, Aug=12750.5; cogs Jul=4000; opex Jul=2500.
    const sales = composite.rows.find((r) => r.account_code === '200')
    expect(sales?.monthly_values['2025-07']).toBe(11500)
    expect(sales?.monthly_values['2025-08']).toBe(12750.5)
    const cogs = composite.rows.find((r) => r.account_code === '400')
    expect(cogs?.monthly_values['2025-07']).toBe(4000)
    const rent = composite.rows.find((r) => r.account_code === '500')
    expect(rent?.monthly_values['2025-07']).toBe(2500)

    // forecast_rows pass-through with the wide forecast_months JSONB.
    expect(composite.forecast_rows).toHaveLength(1)
    expect(composite.forecast_rows[0].forecast_months['2025-07']).toBe(12000)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // D-18 — invariant: computed_at < financial_forecasts.updated_at throws.
  // ─────────────────────────────────────────────────────────────────────────
  it('invariant', async () => {
    const supabase = new MockSupabase()
    supabase.setFixture('financial_forecasts', {
      data: [activeForecastRow({ updated_at: '2026-04-10T00:00:00Z' })],
    })
    supabase.setFixture('forecast_pl_lines', {
      data: [
        {
          account_code: '200',
          account_name: 'Sales',
          category: 'Revenue',
          forecast_months: { '2025-07': 1000 },
          // STALE — computed_at < updated_at
          computed_at: '2026-04-01T00:00:00Z',
        },
      ],
    })
    supabase.setFixture('xero_pl_lines', { data: [] })

    const svc = new ForecastReadService(supabase as any)
    await expect(svc.getMonthlyComposite(FORECAST_ID)).rejects.toThrow(/INVARIANT VIOLATED/)

    // Sentry tagged with invariant='forecast_freshness'
    const calls = (Sentry.captureException as any).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1]?.tags?.invariant).toBe('forecast_freshness')
    expect(lastCall[1]?.tags?.forecast_id).toBe(FORECAST_ID)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // D-18 — negative coverage triggers invariant.
  // ─────────────────────────────────────────────────────────────────────────
  it('negative coverage', async () => {
    const supabase = new MockSupabase()
    supabase.setFixture('financial_forecasts', { data: [activeForecastRow()] })
    supabase.setFixture('forecast_pl_lines', {
      data: [
        {
          account_code: '200',
          account_name: 'Sales',
          category: 'Revenue',
          forecast_months: {},
          computed_at: '2026-04-02T00:00:00Z',
        },
      ],
    })
    supabase.setFixture('xero_pl_lines', { data: [] })

    const svc = new ForecastReadService(supabase as any)
    // Force the coverage path with a negative value to assert the guard fires.
    // We monkey-patch the private aggregator to emit months_covered = -1.
    // (The structural guard lives at the boundary; this test asserts the throw.)
    const orig = (svc as any).computeCoverage.bind(svc)
    ;(svc as any).computeCoverage = (rows: unknown) => {
      const real = orig(rows)
      return { ...real, months_covered: -1 }
    }

    await expect(svc.getMonthlyComposite(FORECAST_ID)).rejects.toThrow(/INVARIANT VIOLATED/)
    const calls = (Sentry.captureException as any).mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1]?.tags?.invariant).toBe('coverage_non_negative')
    expect(lastCall[1]?.tags?.forecast_id).toBe(FORECAST_ID)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // D-14 — service resolves the active forecast (the unique_active_forecast_per_fy
  // partial index already guarantees at most one). The service must filter by
  // is_active when looking up by (business_id, fiscal_year). For lookup by
  // forecast_id it loads that exact row (pre-filtered upstream).
  // ─────────────────────────────────────────────────────────────────────────
  it('aggregates active forecast (D-14)', async () => {
    const supabase = new MockSupabase()
    supabase.setFixture('financial_forecasts', {
      data: [activeForecastRow({ is_active: true })],
    })
    supabase.setFixture('forecast_pl_lines', {
      data: [
        {
          account_code: '200',
          account_name: 'Sales',
          category: 'Revenue',
          forecast_months: { '2025-07': 1000 },
          computed_at: '2026-04-02T00:00:00Z',
        },
      ],
    })
    supabase.setFixture('xero_pl_lines', { data: [] })

    const svc = createForecastReadService(supabase as any)
    const composite = await svc.getMonthlyComposite(FORECAST_ID)
    expect(composite.forecast_id).toBe(FORECAST_ID)
    expect(composite.fiscal_year).toBe(FY)
    // Confirm the financial_forecasts read filtered by id (the lookup contract).
    const filters = supabase.capturedFilters['financial_forecasts']
    const idFilter = filters.eqs.find(([col]: [string, any]) => col === 'id')
    expect(idFilter?.[1]).toBe(FORECAST_ID)
  })

  // Sanity: getCategorySubtotalsForMonth + getCashflowProjection delegate to getMonthlyComposite.
  it('getCategorySubtotalsForMonth returns correct subtotals', async () => {
    const supabase = new MockSupabase()
    // updated_at older than computed_at so the freshness invariant passes.
    supabase.setFixture('financial_forecasts', {
      data: [activeForecastRow({ updated_at: '2026-03-01T00:00:00Z' })],
    })
    supabase.setFixture('forecast_pl_lines', {
      data: [
        {
          account_code: '200',
          account_name: 'Sales',
          category: 'Revenue',
          forecast_months: { '2025-07': 10000 },
          computed_at: '2026-04-02T00:00:00Z',
        },
      ],
    })
    supabase.setFixture('xero_pl_lines', {
      data: [
        makeXeroRow('200', 'Sales', 'revenue', '2025-07-01', 10000, 'org-A'),
        makeXeroRow('400', 'COGS', 'cogs', '2025-07-01', 3000, 'org-A'),
        makeXeroRow('500', 'Rent', 'opex', '2025-07-01', 1000, 'org-A'),
        makeXeroRow('600', 'Interest', 'other_income', '2025-07-01', 500, 'org-A'),
        makeXeroRow('700', 'Bank Fees', 'other_expense', '2025-07-01', 200, 'org-A'),
      ],
    })

    const svc = new ForecastReadService(supabase as any)
    const subtotals: CategorySubtotals = await svc.getCategorySubtotalsForMonth(FORECAST_ID, '2025-07')

    expect(subtotals.revenue).toBe(10000)
    expect(subtotals.cogs).toBe(3000)
    expect(subtotals.gross_profit).toBe(7000)
    expect(subtotals.opex).toBe(1000)
    expect(subtotals.other_income).toBe(500)
    expect(subtotals.other_expense).toBe(200)
    // net_profit = revenue - cogs - opex + other_income - other_expense
    expect(subtotals.net_profit).toBe(10000 - 3000 - 1000 + 500 - 200)
  })

  it('getCashflowProjection sums forecast_months by category sign', async () => {
    const supabase = new MockSupabase()
    supabase.setFixture('financial_forecasts', { data: [activeForecastRow()] })
    supabase.setFixture('forecast_pl_lines', {
      data: [
        {
          account_code: '200',
          account_name: 'Sales',
          category: 'revenue',
          forecast_months: { '2025-07': 10000 },
          computed_at: '2026-04-02T00:00:00Z',
        },
        {
          account_code: '400',
          account_name: 'COGS',
          category: 'cogs',
          forecast_months: { '2025-07': 3000 },
          computed_at: '2026-04-02T00:00:00Z',
        },
        {
          account_code: '500',
          account_name: 'Rent',
          category: 'opex',
          forecast_months: { '2025-07': 1000 },
          computed_at: '2026-04-02T00:00:00Z',
        },
      ],
    })
    supabase.setFixture('xero_pl_lines', { data: [] })

    const svc = new ForecastReadService(supabase as any)
    const cf: CashflowProjection = await svc.getCashflowProjection(FORECAST_ID)
    // Net = +10000 (revenue) -3000 (cogs) -1000 (opex) = 6000
    expect(cf.monthly_net['2025-07']).toBe(6000)
    expect(cf.forecast_id).toBe(FORECAST_ID)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Plan 44.1-04 — Soft-fail invariant mode (D-44.1-08 through D-44.1-12)
//
// Re-imports the service module with `process.env.FORECAST_INVARIANTS_STRICT`
// flipped before each test (vi.resetModules + new env var) so the
// module-load-time `STRICT_INVARIANTS` constant re-evaluates.
//
// Per W3, all soft-fail / strict-on invariant tests run END-TO-END through the
// public `getMonthlyComposite` surface — they do NOT call private
// `assertCoverageNonNegative` / `assertComputedAtIsFresh` directly.
// ───────────────────────────────────────────────────────────────────────────

// Builds a MockSupabase preloaded with rows that trip the freshness invariant
// when read via getMonthlyComposite (computed_at < financial_forecasts.updated_at).
function makeStaleSupabaseMock() {
  const supabase = new MockSupabase()
  supabase.setFixture('financial_forecasts', {
    data: [
      {
        id: 'forecast-stale-1',
        business_id: BUSINESS_ID,
        fiscal_year: FY,
        is_active: true,
        // updated_at AFTER computed_at → freshness violation.
        updated_at: '2026-04-10T00:00:00Z',
      },
    ],
  })
  supabase.setFixture('forecast_pl_lines', {
    data: [
      {
        account_code: '200',
        account_name: 'Sales',
        category: 'Revenue',
        forecast_months: { '2025-07': 1000 },
        // STALE — older than updated_at above.
        computed_at: '2026-04-01T00:00:00Z',
      },
    ],
  })
  supabase.setFixture('xero_pl_lines', { data: [] })
  return supabase
}

// Builds a MockSupabase that produces months_covered=-1 when run through
// getMonthlyComposite. We honor W3 (test goes through public surface) by still
// invoking the public method; the only change is forcing the internal coverage
// calc to a negative value via a per-instance subclass override. The
// invariant-assertion code path that consumes `coverage` is exercised end-to-end.
function makeNegativeCoverageSupabaseMock() {
  const supabase = new MockSupabase()
  supabase.setFixture('financial_forecasts', {
    data: [
      {
        id: 'forecast-neg-cov-1',
        business_id: BUSINESS_ID,
        fiscal_year: FY,
        is_active: true,
        updated_at: '2026-03-01T00:00:00Z', // older than computed_at → freshness OK
      },
    ],
  })
  supabase.setFixture('forecast_pl_lines', {
    data: [
      {
        account_code: '200',
        account_name: 'Sales',
        category: 'Revenue',
        forecast_months: {},
        computed_at: '2026-04-02T00:00:00Z',
      },
    ],
  })
  supabase.setFixture('xero_pl_lines', { data: [] })
  return supabase
}

// Builds a MockSupabase with computed_at >= updated_at and at least one
// month of coverage — used as the no-violation sentinel for soft-fail mode.
function makeFreshSupabaseMock() {
  const supabase = new MockSupabase()
  supabase.setFixture('financial_forecasts', {
    data: [
      {
        id: 'forecast-fresh-1',
        business_id: BUSINESS_ID,
        fiscal_year: FY,
        is_active: true,
        updated_at: '2026-03-01T00:00:00Z',
      },
    ],
  })
  supabase.setFixture('forecast_pl_lines', {
    data: [
      {
        account_code: '200',
        account_name: 'Sales',
        category: 'Revenue',
        forecast_months: { '2025-07': 1000 },
        computed_at: '2026-04-02T00:00:00Z',
      },
    ],
  })
  supabase.setFixture('xero_pl_lines', {
    data: [makeXeroRow('200', 'Sales', 'revenue', '2025-07-01', 1000, 'org-A')],
  })
  return supabase
}

describe('Soft-fail invariant mode — D-44.1-08', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.FORECAST_INVARIANTS_STRICT = 'false'
  })

  afterEach(() => {
    process.env.FORECAST_INVARIANTS_STRICT = 'true'
  })

  it('strict-off — stale computed_at logs to Sentry but does NOT throw via getMonthlyComposite (D-44.1-09)', async () => {
    const captureMessageSpy = vi.fn()
    const addBreadcrumbSpy = vi.fn()
    vi.doMock('@sentry/nextjs', () => ({
      captureException: vi.fn(),
      captureMessage: captureMessageSpy,
      addBreadcrumb: addBreadcrumbSpy,
    }))

    // Re-import the service AFTER resetModules + env flip so STRICT_INVARIANTS=false.
    const { createForecastReadService: createSvc } = await import(
      '@/lib/services/forecast-read-service'
    )
    const supabase = makeStaleSupabaseMock()
    const svc = createSvc(supabase as any)

    // MUST NOT throw — soft-fail returns the row.
    const result = await svc.getMonthlyComposite('forecast-stale-1')
    expect(result).toBeDefined()
    expect(result.forecast_id).toBe('forecast-stale-1')

    // Sentry was notified with the soft-fail tag.
    expect(captureMessageSpy).toHaveBeenCalledWith(
      expect.stringContaining('forecast_freshness violation'),
      expect.objectContaining({
        tags: expect.objectContaining({ invariant_violation_logged: 'forecast_freshness' }),
      }),
    )
    expect(addBreadcrumbSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'invariant',
        data: expect.objectContaining({ forecast_id: 'forecast-stale-1' }),
      }),
    )
  })

  it('strict-off — negative coverage logs to Sentry but does NOT throw via getMonthlyComposite (D-44.1-09, W3)', async () => {
    // W3 fix: this test is INTEGRATION-style — pipes a negative-coverage
    // scenario through the public getMonthlyComposite surface end-to-end.
    // It does NOT call the private `assertCoverageNonNegative` directly.
    const captureMessageSpy = vi.fn()
    const addBreadcrumbSpy = vi.fn()
    vi.doMock('@sentry/nextjs', () => ({
      captureException: vi.fn(),
      captureMessage: captureMessageSpy,
      addBreadcrumb: addBreadcrumbSpy,
    }))

    const { ForecastReadService: SvcCtor } = await import(
      '@/lib/services/forecast-read-service'
    )
    const supabase = makeNegativeCoverageSupabaseMock()
    const svc = new SvcCtor(supabase as any)
    // Force the internal coverage computation to emit months_covered=-1 so the
    // invariant guard fires when the public getMonthlyComposite call reaches
    // assertCoverageNonNegative. The public surface still drives the call.
    const orig = (svc as any).computeCoverage.bind(svc)
    ;(svc as any).computeCoverage = (rows: unknown) => ({
      ...orig(rows),
      months_covered: -1,
    })

    // MUST NOT throw — soft-fail mode returns the row.
    const result = await svc.getMonthlyComposite('forecast-neg-cov-1')
    expect(result).toBeDefined()
    expect(result.forecast_id).toBe('forecast-neg-cov-1')

    // Sentry was notified with the soft-fail tag for negative-coverage.
    expect(captureMessageSpy).toHaveBeenCalledWith(
      expect.stringContaining('coverage_non_negative violation'),
      expect.objectContaining({
        tags: expect.objectContaining({ invariant_violation_logged: 'coverage_non_negative' }),
      }),
    )
    expect(addBreadcrumbSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'invariant',
        message: expect.stringContaining('coverage_non_negative'),
      }),
    )
  })

  it('strict-on — negative coverage THROWS via getMonthlyComposite (sentinel — confirms strict mode still works through public surface)', async () => {
    // Mirror of the above but with strict-on, asserting the throw path exists end-to-end.
    process.env.FORECAST_INVARIANTS_STRICT = 'true'
    vi.resetModules()
    const captureExceptionSpy = vi.fn()
    vi.doMock('@sentry/nextjs', () => ({
      captureException: captureExceptionSpy,
      captureMessage: vi.fn(),
      addBreadcrumb: vi.fn(),
    }))

    const { ForecastReadService: SvcCtor } = await import(
      '@/lib/services/forecast-read-service'
    )
    const supabase = makeNegativeCoverageSupabaseMock()
    const svc = new SvcCtor(supabase as any)
    const orig = (svc as any).computeCoverage.bind(svc)
    ;(svc as any).computeCoverage = (rows: unknown) => ({
      ...orig(rows),
      months_covered: -1,
    })

    await expect(svc.getMonthlyComposite('forecast-neg-cov-1')).rejects.toThrow(
      /coverage\.months_covered/,
    )
    expect(captureExceptionSpy).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ invariant: 'coverage_non_negative' }),
      }),
    )
  })

  it('strict-off — fresh computed_at does NOT log invariant_violation_logged (sentinel)', async () => {
    const captureMessageSpy = vi.fn()
    vi.doMock('@sentry/nextjs', () => ({
      captureException: vi.fn(),
      captureMessage: captureMessageSpy,
      addBreadcrumb: vi.fn(),
    }))
    const { createForecastReadService: createSvc } = await import(
      '@/lib/services/forecast-read-service'
    )
    const supabase = makeFreshSupabaseMock()
    const svc = createSvc(supabase as any)
    await svc.getMonthlyComposite('forecast-fresh-1')
    // No invariant_violation_logged should fire.
    expect(captureMessageSpy).not.toHaveBeenCalled()
  })
})
