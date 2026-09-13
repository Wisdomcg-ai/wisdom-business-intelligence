/**
 * The Full Year route tags every line with its expense group.
 *
 * The Full Year page printed Urban Road's 49 expense accounts as one flat run
 * while the Actual vs Budget page of the same pack printed them under nine
 * headings. The renderers group; the route's job is to put the group on every
 * line — Xero lines, forecast-only lines and approved-only lines alike — from
 * the same reader generate/route.ts uses, so the two pages cannot disagree
 * about which heading an account belongs under.
 *
 * Harness: the mock Supabase client from approved-budget-column.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mappingGroup } from '@/lib/monthly-report/expense-groups'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

let tables: Record<string, any[]> = {}

type FilterOp = 'eq' | 'in' | 'not-is' | 'neq' | 'lte' | 'gt'

function serviceClient() {
  const build = (
    table: string,
    filters: Array<[string, unknown, FilterOp]> = [],
    ordered: { col: string; ascending: boolean } | null = null,
  ): any => {
    const run = () => {
      let out = (tables[table] ?? []).filter((row) =>
        filters.every(([col, val, op]) =>
          op === 'in' ? Array.isArray(val) && val.includes(row[col])
          : op === 'not-is' ? (val === null ? row[col] != null : row[col] !== val)
          : op === 'neq' ? row[col] !== val
          : op === 'lte' ? row[col] != null && row[col] <= (val as never)
          : op === 'gt' ? row[col] != null && row[col] > (val as never)
          : row[col] === val,
        ),
      )
      if (ordered) {
        const { col, ascending } = ordered
        out = [...out].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] < b[col] ? -1 : 1) * (ascending ? 1 : -1)))
      }
      return out
    }
    const self: any = {
      select: () => self,
      eq: (col: string, val: unknown) => build(table, [...filters, [col, val, 'eq']], ordered),
      in: (col: string, val: unknown[]) => build(table, [...filters, [col, val, 'in']], ordered),
      not: (col: string, op: string, val: unknown) =>
        build(table, [...filters, [col, val, op === 'is' ? 'not-is' : 'neq']], ordered),
      lte: (col: string, val: unknown) => build(table, [...filters, [col, val, 'lte']], ordered),
      gt: (col: string, val: unknown) => build(table, [...filters, [col, val, 'gt']], ordered),
      order: (col: string, opts?: { ascending?: boolean }) =>
        build(table, filters, { col, ascending: opts?.ascending ?? true }),
      range: (from: number, to: number) => ({
        then: (resolve: any) => Promise.resolve({ data: run().slice(from, to + 1), error: null }).then(resolve),
      }),
      limit: (n: number) => ({
        maybeSingle: async () => ({ data: run().slice(0, n)[0] ?? null, error: null }),
        then: (resolve: any) => Promise.resolve({ data: run().slice(0, n), error: null }).then(resolve),
      }),
      single: async () => {
        const row = run()[0] ?? null
        return { data: row, error: row ? null : { message: 'not found' } }
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: run(), error: null }).then(resolve),
    }
    return self
  }
  return { from: (table: string) => build(table) }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => serviceClient()) }))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-key' }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  })),
}))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allow: true, reason: 'owner' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  SECTION_PERMISSION_ENFORCE: false,
  enforceSectionPermission: () => null,
}))

const BIZ = 'biz-0001'
const PROFILE = 'profile-0001'
const FY = 2027

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: BIZ, profileId: PROFILE, all: [BIZ, PROFILE] })),
}))

let compositeRows: any[] = []
vi.mock('@/lib/services/forecast-read-service', () => ({
  createForecastReadService: vi.fn(() => ({
    getMonthlyComposite: vi.fn(async () => ({ rows: compositeRows, data_quality: 'fresh', per_tenant_quality: [] })),
    getDataQualityForBusiness: vi.fn(async () => ({ data_quality: 'fresh', per_tenant_quality: [] })),
  })),
}))

// ── Fixtures: Urban Road's accounts and groups ──────────────────────────────

const ORDER = [
  'Employment Expense', 'Travel & Accommodation', 'Professional Expense',
  'IT Hardware and Software', 'Marketing and Advertising', 'Occupancy Expense',
  'Foreign Currency Gains and Losses', 'Bank and Other Fees', 'Other Operating Expenses',
]

const mapping = (name: string, code: string, group: string) => ({
  business_id: BIZ,
  xero_account_name: name,
  xero_account_code: code,
  report_category: 'Operating Expenses',
  report_subcategory: group,
})

const forecastLine = (id: string, code: string, name: string, months: Record<string, number>) => ({
  id, forecast_id: 'fc-1', account_code: code, account_name: name, category: 'Operating Expenses', forecast_months: months,
})

function urbanRoadTables() {
  return {
    monthly_report_settings: [{
      business_id: BIZ,
      budget_source: 'budget_version',
      budget_forecast_id: null,
      expense_group_order: ORDER,
    }],
    account_mappings: [
      mapping('Employ - Wages & Salaries', '62170', 'Employment Expense'),
      mapping('Memberships & Registrations', '64900', 'Bank and Other Fees'),
      mapping('Research & Development Samples', '64780', 'Other Operating Expenses'),
      mapping('Printing & Stationery', '65600', 'Other Operating Expenses'),
      // No row for Bank Revaluations (497) — as in prod.
    ],
    financial_forecasts: [{ id: 'fc-1', business_id: PROFILE, name: 'FY27 Forecast', is_active: true, fiscal_year: FY }],
    forecast_pl_lines: [
      forecastLine('f-wages', '62170', 'Employ - Wages & Salaries', { '2026-09': 42015 }),
      forecastLine('f-mem', '64900', 'Memberships & Registrations', { '2026-09': 225 }),
      // Forecast-only: no actuals this year.
      forecastLine('f-rd', '64780', 'Research & Development Samples', { '2026-09': 250, '2026-10': 250 }),
      // Forecast-only AND unmapped.
      forecastLine('f-reval', '497', 'Bank Revaluations', { '2026-09': 20, '2026-10': 20 }),
    ],
    business_profiles: [{ id: PROFILE, business_id: BIZ, fiscal_year_start: 7 }],
    budget_versions: [{
      id: 'v1', business_id: BIZ, fiscal_year: FY, label: 'Overall Budget', effective_from: '2026-07',
      version_number: 1, locked_at: '2026-09-09T00:00:00Z', tenant_id: 'tenant-a',
    }],
    budget_lines: [
      // Approved-only: no actuals, no forecast line, mapped by name.
      {
        id: 'bl-print', budget_version_id: 'v1', business_id: BIZ, account_code: '65600',
        account_name: 'Printing & Stationery', category: 'Operating Expenses', month: '2026-09', amount: 375,
      },
    ],
  } as Record<string, any[]>
}

async function fullYear() {
  const { POST } = await import('../route')
  const res = await POST(
    new Request('http://localhost/api/monthly-report/full-year', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BIZ, fiscal_year: FY, report_month: '2026-08' }),
    }) as any,
  )
  return { status: res.status, body: (await res.json()) as any }
}

const opex = (body: any) => (body.report?.sections ?? []).find((s: any) => s.category === 'Operating Expenses')
const lineNamed = (body: any, name: string) => opex(body).lines.find((l: any) => l.account_name === name)

describe('full-year — every line carries its expense group', () => {
  beforeEach(() => {
    compositeRows = [
      { account_code: '62170', account_name: 'Employ - Wages & Salaries', account_type: 'opex', section: '', monthly_values: { '2026-07': 42015.40, '2026-08': 52519.25 } },
      { account_code: '64900', account_name: 'Memberships & Registrations', account_type: 'opex', section: '', monthly_values: { '2026-07': 188.28, '2026-08': 376.55 } },
    ]
    tables = urbanRoadTables()
  })

  it('a Xero line takes the group its mapping names', async () => {
    const { status, body } = await fullYear()
    expect(status).toBe(200)
    expect(lineNamed(body, 'Employ - Wages & Salaries').group).toBe('Employment Expense')
    // Where the Actual vs Budget page puts it — and where Calxa's Full Year page does not.
    expect(lineNamed(body, 'Memberships & Registrations').group).toBe('Bank and Other Fees')
  })

  it('a forecast-only line takes the group of the mapping its name resolves to', async () => {
    const { body } = await fullYear()
    const rd = lineNamed(body, 'Research & Development Samples')
    expect(rd).toBeTruthy()
    expect(rd.group).toBe('Other Operating Expenses')
  })

  it('an approved-only line takes its group the same way', async () => {
    const { body } = await fullYear()
    const printing = lineNamed(body, 'Printing & Stationery')
    expect(printing).toBeTruthy()
    expect(printing.projected_total).toBe(0)
    expect(printing.approved_annual_budget).toBe(375)
    expect(printing.group).toBe('Other Operating Expenses')
  })

  it('an unmapped forecast-only line has no group — null, not a guess', async () => {
    const { body } = await fullYear()
    expect(lineNamed(body, 'Bank Revaluations').group).toBeNull()
  })

  it('leaves the section total and the line order exactly as they were', async () => {
    const { body } = await fullYear()
    const section = opex(body)
    const sum = section.lines.reduce((s: number, l: any) => s + l.projected_total, 0)
    expect(section.subtotal.projected_total).toBeCloseTo(sum, 6)
    // Still flat, still code order compared as text — grouping is the renderers'.
    // Bank Revaluations' forecast code 497 is vouched for by no actuals or
    // mapping here, so it sorts with the codeless tail (statement-order.ts).
    expect(section.lines.map((l: any) => [l.account_code, l.account_name])).toEqual([
      ['62170', 'Employ - Wages & Salaries'],
      ['64780', 'Research & Development Samples'],
      ['64900', 'Memberships & Registrations'],
      ['65600', 'Printing & Stationery'],
      [null, 'Bank Revaluations'],
    ])
    expect(section.subtotal.group).toBeUndefined()
  })

  it('emits the coach heading order for a renderer holding only this payload', async () => {
    const { body } = await fullYear()
    expect(body.report.expense_group_order).toEqual(ORDER)
  })

  it('emits null heading order for a client that has not set one', async () => {
    tables.monthly_report_settings = [{ business_id: BIZ, budget_source: 'forecast', budget_forecast_id: null }]
    const { body } = await fullYear()
    expect(body.report.expense_group_order).toBeNull()
  })
})

describe('mappingGroup is the one reader of report_subcategory', () => {
  it('reads the mapping, and says null for no mapping', () => {
    expect(mappingGroup({ report_subcategory: 'Bank and Other Fees' })).toBe('Bank and Other Fees')
    expect(mappingGroup({ report_subcategory: null })).toBeNull()
    expect(mappingGroup(undefined)).toBeNull()
    expect(mappingGroup(new Map<string, any>().get('Bank Revaluations'))).toBeNull()
  })

  it('both statement routes use it and neither reads the column directly', () => {
    // The two pages agree only while both routes take the group from the same
    // place. A route that reads report_subcategory inline is the first step to
    // an account printing under one heading on one page and another heading on
    // the next — which is exactly the Calxa inconsistency we chose not to copy.
    for (const route of ['generate', 'full-year']) {
      const src = readFileSync(join(process.cwd(), 'src/app/api/monthly-report', route, 'route.ts'), 'utf8')
      expect(src, route).toContain("import { mappingGroup } from '@/lib/monthly-report/expense-groups'")
      expect(src, route).not.toMatch(/report_subcategory/)
      expect(src.match(/group: mappingGroup\(/g)?.length ?? 0, route).toBeGreaterThanOrEqual(2)
    }
  })
})
