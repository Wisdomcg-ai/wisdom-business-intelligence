/**
 * FX account split — what the Actual vs Budget statement prints, Urban Road
 * August 2026.
 *
 * The sync change needs NO reader change: the three system accounts arrive as
 * ordinary coded rows and group through account_mappings like any account. This
 * suite proves that on the generate route with Urban Road's real Aug figures.
 *
 * Real (prod + Xero, 14 Sep 2026): the merged row 238.61 / 919.25; the per-
 * account movements 76.93/(124.09)/285.77 and 96.72/484.27/338.26; the group
 * subtotals before the split (Bank and Other Fees 6,853.99 / 5,055.21; Other
 * Operating 35,473.17 / 36,543.40); Total Expense Aug 162,234.55; the 62700
 * budget of $2 a month; mappings (497 → Bank and Other Fees under decision 6,
 * the merged row's mapping carrying code 62700).
 *
 * CONSTRUCTED: each group's non-FX accounts are ONE residual row carrying the
 * group's real before-split subtotal, and the rest of Operating Expenses is
 * one residual row making Aug Total Expense 162,234.55. They stand in for ~80
 * accounts whose individual lines are irrelevant to the split.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureMessage, captureException: vi.fn() }))

let tables: Record<string, any[]> = {}

type FilterOp = 'eq' | 'in' | 'not-is' | 'neq' | 'lte' | 'gt'

/** The budget-resolution characterisation harness, verbatim in behaviour. */
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
      limit: (n: number) => {
        const capped = () => run().slice(0, n)
        return {
          maybeSingle: async () => ({ data: capped()[0] ?? null, error: null }),
          single: async () => ({ data: capped()[0] ?? null, error: capped()[0] ? null : { message: 'not found' } }),
          then: (resolve: any) => Promise.resolve({ data: capped(), error: null }).then(resolve),
        }
      },
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
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  })),
}))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/utils/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  createRateLimitKey: vi.fn((p: string, id: string) => `${p}:${id}`),
  RATE_LIMIT_CONFIGS: { report: {} },
}))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allow: true, reason: 'owner' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  SECTION_PERMISSION_ENFORCE: false,
  enforceSectionPermission: () => null,
}))

let compositeRows: any[] = []
vi.mock('@/lib/services/forecast-read-service', () => ({
  createForecastReadService: vi.fn(() => ({
    getMonthlyComposite: vi.fn(async () => ({ rows: compositeRows, data_quality: 'fresh', per_tenant_quality: [] })),
    getDataQualityForBusiness: vi.fn(async () => ({ data_quality: 'fresh', per_tenant_quality: [] })),
  })),
}))

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: BIZ, profileId: PROFILE, all: [BIZ, PROFILE] })),
}))

const USER = 'user-0001'
const BIZ = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const PROFILE = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'

const FX_GROUP = 'Foreign Currency Gains and Losses'
const BOF = 'Bank and Other Fees'
const OOE = 'Other Operating Expenses'
const REST = 'Everything else (constructed)'

const mapping = (name: string, code: string | null, sub: string | null) => ({
  id: `map-${name}`,
  business_id: BIZ,
  xero_account_name: name,
  xero_account_code: code,
  report_category: 'Operating Expenses',
  report_subcategory: sub,
  is_confirmed: true,
  forecast_pl_line_id: null,
  forecast_pl_line_name: null,
})

const actual = (code: string | null, name: string, jul: number, aug: number) => ({
  account_code: code,
  account_name: name,
  account_type: 'opex',
  monthly_values: { '2026-07': jul, '2026-08': aug },
})

const budgetLine = (id: string, code: string | null, name: string, month: string, amount: number) => ({
  id,
  budget_version_id: 'v1',
  business_id: BIZ,
  account_code: code,
  account_name: name,
  category: 'Operating Expenses',
  month,
  amount,
})

