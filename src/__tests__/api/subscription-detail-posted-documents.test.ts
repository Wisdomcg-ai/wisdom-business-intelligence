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
  const c: any = {
    eq: (col: string, val: unknown) => { filters.push([col, val]); return c },
    in: () => c,
    or: () => c,
    is: () => c,
    gte: () => c,
    lte: () => c,
    order: () => c,
    limit: () => c,
    maybeSingle: async () => ({ data: fx.single ?? null, error: fx.error ?? null }),
    single: async () => ({ data: fx.single ?? null, error: fx.error ?? null }),
    then: (resolve: any, reject?: any) => {
      const rows = table !== 'subscription_vendor_actuals'
        ? (fx.rows ?? [])
        : (fx.rows ?? []).filter(r => filters.every(([col, val]) => !(col in r) || r[col] === val))
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
    xero_connections: { rows: [{ id: 'conn-ur', business_id: 'biz-ur', tenant_id: '8519c134-ed81-4d9b-8f07-ce499d12b7ee', is_active: true }] },
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
    expect(vendors[0].actual).toBe(1125)
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
