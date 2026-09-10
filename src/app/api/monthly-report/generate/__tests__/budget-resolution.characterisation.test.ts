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
 *
 * The last suite is not characterisation: it pins the account-code tier, which
 * is new behaviour on the budget-store path. Everything above it is unchanged
 * apart from one fixture column (`xero_account_code: null` on the base mapping
 * row, so the harness rows have the shape prod rows have) — the tier is inert
 * without a code on both sides, and those cases prove it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isAccountMatch } from '@/lib/utils/account-matching'

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
      // PostgREST caps a page at 1000 rows and the resolver pages through
      // budget_lines with .range(); a harness without it would silently return
      // every row on page one and prove nothing about the cap.
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
      { id: 'map-1', business_id: BIZ, xero_account_name: REVENUE, xero_account_code: null, report_category: 'Revenue', forecast_pl_line_id: null, forecast_pl_line_name: null },
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

// ─────────────────────────────────────────────────────────────────────────────
// A revision applies PROSPECTIVELY. The report reads four windows out of one
// budget map — the month, YTD, the annual total, next month — so a version
// resolved once for the anchor month and applied to all four would let a
// revision imported in October restate July, inside the totals that are meant
// to be settled. Each month takes the version in force for THAT month.
// ─────────────────────────────────────────────────────────────────────────────

/** The Revenue subtotal, where the stitched windows show up. */
function revenueSubtotal(report: any) {
  const section = (report.sections ?? []).find((s: any) => s.category === 'Revenue')
  return section?.subtotal
}

describe('monthly-report/generate — a revision does not restate earlier months', () => {
  beforeEach(() => {
    captureMessage.mockClear()
  })

  it('stitches per month: July keeps v1 even though v2 governs the report month', async () => {
    // v1 from the start of the year, v2 from October. Reporting November.
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07'), version('v2', '2026-10', { label: 'Overall Budget v2' })],
      budget_lines: [
        budgetLine('l-1', 'v1', '2026-07', 100),
        budgetLine('l-2', 'v1', '2026-11', 999),   // superseded — must NOT count
        budgetLine('l-3', 'v2', '2026-11', 300),
        budgetLine('l-4', 'v2', '2026-07', 888),   // not yet effective — must NOT count
      ],
    })

    const { status, body } = await (async () => {
      const { POST } = await import('../route')
      const res = await POST(new Request('http://localhost/api/monthly-report/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: BIZ, report_month: '2026-11', fiscal_year: FY }),
      }) as any)
      return { status: res.status, body: (await res.json()) as any }
    })()

    expect(status).toBe(200)
    expect(body.report.has_budget).toBe(true)
    // Provenance is the version governing the ANCHOR month.
    expect(body.report.budget_version_id).toBe('v2')

    const sub = revenueSubtotal(body.report)
    expect(sub.budget).toBe(300)        // November from v2, not v1's 999
    expect(sub.ytd_budget).toBe(400)    // July 100 (v1) + November 300 (v2); v2's July 888 excluded
  })

  it('refuses the whole year when two versions tie on a later month', async () => {
    // The tie is in October — after the August report month. Dropping just that
    // month would understate the annual total silently.
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07'), version('v2', '2026-10'), version('v3', '2026-10')],
      budget_lines: [budgetLine('l-1', 'v1', '2026-08', 405521)],
    })

    const r = await resolution()
    expect(r.hasBudget).toBe(false)
    expect(r.report.no_budget_reason).toBe('multiple_versions_in_force')
    expect(r.forecastId).toBeNull()
    expect(
      captureMessage.mock.calls.filter((c: any[]) => c[1]?.tags?.invariant === 'budget-multiple-versions-in-force'),
    ).toHaveLength(1)
  })

  it('refuses to sum budgets from two Xero orgs', async () => {
    // Summing two orgs needs an FX rule this does not have. The settings flip
    // already refuses multi-org businesses; this is the resolver's own guard,
    // because that one lives in a different route.
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [
        { ...version('v1', '2026-07'), tenant_id: 'tenant-a' },
        { ...version('v2', '2026-08'), tenant_id: 'tenant-b' },
      ],
      budget_lines: [budgetLine('l-1', 'v1', '2026-07', 100), budgetLine('l-2', 'v2', '2026-08', 200)],
    })

    const r = await resolution()
    expect(r.hasBudget).toBe(false)
    expect(r.report.no_budget_reason).toBe('multiple_versions_in_force')
    expect(
      captureMessage.mock.calls.filter((c: any[]) => c[1]?.tags?.invariant === 'budget-multiple-tenants-in-force'),
    ).toHaveLength(1)
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// The ACCOUNT CODE tier.
//
// Every case above matches budget to actual by NAME, because that is all the
// route had. Name matching is a heuristic and it loses on any account renamed
// on one side only. Urban Road's P&L carries "Foreign Currency Gains and
// Losses"; its Xero budget carries "Foreign Currency Loss/Gain" (code 62700).
// Those normalise to "and currency foreign gains losses" and "currency foreign
// lossgain" — nothing in common — so the August pack printed the account TWICE:
// once with the actual and a $0 budget, once budget-only with a $0 actual, both
// inside Operating Expenses.
//
// The SUBTOTAL is not the casualty. Both rows sit in the same section and
// buildSubtotal sums it, so actual, budget, ytd, unspent_budget and
// budget_annual_total all net back to the single-row answer. What is wrong is
// each row's own variance — the whole actual as an overspend against nothing,
// the whole budget as unspent against nothing — and an account list that has
// one account on it twice and therefore cannot be tied back to Xero. The
// subtotal cases below assert the totals stay right, which is the invariant;
// the row cases assert the page becomes readable, which is the fix.
//
// The code is the same string on both sides. These cases pin that it is used,
// that a code-matched line is CLAIMED like any other (or the budget-only pass
// re-emits it as the duplicate this fix exists to remove), and that the tier is
// inert wherever there are no codes.
// ─────────────────────────────────────────────────────────────────────────────

