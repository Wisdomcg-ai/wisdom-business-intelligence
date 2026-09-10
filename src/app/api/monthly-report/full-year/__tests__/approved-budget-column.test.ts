/**
 * The Full Year page's two budgets.
 *
 * `budget` is the FORECAST — it feeds the italic cells and the projection,
 * answering "where will we land". `approved_budget` is the yardstick from
 * budget_versions/budget_lines, answering "what were we held to". They are
 * resolved separately on purpose: swapping the projection's source would have
 * silently redefined it as "what we approved in July", which the budget-store
 * plan lists as a non-goal.
 *
 * The column appears ONLY for a client on the budget store, so that one client
 * never has two baselines on screen at once — their Budget vs Actual tab and
 * this page must agree about what they are measured against.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureMessage, captureException: vi.fn() }))

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
      // PostgREST caps a page at 1000 rows and the resolver pages through
      // budget_lines with .range(); a harness without it would silently return
      // every row on page one and prove nothing about the cap.
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
const REVENUE = 'Consulting Income'

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

// ── Fixtures ─────────────────────────────────────────────────────────────────

const forecastLine = (id: string, months: Record<string, number>) => ({
  id,
  forecast_id: 'fc-1',
  account_name: REVENUE,
  category: 'Revenue',
  forecast_months: months,
})

const version = (id: string, effective_from: string) => ({
  id,
  business_id: BIZ,
  fiscal_year: FY,
  label: 'Overall Budget',
  effective_from,
  version_number: 1,
  locked_at: '2026-09-09T00:00:00Z',
  tenant_id: 'tenant-a',
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

function baseTables(over: Record<string, any[]> = {}) {
  return {
    monthly_report_settings: [],
    account_mappings: [{ business_id: BIZ, xero_account_name: REVENUE, report_category: 'Revenue' }],
    financial_forecasts: [{ id: 'fc-1', business_id: PROFILE, name: 'FY27 Forecast', is_active: true, fiscal_year: FY }],
    forecast_pl_lines: [forecastLine('fl-1', { '2026-07': 1000, '2026-08': 1000 })],
    business_profiles: [{ id: PROFILE, business_id: BIZ, fiscal_year_start: 7 }],
    budget_versions: [],
    budget_lines: [],
    ...over,
  } as Record<string, any[]>
}

async function fullYear() {
  const { POST } = await import('../route')
  const res = await POST(
    new Request('http://localhost/api/monthly-report/full-year', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BIZ, fiscal_year: FY }),
    }) as any,
  )
  return { status: res.status, body: (await res.json()) as any }
}

/** The Revenue line, where both budgets show up. */
function revenueLine(body: any) {
  const section = (body.report?.sections ?? []).find((s: any) => s.category === 'Revenue')
  return section?.lines?.[0] ?? section?.subtotal
}

const onStore = { business_id: BIZ, budget_source: 'budget_version', budget_forecast_id: null }

