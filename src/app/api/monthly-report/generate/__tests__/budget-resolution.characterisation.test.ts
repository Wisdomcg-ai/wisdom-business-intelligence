/**
 * Characterisation of HOW the monthly report picks its budget.
 *
 * This file exists to make one claim checkable: extracting the budget block
 * into `resolveBudget()` changes nothing. It is written against the route as it
 * stands and must pass, unedited, after the extraction — if an assertion has to
 * move, the refactor was not a refactor.
 *
 * The two existing suites here cannot do that job: their service mock returns
 * empty for every table but `account_mappings`, so `financial_forecasts`
 * resolves to null, `forecast_pl_lines` is never read, and the whole budget
 * block could be deleted with the suite still green.
 *
 * Every case below is a branch the seam could plausibly break, and several are
 * behaviours that look like bugs and are deliberately preserved:
 *   - a pin at a zero-line forecast yields NO budget; it does not retry the
 *     fallback, because the demotion happens after the fallback block
 *   - a dangling pin DOES retry the fallback
 *   - a pin whose fiscal_year is null is honoured for every year
 *   - the fallback tries profile-space before businesses-space, first hit wins
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Sentry ───────────────────────────────────────────────────────────────────
const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage,
  captureException: vi.fn(),
}))

// ── Supabase ─────────────────────────────────────────────────────────────────
let tables: Record<string, any[]> = {}

/**
 * A mock that honours `.eq()/.in()/.order()/.limit()/.single()/.maybeSingle()`,
 * because the resolution order IS a sequence of filters — a mock that ignores
 * them cannot tell tier F1 from tier F2. Modelled on the consolidated route's
 * harness, with `.limit()` returning a chainable rather than a promise (this
 * route does `.limit(1).maybeSingle()`).
 */
function serviceClient() {
  const build = (
    table: string,
    filters: Array<[string, unknown, 'eq' | 'in']> = [],
    ordered: { col: string; ascending: boolean } | null = null,
  ): any => {
    const run = () => {
      let out = (tables[table] ?? []).filter((row) =>
        filters.every(([col, val, op]) =>
          op === 'in' ? Array.isArray(val) && val.includes(row[col]) : row[col] === val,
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
      not: () => self,
      order: (col: string, opts?: { ascending?: boolean }) =>
        build(table, filters, { col, ascending: opts?.ascending ?? true }),
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

// Actuals come from the read service when an active forecast exists for the FY.
// Held in a mutable so a case can vary the actuals without touching the budget.
let compositeRows: any[] = []
vi.mock('@/lib/services/forecast-read-service', () => ({
  createForecastReadService: vi.fn(() => ({
    getMonthlyComposite: vi.fn(async () => ({
      rows: compositeRows,
      data_quality: 'fresh',
      per_tenant_quality: [],
    })),
    getDataQualityForBusiness: vi.fn(async () => ({ data_quality: 'fresh', per_tenant_quality: [] })),
  })),
}))

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: BIZ, profileId: PROFILE, all: [BIZ, PROFILE] })),
}))

// ── Fixture constants ────────────────────────────────────────────────────────
const USER = 'user-0001'
const BIZ = 'biz-0001'
const PROFILE = 'profile-0001'
const FY = 2027
const MONTH = '2026-08'

const REVENUE = 'Consulting Income'

/** A forecast row. `fiscal_year: undefined` means the column is null. */
const forecast = (id: string, name: string, opts: { fy?: number | null; active?: boolean; biz?: string } = {}) => ({
  id,
  name,
  fiscal_year: opts.fy === undefined ? FY : opts.fy,
  is_active: opts.active ?? false,
  business_id: opts.biz ?? PROFILE,
  created_at: '2026-01-01T00:00:00Z',
})

/** A budget line on a forecast. */
const plLine = (id: string, forecastId: string, account: string, months: Record<string, number>, category = 'Revenue') => ({
  id,
  forecast_id: forecastId,
  account_name: account,
  category,
  forecast_months: months,
})

function baseTables(over: Partial<Record<string, any[]>> = {}) {
  return {
    business_profiles: [{ id: PROFILE, business_id: BIZ, fiscal_year_start: 7 }],
    monthly_report_settings: [],
    account_mappings: [
      { id: 'map-1', business_id: BIZ, xero_account_name: REVENUE, report_category: 'Revenue', forecast_pl_line_id: null, forecast_pl_line_name: null },
    ],
    financial_forecasts: [],
    forecast_pl_lines: [],
    xero_pl_lines_wide_compat: [],
    monthly_report_snapshots: [],
    ...over,
  } as Record<string, any[]>
}