const FX_XERO = 'Foreign Currency Gains and Losses'
const FX_BUDGET = 'Foreign Currency Loss/Gain'
const GENERAL = 'General Expenses'

/** An account_mappings row. `code` null is the real Urban Road FX shape. */
const mapping = (name: string, code: string | null, category = 'Operating Expenses') => ({
  id: `map-${name}`,
  business_id: BIZ,
  xero_account_name: name,
  xero_account_code: code,
  report_category: category,
  forecast_pl_line_id: null,
  forecast_pl_line_name: null,
})

/** A budget_lines row carrying a code. */
const codedLine = (
  id: string,
  code: string | null,
  name: string,
  month: string,
  amount: number,
  category = 'Operating Expenses',
) => ({
  id,
  budget_version_id: 'v1',
  business_id: BIZ,
  account_code: code,
  account_name: name,
  category,
  month,
  amount,
})

/** A composite actuals row. `code` null means Xero posted no code. */
const actual = (code: string | null, name: string, monthly: Record<string, number>, type = 'opex') => ({
  account_code: code,
  account_name: name,
  account_type: type,
  monthly_values: monthly,
})

/**
 * An active forecast is what routes the ACTUALS through ForecastReadService —
 * the mocked `compositeRows`. Without one the route falls back to reading
 * xero_pl_lines_wide_compat directly and every actual reads $0, which would
 * make these cases pass or fail for reasons that have nothing to do with
 * matching. The BUDGET still comes from the store: the gate is budget_source,
 * not the presence of a forecast.
 */
const actualsRouting = () => [forecast('active', 'Actuals routing', { active: true })]

function opexLines(report: any) {
  const section = (report.sections ?? []).find((s: any) => s.category === 'Operating Expenses')
  return section?.lines ?? []
}

