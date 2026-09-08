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
/**
 * Every operator the harness understands. Widen this whenever the code under
 * test starts filtering on a new one — a filter the harness quietly ignores is
 * worse than no harness, because the assertion still passes.
 */
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
      // A real `not`, `lte` and `gt` — NOT no-ops. The budget-version tier
      // filters on `.not('locked_at','is',null)`, `.lte('effective_from', month)`
      // and `.gt(...)`. With a pass-through `not` an unlocked version would
      // resolve, and a missing `lte` would throw inside the tier's own try and
      // be swallowed as "no version" — a fallback assertion would then pass for
      // entirely the wrong reason.
      not: (col: string, op: string, val: unknown) =>
        build(table, [...filters, [col, val, op === 'is' ? 'not-is' : 'neq']], ordered),
      lte: (col: string, val: unknown) => build(table, [...filters, [col, val, 'lte']], ordered),
      gt: (col: string, val: unknown) => build(table, [...filters, [col, val, 'gt']], ordered),
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
    budget_versions: [],
    budget_lines: [],
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

// ─────────────────────────────────────────────────────────────────────────────
// The budget store. Everything above pins the LEGACY path and must keep passing
// unedited — that is the proof the gate is a gate.

const version = (
  id: string,
  effective_from: string,
  over: { locked?: boolean; label?: string; fiscal_year?: number } = {},
) => ({
  id,
  business_id: BIZ,
  fiscal_year: over.fiscal_year ?? 2027,
  label: over.label ?? 'Overall Budget',
  effective_from,
  version_number: 1,
  locked_at: over.locked === false ? null : '2026-09-09T00:00:00Z',
})

const budgetLine = (id: string, versionId: string, month: string, amount: number) => ({
  id,
  budget_version_id: versionId,
  business_id: BIZ,
  account_name: REVENUE,
  category: 'Revenue',
  month,
  amount,
})

/** Settings that put the client on the budget store. */
const onStore = { business_id: BIZ, budget_source: 'budget_version', sections: {} }

describe('monthly-report/generate — the budget store', () => {
  beforeEach(() => {
    captureMessage.mockClear()
    compositeRows = [{ account_name: REVENUE, account_type: 'revenue', monthly_values: { '2026-07': 100, '2026-08': 200 } }]
    tables = baseTables()
  })

  it('a client not switched over never touches the budget tables', async () => {
    // The gate is on the QUERY. A locked, in-force version exists and is
    // ignored, because budget_source is absent — which is the state 19 of the
    // 31 businesses are in (no settings row at all).
    tables = baseTables({
      financial_forecasts: [forecast('active', 'Active FY27', { active: true })],
      forecast_pl_lines: [plLine('bl-1', 'active', REVENUE, { '2026-08': 500 })],
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [budgetLine('l-1', 'v1', '2026-08', 999)],
    })

    const r = await resolution()
    expect(r.hasBudget).toBe(true)
    expect(r.forecastId).toBe('active')
    expect(r.report.budget_source).toBe('forecast')
    expect(r.report.budget_version_id).toBeNull()
  })

  it('a switched client reads the version in force for the report month', async () => {
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [budgetLine('l-1', 'v1', '2026-08', 405521), budgetLine('l-2', 'v1', '2026-09', 551975)],
    })

    const r = await resolution()
    expect(r.hasBudget).toBe(true)
    expect(r.report.budget_source).toBe('budget_version')
    expect(r.report.budget_version_id).toBe('v1')
    expect(r.report.no_budget_reason).toBeNull()
    expect(r.forecastId).toBeNull()
  })

  it('a revision applies prospectively — August keeps the version it was reported against', async () => {
    // v2 arrives in October. Reporting August must still resolve v1: this is
    // the whole reason effective-dating exists instead of a single pin.
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07'), version('v2', '2026-10', { label: 'Revised' })],
      budget_lines: [budgetLine('l-1', 'v1', '2026-08', 405521), budgetLine('l-2', 'v2', '2026-08', 1)],
    })

    const r = await resolution()
    expect(r.report.budget_version_id).toBe('v1')
    expect(r.report.budget_forecast_name).toBe('Overall Budget')
  })

  it('fails CLOSED when the only version is not yet effective — it does not fall back to the forecast', async () => {
    // An active forecast WITH lines is sitting right there. Using it would
    // silently measure the client against the moving yardstick.
    tables = baseTables({
      monthly_report_settings: [onStore],
      financial_forecasts: [forecast('active', 'Active FY27', { active: true })],
      forecast_pl_lines: [plLine('bl-1', 'active', REVENUE, { '2026-08': 500 })],
      budget_versions: [version('v1', '2026-09')],
      budget_lines: [budgetLine('l-1', 'v1', '2026-09', 551975)],
    })

    const r = await resolution()
    expect(r.hasBudget).toBe(false)
    expect(r.report.no_budget_reason).toBe('version_not_yet_effective')
    expect(r.forecastId).toBeNull()
  })

  it('distinguishes "nothing imported" from "not yet effective"', async () => {
    tables = baseTables({ monthly_report_settings: [onStore] })
    expect((await resolution()).report.no_budget_reason).toBe('no_version_in_force')
  })

  it('refuses to choose between two versions in force, and says so in Sentry', async () => {
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07'), version('v2', '2026-07', { label: 'Other org' })],
      budget_lines: [budgetLine('l-1', 'v1', '2026-08', 1), budgetLine('l-2', 'v2', '2026-08', 2)],
    })

    const r = await resolution()
    expect(r.hasBudget).toBe(false)
    expect(r.report.no_budget_reason).toBe('multiple_versions_in_force')
    expect(
      captureMessage.mock.calls.filter((c) => c[1]?.tags?.invariant === 'budget-multiple-versions-in-force'),
    ).toHaveLength(1)
  })

  it('an unlocked version is not a budget — a half-written import stays invisible', async () => {
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07', { locked: false })],
      budget_lines: [budgetLine('l-1', 'v1', '2026-08', 405521)],
    })
    expect((await resolution()).report.no_budget_reason).toBe('no_version_in_force')
  })

  it('a locked version with no lines is not a budget either', async () => {
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07')],
    })
    expect((await resolution()).report.no_budget_reason).toBe('version_has_no_lines')
  })

  it("another year's version is not in force", async () => {
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2025-07', { fiscal_year: 2026 })],
      budget_lines: [budgetLine('l-1', 'v1', '2026-08', 1)],
    })
    expect((await resolution()).report.no_budget_reason).toBe('no_version_in_force')
  })
})
