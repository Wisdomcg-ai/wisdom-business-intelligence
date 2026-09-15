/**
 * A coach generates and exports a consolidated pack — the path Generate and
 * Export take on a consolidation parent, end to end:
 *
 *   POST /api/monthly-report/consolidated (the exported handler, as a coach)
 *     → adaptConsolidatedToGeneratedReport (what useMonthlyReport puts on screen)
 *     → MonthlyReportPDFService.generate() (what Export PDF saves)
 *
 * IICT Group: three orgs, one of them HKD, with the month's rates stored. The
 * pack prints Calxa's August Total Income row with IICT Group Limited's HKD
 * translated, not added in one-for-one.
 *
 * Dragon Roofing & Easy Hail: two AUD orgs. The summary page prints Calxa's
 * nine columns — it printed six, because the adapter replaced the business's
 * settings with a stub that switched off Unspent Budget, Budget Next Month and
 * Budget Annual Total (IICT-12, DRG-05).
 *
 * Figures are Calxa's August 2026 packs (IICT p2 and p6, Dragon p2). Budgets
 * come through a business-level forecast here only so the budget columns have
 * something to print; where the real budget comes from is package P5.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adaptConsolidatedToGeneratedReport } from '@/app/finances/monthly-report/hooks/useMonthlyReport'
import { MonthlyReportPDFService } from '@/app/finances/monthly-report/services/monthly-report-pdf-service'
import { textRuns, pageContaining } from '@/app/finances/monthly-report/services/__tests__/pdf-pack-fixture'
import type { PDFLayout } from '@/app/finances/monthly-report/types/pdf-layout'

vi.mock('@supabase/supabase-js', () => {
  const proxy = { from: (table: string) => currentServiceMock.from(table) }
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

let currentServiceMock: any = { from: () => ({}) }
let currentAuthMock: any = {}

type Op = 'eq' | 'in' | 'is'

/** Service-role client over in-memory tables (the consolidated route.test.ts shape). */
function mockSupabase(rowsByTable: Record<string, any[]>) {
  const matchAll = (rows: any[], filters: Array<[string, unknown, Op]>) =>
    rows.filter((r) =>
      filters.every(([col, val, op]) => {
        const cell = r[col]
        if (op === 'eq') return cell === val
        if (op === 'in') return Array.isArray(val) && (val as unknown[]).includes(cell)
        return val === null ? cell === null || cell === undefined : cell === val
      }),
    )
  const buildQuery = (table: string, filters: Array<[string, unknown, Op]> = []): any => {
    const ex = () => matchAll(rowsByTable[table] ?? [], filters)
    return {
      eq: (col: string, val: unknown) => buildQuery(table, [...filters, [col, val, 'eq']]),
      in: (col: string, val: unknown[]) => buildQuery(table, [...filters, [col, val, 'in']]),
      is: (col: string, val: unknown) => buildQuery(table, [...filters, [col, val, 'is']]),
      order: () => buildQuery(table, filters),
      limit: (n: number) => Promise.resolve({ data: ex().slice(0, n), error: null }),
      single: () => Promise.resolve({ data: ex()[0] ?? null, error: ex()[0] ? null : { message: 'not found' } }),
      maybeSingle: () => Promise.resolve({ data: ex()[0] ?? null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: ex(), error: null }).then(resolve),
    }
  }
  return { from: (table: string) => ({ select: () => buildQuery(table) }) }
}

function chainable(data: any): any {
  const chain: any = {
    eq: () => chain,
    or: () => chain,
    in: () => chain,
    is: () => chain,
    order: () => chain,
    limit: (n: number) => Promise.resolve({ data: data ? [data].slice(0, n) : [], error: null }),
    maybeSingle: async () => ({ data, error: null }),
    single: async () => ({ data, error: data ? null : { message: 'not found' } }),
    then: (resolve: any) => Promise.resolve({ data: data ? [data] : [], error: null }).then(resolve),
  }
  return chain
}

/** A coach assigned to the business. */
function coachAuthClient(businessId: string) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'businesses') return { select: () => chainable({ id: businessId }) }
      if (table === 'system_roles') return { select: () => chainable({ role: 'coach' }) }
      return { select: () => chainable(null) }
    },
  }
}

const FY_MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
]

/** Monthly budget from the month, next month and the rest of the year. */
function budgetMonths(jul: number, aug: number, sep: number, octToMay: number, jun: number) {
  const out: Record<string, number> = { '2026-07': jul, '2026-08': aug, '2026-09': sep, '2027-06': jun }
  for (const m of FY_MONTHS.slice(3, 11)) out[m] = octToMay
  return out
}