describe('monthly-report/generate — matching on the account code', () => {
  beforeEach(() => {
    captureMessage.mockClear()
    tables = baseTables()
  })

  it('the Foreign Currency case: different names, same code, ONE row carrying both numbers', async () => {
    // Sanity: the name tiers genuinely cannot see these two as the same
    // account. Without this the case could pass for the wrong reason.
    expect(isAccountMatch(FX_XERO, FX_BUDGET)).toBe(false)

    compositeRows = [actual('62700', FX_XERO, { '2026-07': 100, '2026-08': 919.25 })]
    tables = baseTables({
      account_mappings: [mapping(FX_XERO, '62700')],
      monthly_report_settings: [onStore],
      financial_forecasts: actualsRouting(),
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [
        codedLine('l-1', '62700', FX_BUDGET, '2026-07', 800),
        codedLine('l-2', '62700', FX_BUDGET, '2026-08', 1000),
      ],
    })

    const { report } = await resolution()
    const lines = opexLines(report)

    expect(lines).toHaveLength(1)
    expect(lines[0].actual).toBe(919.25)
    expect(lines[0].budget).toBe(1000)
    expect(lines[0].ytd_budget).toBe(1800)
    expect(lines[0].is_budget_only).toBe(false)
    // The subtotal is the point: two rows for one account double the budget.
    const subtotal = report.sections.find((s: any) => s.category === 'Operating Expenses').subtotal
    expect(subtotal.actual).toBe(919.25)
    expect(subtotal.budget).toBe(1000)
  })

  it('splitting the account never moved money — the subtotal was always right', async () => {
    // Pinning the correction above. Same client, same budget, same actual, with
    // the code removed from BOTH sides so the names have to carry the match and
    // fail: two rows come out instead of one, and every summed field on the
    // section subtotal is identical to the matched case. What differs is the
    // per-row variances, which are facts about nothing, and an account list a
    // reader cannot tie back to Xero.
    compositeRows = [actual(null, FX_XERO, { '2026-07': 100, '2026-08': 919.25 })]
    tables = baseTables({
      account_mappings: [mapping(FX_XERO, null)],
      monthly_report_settings: [onStore],
      financial_forecasts: actualsRouting(),
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [
        codedLine('l-1', null, FX_BUDGET, '2026-07', 800),
        codedLine('l-2', null, FX_BUDGET, '2026-08', 1000),
      ],
    })

    const { report } = await resolution()
    const lines = opexLines(report)
    expect(lines).toHaveLength(2)

    const subtotal = report.sections.find((s: any) => s.category === 'Operating Expenses').subtotal
    expect(subtotal.actual).toBe(919.25)
    expect(subtotal.budget).toBe(1000)
    expect(subtotal.ytd_actual).toBe(1019.25)
    expect(subtotal.ytd_budget).toBe(1800)
    expect(subtotal.budget_annual_total).toBe(1800)
    expect(subtotal.unspent_budget).toBe(1800 - 1019.25)
    expect(subtotal.variance_amount).toBe(1000 - 919.25)

    // The damage, per row: the actual reported as an overspend against a budget
    // of nothing, and the budget reported as entirely unspent against an actual
    // of nothing.
    const withActual = lines.find((l: any) => !l.is_budget_only)
    const budgetOnly = lines.find((l: any) => l.is_budget_only)
    expect(withActual.variance_amount).toBe(-919.25)
    expect(budgetOnly.variance_amount).toBe(1000)
  })

  it('a code-matched line is CLAIMED — the budget-only pass must not re-emit it', async () => {
    // The failure that matters most. `matchedBudgetLineIds` / the identity set
    // are what stop the budget-only pass from printing the same account again.
    // A tier that matched without registering there produces exactly the
    // two-rows-one-account bug this whole change removes.
    compositeRows = [actual('62700', FX_XERO, { '2026-08': 919.25 })]
    tables = baseTables({
      account_mappings: [mapping(FX_XERO, '62700')],
      monthly_report_settings: [onStore],
      financial_forecasts: actualsRouting(),
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [codedLine('l-1', '62700', FX_BUDGET, '2026-08', 1000)],
    })

    const { report } = await resolution()
    const lines = opexLines(report)
    expect(lines.filter((l: any) => l.is_budget_only)).toHaveLength(0)
    expect(lines.map((l: any) => l.account_name)).toEqual([FX_XERO])
  })

  it('takes the code from the MAPPING when Xero posted the row without one', async () => {
    // Urban Road's real shape: xero_pl_lines.account_code is null for that
    // account, because Xero's P&L emits it as a report-only line. The mapping
    // is the only place the code can be declared, so it is consulted second
    // rather than not at all.
    compositeRows = [actual(null, FX_XERO, { '2026-08': 919.25 })]
    tables = baseTables({
      account_mappings: [mapping(FX_XERO, '62700')],
      monthly_report_settings: [onStore],
      financial_forecasts: actualsRouting(),
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [codedLine('l-1', '62700', FX_BUDGET, '2026-08', 1000)],
    })

    const lines = opexLines((await resolution()).report)
    expect(lines).toHaveLength(1)
    expect(lines[0].budget).toBe(1000)
  })

  it('the actuals row\'s own code wins over the mapping\'s copy', async () => {
    // account_mappings carries a copy of the Xero code; xero_pl_lines carries
    // what Xero actually posted. Prefer the fact, or a stale mapping silently
    // reroutes an account's budget to a different account.
    compositeRows = [actual('428.1', GENERAL, { '2026-08': 50 })]
    tables = baseTables({
      account_mappings: [mapping(GENERAL, '428.2')],
      monthly_report_settings: [onStore],
      financial_forecasts: actualsRouting(),
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [
        codedLine('l-1', '428.1', 'BATHURST: General Expenses', '2026-08', 500),
        codedLine('l-2', '428.2', 'ORANGE: General Expenses', '2026-08', 400),
      ],
    })

    const lines = opexLines((await resolution()).report)
    const matched = lines.find((l: any) => !l.is_budget_only)
    expect(matched.budget).toBe(500)
  })

  it('two accounts sharing a name are two rows, and their budgets are not summed', async () => {
    // Keyed on the name, the resolver merged these into one line budgeted 900,
    // the first Xero row claimed it and the second rendered $0 with a
    // "already claimed" warning. Both rows were plausible; the sum was not.
    compositeRows = [
      actual('428.1', GENERAL, { '2026-08': 50 }),
      actual('428.2', GENERAL, { '2026-08': 60 }),
    ]
    tables = baseTables({
      account_mappings: [mapping(GENERAL, null)],
      monthly_report_settings: [onStore],
      financial_forecasts: actualsRouting(),
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [
        codedLine('l-1', '428.1', GENERAL, '2026-08', 500),
        codedLine('l-2', '428.2', GENERAL, '2026-08', 400),
      ],
    })

    const { report } = await resolution()
    const lines = opexLines(report)
    expect(lines).toHaveLength(2)
    expect(lines.map((l: any) => l.budget).sort((a: number, b: number) => a - b)).toEqual([400, 500])
    expect(lines.map((l: any) => l.actual).sort((a: number, b: number) => a - b)).toEqual([50, 60])
    expect(lines.some((l: any) => l.is_budget_only)).toBe(false)
    // No double-claim: neither row was starved of its own budget.
    expect(
      captureMessage.mock.calls.filter((c: any[]) => String(c[0]).includes('already claimed')),
    ).toHaveLength(0)
    const subtotal = report.sections.find((s: any) => s.category === 'Operating Expenses').subtotal
    expect(subtotal.budget).toBe(900)
    expect(subtotal.actual).toBe(110)
  })

  it('the unmatched half of a same-name pair still reaches the report as budget-only', async () => {
    // Splitting the merged line is only half the fix. The budget-only pass used
    // to suppress by NAME, so the sibling that had no actual would be dropped
    // entirely and its whole annual budget would vanish from the subtotal —
    // worse than the merge, which at least kept the money on the page.
    compositeRows = [actual('428.1', GENERAL, { '2026-08': 50 })]
    tables = baseTables({
      account_mappings: [mapping(GENERAL, null)],
      monthly_report_settings: [onStore],
      financial_forecasts: actualsRouting(),
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [
        codedLine('l-1', '428.1', GENERAL, '2026-08', 500),
        codedLine('l-2', '428.2', GENERAL, '2026-08', 400),
      ],
    })

    const { report } = await resolution()
    const lines = opexLines(report)
    expect(lines).toHaveLength(2)
    expect(lines.filter((l: any) => l.is_budget_only)).toHaveLength(1)
    const subtotal = report.sections.find((s: any) => s.category === 'Operating Expenses').subtotal
    expect(subtotal.budget).toBe(900)
    expect(subtotal.actual).toBe(50)
  })

  it('the code beats a name that matches a different account', async () => {
    // Where the two keys disagree, the identity wins and the name-alike is left
    // to stand on its own as budget-only.
    compositeRows = [actual('428.1', 'Sundry', { '2026-08': 50 })]
    tables = baseTables({
      account_mappings: [mapping('Sundry', null)],
      monthly_report_settings: [onStore],
      financial_forecasts: actualsRouting(),
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [
        codedLine('l-1', '428.1', 'Miscellaneous', '2026-08', 500),
        codedLine('l-2', '999', 'Sundry', '2026-08', 400),
      ],
    })

    const lines = opexLines((await resolution()).report)
    const matched = lines.find((l: any) => !l.is_budget_only)
    expect(matched.account_name).toBe('Sundry')
    expect(matched.budget).toBe(500)          // account 428.1 "Miscellaneous"
    const budgetOnly = lines.filter((l: any) => l.is_budget_only)
    expect(budgetOnly).toHaveLength(1)
    expect(budgetOnly[0].budget).toBe(400)    // account 999 "Sundry"
  })

  it('is inert on the forecast path — a coded actual does not match an uncoded budget', async () => {
    // The resolver does not select forecast_pl_lines.account_code (the column
    // exists; this path deliberately reads the fields it always read), so
    // budgetByCode is empty and the cascade falls straight through to the name
    // tiers. Every client not on the budget store therefore behaves exactly as
    // it did.
    compositeRows = [actual('62700', FX_XERO, { '2026-08': 919.25 })]
    tables = baseTables({
      account_mappings: [mapping(FX_XERO, '62700')],
      financial_forecasts: [forecast('active', 'Active FY27', { active: true })],
      forecast_pl_lines: [plLine('bl-1', 'active', FX_BUDGET, { '2026-08': 1000 }, 'Operating Expenses')],
    })

    const { report } = await resolution()
    const lines = opexLines(report)
    // Two rows, exactly as before: the actual with no budget, and the budget
    // with no actual. Not fixed here — fixing it would change every client on
    // the legacy path — but proven unchanged.
    expect(lines).toHaveLength(2)
    expect(lines.find((l: any) => l.account_name === FX_XERO).budget).toBe(0)
    expect(lines.find((l: any) => l.account_name === FX_BUDGET).is_budget_only).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A pin outranks a code.
//
// account_mappings.forecast_pl_line_id is a human being saying which budget
// line an account IS. The account code is an identity the two sides happen to
// share — a very good inference, and still an inference. Placed above the pin,
// the code silently overruled a coach's explicit decision and nothing recorded
// that a decision had been made at all.
//
// No live exposure today: zero mappings fleet-wide carry a pin. It is wrong on
// principle and free to fix now.
// ─────────────────────────────────────────────────────────────────────────────

describe('monthly-report/generate — a pin outranks the account code', () => {
  const pinned = (name: string, code: string | null, lineId: string) => ({
    ...mapping(name, code),
    forecast_pl_line_id: lineId,
  })

  /** The Xero row's code says 428.1; the coach pinned the 428.2 line. */
  function disagreeing() {
    compositeRows = [actual('428.1', GENERAL, { '2026-08': 50 })]
    tables = baseTables({
      account_mappings: [pinned(GENERAL, null, 'l-2')],
      monthly_report_settings: [onStore],
      financial_forecasts: actualsRouting(),
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [
        codedLine('l-1', '428.1', 'BATHURST: General Expenses', '2026-08', 500),
        codedLine('l-2', '428.2', 'ORANGE: General Expenses', '2026-08', 400),
      ],
    })
  }

  beforeEach(() => {
    captureMessage.mockClear()
    tables = baseTables()
  })

  it('honours the pin when the code would have chosen differently', async () => {
    disagreeing()
    const { report } = await resolution()
    const matched = opexLines(report).find((l: any) => !l.is_budget_only)
    expect(matched.budget).toBe(400)
  })

  it('records the disagreement, so a stale pin or a stale code is findable', async () => {
    disagreeing()
    const { body } = await generate()
    const entry = body._debug.match_detail.find((m: any) => m.xero === GENERAL)
    expect(entry.method).toBe('forecast_pl_line_id')
    expect(entry.codeWouldHaveMatched).toBe('BATHURST: General Expenses')
    expect(body._debug.pin_code_disagreements).toEqual([
      { xero: GENERAL, pinned: 'ORANGE: General Expenses', code_would_have_matched: 'BATHURST: General Expenses' },
    ])
  })

  it('says nothing when the pin and the code agree', async () => {
    compositeRows = [actual('428.1', GENERAL, { '2026-08': 50 })]
    tables = baseTables({
      account_mappings: [pinned(GENERAL, null, 'l-1')],
      monthly_report_settings: [onStore],
      financial_forecasts: actualsRouting(),
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [codedLine('l-1', '428.1', 'BATHURST: General Expenses', '2026-08', 500)],
    })

    const { body } = await generate()
    expect(body._debug.pin_code_disagreements).toEqual([])
    expect(body._debug.match_detail.find((m: any) => m.xero === GENERAL).codeWouldHaveMatched).toBeUndefined()
  })

  it('still falls through to the code when the pin points at nothing', async () => {
    // A dangling pin — the line it named was deleted — must not strand the
    // account with no budget at all.
    compositeRows = [actual('428.1', GENERAL, { '2026-08': 50 })]
    tables = baseTables({
      account_mappings: [pinned(GENERAL, null, 'deleted-line')],
      monthly_report_settings: [onStore],
      financial_forecasts: actualsRouting(),
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [codedLine('l-1', '428.1', 'BATHURST: General Expenses', '2026-08', 500)],
    })

    const { body } = await generate()
    const entry = body._debug.match_detail.find((m: any) => m.xero === GENERAL)
    expect(entry.method).toBe('account_code')
    expect(entry.budget).toBe('BATHURST: General Expenses')
  })
})