describe('full-year — the approved budget column', () => {
  beforeEach(() => {
    captureMessage.mockClear()
    compositeRows = [
      { account_name: REVENUE, account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-07': 900 } },
    ]
    tables = baseTables()
  })

  it('a client NOT on the budget store gets null everywhere — nothing changes for them', async () => {
    // A locked version even exists; it must be ignored, because their Budget vs
    // Actual tab is still measured against the forecast and the two tabs must
    // not hold different baselines.
    tables = baseTables({
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [budgetLine('bl-1', 'v1', '2026-07', 5000)],
    })

    const { status, body } = await fullYear()
    expect(status).toBe(200)
    const line = revenueLine(body)
    expect(line.approved_annual_budget).toBeNull()
    expect(line.months.every((m: any) => m.approved_budget === null)).toBe(true)
    // The forecast still drives the projection, untouched.
    expect(line.months.find((m: any) => m.month === '2026-07').budget).toBe(1000)
  })

  it('a switched client gets the approved budget alongside the forecast, not instead of it', async () => {
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [budgetLine('bl-1', 'v1', '2026-07', 5000), budgetLine('bl-2', 'v1', '2026-08', 6000)],
    })

    const { status, body } = await fullYear()
    expect(status).toBe(200)
    const line = revenueLine(body)
    const jul = line.months.find((m: any) => m.month === '2026-07')

    // Both present, and different — this is the whole point.
    expect(jul.budget).toBe(1000)          // forecast, drives the projection
    expect(jul.approved_budget).toBe(5000) // the yardstick
    expect(line.approved_annual_budget).toBe(11000)
    // The projection is still forecast-derived, NOT the approved budget.
    expect(line.annual_budget).toBe(2000)
  })

  it('a month the budget does not cover reads 0 inside a covered year, not null', async () => {
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [budgetLine('bl-1', 'v1', '2026-07', 5000)],
    })

    const { status, body } = await fullYear()
    expect(status).toBe(200)
    const line = revenueLine(body)
    expect(line.months.find((m: any) => m.month === '2026-08').approved_budget).toBe(0)
    expect(line.approved_annual_budget).toBe(5000)
  })

  it('names the version the column came from, so the page is not printing an anonymous second money column', async () => {
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [budgetLine('bl-1', 'v1', '2026-07', 5000)],
    })

    const { body } = await fullYear()
    expect(body.report.approved_budget_label).toBe('Overall Budget')
  })

  it('leaves the label null whenever there is no approved budget, because the column is keyed off it', async () => {
    // Both halves: never switched over, and switched over but unresolvable. A
    // label without a budget would put a header over an empty column, and an
    // empty budget column is read as zero.
    const { body: never } = await fullYear()
    expect(never.report.approved_budget_label).toBeNull()

    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2027-06')],
      budget_lines: [budgetLine('bl-1', 'v1', '2027-06', 5000)],
    })
    const { body: notInForce } = await fullYear()
    expect(notInForce.report.approved_budget_label).toBeNull()
  })

  it('a switched client whose version is not yet in force gets null, not the forecast', async () => {
    // Fail-closed: the budget must never quietly become the forecast for a
    // client who was deliberately moved off it.
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2027-06')],
      budget_lines: [budgetLine('bl-1', 'v1', '2027-06', 5000)],
    })

    const { status, body } = await fullYear()
    expect(status).toBe(200)
    const line = revenueLine(body)
    expect(line.approved_annual_budget).toBeNull()
    expect(line.months.every((m: any) => m.approved_budget === null)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// An account the approved budget covers but which has no actuals and no
// forecast line still needs a row, or its budget vanishes from the page.
// Distinct Directions FY27: two of its three clinic income accounts have never
// been posted to, and the Full Year revenue budget read 47% of the truth.
// ─────────────────────────────────────────────────────────────────────────────

describe('full-year — an approved budget with no actuals and no forecast', () => {
  const UNPOSTED = 'ORANGE: Behavioural Assessment Income'

  beforeEach(() => {
    captureMessage.mockClear()
    compositeRows = [
      { account_name: REVENUE, account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-07': 900 } },
    ]
  })

  it('gets its own row rather than being dropped from the total', async () => {
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [
        budgetLine('bl-1', 'v1', '2026-07', 5000),
        // Budgeted, never posted to, and absent from the forecast.
        { ...budgetLine('bl-2', 'v1', '2026-07', 2000), account_name: UNPOSTED },
        { ...budgetLine('bl-3', 'v1', '2026-08', 3000), account_name: UNPOSTED },
      ],
    })

    const { status, body } = await fullYear()
    expect(status).toBe(200)
    const section = (body.report?.sections ?? []).find((s: any) => s.category === 'Revenue')

    const unposted = section.lines.find((l: any) => l.account_name === UNPOSTED)
    expect(unposted, 'the budgeted-but-unposted account needs a row').toBeTruthy()
    expect(unposted.approved_annual_budget).toBe(5000)
    // It has no forecast, so the projection says nothing about it — 0, not the budget.
    expect(unposted.annual_budget).toBe(0)
    expect(unposted.projected_total).toBe(0)
    expect(unposted.variance_amount).toBe(0)

    // And the subtotal carries BOTH accounts.
    expect(section.subtotal.approved_annual_budget).toBe(10000)
  })

  it('does not duplicate an account that already has a row', async () => {
    tables = baseTables({
      monthly_report_settings: [onStore],
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [budgetLine('bl-1', 'v1', '2026-07', 5000)],
    })

    const { body } = await fullYear()
    const section = (body.report?.sections ?? []).find((s: any) => s.category === 'Revenue')
    expect(section.lines.filter((l: any) => l.account_name === REVENUE)).toHaveLength(1)
    expect(section.subtotal.approved_annual_budget).toBe(5000)
  })

  it('adds nothing for a client not on the budget store', async () => {
    tables = baseTables({
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [{ ...budgetLine('bl-2', 'v1', '2026-07', 2000), account_name: UNPOSTED }],
    })

    const { body } = await fullYear()
    const section = (body.report?.sections ?? []).find((s: any) => s.category === 'Revenue')
    expect(section.lines.find((l: any) => l.account_name === UNPOSTED)).toBeUndefined()
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// One page renders both surfaces, so both must resolve an account the same way.
//
// The resolver groups budget_lines on budgetLineKey — the account CODE, falling
// back to the name only for a line that has none. This route used to match
// those same lines by name alone, so an account a bookkeeper renamed on one
// side only (Urban Road's P&L says "Foreign Currency Gains and Losses" where
// its budget says "Foreign Currency Loss/Gain", code 62700) split into two rows
// here while the monthly Budget vs Actual page showed one. Same client, same
// pack, two different account lists, and no way for a reader to reconcile
// either of them to Xero.
// ─────────────────────────────────────────────────────────────────────────────

describe('full-year — the approved budget is matched on the account code', () => {
  const XERO_NAME = 'Foreign Currency Gains and Losses'
  const BUDGET_NAME = 'Foreign Currency Loss/Gain'
  const CODE = '62700'

  beforeEach(() => {
    captureMessage.mockClear()
  })

  /** The budget and the actuals share a code and disagree about the name. */
  function renamedAccount() {
    compositeRows = [
      { account_code: CODE, account_name: XERO_NAME, account_type: 'opex', section: '', monthly_values: { '2026-07': 900 } },
    ]
    tables = baseTables({
      monthly_report_settings: [onStore],
      account_mappings: [{ business_id: BIZ, xero_account_name: XERO_NAME, report_category: 'Operating Expenses' }],
      forecast_pl_lines: [],
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [
        { ...budgetLine('bl-1', 'v1', '2026-07', 5000), account_code: CODE, account_name: BUDGET_NAME, category: 'Operating Expenses' },
      ],
    })
  }

  it('emits ONE row for an account renamed on one side only', async () => {
    renamedAccount()
    const { status, body } = await fullYear()
    expect(status).toBe(200)
    const section = (body.report?.sections ?? []).find((s: any) => s.category === 'Operating Expenses')

    expect(section.lines).toHaveLength(1)
    expect(section.lines[0].account_name).toBe(XERO_NAME)
    expect(section.lines[0].approved_annual_budget).toBe(5000)
    // The budget landed on the row that carries the actual, so the subtotal is
    // the budget once — not once on each of two half-rows.
    expect(section.subtotal.approved_annual_budget).toBe(5000)
  })

  it('falls back to the name when the actuals row carries no code', async () => {
    // Xero's synthetic report-only lines arrive with a blank code and can be
    // given one nowhere else, so the name tier has to keep working.
    renamedAccount()
    compositeRows = [
      { account_code: null, account_name: BUDGET_NAME, account_type: 'opex', section: '', monthly_values: { '2026-07': 900 } },
    ]
    tables.account_mappings = [{ business_id: BIZ, xero_account_name: BUDGET_NAME, report_category: 'Operating Expenses' }]

    const { body } = await fullYear()
    const section = (body.report?.sections ?? []).find((s: any) => s.category === 'Operating Expenses')
    expect(section.lines).toHaveLength(1)
    expect(section.lines[0].approved_annual_budget).toBe(5000)
  })

  it('keeps two accounts that share a name but carry different codes', async () => {
    // The mirror-image failure: suppressing by name deletes the second
    // account's whole annual budget from the page, which is worse than the
    // duplicate row it was meant to remove.
    compositeRows = []
    tables = baseTables({
      monthly_report_settings: [onStore],
      account_mappings: [],
      forecast_pl_lines: [],
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [
        { ...budgetLine('bl-1', 'v1', '2026-07', 5000), account_code: '41000', account_name: 'Sales' },
        { ...budgetLine('bl-2', 'v1', '2026-07', 3000), account_code: '41001', account_name: 'Sales' },
      ],
    })

    const { body } = await fullYear()
    const section = (body.report?.sections ?? []).find((s: any) => s.category === 'Revenue')
    expect(section.lines).toHaveLength(2)
    expect(section.subtotal.approved_annual_budget).toBe(8000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// "No forecast" and "a forecast of zero" are different answers.
//
// Distinct Directions has an is_active = false FY2027 forecast and an
// is_active = true FY2026 one, so a FY2027 report resolves no forecast at all
// and every annual_budget below comes out 0. The route says so in one field
// rather than leaving the page to guess from the zeros.
// ─────────────────────────────────────────────────────────────────────────────

describe('full-year — whether a forecast exists at all', () => {
  beforeEach(() => {
    captureMessage.mockClear()
    compositeRows = [
      { account_name: REVENUE, account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-07': 900 } },
    ]
  })

  it('is false when the only forecast for the year is inactive', async () => {
    tables = baseTables({
      monthly_report_settings: [onStore],
      financial_forecasts: [
        { id: 'fc-27', business_id: PROFILE, name: 'FY2027 Financial Forecast', is_active: false, fiscal_year: FY },
        { id: 'fc-26', business_id: PROFILE, name: 'FY2026 Forecast', is_active: true, fiscal_year: 2026 },
      ],
      forecast_pl_lines: [],
      budget_versions: [version('v1', '2026-07')],
      budget_lines: [budgetLine('bl-1', 'v1', '2026-07', 5000)],
    })

    const { status, body } = await fullYear()
    expect(status).toBe(200)
    expect(body.report.forecast_available).toBe(false)
    // The approved budget is still there — it is the only yardstick left.
    expect(body.report.approved_budget_label).toBe('Overall Budget')
    const line = revenueLine(body)
    expect(line.approved_annual_budget).toBe(5000)
    // The zeros are still zeros in the payload; the flag is what stops the
    // page rendering them as a favourable variance.
    expect(line.annual_budget).toBe(0)
  })

  it('is false when the forecast exists but has no materialised lines', async () => {
    // The empty-shell wizard trap: an active forecast the route already
    // demotes. It must demote the flag with it.
    tables = baseTables({ forecast_pl_lines: [] })
    const { body } = await fullYear()
    expect(body.report.forecast_available).toBe(false)
  })

  it('is true whenever a forecast actually backs the columns', async () => {
    tables = baseTables()
    const { body } = await fullYear()
    expect(body.report.forecast_available).toBe(true)
  })
})