/** Mappings common to both states: the constructed residual rows + 497 (decision 6). */
const baseMappings = [
  mapping('Bank and Other Fees — other accounts (constructed)', 'BOF-REST', BOF),
  mapping('Other Operating — other accounts (constructed)', 'OOE-REST', OOE),
  mapping('Operating — rest (constructed)', 'REST', REST),
  mapping('Bank Revaluations', '497', BOF),
]
const residualRows = [
  actual('BOF-REST', 'Bank and Other Fees — other accounts (constructed)', 6853.99, 5055.21),
  actual('OOE-REST', 'Other Operating — other accounts (constructed)', 35473.17, 36543.4),
  // Aug: 162,234.55 − (5,055.21 + 36,543.40 + 919.25) = 119,716.69.
  actual('REST', 'Operating — rest (constructed)', 121030.23, 119716.69),
]
const budgets = [
  budgetLine('b-62700-jul', '62700', 'Foreign Currency Loss/Gain', '2026-07', 2),
  budgetLine('b-62700-aug', '62700', 'Foreign Currency Loss/Gain', '2026-08', 2),
  budgetLine('b-497-jul', '497', 'Bank Revaluations', '2026-07', 20),
  budgetLine('b-497-aug', '497', 'Bank Revaluations', '2026-08', 20),
]

function tablesWith(mappings: any[]) {
  return {
    business_profiles: [{ id: PROFILE, business_id: BIZ, fiscal_year_start: 7 }],
    monthly_report_settings: [{ business_id: BIZ, budget_source: 'budget_version', sections: { fx_account_split: true } }],
    account_mappings: mappings,
    financial_forecasts: [{ id: 'active', name: 'Actuals routing', fiscal_year: 2027, is_active: true, business_id: PROFILE, created_at: '2026-01-01T00:00:00Z' }],
    forecast_pl_lines: [],
    xero_pl_lines_wide_compat: [],
    monthly_report_snapshots: [],
    budget_versions: [{ id: 'v1', business_id: BIZ, fiscal_year: 2027, label: 'Overall Budget', effective_from: '2026-07', version_number: 1, locked_at: '2026-09-09T00:00:00Z' }],
    budget_lines: budgets,
  } as Record<string, any[]>
}

async function generate() {
  const { POST } = await import('../route')
  const res = await POST(
    new Request('http://localhost/api/monthly-report/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BIZ, report_month: '2026-08', fiscal_year: 2027 }),
    }) as any,
  )
  expect(res.status).toBe(200)
  return ((await res.json()) as any).report
}

const round2 = (n: number) => Math.round(n * 100) / 100

function opex(report: any) {
  return report.sections.find((s: any) => s.category === 'Operating Expenses')
}
function groupTotals(report: any, group: string) {
  const lines = opex(report).lines.filter((l: any) => l.group === group)
  return {
    lines,
    actual: round2(lines.reduce((s: number, l: any) => s + l.actual, 0)),
    budget: round2(lines.reduce((s: number, l: any) => s + l.budget, 0)),
    ytd_actual: round2(lines.reduce((s: number, l: any) => s + l.ytd_actual, 0)),
    ytd_budget: round2(lines.reduce((s: number, l: any) => s + l.ytd_budget, 0)),
  }
}

