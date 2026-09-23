/**
 * subscription-detail's DEFAULT figures do not move.
 *
 * Every client with subscription codes reads this route's `actual`,
 * `prior_month_actual` and `variance` — on the standard PDF page, the
 * Subscription tab and the leakage cards — against vendor budgets Step 6
 * seeded on the gross document amount. Quoting those fields net of GST
 * would print a ~10% saving on every Inclusive-billed vendor that nobody
 * made, so the net figures ride beside them (`statement`) for a placement
 * that opts in, and the default fields stay exactly what they were.
 *
 * The first test's expected values are what the route returned at ba3a5902,
 * before the statement basis existed: that test was run against that commit
 * too and passes there unchanged, and the whole response there and here
 * differed only by keys added here (`statement`, `complete`,
 * `total_budget_source`).
 *
 * A forecast-basis client (budget_forecast_id set), one org, GST-inclusive
 * bills and card spend, a USD charge with its own rate, a price rise, a lapsed
 * monthly and an unbudgeted vendor.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allowed: true, reason: 'ok' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  enforceSectionPermission: vi.fn(() => null),
}))
vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: () => 'test-secret-key',
}))
vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn(async () => ({ success: true, accessToken: 'fake-access-token' })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}))
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: vi.fn(async () => true),
}))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async (_c: unknown, id: string) => ({
    businessId: id,
    profileId: 'profile-1',
    all: [id, 'profile-1'],
  })),
}))

let tableFixtures: Record<string, { rows?: any[]; single?: any | null }> = {}
let upserts: { table: string; rows: any[] }[] = []

function chainable(table: string): any {
  const fx = tableFixtures[table] ?? { rows: [], single: null }
  const c: any = {
    eq: () => c, in: () => c, or: () => c, is: () => c, gte: () => c, lte: () => c,
    not: () => c, range: () => c, order: () => c, limit: () => c,
    maybeSingle: async () => ({ data: fx.single ?? null, error: null }),
    single: async () => ({ data: fx.single ?? null, error: null }),
    then: (resolve: any, reject?: any) => Promise.resolve({ data: fx.rows ?? [], error: null }).then(resolve, reject),
  }
  return c
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => chainable(table),
      upsert: async (rows: any[]) => { upserts.push({ table, rows }); return { error: null } },
      delete: () => ({ in: async () => ({ error: null }) }),
    }),
  })),
}))

const xeroDate = (d: string) => `/Date(${Date.parse(`${d}T00:00:00Z`)}+0000)/`
const CURRENT = 'Date>=DateTime(2026,8,1)'

const bill = (id: string, date: string, contact: string, amount: number, tax: number, description: string) => ({
  InvoiceID: id, Type: 'ACCPAY', Status: 'AUTHORISED', LineAmountTypes: 'Inclusive', CurrencyCode: 'AUD',
  Date: xeroDate(date), Contact: { Name: contact },
  LineItems: [{ AccountCode: '63700', LineAmount: amount, TaxAmount: tax, Description: description }],
})

const currentBills = [
  bill('ms-aug', '2026-08-05', 'Machship', 125, 11.36, 'Machship monthly'),
  bill('adobe-aug', '2026-08-09', 'Adobe', 473, 43, 'Creative Cloud'),
  // Bill CL007500: a contact the description does not name.
  bill('edi-aug', '2026-08-12', 'Edi Cloud', 1125, 102.27, 'Yearly EDi Cloud Access\nVendor Number 300405 trading with Harvey Norman (0) = $960.00'),
]
const priorBills = [
  bill('ms-jul', '2026-07-05', 'Machship', 110, 10, 'Machship monthly'),
  bill('adobe-jul', '2026-07-09', 'Adobe', 440, 40, 'Creative Cloud'),
]
const currentBank = [
  {
    BankTransactionID: 'canva-aug', Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-08-14'),
    Contact: { Name: 'Canva' }, CurrencyCode: 'AUD', LineAmountTypes: 'Inclusive',
    LineItems: [{ AccountCode: '63700', LineAmount: 22, TaxAmount: 2, Description: 'Canva Pro' }],
  },
  {
    BankTransactionID: 'claude-aug', Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-08-04'),
    Contact: { Name: 'Anthropic' }, CurrencyCode: 'USD', CurrencyRate: 0.6565, LineAmountTypes: 'NoTax',
    LineItems: [{ AccountCode: '63700', LineAmount: 200, TaxAmount: 0, Description: 'Claude Team' }],
  },
]

function mockFetch(url: any): Promise<Response> {
  const u = String(url)
  const json = (body: any) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))
  const page = Number(/[?&]page=(\d+)/.exec(u)?.[1] ?? '1')
  const isCurrent = decodeURIComponent(u).includes(CURRENT)
  const paged = (items: any[]) => (page === 1 ? items : [])
  if (u.includes('/api.xro/2.0/Accounts')) return json({ Accounts: [{ Code: '63700', Name: 'IT Costs Software' }] })
  if (u.includes('/api.xro/2.0/Invoices')) return json({ Invoices: paged(isCurrent ? currentBills : priorBills) })
  if (u.includes('/api.xro/2.0/BankTransactions')) return json({ BankTransactions: paged(isCurrent ? currentBank : []) })
  return json({})
}

import { POST } from '@/app/api/monthly-report/subscription-detail/route'

/** Only the fields the route has always returned — the ones every client's page reads. */
function defaultFields(data: any) {
  return {
    report_month: data.report_month,
    grand_total: data.grand_total,
    accounts: data.accounts.map((a: any) => ({
      account_code: a.account_code,
      account_name: a.account_name,
      total_prior_month: a.total_prior_month,
      total_actual: a.total_actual,
      total_budget: a.total_budget,
      total_variance: a.total_variance,
      vendors: a.vendors.map((v: any) => ({
        vendor_name: v.vendor_name,
        vendor_key: v.vendor_key,
        prior_month_actual: v.prior_month_actual,
        actual: v.actual,
        budget: v.budget,
        variance: v.variance,
        transaction_count: v.transaction_count,
        category: v.category,
      })),
    })),
    leakage: data.leakage,
  }
}

