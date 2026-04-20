/**
 * Integration tests for POST /api/monthly-report/consolidated.
 *
 * Phase 34.3 — verifies the route returns the extended shape with per-tenant
 * and consolidated budgets, plus `tenants_with_budget` / `tenants_without_budget`
 * diagnostics.
 *
 * Same mock-shape pattern as consolidated-bs/route.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@supabase/supabase-js', () => {
  const proxy = {
    from: (table: string) => currentServiceMock.from(table),
  }
  return { createClient: vi.fn(() => proxy) }
})
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => currentAuthMock),
}))
vi.mock('@/lib/utils/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  createRateLimitKey: vi.fn((prefix: string, id: string) => `${prefix}:${id}`),
  RATE_LIMIT_CONFIGS: { report: {} },
}))
vi.mock('@/lib/utils/resolve-business-ids', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return actual
})

let currentServiceMock: any = { from: () => ({}) }
let currentAuthMock: any = {}

function setServiceMock(mock: any) {
  currentServiceMock = mock
}
function setAuthMock(mock: any) {
  currentAuthMock = mock
}

function mockSupabase(rowsByTable: Record<string, any[]>) {
  const matchAll = (rows: any[], filters: Array<[string, unknown, 'eq' | 'in']>) => {
    return rows.filter((r) =>
      filters.every(([col, val, op]) => {
        if (op === 'eq') return r[col] === val
        if (op === 'in') return Array.isArray(val) && (val as unknown[]).includes(r[col])
        return false
      }),
    )
  }
  const buildQuery = (
    table: string,
    filters: Array<[string, unknown, 'eq' | 'in']> = [],
    ordered: { col: string; ascending: boolean } | null = null,
  ): any => {
    const rows = rowsByTable[table] ?? []
    const ex = () => {
      let out = matchAll(rows, filters)
      if (ordered) {
        const col = ordered.col
        out = [...out].sort((a, b) => {
          const av = a[col]
          const bv = b[col]
          if (av === bv) return 0
          return (av < bv ? -1 : 1) * (ordered.ascending ? 1 : -1)
        })
      }
      return out
    }
    return {
      eq: (col: string, val: unknown) => buildQuery(table, [...filters, [col, val, 'eq']], ordered),
      in: (col: string, val: unknown[]) => buildQuery(table, [...filters, [col, val, 'in']], ordered),
      order: (col: string, opts?: { ascending?: boolean }) =>
        buildQuery(table, filters, { col, ascending: opts?.ascending ?? true }),
      limit: (n: number) =>
        Promise.resolve({ data: ex().slice(0, n), error: null }),
      single: () =>
        Promise.resolve({ data: ex()[0] ?? null, error: ex()[0] ? null : { message: 'not found' } }),
      maybeSingle: () => Promise.resolve({ data: ex()[0] ?? null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: ex(), error: null }).then(resolve),
    }
  }
  return {
    from: (table: string) => ({ select: (_cols: string) => buildQuery(table) }),
  }
}

function mockAuthClient(userId: string, businessId: string, isSuperAdmin = false) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'businesses') {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                maybeSingle: async () => ({
                  data: { id: businessId },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'system_roles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: isSuperAdmin ? { role: 'super_admin' } : null,
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }
    },
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BIZ = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const T_A = 'tenant-a'
const T_B = 'tenant-b'

const plLines = [
  { business_id: BIZ, tenant_id: T_A, account_name: 'Sales', account_code: null, account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-03': 20000 } },
  { business_id: BIZ, tenant_id: T_A, account_name: 'Rent', account_code: null, account_type: 'opex', section: 'Operating Expenses', monthly_values: { '2026-03': 3000 } },
  { business_id: BIZ, tenant_id: T_B, account_name: 'Sales', account_code: null, account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-03': 30000 } },
  { business_id: BIZ, tenant_id: T_B, account_name: 'Rent', account_code: null, account_type: 'opex', section: 'Operating Expenses', monthly_values: { '2026-03': 4000 } },
]

const forecastIdA = 'forecast-a'
const forecastIdB = 'forecast-b'

function buildState(opts: { withBudgetA: boolean; withBudgetB: boolean }) {
  const forecasts: any[] = []
  const forecastPlLines: any[] = []
  if (opts.withBudgetA) {
    forecasts.push({
      id: forecastIdA,
      business_id: BIZ,
      tenant_id: T_A,
      fiscal_year: 2026,
      updated_at: '2026-04-01T00:00:00Z',
    })
    forecastPlLines.push(
      { forecast_id: forecastIdA, account_name: 'Sales', account_type: 'revenue', account_class: null, category: null, actual_months: {}, forecast_months: { '2026-03': 25000 } },
      { forecast_id: forecastIdA, account_name: 'Rent', account_type: 'opex', account_class: null, category: null, actual_months: {}, forecast_months: { '2026-03': 3500 } },
    )
  }
  if (opts.withBudgetB) {
    forecasts.push({
      id: forecastIdB,
      business_id: BIZ,
      tenant_id: T_B,
      fiscal_year: 2026,
      updated_at: '2026-04-01T00:00:00Z',
    })
    forecastPlLines.push(
      { forecast_id: forecastIdB, account_name: 'Sales', account_type: 'revenue', account_class: null, category: null, actual_months: {}, forecast_months: { '2026-03': 28000 } },
    )
  }
  return {
    businesses: [{ id: BIZ, name: 'Test Group' }],
    business_profiles: [{ id: BIZ, business_id: BIZ, fiscal_year_start: 7 }],
    xero_connections: [
      { id: 'c-a', business_id: BIZ, tenant_id: T_A, tenant_name: 'Tenant A', display_name: 'Tenant A', display_order: 0, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      { id: 'c-b', business_id: BIZ, tenant_id: T_B, tenant_name: 'Tenant B', display_name: 'Tenant B', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
    ],
    xero_pl_lines: plLines,
    consolidation_elimination_rules: [],
    financial_forecasts: forecasts,
    forecast_pl_lines: forecastPlLines,
    fx_rates: [],
  }
}

async function invokeRoute(body: unknown) {
  const { POST } = await import('./route')
  const req = new Request('http://localhost/api/monthly-report/consolidated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await POST(req as any)
  return {
    status: res.status,
    json: (await res.json()) as any,
  }
}

describe('POST /api/monthly-report/consolidated — Phase 34.3 budgets', () => {
  beforeEach(() => {
    setAuthMock(mockAuthClient('user-1', BIZ, false))
  })

  it('returns per-tenant + consolidated budget when both tenants have forecasts', async () => {
    setServiceMock(mockSupabase(buildState({ withBudgetA: true, withBudgetB: true })))
    const { status, json } = await invokeRoute({
      business_id: BIZ,
      report_month: '2026-03',
      fiscal_year: 2026,
    })
    expect(status).toBe(200)
    const report = json.report

    // Both tenants have budgetLines
    expect(report.byTenant.length).toBe(2)
    for (const col of report.byTenant) {
      expect(Array.isArray(col.budgetLines)).toBe(true)
    }

    // Consolidated budget for Sales: 25000 (A) + 28000 (B) = 53000
    const salesBudget = report.consolidated.budgetLines.find(
      (l: any) => l.account_name === 'Sales',
    )
    expect(salesBudget).toBeDefined()
    expect(salesBudget.monthly_values['2026-03']).toBe(53000)

    // Consolidated budget for Rent: 3500 (A only, B has no rent budget) = 3500
    const rentBudget = report.consolidated.budgetLines.find(
      (l: any) => l.account_name === 'Rent',
    )
    expect(rentBudget.monthly_values['2026-03']).toBe(3500)

    // Diagnostics
    expect(report.diagnostics.tenants_with_budget).toBe(2)
    expect(report.diagnostics.tenants_without_budget).toEqual([])
  })

  it('records missing-budget tenants in diagnostics, returns zero summed budget', async () => {
    setServiceMock(mockSupabase(buildState({ withBudgetA: false, withBudgetB: false })))
    const { status, json } = await invokeRoute({
      business_id: BIZ,
      report_month: '2026-03',
      fiscal_year: 2026,
    })
    expect(status).toBe(200)
    const report = json.report

    expect(report.diagnostics.tenants_with_budget).toBe(0)
    // Both tenant_ids in the without-budget list
    expect(report.diagnostics.tenants_without_budget).toHaveLength(2)
    expect(report.diagnostics.tenants_without_budget).toEqual(
      expect.arrayContaining([T_A, T_B]),
    )
    // byTenant columns exist but without budgetLines
    for (const col of report.byTenant) {
      expect(col.budgetLines).toBeUndefined()
    }
    // Consolidated budget sums to zero for every row
    for (const row of report.consolidated.budgetLines) {
      expect(row.monthly_values['2026-03']).toBe(0)
    }
  })

  it('mixes budgeted + unbudgeted tenants correctly', async () => {
    setServiceMock(mockSupabase(buildState({ withBudgetA: true, withBudgetB: false })))
    const { status, json } = await invokeRoute({
      business_id: BIZ,
      report_month: '2026-03',
      fiscal_year: 2026,
    })
    expect(status).toBe(200)
    const report = json.report

    expect(report.diagnostics.tenants_with_budget).toBe(1)
    expect(report.diagnostics.tenants_without_budget).toEqual([T_B])

    // Consolidated budget for Sales: 25000 (A) + 0 (B) = 25000
    const salesBudget = report.consolidated.budgetLines.find(
      (l: any) => l.account_name === 'Sales',
    )
    expect(salesBudget.monthly_values['2026-03']).toBe(25000)

    // Tenant A column has budgetLines, Tenant B does not
    const colA = report.byTenant.find((c: any) => c.tenant_id === T_A)
    const colB = report.byTenant.find((c: any) => c.tenant_id === T_B)
    expect(colA.budgetLines).toBeDefined()
    expect(colB.budgetLines).toBeUndefined()
  })

  it('preserves actuals shape (lines still present alongside budgetLines)', async () => {
    setServiceMock(mockSupabase(buildState({ withBudgetA: true, withBudgetB: true })))
    const { status, json } = await invokeRoute({
      business_id: BIZ,
      report_month: '2026-03',
      fiscal_year: 2026,
    })
    expect(status).toBe(200)
    const report = json.report

    // Consolidated actuals sum: Sales = 20000 + 30000 = 50000
    const salesActual = report.consolidated.lines.find(
      (l: any) => l.account_name === 'Sales',
    )
    expect(salesActual.monthly_values['2026-03']).toBe(50000)

    // Budget column still present
    expect(report.consolidated.budgetLines.length).toBeGreaterThan(0)
  })
})
