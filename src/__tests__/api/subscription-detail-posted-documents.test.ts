/**
 * subscription-detail quotes posted documents only, signed by document type.
 *
 * The route asked Xero for bills by Type and Date with no Statuses ("Xero
 * excludes DELETED and VOIDED by default" — it does not; a DRAFT and a VOIDED
 * Team Global Express bill reached Urban Road's August 2026 commentary through
 * exactly that request) and for bank transactions with `Type=="SPEND"`, which
 * dropped every refund received. Contractor Analysis calls this route too:
 * Reena Rosales was paid $1,600 in August 2026 (Calxa), and this route said
 * $2,400.
 *
 * Harness copied from subscription-detail-budget-only.test.ts, extended to
 * route Xero fixtures by URL, record the URLs, and record the vendor-actuals
 * writes (upsert and delete).
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

type TableData = { rows?: any[]; single?: any | null; error?: any | null }
let tableFixtures: Record<string, TableData> = {}
let upserts: { table: string; rows: any[] }[] = []
let deletes: { table: string; ids: string[] }[] = []

function chainable(table: string): any {
  const fx = tableFixtures[table] ?? { rows: [], single: null }
  // The history table honours .eq on the columns a fixture row carries, so a
  // test can see WHICH rows a prune was allowed to read.
  const filters: [string, unknown][] = []
  // A keyset page (readAllRows: budget_lines) asks for the rows after the last
  // id it received; honouring that is what lets the read reach its empty page.
  let after: [string, string] | null = null
  const c: any = {
    eq: (col: string, val: unknown) => { filters.push([col, val]); return c },
    in: () => c,
    or: () => c,
    is: () => c,
    gte: () => c,
    lte: () => c,
    gt: (col: string, val: string) => { after = [col, val]; return c },
    not: () => c,
    range: () => c,
    order: () => c,
    limit: () => c,
    maybeSingle: async () => ({ data: fx.single ?? null, error: fx.error ?? null }),
    single: async () => ({ data: fx.single ?? null, error: fx.error ?? null }),
    then: (resolve: any, reject?: any) => {
      let rows = table !== 'subscription_vendor_actuals'
        ? (fx.rows ?? [])
        : (fx.rows ?? []).filter(r => filters.every(([col, val]) => !(col in r) || r[col] === val))
      if (after) {
        const [col, val] = after
        rows = rows.filter(r => String(r[col]) > val)
      }
      return Promise.resolve({ data: rows, error: fx.error ?? null }).then(resolve, reject)
    },
  }
  return c
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => chainable(table),
      upsert: async (rows: any[]) => {
        upserts.push({ table, rows })
        return { error: null }
      },
      delete: () => ({
        in: async (_col: string, ids: string[]) => {
          deletes.push({ table, ids })
          return { error: null }
        },
      }),
    }),
  })),
}))

// ── Xero, routed by URL ──────────────────────────────────────────────────────
type Pager = (page: number) => any[]
let xero: {
  accounts: any[]
  currentBank: Pager
  priorBank: Pager
  currentBills: Pager
  priorBills: Pager
}
let fetchedUrls: string[] = []

const none: Pager = () => []
const onePage = (items: any[]): Pager => (page) => (page === 1 ? items : [])

function mockFetch(url: any): Promise<Response> {
  const u = String(url)
  fetchedUrls.push(u)
  const json = (body: any) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))
  const page = Number(/[?&]page=(\d+)/.exec(u)?.[1] ?? '1')
  const decoded = decodeURIComponent(u)
  // report_month is always the later of the two months in these tests.
  const isCurrent = decoded.includes(currentRange)
  if (u.includes('/api.xro/2.0/Accounts')) return json({ Accounts: xero.accounts })
  if (u.includes('/api.xro/2.0/Invoices')) {
    return json({ Invoices: (isCurrent ? xero.currentBills : xero.priorBills)(page) })
  }
  if (u.includes('/api.xro/2.0/BankTransactions')) {
    return json({ BankTransactions: (isCurrent ? xero.currentBank : xero.priorBank)(page) })
  }
  return json({})
}
let currentRange = ''

import * as Sentry from '@sentry/nextjs'
import { POST } from '@/app/api/monthly-report/subscription-detail/route'
import { createVendorKey, extractVendorName } from '@/lib/utils/vendor-normalization'
import { buildSubscriptionPageModel, parseSubscriptionPageConfig } from '@/lib/monthly-report/subscription-page'

function makeRequest(body: any): NextRequest {
  return new NextRequest('http://localhost/api/monthly-report/subscription-detail', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  } as any)
}

async function run(report_month: string, account_codes: string[]) {
  const [y, m] = report_month.split('-').map(Number)
  currentRange = `Date>=DateTime(${y},${m},1)`
  const res = await POST(makeRequest({ business_id: 'biz-ur', report_month, account_codes }))
  expect(res.status).toBe(200)
  return (await res.json()).data
}

const xeroDate = (d: string) => `/Date(${Date.parse(`${d}T00:00:00Z`)}+0000)/`

// ── Real-shaped fixtures ─────────────────────────────────────────────────────
function ediCloud(status: string, id = 'fa73d1a9-9752-4dcc-b7a8-04d451b77b45') {
  return {
    InvoiceID: id, InvoiceNumber: 'CL007500', Type: 'ACCPAY', Status: status,
    LineAmountTypes: 'Inclusive', CurrencyCode: 'AUD', Date: xeroDate('2026-08-12'),
    Contact: { Name: 'Harvey Norman' },
    LineItems: [{
      AccountCode: '63700', LineAmount: 1125, TaxAmount: 102.27,
      Description: 'Yearly EDi Cloud Access\nVendor Number 300405 trading with Harvey Norman (0) = $960.00',
    }],
  }
}
const EDI_KEY = createVendorKey(extractVendorName(
  'Harvey Norman',
  'Yearly EDi Cloud Access\nVendor Number 300405 trading with Harvey Norman (0) = $960.00',
))

const reenaBill = (n: number, description: string) => ({
  InvoiceID: `reena-${n}`, InvoiceNumber: `UR-RR008${n}`, Type: 'ACCPAY', Status: 'PAID',
  Date: xeroDate('2026-08-08'), Contact: { Name: 'Reena Rosales' },
  LineItems: [{ AccountCode: '61400', LineAmount: 400, Description: description }],
})
const reenaBank = (id: string, Type: string, Status: string, Description: string) => ({
  BankTransactionID: id, Type, Status, Date: xeroDate('2026-08-18'), Reference: '',
  Contact: { Name: 'Reena Rosales' },
  LineItems: [{ AccountCode: '61400', LineAmount: 400, Description }],
})

beforeEach(() => {
  tableFixtures = {
    xero_connections: { rows: [{ id: 'conn-ur', business_id: 'biz-ur', tenant_id: '8519c134-ed81-4d9b-8f07-ce499d12b7ee', is_active: true, functional_currency: 'AUD' }] },
    subscription_budgets: { rows: [] },
  }
  upserts = []
  deletes = []
  fetchedUrls = []
  xero = {
    accounts: [
      { Code: '63700', Name: 'IT Costs Software' },
      { Code: '61400', Name: 'Contractors excl. Artists' },
    ],
    currentBank: none, priorBank: none, currentBills: none, priorBills: none,
  }
  vi.stubGlobal('fetch', vi.fn(mockFetch))
  // The route paces Xero with 300ms sleeps; the page-cap case would take seconds.
  vi.stubGlobal('setTimeout', ((fn: () => void) => { Promise.resolve().then(fn); return 0 }) as any)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('subscription-detail — posted documents only', () => {
  it('a DRAFT and a VOIDED copy of the Edi Cloud bill are not spend; the AUTHORISED one is', async () => {
    xero.currentBills = onePage([
      ediCloud('AUTHORISED'),
      ediCloud('DRAFT', 'edi-draft'),
      ediCloud('VOIDED', 'edi-voided'),
    ])

    const data = await run('2026-08', ['63700'])
    const vendors = data.accounts.find((a: any) => a.account_code === '63700').vendors
    expect(vendors).toHaveLength(1)
    expect(vendors[0].vendor_key).toBe(EDI_KEY)
    // The gross $1,125 by default; net of its $102.27 GST for a page that asks.
    expect(vendors[0].actual).toBe(1125)
    expect(vendors[0].statement.actual).toBe(1022.73)
    expect(vendors[0].transaction_count).toBe(1)

    const invoiceUrls = fetchedUrls.filter(u => u.includes('/Invoices'))
    const bankUrls = fetchedUrls.filter(u => u.includes('/BankTransactions'))
    expect(invoiceUrls).toHaveLength(2)
    expect(bankUrls).toHaveLength(2)
    for (const u of invoiceUrls) expect(u).toContain('Statuses=AUTHORISED,PAID')
    for (const u of bankUrls) {
      expect(u).toContain(encodeURIComponent('Status=="AUTHORISED"'))
      expect(u).not.toContain(encodeURIComponent('Type=="SPEND"'))
    }
  })

  it('Contractor Analysis: Reena Rosales, August 2026, is $1,600 — as Calxa prints — and writes no subscription history', async () => {
    tableFixtures['monthly_report_settings'] = { single: { budget_forecast_id: null, subscription_account_codes: ['63700', '63706'] } }
    xero.currentBills = onePage([
      reenaBill(2, '3-7 Aug 26'),
      reenaBill(3, '10-14 August 26'),
      reenaBill(4, '17-20th August 26'),
      reenaBill(5, '24-28 August 26'),
    ])
    xero.currentBank = onePage([
      reenaBank('bt-in', 'RECEIVE', 'AUTHORISED', 'Renna returned funds from wise, repaid 19/8/26'),
      reenaBank('bt-out', 'SPEND', 'AUTHORISED', 'repayment of returned funds'),
      reenaBank('bt-deleted', 'SPEND', 'DELETED', 'repayment of returned funds'),
    ])

    const data = await run('2026-08', ['61400'])
    const vendors = data.accounts.find((a: any) => a.account_code === '61400').vendors
    const total = vendors.reduce((s: number, v: any) => s + v.actual, 0)
    expect(total).toBe(1600)
    expect(vendors.reduce((s: number, v: any) => s + v.transaction_count, 0)).toBe(6)
    // One contractor, however the descriptions name her.
    const reena = vendors.find((v: any) => v.actual === 1600)
    expect(reena).toBeTruthy()

    expect(upserts.filter(u => u.table === 'subscription_vendor_actuals')).toHaveLength(0)
    expect(deletes).toHaveLength(0)
  })

  it('Issuu, February 2026: the refund received shows, against January\'s charge', async () => {
    tableFixtures['monthly_report_settings'] = { single: { budget_forecast_id: null, subscription_account_codes: ['63700'] } }
    xero.currentBank = onePage([{
      BankTransactionID: 'issuu-feb', Type: 'RECEIVE', Status: 'AUTHORISED', Date: xeroDate('2026-02-10'),
      Reference: 'Issuu', Contact: { Name: 'Issuu' },
      LineItems: [{ AccountCode: '63700', LineAmount: 3258, Description: 'Issuu' }],
    }])
    xero.priorBank = onePage([{
      BankTransactionID: 'issuu-jan', Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-01-15'),
      Reference: 'Issuu', Contact: { Name: 'Issuu' },
      LineItems: [{ AccountCode: '63700', LineAmount: 3279.14, Description: 'Issuu' }],
    }])

    const data = await run('2026-02', ['63700'])
    const issuu = data.accounts.find((a: any) => a.account_code === '63700').vendors[0]
    expect(issuu.vendor_key).toBe('issuu')
    expect(issuu.actual).toBe(-3258)
    expect(issuu.prior_month_actual).toBe(3279.14)

    const written = upserts.find(u => u.table === 'subscription_vendor_actuals')!.rows
    expect(written).toEqual([expect.objectContaining({ vendor_key: 'issuu', month: '2026-02', amount: -3258, source: 'report' })])
  })

  // A month the range helper cannot read has no Xero request to make. Before
  // the posted-documents change the route split the string and asked Xero for
  // DateTime(2026,13,1) anyway; now it must refuse before any fetch.
  it.each(['2026-13', '2026-8', 'abc', '2026-00', '2026-08-01'])('a malformed report_month (%s) is a 400, and Xero is never asked', async (report_month) => {
    const res = await POST(makeRequest({ business_id: 'biz-ur', report_month, account_codes: ['63700'] }))
    expect(res.status).toBe(400)
    expect(fetchedUrls).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(deletes).toHaveLength(0)
  })
})

describe('subscription-detail — stale vendor-month rows', () => {
  beforeEach(() => {
    tableFixtures['monthly_report_settings'] = { single: { budget_forecast_id: null, subscription_account_codes: ['63700'] } }
    tableFixtures['subscription_vendor_actuals'] = {
      rows: [
        // As prod holds it: written by this page on 11 Sep 07:22.
        { id: 'row-avocado', vendor_key: 'avocadoblvd', source: 'report' },
        { id: 'row-edi', vendor_key: EDI_KEY, source: 'report' },
      ],
    }
    xero.currentBills = onePage([ediCloud('AUTHORISED')])
  })

  it('deletes the viewed month\'s rows for vendors no longer in its posted documents (avocadoblvd 2026-08 $6,500), keeps the rest', async () => {
    await run('2026-08', ['63700'])
    expect(deletes).toEqual([{ table: 'subscription_vendor_actuals', ids: ['row-avocado'] }])
  })

  it('leaves the wizard\'s own history alone — its accounts may be wider than this page\'s', async () => {
    // Step 6 analyses whatever accounts the operator picks; this page reads the
    // accounts nominated in the report settings. In prod two businesses budget
    // subscriptions on accounts outside those (eight codes each), so an
    // 'analyze' row for this month may be a vendor this page never looks for.
    // This page prunes only its own ('report') rows.
    tableFixtures['subscription_vendor_actuals'] = {
      rows: [
        { id: 'row-avocado', vendor_key: 'avocadoblvd', source: 'report' },
        { id: 'row-wizard-freight', vendor_key: 'teamglobalexpress', source: 'analyze' },
      ],
    }
    await run('2026-08', ['63700'])
    expect(deletes).toEqual([{ table: 'subscription_vendor_actuals', ids: ['row-avocado'] }])
  })

  it('deletes nothing when the month could not be read whole — and says why', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      BankTransactionID: `bt-${i}`, Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-08-03'),
      Contact: { Name: 'Somebody' }, LineItems: [{ AccountCode: '44000', LineAmount: 10 }],
    }))
    xero.currentBank = () => fullPage

    await run('2026-08', ['63700'])
    expect(deletes).toHaveLength(0)
    const capWarnings = vi.mocked(Sentry.captureMessage).mock.calls
      .filter(([, opts]: any[]) => opts?.tags?.invariant === 'subscription_xero_page_cap')
    expect(capWarnings).toHaveLength(1)
    expect(fetchedUrls.filter(u => u.includes('/BankTransactions') && decodeURIComponent(u).includes('DateTime(2026,8,1)'))).toHaveLength(10)
  })

  it('deletes nothing when Xero never stops rate limiting — three retries, one warning, then stop', async () => {
    // The pager used to retry a 429 forever. It now retries the same page three
    // times, warns once, and reports the list incomplete, so the avocadoblvd row
    // the previous test deletes must survive here.
    vi.stubGlobal('fetch', vi.fn((url: any) => {
      const decoded = decodeURIComponent(String(url))
      if (decoded.includes('/BankTransactions') && decoded.includes(currentRange)) {
        fetchedUrls.push(String(url))
        return Promise.resolve(new Response('', { status: 429 }))
      }
      return mockFetch(url)
    }))

    await run('2026-08', ['63700'])
    const currentBankCalls = fetchedUrls.filter(u => u.includes('/BankTransactions') && decodeURIComponent(u).includes('DateTime(2026,8,1)'))
    expect(currentBankCalls).toHaveLength(4)
    for (const u of currentBankCalls) expect(u).toMatch(/[?&]page=1$/)
    const rateWarnings = vi.mocked(Sentry.captureMessage).mock.calls
      .filter(([, opts]: any[]) => opts?.tags?.invariant === 'subscription_xero_rate_limit')
    expect(rateWarnings).toHaveLength(1)
    expect(deletes).toHaveLength(0)
  })

  it('deletes nothing when the caller asked for only some of the subscription accounts', async () => {
    tableFixtures['monthly_report_settings'] = { single: { budget_forecast_id: null, subscription_account_codes: ['63700', '63706'] } }
    await run('2026-08', ['63700'])
    expect(upserts.filter(u => u.table === 'subscription_vendor_actuals')).toHaveLength(1)
    expect(deletes).toHaveLength(0)
  })
})

describe('subscription-detail — the P&L\'s money and the approved budget', () => {
  beforeEach(() => {
    tableFixtures['monthly_report_settings'] = { single: { budget_forecast_id: null, subscription_account_codes: ['63700'] } }
  })

  it('Edi Cloud, August 2026: the row keeps the gross $1,125 the history and Step 6 hold, with $1,022.73 net of GST beside it', async () => {
    xero.currentBills = onePage([ediCloud('AUTHORISED')])
    const data = await run('2026-08', ['63700'])
    const edi = data.accounts[0].vendors[0]
    expect(edi.actual).toBe(1125)
    expect(edi.variance).toBe(-1125)
    expect(edi.statement).toEqual({ prior_month_actual: 0, actual: 1022.73, variance: -1022.73 })
    const written = upserts.find(u => u.table === 'subscription_vendor_actuals')!.rows
    expect(written).toEqual([expect.objectContaining({ vendor_key: EDI_KEY, month: '2026-08', amount: 1125, source: 'report' })])
  })

  it('a US-dollar card charge is divided by its own CurrencyRate, and a refund on the same basis comes off', async () => {
    xero.currentBank = onePage([
      {
        BankTransactionID: 'claude-aug', Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-08-04'),
        Contact: { Name: 'Anthropic' }, CurrencyCode: 'USD', CurrencyRate: 0.6565, LineAmountTypes: 'NoTax',
        LineItems: [{ AccountCode: '63700', LineAmount: 200, TaxAmount: 0, Description: 'Claude Team' }],
      },
      {
        BankTransactionID: 'claude-refund', Type: 'RECEIVE', Status: 'AUTHORISED', Date: xeroDate('2026-08-20'),
        Contact: { Name: 'Anthropic' }, CurrencyCode: 'USD', CurrencyRate: 0.6565, LineAmountTypes: 'NoTax',
        LineItems: [{ AccountCode: '63700', LineAmount: 20, TaxAmount: 0, Description: 'Claude Team credit' }],
      },
    ])
    const data = await run('2026-08', ['63700'])
    const claude = data.accounts[0].vendors[0]
    // The document's own figure by default, as it always was; the org's money beside it.
    expect(claude.actual).toBe(180)
    expect(claude.statement.actual).toBeCloseTo(180 / 0.6565, 2)
    expect(data.accounts[0].unconverted).toBeUndefined()
  })

  it('a foreign line with no exchange rate is in no vendor\'s figure, and the account says which line it was', async () => {
    xero.currentBank = onePage([{
      BankTransactionID: 'cf-aug', Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-08-09'),
      Contact: { Name: 'Cloudflare' }, CurrencyCode: 'USD', LineAmountTypes: 'NoTax',
      LineItems: [{ AccountCode: '63700', LineAmount: 25, TaxAmount: 0, Description: 'Cloudflare Pro' }],
    }])
    const data = await run('2026-08', ['63700'])
    const account = data.accounts[0]
    expect(account.vendors[0].actual).toBe(25)
    expect(account.vendors[0].statement.actual).toBe(0)
    expect(account.unconverted).toEqual([
      expect.objectContaining({ vendor_name: 'Cloudflare', amount: 25, source_currency: 'USD', is_current: true }),
    ])
  })

  it('a budget-store client: the TOTAL budget is the approved $13,697 for 63700, not the vendor budgets\' $14,253', async () => {
    tableFixtures['monthly_report_settings'] = {
      single: { budget_forecast_id: null, subscription_account_codes: ['63700'], budget_source: 'budget_version' },
    }
    tableFixtures['business_profiles'] = { single: { fiscal_year_start: 7 } }
    tableFixtures['budget_versions'] = {
      rows: [{ id: '72c658c0-b7e5-4578-b028-9db202d04227', label: 'FY27 Xero budget', effective_from: '2026-07', version_number: 1, tenant_id: '8519c134-ed81-4d9b-8f07-ce499d12b7ee' }],
    }
    tableFixtures['budget_lines'] = {
      rows: [
        { id: 'bl-1', account_code: '63700', account_name: 'IT Costs Software', category: 'Operating Expenses', month: '2026-07', amount: 13862, budget_version_id: '72c658c0-b7e5-4578-b028-9db202d04227' },
        { id: 'bl-2', account_code: '63700', account_name: 'IT Costs Software', category: 'Operating Expenses', month: '2026-08', amount: 13697, budget_version_id: '72c658c0-b7e5-4578-b028-9db202d04227' },
      ],
    }
    tableFixtures['subscription_budgets'] = {
      rows: [{ vendor_key: 'shopify', vendor_name: 'Shopify', monthly_budget: 4500, account_codes: ['63700'], frequency: 'monthly', renewal_month: null }],
    }
    tableFixtures['xero_pl_lines_wide_compat'] = {
      rows: [{ account_name: 'IT Costs Software', monthly_values: { '2026-07': 13764.27, '2026-08': 14725.73 } }],
    }
    xero.currentBills = onePage([ediCloud('AUTHORISED')])

    const data = await run('2026-08', ['63700'])
    const account = data.accounts[0]
    expect(account.total_budget).toBe(13697)
    expect(account.total_budget_source).toBe('approved_budget')
    expect(account.total_actual).toBe(14725.73)
    expect(account.total_prior_month).toBe(13764.27)
  })

  describe('a budget-store client also carries the TOTAL budget its standard page printed before the store', () => {
    // Before the budget store this page read the forecast regardless of
    // budget_source, falling back to the vendor budgets. The standard layout
    // still prints that unless its placement asks for the approved budget
    // (subscription-page `total_budget`), so the route has to carry it.
    beforeEach(() => {
      tableFixtures['monthly_report_settings'] = {
        single: { budget_forecast_id: null, subscription_account_codes: ['63700'], budget_source: 'budget_version' },
      }
      tableFixtures['business_profiles'] = { single: { fiscal_year_start: 7 } }
      tableFixtures['budget_versions'] = {
        rows: [{ id: '72c658c0-b7e5-4578-b028-9db202d04227', label: 'FY27 Xero budget', effective_from: '2026-07', version_number: 1, tenant_id: '8519c134-ed81-4d9b-8f07-ce499d12b7ee' }],
      }
      tableFixtures['budget_lines'] = {
        rows: [{ id: 'bl-2', account_code: '63700', account_name: 'IT Costs Software', category: 'Operating Expenses', month: '2026-08', amount: 13697, budget_version_id: '72c658c0-b7e5-4578-b028-9db202d04227' }],
      }
      tableFixtures['subscription_budgets'] = {
        rows: [{ vendor_key: 'shopify', vendor_name: 'Shopify', monthly_budget: 4500, account_codes: ['63700'], frequency: 'monthly', renewal_month: null }],
      }
      tableFixtures['xero_pl_lines_wide_compat'] = {
        rows: [{ account_name: 'IT Costs Software', monthly_values: { '2026-08': 14725.73 } }],
      }
    })

    it('no forecast line (Urban Road): the vendor budgets, $4,500 — beside the approved $13,697, which is unchanged', async () => {
      const data = await run('2026-08', ['63700'])
      const account = data.accounts[0]
      expect(account.total_budget).toBe(13697)
      expect(account.total_budget_source).toBe('approved_budget')
      expect(account.pre_budget_store_total).toEqual({ budget: 4500, variance: -10225.73, source: 'vendor_sum' })
      expect(data.pre_budget_store_grand_budget).toBe(4500)
    })

    it('a pinned forecast with the account (Precision Electrical: $3,811.52): the forecast line', async () => {
      tableFixtures['monthly_report_settings'] = {
        single: { budget_forecast_id: 'fc-1', subscription_account_codes: ['63700'], budget_source: 'budget_version' },
      }
      tableFixtures['forecast_pl_lines'] = { rows: [{ id: 'fl-1', account_name: 'IT Costs Software', forecast_months: { '2026-08': 3811.52 } }] }
      const data = await run('2026-08', ['63700'])
      const account = data.accounts[0]
      expect(account.total_budget).toBe(13697)
      expect(account.pre_budget_store_total).toEqual({ budget: 3811.52, variance: -10914.21, source: 'forecast' })
      expect(data.pre_budget_store_grand_budget).toBe(3811.52)
    })

    it('a forecast-basis client carries neither: its total_budget already is that figure', async () => {
      tableFixtures['monthly_report_settings'] = { single: { budget_forecast_id: null, subscription_account_codes: ['63700'] } }
      const data = await run('2026-08', ['63700'])
      expect(data.accounts[0].total_budget).toBe(4500)
      expect(data.accounts[0]).not.toHaveProperty('pre_budget_store_total')
      expect(data).not.toHaveProperty('pre_budget_store_grand_budget')
    })
  })

  it('a forecast-basis client keeps the vendor-budget fallback it had, and says that is what it is', async () => {
    tableFixtures['subscription_budgets'] = {
      rows: [{ vendor_key: 'shopify', vendor_name: 'Shopify', monthly_budget: 4500, account_codes: ['63700'], frequency: 'monthly', renewal_month: null }],
    }
    const data = await run('2026-08', ['63700'])
    expect(data.accounts[0].total_budget).toBe(4500)
    expect(data.accounts[0].total_budget_source).toBe('vendor_sum')
  })

  it('vendor rows adding to more than the P&L account are recorded as an invariant breach', async () => {
    tableFixtures['xero_pl_lines_wide_compat'] = {
      rows: [{ account_name: 'IT Costs Software', monthly_values: { '2026-08': 900 } }],
    }
    xero.currentBills = onePage([ediCloud('AUTHORISED')])
    await run('2026-08', ['63700'])
    const breaches = vi.mocked(Sentry.captureMessage).mock.calls
      .filter(([, opts]: any[]) => opts?.tags?.invariant === 'subscription-vendors-exceed-account')
    expect(breaches).toHaveLength(1)
  })

  it('the breach is judged on the statement figures: a gross $1,125 over a $1,050 account is its GST, not a breach', async () => {
    tableFixtures['xero_pl_lines_wide_compat'] = {
      rows: [{ account_name: 'IT Costs Software', monthly_values: { '2026-08': 1050 } }],
    }
    xero.currentBills = onePage([ediCloud('AUTHORISED')])
    await run('2026-08', ['63700'])
    const breaches = vi.mocked(Sentry.captureMessage).mock.calls
      .filter(([, opts]: any[]) => opts?.tags?.invariant === 'subscription-vendors-exceed-account')
    expect(breaches).toHaveLength(0)
  })
})

describe('subscription-detail — review fixes', () => {
  beforeEach(() => {
    tableFixtures['monthly_report_settings'] = { single: { budget_forecast_id: null, subscription_account_codes: ['63700'] } }
  })

  it('a price rise past 10% on an Inclusive-billed monthly vendor still reaches the price-rises card: leakage reads gross, as its budgets were seeded', async () => {
    // Step 6 seeded the budget at the gross $110 (100 + GST). The vendor now
    // bills $125 gross, 13.6% more. On the page that is $113.64 net, which
    // against the gross budget is 3.3% — a net actual needs a 21% rise before
    // the card sees it. (Exactly 10% is not used: 110 × 1.1 is
    // 121.00000000000001 in floating point, so $121 misses the gate on either
    // basis.)
    tableFixtures['subscription_budgets'] = {
      rows: [{ vendor_key: 'machship', vendor_name: 'Machship', monthly_budget: 110, account_codes: ['63700'], frequency: 'monthly', renewal_month: null }],
    }
    xero.currentBills = onePage([{
      InvoiceID: 'ms-aug', Type: 'ACCPAY', Status: 'AUTHORISED', LineAmountTypes: 'Inclusive', CurrencyCode: 'AUD',
      Date: xeroDate('2026-08-05'), Contact: { Name: 'Machship' },
      LineItems: [{ AccountCode: '63700', LineAmount: 125, TaxAmount: 11.36, Description: 'Machship monthly' }],
    }])
    const data = await run('2026-08', ['63700'])
    expect(data.accounts[0].vendors[0].actual).toBe(125)
    expect(data.accounts[0].vendors[0].statement.actual).toBe(113.64)
    expect(data.leakage.price_rises).toEqual([expect.objectContaining({ vendor_key: 'machship', actual: 125, expected: 110 })])
  })

  it('a budget row on an account this page did not ask for is not this page\'s budget: no lapsed contractor, no borrowed vendor budget', async () => {
    // Urban Road's data step C01 activates 15 monthly contractor rows on 61400
    // ($30,081 a month). The subscription page asks for 63700 only, so its
    // crawl never sees a contractor payment — and every one of those rows read
    // as a subscription "lapsed, still budgeted".
    tableFixtures['subscription_budgets'] = {
      rows: [
        { vendor_key: 'shopify', vendor_name: 'Shopify', monthly_budget: 4500, account_codes: ['63700'], frequency: 'monthly', renewal_month: null },
        { vendor_key: 'reenarosales', vendor_name: 'Reena Rosales', monthly_budget: 1600, account_codes: ['61400'], frequency: 'monthly', renewal_month: null, category: 'Design' },
        // The same key budgeted on another account: not Shopify's budget on this one.
        { vendor_key: 'shopify', vendor_name: 'Shopify', monthly_budget: 999, account_codes: ['61400'], frequency: 'monthly', renewal_month: null },
        // A legacy row with no account recorded cannot be said to be off this page, so it stays, as it always has.
        { vendor_key: 'loom', vendor_name: 'Loom', monthly_budget: 20, account_codes: null, frequency: 'monthly', renewal_month: null },
      ],
    }
    xero.currentBills = onePage([{
      InvoiceID: 'shopify-aug', Type: 'ACCPAY', Status: 'AUTHORISED', LineAmountTypes: 'NoTax', CurrencyCode: 'AUD',
      Date: xeroDate('2026-08-05'), Contact: { Name: 'Shopify' },
      LineItems: [{ AccountCode: '63700', LineAmount: 4500, TaxAmount: 0, Description: 'Shopify Plus' }],
    }])
    const data = await run('2026-08', ['63700'])
    expect(data.accounts[0].vendors.map((v: any) => [v.vendor_key, v.budget])).toEqual([['shopify', 4500]])
    expect(data.leakage.lapsed_still_budgeted.map((l: any) => l.vendor_key)).toEqual(['loom'])
    expect(data.leakage.price_rises).toEqual([])

    // Asked for its own account, the contractor row is budgeted there.
    xero.currentBills = none
    const contractors = await run('2026-08', ['61400'])
    expect(contractors.leakage.lapsed_still_budgeted.map((l: any) => l.vendor_key)).toEqual(expect.arrayContaining(['reenarosales']))
    expect(contractors.accounts[0].vendors.find((v: any) => v.vendor_key === 'reenarosales')).toMatchObject({ budget: 1600, category: 'Design' })
  })

  it('an unbudgeted foreign line with no exchange rate is still on the new-unbudgeted card', async () => {
    xero.currentBank = onePage([{
      BankTransactionID: 'cf-aug', Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-08-09'),
      Contact: { Name: 'Cloudflare' }, CurrencyCode: 'USD', LineAmountTypes: 'NoTax',
      LineItems: [{ AccountCode: '63700', LineAmount: 25, TaxAmount: 0, Description: 'Cloudflare Pro' }],
    }])
    const data = await run('2026-08', ['63700'])
    expect(data.leakage.new_unbudgeted.map((l: any) => l.vendor_key)).toEqual(['cloudflare'])
  })

  it('a card line and a bill on one key print under the vendor\'s name — never the bank\'s, the card\'s or the business\'s own', async () => {
    // A contact that is not a known vendor is usually not the vendor at all:
    // the bank a card charge came through, a staff reimbursement, the client
    // itself. None of them may name the row, on either layout.
    xero.currentBank = onePage([
      {
        BankTransactionID: 'cba-adobe', Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-08-03'),
        Contact: { Name: 'Commonwealth Bank' }, CurrencyCode: 'AUD', LineAmountTypes: 'Inclusive',
        LineItems: [{ AccountCode: '63700', LineAmount: 110, TaxAmount: 10, Description: 'ADOBE *CREATIVE CLOUD' }],
      },
      {
        BankTransactionID: 'own-xero', Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-08-05'),
        Contact: { Name: 'Urban Road Pty Ltd' }, CurrencyCode: 'AUD', LineAmountTypes: 'Inclusive',
        LineItems: [{ AccountCode: '63700', LineAmount: 55, TaxAmount: 5, Description: 'Xero subscription' }],
      },
    ])
    xero.currentBills = onePage([{
      InvoiceID: 'adobe-bill', Type: 'ACCPAY', Status: 'AUTHORISED', LineAmountTypes: 'Inclusive', CurrencyCode: 'AUD',
      Date: xeroDate('2026-08-10'), Contact: { Name: 'Profit Peak Pty Ltd' },
      LineItems: [{ AccountCode: '63700', LineAmount: 220, TaxAmount: 20, Description: 'Adobe Creative Cloud seats' }],
    }])
    const data = await run('2026-08', ['63700'])
    const vendors = data.accounts[0].vendors
    expect(vendors.map((v: any) => [v.vendor_key, v.vendor_name, v.actual])).toEqual([['adobe', 'Adobe', 330], ['xero', 'Xero', 55]])
    for (const v of vendors) expect(v).not.toHaveProperty('contact_name')
    const parsed = parseSubscriptionPageConfig({ layout: 'calxa' })
    const model = buildSubscriptionPageModel(data, parsed.config)
    expect(model.rows.filter((r) => r.kind === 'vendor').map((r) => r.label)).toEqual(['Adobe', 'Xero'])
  })

  it('Edi Cloud, August 2026: the row keeps its canonical name and key; the sheet\'s name is the placement\'s label for that key', async () => {
    xero.currentBills = onePage([{ ...ediCloud('AUTHORISED'), Contact: { Name: 'Edi Cloud' } }])
    const data = await run('2026-08', ['63700'])
    const row = data.accounts[0].vendors[0]
    expect(row).toMatchObject({ vendor_key: 'harveynorman', vendor_name: 'Harvey Norman' })
    expect(row).not.toHaveProperty('contact_name')
    const parsed = parseSubscriptionPageConfig({ layout: 'calxa', labels: { harveynorman: 'Edi Cloud' } })
    expect(buildSubscriptionPageModel(data, parsed.config).rows[0]).toMatchObject({ label: 'Edi Cloud', actual: 1022.73 })
  })

  it('a whole crawl says it is complete', async () => {
    const data = await run('2026-08', ['63700'])
    expect(data.complete).toBe(true)
    expect(data.incomplete_reason).toBeUndefined()
  })

  it('no active Xero connection is an answer that could not be checked, not an empty month', async () => {
    tableFixtures['xero_connections'] = { rows: [] }
    const data = await run('2026-08', ['61400'])
    expect(data.accounts).toEqual([])
    expect(data.complete).toBe(false)
    expect(data.incomplete_reason).toBe('the business has no active Xero connection')
  })

  it('an org whose token is unavailable makes the answer incomplete, and names the org', async () => {
    tableFixtures['xero_connections'] = { rows: [{ id: 'conn-ur', business_id: 'biz-ur', tenant_id: 't-ur', tenant_name: 'Urban Road Pty Ltd', is_active: true, functional_currency: 'AUD' }] }
    const { getValidAccessToken } = await import('@/lib/xero/token-manager')
    vi.mocked(getValidAccessToken).mockResolvedValueOnce({ success: false } as any)
    const data = await run('2026-08', ['61400'])
    expect(data.complete).toBe(false)
    expect(data.incomplete_reason).toBe('Xero could not be read for Urban Road Pty Ltd')
  })

  it('a month Xero did not return whole is incomplete', async () => {
    tableFixtures['xero_connections'] = { rows: [{ id: 'conn-ur', business_id: 'biz-ur', tenant_id: 't-ur', tenant_name: 'Urban Road Pty Ltd', is_active: true, functional_currency: 'AUD' }] }
    vi.stubGlobal('fetch', vi.fn((url: any) => {
      const decoded = decodeURIComponent(String(url))
      if (decoded.includes('/BankTransactions') && decoded.includes(currentRange)) return Promise.resolve(new Response('', { status: 429 }))
      return mockFetch(url)
    }))
    const data = await run('2026-08', ['61400'])
    expect(data.complete).toBe(false)
    expect(data.incomplete_reason).toBe('Xero did not return every transaction for Urban Road Pty Ltd')
  })

  it('a budget-store client with no version in force has no total budget — 0, source none, and the reason — not the vendor sum', async () => {
    tableFixtures['monthly_report_settings'] = {
      single: { budget_forecast_id: null, subscription_account_codes: ['63700'], budget_source: 'budget_version' },
    }
    tableFixtures['business_profiles'] = { single: { fiscal_year_start: 7 } }
    tableFixtures['budget_versions'] = { rows: [] }
    tableFixtures['subscription_budgets'] = {
      rows: [{ vendor_key: 'shopify', vendor_name: 'Shopify', monthly_budget: 4500, account_codes: ['63700'], frequency: 'monthly', renewal_month: null }],
    }
    const data = await run('2026-08', ['63700'])
    const account = data.accounts[0]
    expect(account.total_budget).toBe(0)
    expect(account.total_budget_source).toBe('none')
    expect(account.total_budget_absent).toBe('no approved budget version is locked for FY2027')
    // The vendor's own budget is still its row's.
    expect(account.vendors[0].budget).toBe(4500)
    expect(data.grand_total.budget).toBe(0)
  })
})

describe('subscription-detail — organisations in different currencies', () => {
  const AU = { id: 'conn-au', business_id: 'biz-ur', tenant_id: 't-au', tenant_name: 'IICT Pty Ltd', is_active: true, functional_currency: 'AUD' }
  const HK = { id: 'conn-hk', business_id: 'biz-ur', tenant_id: 't-hk', tenant_name: 'IICT (HK) Ltd', is_active: true, functional_currency: 'HKD' }
  const adobeBill = (id: string, amount: number, currency: string) => ({
    InvoiceID: id, Type: 'ACCPAY', Status: 'AUTHORISED', LineAmountTypes: 'NoTax', CurrencyCode: currency,
    Date: xeroDate('2026-08-10'), Contact: { Name: 'Adobe' },
    LineItems: [{ AccountCode: '63700', LineAmount: amount, TaxAmount: 0, Description: 'Creative Cloud' }],
  })

  let hkBillCurrency = 'HKD'

  beforeEach(() => {
    hkBillCurrency = 'HKD'
    tableFixtures['monthly_report_settings'] = { single: { budget_forecast_id: null, subscription_account_codes: ['63700'] } }
    // Each org answers with its own bills.
    vi.stubGlobal('fetch', vi.fn((url: any, init?: any) => {
      const tenant = init?.headers?.['xero-tenant-id']
      const decoded = decodeURIComponent(String(url))
      if (decoded.includes('/Invoices') && decoded.includes(currentRange)) {
        const items = tenant === 't-hk' ? [adobeBill('hk-1', 4730, hkBillCurrency)] : tenant === 't-au' ? [adobeBill('au-1', 430, 'AUD')] : []
        const page = Number(/[?&]page=(\d+)/.exec(String(url))?.[1] ?? '1')
        return Promise.resolve(new Response(JSON.stringify({ Invoices: page === 1 ? items : [] }), { status: 200 }))
      }
      return mockFetch(url)
    }))
  })

  it('AUD and HKD orgs: no vendor claims a figure in one currency, the answer says why, and no invariant fires', async () => {
    tableFixtures['xero_connections'] = { rows: [AU, HK] }
    tableFixtures['xero_pl_lines_wide_compat'] = { rows: [{ tenant_id: 't-au', account_name: 'IT Costs Software', monthly_values: { '2026-08': 430 } }] }
    const data = await run('2026-08', ['63700'])
    const adobe = data.accounts[0].vendors[0]
    expect(adobe.statement).toBeUndefined()
    expect(data.statement_unavailable).toEqual({ reason: 'mixed_currencies', currencies: ['AUD', 'HKD'] })
    const breaches = vi.mocked(Sentry.captureMessage).mock.calls
      .filter(([, opts]: any[]) => opts?.tags?.invariant === 'subscription-vendors-exceed-account')
    expect(breaches).toHaveLength(0)
    // The sheet refuses the vendor figures and says why — not "money this account did not post".
    const model = buildSubscriptionPageModel(data, parseSubscriptionPageConfig({ layout: 'calxa' }).config)
    expect(model.rows.filter((r) => r.kind === 'vendor' || r.kind === 'unallocated')).toEqual([])
    const notes = model.notes.join(' ')
    expect(notes).toContain('AUD and HKD')
    expect(notes).not.toContain('did not post')
    expect(notes).not.toContain('gross amounts')
  })

  it('several orgs, one with no recorded currency, cannot be vouched for either', async () => {
    tableFixtures['xero_connections'] = { rows: [AU, { ...HK, functional_currency: null }] }
    const data = await run('2026-08', ['63700'])
    expect(data.statement_unavailable).toEqual({ reason: 'mixed_currencies', currencies: ['AUD', null] })
  })

  it('two orgs in the same currency, and one org with none recorded, keep their net figures', async () => {
    tableFixtures['xero_connections'] = { rows: [AU, { ...HK, functional_currency: 'AUD' }] }
    hkBillCurrency = 'AUD'
    let data = await run('2026-08', ['63700'])
    expect(data.statement_unavailable).toBeUndefined()
    expect(data.accounts[0].vendors[0].statement.actual).toBe(5160)
    tableFixtures['xero_connections'] = { rows: [{ ...AU, functional_currency: null }] }
    data = await run('2026-08', ['63700'])
    expect(data.statement_unavailable).toBeUndefined()
    // One org's lines are one currency whatever it is; an unknown base is toStatementAmount's to handle, line by line.
    expect(data.accounts[0].vendors[0].statement).toBeDefined()
  })

  it('the account total is every org\'s P&L line, not whichever org\'s row came back last (Dragon: two AUD orgs on 485)', async () => {
    tableFixtures['xero_connections'] = { rows: [AU, { ...HK, functional_currency: 'AUD' }] }
    tableFixtures['xero_pl_lines_wide_compat'] = {
      rows: [
        { tenant_id: 't-au', account_name: 'IT Costs Software', monthly_values: { '2026-07': 400, '2026-08': 430 } },
        { tenant_id: 't-hk', account_name: 'IT Costs Software', monthly_values: { '2026-07': 700, '2026-08': 4730 } },
      ],
    }
    const data = await run('2026-08', ['63700'])
    expect(data.accounts[0].total_actual).toBe(5160)
    expect(data.accounts[0].total_prior_month).toBe(1100)
    expect(data.grand_total.actual).toBe(5160)
  })
})

describe('subscription-detail — a budget-store client whose approved budget could not be read', () => {
  it('fails closed with the reason — not the vendor sum, and not "no budget line of its own"', async () => {
    tableFixtures['monthly_report_settings'] = {
      single: { budget_forecast_id: null, subscription_account_codes: ['63700'], budget_source: 'budget_version' },
    }
    tableFixtures['subscription_budgets'] = {
      rows: [{ vendor_key: 'shopify', vendor_name: 'Shopify', monthly_budget: 4500, account_codes: ['63700'], frequency: 'monthly', renewal_month: null }],
    }
    const { resolveBusinessProfileIds } = await import('@/lib/business/resolveBusinessProfileIds')
    // The P&L read resolves ids first, then the pre-budget-store forecast read;
    // the approved budget read is the third call.
    const ok = async (_c: unknown, id: string) => ({ businessId: id, profileId: 'profile-1', all: [id, 'profile-1'] }) as any
    vi.mocked(resolveBusinessProfileIds)
      .mockImplementationOnce(ok)
      .mockImplementationOnce(ok)
      .mockRejectedValueOnce(new Error('connection reset'))
    xero.currentBills = onePage([ediCloud('AUTHORISED')])
    const data = await run('2026-08', ['63700'])
    const account = data.accounts[0]
    expect(account.total_budget).toBe(0)
    expect(account.total_budget_source).toBe('none')
    expect(account.total_budget_absent).toBe('the approved budget could not be read')
    // The standard page's figure was read before, and is not lost with it.
    expect(account.pre_budget_store_total).toEqual({ budget: 4500, variance: 3375, source: 'vendor_sum' })
  })
})