/** The layout a Calxa-order pack places: the summary, then the per-entity page. */
const LAYOUT: PDFLayout = {
  version: 1,
  pages: [
    { id: 'summary', orientation: 'landscape', widgets: [{ id: 's', type: 'executive_summary', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
    { id: 'entities', orientation: 'landscape', widgets: [{ id: 'c', type: 'consolidated_pl', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
  ],
}

async function generateAsCoach(businessId: string) {
  const { POST } = await import('../route')
  const req = new Request('http://localhost/api/monthly-report/consolidated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_id: businessId, report_month: '2026-08', fiscal_year: 2027 }),
  })
  const res = await POST(req as any)
  return { status: res.status, json: (await res.json()) as any }
}

/** The runs that follow a row's label on the summary page: its nine figures. */
function rowFigures(runs: string[], label: string, count = 9): string[] {
  const at = runs.indexOf(label)
  expect(at).toBeGreaterThanOrEqual(0)
  return runs.slice(at + 1, at + 1 + count)
}

// ─── IICT Group ──────────────────────────────────────────────────────────────

const IICT = 'fbc6dffd-677d-47ec-8277-7157982938e7'
const IICT_PROFILE = 'iict-profile'
const IAP = 'tenant-iap'
const IGL = 'tenant-igl'
const IGP = 'tenant-igp'

/** IICT's stored settings row (audit 15-settings): every column switch on. */
const IICT_SETTINGS = {
  id: 'settings-iict',
  business_id: IICT,
  sections: { revenue_detail: true, cogs_detail: true, opex_detail: true, subscription_detail: true },
  show_prior_year: true,
  show_ytd: true,
  show_unspent_budget: true,
  show_budget_next_month: true,
  show_budget_annual_total: true,
  budget_forecast_id: null,
  budget_source: 'forecast',
  subscription_account_codes: ['418'],
  standing_commentary: null,
  expense_group_order: null,
  pdf_layout: null,
}

function iictState() {
  return {
    businesses: [{ id: IICT, name: 'IICT Group Consolidated', consolidation_budget_mode: 'single' }],
    business_profiles: [{ id: IICT_PROFILE, business_id: IICT, fiscal_year_start: 7 }],
    xero_connections: [
      { id: 'c-iap', business_id: IICT, tenant_id: IAP, tenant_name: 'IICT (Aust) Pty Ltd', display_name: 'IICT (Aust) Pty Ltd', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      { id: 'c-igl', business_id: IICT, tenant_id: IGL, tenant_name: 'IICT Group Limited', display_name: 'IICT Group Limited', display_order: 2, functional_currency: 'HKD', include_in_consolidation: true, is_active: true },
      { id: 'c-igp', business_id: IICT, tenant_id: IGP, tenant_name: 'IICT Group Pty Ltd', display_name: 'IICT Group Pty Ltd', display_order: 3, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
    ],
    xero_pl_lines_wide_compat: [
      { business_id: IICT_PROFILE, tenant_id: IAP, account_name: 'Commissions Received', account_code: '260', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-07': 31_707.37, '2026-08': 32_455 } },
      // HKD, as IICT Group Limited's Xero holds it (v2-pl: Aug 1,628,444.86).
      { business_id: IICT_PROFILE, tenant_id: IGL, account_name: 'Membership income', account_code: '200', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-07': 2_066_024.18, '2026-08': 1_628_444.86 } },
      { business_id: IICT_PROFILE, tenant_id: IGP, account_name: 'Membership income', account_code: '200', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-08': 62 } },
    ],
    // Every FY month has its rate: Calxa's implied Jul and Aug averages.
    fx_rates: FY_MONTHS.map((m) => ({
      currency_pair: 'HKD/AUD',
      rate_type: 'monthly_average',
      period: `${m}-01`,
      rate: m === '2026-07' ? 0.183094 : m === '2026-08' ? 0.179536 : 0.18,
      source: 'oxr',
    })),
    financial_forecasts: [{ id: 'fc-iict', business_id: IICT_PROFILE, tenant_id: null, fiscal_year: 2027, is_active: true, updated_at: '2026-09-01T00:00:00Z' }],
    // Calxa p2: 314,012 month, 616,219 YTD, 304,636 next month, 3,982,720 annual.
    forecast_pl_lines: [
      { forecast_id: 'fc-iict', account_name: 'Membership income', account_type: 'revenue', account_class: null, category: null, actual_months: {}, forecast_months: budgetMonths(302_207, 314_012, 304_636, 340_207, 340_209) },
    ],
    consolidation_elimination_rules: [],
    monthly_report_settings: [IICT_SETTINGS],
  }
}

describe('IICT Group — a coach generates and exports the consolidated pack (3 orgs, HKD, rates stored)', () => {
  beforeEach(() => {
    setup(IICT, iictState())
  })

  it("the route serves the translated consolidation and the business's own settings", async () => {
    const { status, json } = await generateAsCoach(IICT)
    expect(status).toBe(200)
    expect(json.report.fx_context.missing_rates).toEqual([])
    expect(json.settings).toMatchObject({
      business_id: IICT,
      show_ytd: true,
      show_unspent_budget: true,
      show_budget_next_month: true,
      show_budget_annual_total: true,
      show_prior_year: true,
      subscription_account_codes: ['418'],
    })
    const igl = json.report.byTenant.find((t: any) => t.tenant_id === IGL)
    const membership = igl.lines.find((l: any) => l.account_name === 'Membership income')
    expect(membership.monthly_values['2026-08']).toBeCloseTo(292_364.48, 1)
  })

  it("the exported summary prints Calxa's nine columns and August Total Income row", async () => {
    const { json } = await generateAsCoach(IICT)
    const report = adaptConsolidatedToGeneratedReport(json.report, '2026-08', 2027, IICT, { settings: json.settings })
    expect(report.settings.show_unspent_budget).toBe(true)

    const doc: any = new MonthlyReportPDFService(report, {
      pdfLayout: LAYOUT,
      consolidated: json.report,
      entityName: 'IICT Group Consolidated',
    }).generate()
    const runs = textRuns(doc, 1)
    for (const header of ['Budgets', 'Actual', 'Variance', 'YTD Budget', 'YTD Actuals', 'Unspent', 'Next Month', 'Annual Total']) {
      expect(runs).toContain(header)
    }
    // Calxa IICT p2: 314,012 | 324,881 | 10,869 | 616,219 | 734,865 | 118,646 | 3,247,855 | 304,636 | 3,982,720
    expect(rowFigures(runs, 'Total Income')).toEqual([
      '314,012', '324,881', '10,869', '616,219', '734,865', '118,646', '3,247,855', '304,636', '3,982,720',
    ])
  })

  it('the per-entity page prints IICT Group Limited in AUD — 292,364, not 1,628,445', async () => {
    const { json } = await generateAsCoach(IICT)
    const report = adaptConsolidatedToGeneratedReport(json.report, '2026-08', 2027, IICT, { settings: json.settings })
    const doc: any = new MonthlyReportPDFService(report, { pdfLayout: LAYOUT, consolidated: json.report }).generate()
    const page = pageContaining(doc, 'IICT Group Limited')
    expect(page).toBeGreaterThan(0)
    const runs = textRuns(doc, page)
    expect(runs).toContain('292,364')
    expect(runs).toContain('32,455')
    expect(runs).not.toContain('1,628,445')
  })
})

describe('a settings row that cannot be read', () => {
  it('fails the request rather than serving a report whose columns would be guessed', async () => {
    setup(IICT, iictState())
    const tables = currentServiceMock
    currentServiceMock = {
      from: (table: string) =>
        table === 'monthly_report_settings'
          ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'connection reset' } }) }) }) }
          : tables.from(table),
    }
    const { status, json } = await generateAsCoach(IICT)
    expect(status).toBe(500)
    expect(json.stage).toBe('load_settings')
    expect(json.report).toBeUndefined()
  })
})

// ─── Dragon Roofing & Easy Hail ──────────────────────────────────────────────

const DRAGON = 'c7df2983-5711-4959-8ec8-a48030d62666'
const DRAGON_PROFILE = 'dragon-profile'
const DRG = 'tenant-dragon'
const EHC = 'tenant-easy-hail'

/** Dragon's stored settings row (audit data-health, monthly_report_settings). */
const DRAGON_SETTINGS = {
  id: 'b726e14d-3eb0-4027-88fa-07cde5fbba7d',
  business_id: DRAGON,
  sections: { cashflow: false, cogs_detail: true, opex_detail: true, revenue_detail: true, subscription_detail: true },
  show_prior_year: true,
  show_ytd: true,
  show_unspent_budget: true,
  show_budget_next_month: true,
  show_budget_annual_total: true,
  budget_forecast_id: null,
  subscription_account_codes: ['488', '485'],
  wages_account_names: [],
  pdf_layout: null,
  standing_commentary: null,
  budget_source: 'forecast',
  expense_group_order: null,
}

function dragonState() {
  return {
    businesses: [{ id: DRAGON, name: 'Dragon Roofing', consolidation_budget_mode: 'per_tenant' }],
    business_profiles: [{ id: DRAGON_PROFILE, business_id: DRAGON, fiscal_year_start: 7 }],
    xero_connections: [
      { id: 'c-drg', business_id: DRAGON, tenant_id: DRG, tenant_name: 'Dragon Roofing', display_name: 'Dragon', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      { id: 'c-ehc', business_id: DRAGON, tenant_id: EHC, tenant_name: 'Easy Hail Claim', display_name: 'Easy Hail', display_order: 2, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
    ],
    xero_pl_lines_wide_compat: [
      { business_id: DRAGON_PROFILE, tenant_id: DRG, account_name: 'Sales - Insurance', account_code: '200', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-07': 1_000_000.4, '2026-08': 720_810.3 } },
      { business_id: DRAGON_PROFILE, tenant_id: EHC, account_name: 'Sales - Management Services', account_code: '205', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-07': 232_129, '2026-08': 153_022 } },
      { business_id: DRAGON_PROFILE, tenant_id: DRG, account_name: 'Tradies Contractors', account_code: '310', account_type: 'cogs', section: 'Cost of Sales', monthly_values: { '2026-07': 770_521.4, '2026-08': 742_332 } },
    ],
    fx_rates: [],
    // Business-level (tenant_id null): the per-tenant engine falls back to it.
    financial_forecasts: [{ id: 'fc-dragon', business_id: DRAGON_PROFILE, tenant_id: null, fiscal_year: 2027, is_active: true, updated_at: '2026-08-23T01:14:20Z' }],
    forecast_pl_lines: [
      { forecast_id: 'fc-dragon', account_name: 'Sales - Insurance', account_type: 'revenue', account_class: null, category: null, actual_months: {}, forecast_months: budgetMonths(1_230_584, 1_000_000, 1_000_000, 700_000, 800_000) },
      { forecast_id: 'fc-dragon', account_name: 'Tradies Contractors', account_type: 'cogs', account_class: null, category: null, actual_months: {}, forecast_months: budgetMonths(758_219, 582_727, 582_727, 414_384, 414_386) },
    ],
    consolidation_elimination_rules: [],
    monthly_report_settings: [DRAGON_SETTINGS],
  }
}

describe('Dragon Roofing & Easy Hail — the summary page prints the nine Calxa columns', () => {
  beforeEach(() => {
    setup(DRAGON, dragonState())
  })

  async function dragonPack() {
    const { status, json } = await generateAsCoach(DRAGON)
    expect(status).toBe(200)
    const report = adaptConsolidatedToGeneratedReport(json.report, '2026-08', 2027, DRAGON, { settings: json.settings })
    const doc: any = new MonthlyReportPDFService(report, {
      pdfLayout: LAYOUT,
      consolidated: json.report,
      entityName: 'Dragon Roofing & Easy Hail',
    }).generate()
    return textRuns(doc, 1)
  }

  it('headed Budgets | Actual | Variance | YTD Budget | YTD Actuals | Variance | Unspent Budget | Budget - Next Month | Budget - Annual Total', async () => {
    const runs = await dragonPack()
    for (const header of ['Budgets', 'Actual', 'YTD Budget', 'YTD Actuals', 'Unspent', 'Next Month', 'Annual Total']) {
      expect(runs).toContain(header)
    }
    expect(runs.filter((r) => r === 'Variance')).toHaveLength(2)
    // The summary never carries the prior year, whatever the setting.
    expect(runs).not.toContain('Aug 2025')
  })

  it("Total Income, Total Cost of Sales and Gross Profit carry Calxa p2's nine figures", async () => {
    const runs = await dragonPack()
    expect(rowFigures(runs, 'Total Income')).toEqual([
      '1,000,000', '873,832', '\\(126,168\\)', '2,230,584', '2,105,962', '\\(124,622\\)', '7,524,622', '1,000,000', '9,630,584',
    ])
    expect(rowFigures(runs, 'Total Cost of Sales')).toEqual([
      '582,727', '742,332', '\\(159,605\\)', '1,340,946', '1,512,853', '\\(171,907\\)', '4,140,278', '582,727', '5,653,131',
    ])
    expect(rowFigures(runs, 'Gross Profit')).toEqual([
      '417,273', '131,500', '\\(285,773\\)', '889,638', '593,108', '\\(296,530\\)', '3,384,345', '417,273', '3,977,453',
    ])
  })
})

function setup(businessId: string, state: Record<string, any[]>) {
  currentAuthMock = coachAuthClient(businessId)
  currentServiceMock = mockSupabase(state)
}