beforeEach(() => {
  tableFixtures = {
    xero_connections: { rows: [{ id: 'conn-1', business_id: 'biz-1', tenant_id: 'tenant-1', tenant_name: 'Client Pty Ltd', is_active: true, functional_currency: 'AUD' }] },
    monthly_report_settings: { single: { budget_forecast_id: 'fc-1', subscription_account_codes: ['63700'] } },
    subscription_budgets: {
      rows: [
        { vendor_name: 'Machship', vendor_key: 'machship', monthly_budget: 110, account_codes: ['63700'], frequency: 'monthly', renewal_month: null, category: null },
        { vendor_name: 'Adobe', vendor_key: 'adobe', monthly_budget: 440, account_codes: ['63700'], frequency: 'monthly', renewal_month: null, category: null },
        { vendor_name: 'Loom', vendor_key: 'loom', monthly_budget: 22, account_codes: ['63700'], frequency: 'monthly', renewal_month: null, category: null },
      ],
    },
    xero_pl_lines_wide_compat: { rows: [{ account_name: 'IT Costs Software', monthly_values: { '2026-07': 500, '2026-08': 1811.76 } }] },
    forecast_pl_lines: { rows: [{ id: 'fpl-1', account_name: 'IT Costs Software', forecast_months: { '2026-08': 1500 } }] },
    account_mappings: { rows: [] },
  }
  upserts = []
  vi.stubGlobal('fetch', vi.fn(mockFetch))
  vi.stubGlobal('setTimeout', ((fn: () => void) => { Promise.resolve().then(fn); return 0 }) as any)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function run() {
  const res = await POST(new NextRequest('http://localhost/api/monthly-report/subscription-detail', {
    method: 'POST',
    body: JSON.stringify({ business_id: 'biz-1', report_month: '2026-08', account_codes: ['63700'] }),
    headers: { 'content-type': 'application/json' },
  } as any))
  expect(res.status).toBe(200)
  return (await res.json()).data
}

describe('subscription-detail — the default figures are the gross document amounts, as they always were', () => {
  it('vendor rows, account totals, grand total and leakage, to the cent', async () => {
    const data = await run()
    expect(defaultFields(data)).toEqual({
      report_month: '2026-08',
      grand_total: { prior_month: 500, actual: 1811.76, budget: 1500, variance: -311.76 },
      accounts: [{
        account_code: '63700',
        account_name: 'IT Costs Software',
        total_prior_month: 500,
        total_actual: 1811.76,
        total_budget: 1500,
        total_variance: -311.76,
        vendors: [
          { vendor_name: 'Adobe', vendor_key: 'adobe', prior_month_actual: 440, actual: 473, budget: 440, variance: -33, transaction_count: 1, category: null },
          // The document's USD figure, as it always was.
          { vendor_name: 'Anthropic', vendor_key: 'anthropic', prior_month_actual: 0, actual: 200, budget: 0, variance: -200, transaction_count: 1, category: null },
          { vendor_name: 'Canva', vendor_key: 'canva', prior_month_actual: 0, actual: 22, budget: 0, variance: -22, transaction_count: 1, category: null },
          // Named and keyed as extractVendorName names it, as it always was.
          { vendor_name: 'Harvey Norman', vendor_key: 'harveynorman', prior_month_actual: 0, actual: 1125, budget: 0, variance: -1125, transaction_count: 1, category: null },
          { vendor_name: 'Loom', vendor_key: 'loom', prior_month_actual: 0, actual: 0, budget: 22, variance: 22, transaction_count: 0, category: null },
          { vendor_name: 'Machship', vendor_key: 'machship', prior_month_actual: 110, actual: 125, budget: 110, variance: -15, transaction_count: 1, category: null },
        ],
      }],
      leakage: {
        new_unbudgeted: [
          { vendor_key: 'harveynorman', vendor_name: 'Harvey Norman', actual: 1125, expected: 0, delta: 1125 },
          { vendor_key: 'anthropic', vendor_name: 'Anthropic', actual: 200, expected: 0, delta: 200 },
          { vendor_key: 'canva', vendor_name: 'Canva', actual: 22, expected: 0, delta: 22 },
        ],
        price_rises: [
          { vendor_key: 'machship', vendor_name: 'Machship', actual: 125, expected: 110, delta: 15 },
        ],
        lapsed_still_budgeted: [
          { vendor_key: 'loom', vendor_name: 'Loom', actual: 0, expected: 22, delta: -22 },
        ],
        totals: { new_unbudgeted: 1347, price_rises: 15, lapsed_still_budgeted: 22 },
      },
    })
    // The history row is the same gross amount.
    const written = upserts.find((u) => u.table === 'subscription_vendor_actuals')!.rows
    expect(written.map((r: any) => [r.vendor_key, r.amount]).sort()).toEqual([['adobe', 473], ['anthropic', 200], ['canva', 22], ['harveynorman', 1125], ['machship', 125]])
  })

  it('the net figures ride beside them, for a placement that opts in', async () => {
    const data = await run()
    const byKey = Object.fromEntries(data.accounts[0].vendors.map((v: any) => [v.vendor_key, v]))
    expect(byKey.adobe.statement).toEqual({ prior_month_actual: 400, actual: 430, variance: 10 })
    expect(byKey.machship.statement).toEqual({ prior_month_actual: 100, actual: 113.64, variance: -3.64 })
    expect(byKey.anthropic.statement.actual).toBe(304.65)
    expect(byKey.harveynorman).toMatchObject({ vendor_name: 'Harvey Norman', statement: { actual: 1022.73 } })
    expect(byKey.harveynorman).not.toHaveProperty('contact_name')
    expect(byKey.loom.statement).toEqual({ prior_month_actual: 0, actual: 0, variance: 22 })
  })
})

describe('subscription-detail — the month window is bounded where the crawl is', () => {
  const post = (months: unknown) => POST(new NextRequest('http://localhost/api/monthly-report/subscription-detail', {
    method: 'POST',
    body: JSON.stringify({ business_id: 'biz-1', report_month: '2026-08', account_codes: ['63700'], months }),
    headers: { 'content-type': 'application/json' },
  } as any))

  it('refuses more months than the contractor page can print, before reading Xero', async () => {
    // withSchema only observes, so the schema alone would let 12 through: 20
    // extra paced reads an org, toward Xero's 60/min cap and the function's timeout.
    for (const months of [7, 12, 0, 2.5, '3']) {
      const res = await post(months)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('months must be a whole number from 1 to 6')
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reads the window the page asks for', async () => {
    const res = await post(6)
    expect(res.status).toBe(200)
  })
})