describe('generate — Urban Road Aug 2026 with the FX account split', () => {
  beforeEach(() => {
    captureMessage.mockClear()
  })

  it('BEFORE (today): the merged row borrows 62700 from its mapping and prints 2 / 919 / (917)', async () => {
    compositeRows = [...residualRows, actual(null, FX_GROUP, 238.61, 919.25)]
    tables = tablesWith([...baseMappings, mapping(FX_GROUP, '62700', FX_GROUP)])
    const report = await generate()
    const fx = groupTotals(report, FX_GROUP)
    expect(fx.lines).toHaveLength(1)
    expect([fx.budget, fx.actual]).toEqual([2, 919.25])
    expect(round2(fx.lines[0].variance_amount)).toBe(-917.25)
    expect(groupTotals(report, BOF).actual).toBe(5055.21)
    expect(groupTotals(report, OOE).actual).toBe(36543.4)
    expect(round2(opex(report).subtotal.actual)).toBe(162234.55)
  })

  it('AFTER (split rows + the new mappings): Calxa p16-17 — FX 2 / 0 / 2, Bank and Other Fees 5,151.93, Other Operating 37,365.93', async () => {
    compositeRows = [
      ...residualRows,
      actual('497', 'Bank Revaluations', 76.93, 96.72),
      actual('498', 'Unrealised Currency Gains', -124.09, 484.27),
      actual('499', 'Realised Currency Gains', 285.77, 338.26),
    ]
    tables = tablesWith([
      ...baseMappings,
      // The data changes (i): 62700 names its group; 498/499 under Other Operating.
      mapping('Foreign Currency Loss/Gain', '62700', FX_GROUP),
      mapping('Unrealised Currency Gains', '498', OOE),
      mapping('Realised Currency Gains', '499', OOE),
      // (iii): the merged row's mapping, code nulled.
      mapping(FX_GROUP, null, FX_GROUP),
    ])
    const report = await generate()

    const fx = groupTotals(report, FX_GROUP)
    expect(fx.lines.map((l: any) => [l.account_name, l.is_budget_only])).toEqual([['Foreign Currency Loss/Gain', true]])
    expect([fx.budget, fx.actual, round2(fx.budget - fx.actual)]).toEqual([2, 0, 2])
    expect([fx.ytd_budget, fx.ytd_actual]).toEqual([4, 0])

    const bof = groupTotals(report, BOF)
    expect(bof.actual).toBe(5151.93)
    expect(bof.ytd_actual).toBe(round2(6930.92 + 5151.93))
    const reval = bof.lines.find((l: any) => l.account_name === 'Bank Revaluations')
    expect([reval.actual, reval.budget, reval.account_code]).toEqual([96.72, 20, '497'])

    const ooe = groupTotals(report, OOE)
    expect(ooe.actual).toBe(37365.93)
    expect(ooe.ytd_actual).toBe(round2(35634.85 + 37365.93))

    // Per-account YTDs print 174 / 360 / 624 as Calxa p10.
    const ytd = (name: string) => opex(report).lines.find((l: any) => l.account_name === name).ytd_actual
    expect([ytd('Bank Revaluations'), ytd('Unrealised Currency Gains'), ytd('Realised Currency Gains')].map((v) => round2(v)))
      .toEqual([173.65, 360.18, 624.03])

    // The three groups move money between each other, never in or out.
    expect(round2(fx.actual + bof.actual + ooe.actual)).toBe(42517.86)
    expect(round2(opex(report).subtotal.actual)).toBe(162234.55)
  })

  it('a FALLBACK month (merged row kept) with the mapping code nulled: no longer bound to the $2 budget', async () => {
    compositeRows = [...residualRows, actual(null, FX_GROUP, 238.61, 919.25)]
    tables = tablesWith([
      ...baseMappings,
      mapping('Foreign Currency Loss/Gain', '62700', FX_GROUP),
      mapping('Unrealised Currency Gains', '498', OOE),
      mapping('Realised Currency Gains', '499', OOE),
      mapping(FX_GROUP, null, FX_GROUP),
    ])
    const report = await generate()
    const fx = groupTotals(report, FX_GROUP)
    const merged = fx.lines.find((l: any) => l.account_name === FX_GROUP)
    const lossGain = fx.lines.find((l: any) => l.account_name === 'Foreign Currency Loss/Gain')
    // Two honest rows under one heading instead of one false one.
    expect([merged.actual, merged.budget]).toEqual([919.25, 0])
    expect([lossGain.actual, lossGain.budget, lossGain.is_budget_only]).toEqual([0, 2, true])
    expect([fx.budget, fx.actual]).toEqual([2, 919.25])
    expect(round2(opex(report).subtotal.actual)).toBe(162234.55)
  })
})