async function generate() {
  const { POST } = await import('../route')
  const res = await POST(
    new Request('http://localhost/api/monthly-report/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BIZ, report_month: MONTH, fiscal_year: FY }),
    }) as any,
  )
  return { status: res.status, body: (await res.json()) as any }
}

/** The three fields that say which budget the report chose. */
async function resolution() {
  const { status, body } = await generate()
  expect(status).toBe(200)
  return {
    hasBudget: body.report.has_budget,
    forecastId: body.report.budget_forecast_id,
    forecastName: body.report.budget_forecast_name,
    report: body.report,
  }
}

const fyMismatch = () =>
  captureMessage.mock.calls.filter((c: any[]) => c[1]?.tags?.invariant === 'budget-fy-mismatch')

describe('monthly-report/generate — how the budget is resolved', () => {
  beforeEach(() => {
    captureMessage.mockClear()
    compositeRows = [{ account_name: REVENUE, account_type: 'revenue', monthly_values: { '2026-07': 100, '2026-08': 200 } }]
    tables = baseTables()
  })

  it('a pin for the report year wins, and names itself', async () => {
    tables = baseTables({
      monthly_report_settings: [{ business_id: BIZ, budget_forecast_id: 'pinned', sections: {} }],
      financial_forecasts: [forecast('pinned', 'Pinned FY27'), forecast('active', 'Active FY27', { active: true })],
      forecast_pl_lines: [plLine('bl-1', 'pinned', REVENUE, { '2026-08': 500 })],
    })

    const r = await resolution()
    expect(r.hasBudget).toBe(true)
    expect(r.forecastId).toBe('pinned')
    expect(r.forecastName).toBe('Pinned FY27')
    expect(fyMismatch()).toHaveLength(0)
  })

  it('a pin belonging to another fiscal year warns and falls through to the active one', async () => {
    tables = baseTables({
      monthly_report_settings: [{ business_id: BIZ, budget_forecast_id: 'wrong-fy', sections: {} }],
      financial_forecasts: [
        forecast('wrong-fy', 'Last year', { fy: 2026 }),
        forecast('active', 'Active FY27', { active: true }),
      ],
      forecast_pl_lines: [
        plLine('bl-old', 'wrong-fy', REVENUE, { '2026-08': 999 }),
        plLine('bl-new', 'active', REVENUE, { '2026-08': 500 }),
      ],
    })

    const r = await resolution()
    expect(r.forecastId).toBe('active')
    expect(r.forecastName).toBe('Active FY27')

    // A live production signal — message, level, tag and extras all matter.
    const calls = fyMismatch()
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('[Report Generate] Pinned budget belongs to another fiscal year — falling back')
    expect(calls[0][1].level).toBe('warning')
    expect(calls[0][1].extra).toMatchObject({ pinnedForecastId: 'wrong-fy', pinnedFY: 2026, reportFY: FY })
  })

  it('a pin with a null fiscal_year is honoured for any year', async () => {
    tables = baseTables({
      monthly_report_settings: [{ business_id: BIZ, budget_forecast_id: 'no-fy', sections: {} }],
      financial_forecasts: [forecast('no-fy', 'FY-less', { fy: null }), forecast('active', 'Active FY27', { active: true })],
      forecast_pl_lines: [plLine('bl-1', 'no-fy', REVENUE, { '2026-08': 500 })],
    })

    const r = await resolution()
    expect(r.forecastId).toBe('no-fy')
    expect(fyMismatch()).toHaveLength(0)
  })

  it('a dangling pin falls through to the active forecast', async () => {
    tables = baseTables({
      monthly_report_settings: [{ business_id: BIZ, budget_forecast_id: 'deleted', sections: {} }],
      financial_forecasts: [forecast('active', 'Active FY27', { active: true })],
      forecast_pl_lines: [plLine('bl-1', 'active', REVENUE, { '2026-08': 500 })],
    })

    const r = await resolution()
    expect(r.forecastId).toBe('active')
    expect(fyMismatch()).toHaveLength(0)
  })

  it('a pin at a forecast with NO lines yields no budget — it does not retry the fallback', async () => {
    // Looks like it should fall through; it does not. The zero-line demotion
    // happens after the fallback block, so the cascade has already ended.
    tables = baseTables({
      monthly_report_settings: [{ business_id: BIZ, budget_forecast_id: 'empty', sections: {} }],
      financial_forecasts: [forecast('empty', 'Empty shell'), forecast('active', 'Active FY27', { active: true })],
      forecast_pl_lines: [plLine('bl-1', 'active', REVENUE, { '2026-08': 500 })],
    })

    const r = await resolution()
    expect(r.hasBudget).toBe(false)
    expect(r.forecastId).toBeNull()
    expect(r.forecastName).toBeUndefined()
  })

  it('with no pin, the profile-space forecast wins over the businesses-space one', async () => {
    tables = baseTables({
      financial_forecasts: [
        forecast('by-business', 'Businesses-space', { active: true, biz: BIZ }),
        forecast('by-profile', 'Profile-space', { active: true, biz: PROFILE }),
      ],
      forecast_pl_lines: [
        plLine('bl-a', 'by-profile', REVENUE, { '2026-08': 500 }),
        plLine('bl-b', 'by-business', REVENUE, { '2026-08': 900 }),
      ],
    })

    const r = await resolution()
    expect(r.forecastId).toBe('by-profile')
  })

  it('an active forecast for a different year is not a budget', async () => {
    tables = baseTables({
      financial_forecasts: [forecast('fy26', 'FY26', { fy: 2026, active: true })],
      forecast_pl_lines: [plLine('bl-1', 'fy26', REVENUE, { '2026-08': 500 })],
    })

    const r = await resolution()
    expect(r.hasBudget).toBe(false)
    expect(r.forecastId).toBeNull()
  })

  it('an active forecast with zero lines is not a budget — the empty-shell case', async () => {
    // Twelve forecasts in prod are active with no materialised lines. Without
    // this demotion every row would render a $0 budget and a negative unspent.
    tables = baseTables({
      financial_forecasts: [forecast('shell', 'Shell', { active: true })],
      forecast_pl_lines: [],
    })

    const r = await resolution()
    expect(r.hasBudget).toBe(false)
    expect(r.forecastName).toBeUndefined()
  })

  it('no forecast at all is not a budget', async () => {
    const r = await resolution()
    expect(r.hasBudget).toBe(false)
    expect(r.forecastId).toBeNull()
  })

  it('has_budget is exactly "there is at least one budget line"', async () => {
    // The invariant the seam must not break: a source that resolves but yields
    // nothing has to read as no-budget, not as a budget of zero.
    for (const [lines, expected] of [
      [[plLine('bl-1', 'active', REVENUE, { '2026-08': 500 })], true],
      [[], false],
    ] as const) {
      tables = baseTables({
        financial_forecasts: [forecast('active', 'Active FY27', { active: true })],
        forecast_pl_lines: [...lines],
      })
      const r = await resolution()
      expect(r.hasBudget).toBe(expected)
    }
  })

  it('the budget reaches the numbers, not just the provenance fields', async () => {
    // Proves the resolved lines are actually consumed: budget, variance, YTD
    // and the annual total all move with the resolved forecast.
    tables = baseTables({
      financial_forecasts: [forecast('active', 'Active FY27', { active: true })],
      forecast_pl_lines: [
        plLine('bl-1', 'active', REVENUE, { '2026-07': 400, '2026-08': 500, '2026-09': 600 }),
      ],
    })

    const { report } = await resolution()
    const revenue = report.sections.find((s: any) => s.category === 'Revenue')
    const line = revenue.lines.find((l: any) => l.account_name === REVENUE)

    expect(line.budget).toBe(500)
    expect(line.actual).toBe(200)
    expect(line.ytd_budget).toBe(900) // Jul + Aug
    expect(line.ytd_actual).toBe(300)
    expect(line.budget_next_month).toBe(600)
    expect(line.budget_annual_total).toBe(1500)
    expect(line.variance_amount).toBe(line.actual - line.budget)
  })

  it('an account with no budget line keeps null-ish budget columns, not invented ones', async () => {
    tables = baseTables({
      financial_forecasts: [forecast('active', 'Active FY27', { active: true })],
      forecast_pl_lines: [plLine('bl-1', 'active', 'Some Other Account', { '2026-08': 500 })],
    })

    const { report } = await resolution()
    const revenue = report.sections.find((s: any) => s.category === 'Revenue')
    const line = revenue.lines.find((l: any) => l.account_name === REVENUE)
    expect(line.budget).toBe(0)
    expect(line.actual).toBe(200)
  })
})
