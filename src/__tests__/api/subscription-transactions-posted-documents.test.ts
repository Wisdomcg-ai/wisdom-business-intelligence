/**
 * Forecast wizard Step 6 (Xero/subscription-transactions) crawls posted
 * CHARGES only.
 *
 * It listed bills with no Statuses, fetched them back through `Invoices?IDs=`
 * (which ignores Statuses altogether) with no per-document check, and counted
 * every SPEND bank transaction Xero returned, deleted ones included. So a
 * draft or voided bill was seeded into a subscription budget.
 *
 * Refunds are deliberately NOT read here, though the monthly report's
 * subscription page reads them. Step 6 derives a price, a cadence and an
 * opening budget from charges; netting a refund into those by month turned a
 * refunded $500 trial into a $500/month budget and opened a $100 monthly vendor
 * whose double charge was refunded at $200. Until a refund can be matched to
 * the charge it reverses, the only difference from before is that unposted
 * documents are no longer counted.
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

const TENANT = '8519c134-ed81-4d9b-8f07-ce499d12b7ee'

let tableRows: Record<string, any[]> = {}
let upserts: { table: string; rows: any[] }[] = []
let deletes: { table: string; ids: string[] }[] = []

function chainable(table: string): any {
  const c: any = {
    eq: () => c, in: () => c, gte: () => c, lte: () => c, order: () => c, limit: () => c,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: any, reject?: any) =>
      Promise.resolve({ data: tableRows[table] ?? [], error: null }).then(resolve, reject),
  }
  return c
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => chainable(table),
      upsert: async (rows: any[]) => { upserts.push({ table, rows }); return { error: null } },
      delete: () => ({
        in: async (_col: string, ids: string[]) => { deletes.push({ table, ids }); return { error: null } },
      }),
    }),
  })),
}))

const xeroDate = (d: string) => `/Date(${Date.parse(`${d}T00:00:00Z`)}+0000)/`

function barilliance(InvoiceID: string, Status: string) {
  return {
    InvoiceID, InvoiceNumber: '7888', Type: 'ACCPAY', Status, CurrencyCode: 'USD',
    Date: xeroDate('2026-02-28'), Contact: { Name: 'Barilliance' },
    LineItems: [{ LineItemID: `${InvoiceID}-l1`, AccountCode: '63700', LineAmount: 1500, Description: 'Barilliance subscription' }],
  }
}
const BILLS = [barilliance('bar-7888', 'PAID'), barilliance('bar-draft', 'DRAFT'), barilliance('bar-voided', 'VOIDED')]

const BANK = [
  {
    BankTransactionID: 'issuu-jan', Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-01-15'),
    Reference: 'Issuu', Contact: { Name: 'Issuu' },
    LineItems: [{ AccountCode: '63700', LineAmount: 3279.14, Description: 'Issuu' }],
  },
  {
    BankTransactionID: 'issuu-feb', Type: 'RECEIVE', Status: 'AUTHORISED', Date: xeroDate('2026-02-10'),
    Reference: 'Issuu', Contact: { Name: 'Issuu' },
    LineItems: [{ AccountCode: '63700', LineAmount: 3258, Description: 'Issuu' }],
  },
  {
    // Shaped on Algolia's over-capture; a status fixture only.
    BankTransactionID: 'algolia-deleted', Type: 'SPEND', Status: 'DELETED', Date: xeroDate('2026-02-05'),
    Reference: 'Algolia', Contact: { Name: 'Algolia' },
    LineItems: [{ AccountCode: '63700', LineAmount: 1464.53, Description: 'Algolia' }],
  },
]

let fetchedUrls: string[] = []
let bankStatus = 200
/** The bank list the mocked Xero returns; a test may add to it. */
let bank: any[] = BANK
/** The bills the mocked Xero returns, when a test replaces BILLS. */
let billsOverride: any[] | null = null
/** When set, every bank page is this full page — to reach the page cap. */
let bankEveryPage: any[] | null = null

function mockFetch(url: any): Promise<Response> {
  const u = String(url)
  fetchedUrls.push(u)
  const json = (body: any, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
  const page = Number(/[?&]page=(\d+)/.exec(u)?.[1] ?? '1')
  if (u.includes('/Accounts')) return json({ Accounts: [{ Code: '63700', Name: 'IT Costs Software' }] })
  const bills: any[] = billsOverride ?? BILLS
  if (u.includes('/Invoices?IDs=')) return json({ Invoices: bills })
  if (u.includes('/Invoices')) return json({ Invoices: page === 1 ? bills.map(b => ({ InvoiceID: b.InvoiceID })) : [] })
  if (u.includes('/BankTransactions')) {
    if (bankStatus !== 200) return json({ error: 'boom' }, bankStatus)
    if (bankEveryPage) return json({ BankTransactions: bankEveryPage })
    return json({ BankTransactions: page === 1 ? bank : [] })
  }
  if (u.includes('/Reports/ProfitAndLoss')) return json({ Reports: [] })
  return json({})
}

import { POST } from '@/app/api/Xero/subscription-transactions/route'
import * as Sentry from '@sentry/nextjs'

async function analyze(extra: Record<string, unknown> = {}) {
  const req = new NextRequest('http://localhost/api/Xero/subscription-transactions', {
    method: 'POST',
    body: JSON.stringify({ business_id: '28d41193-38ae-4071-a2b1-0dbea90a38fd', account_codes: ['63700'], ...extra }),
    headers: { 'content-type': 'application/json' },
  } as any)
  const res = await POST(req)
  expect(res.status).toBe(200)
  return res.json()
}

beforeEach(() => {
  // 14 Sep 2026: the prior FY is Jul 2025 – Jun 2026.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-14T00:00:00Z'))
  // The crawl paces Xero at 1.1s a call; nothing here needs to wait.
  vi.stubGlobal('setTimeout', ((fn: () => void) => { Promise.resolve().then(fn); return 0 }) as any)
  vi.stubGlobal('fetch', vi.fn(mockFetch))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  tableRows = {
    xero_connections: [{ id: 'conn-ur', tenant_id: TENANT, tenant_name: 'Urban Road Pty Ltd', functional_currency: 'AUD', is_active: true }],
    xero_pl_lines_wide_compat: [],
  }
  upserts = []
  deletes = []
  fetchedUrls = []
  bankStatus = 200
  bank = BANK
  billsOverride = null
  bankEveryPage = null
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Step 6 subscription crawl — posted charges only', () => {
  it('counts the PAID Barilliance bill once and ignores the draft, the voided bill and a deleted spend', async () => {
    const json = await analyze()

    const bar = json.vendors.find((v: any) => v.vendorName.toLowerCase().includes('barilliance'))
    expect(bar.priorFYAmount).toBe(1500)
    expect(bar.priorFYCount).toBe(1)
    expect(bar.transactionCount).toBe(1)

    expect(json.vendors.some((v: any) => v.vendorName.toLowerCase().includes('algolia'))).toBe(false)
  })

  it('does not count Issuu\'s February refund: 3,279.14 over one transaction, exactly as before', async () => {
    // The ledger nets Issuu to $21.14 (Calxa: −$3,258 in February), and the
    // monthly report's subscription page shows that. Step 6 does not, on
    // purpose: a refund netted into a month is read as a price and a cadence
    // — a charge and its refund 26 days apart became a "monthly" vendor — and
    // there is no matching of a refund to its charge yet. So Step 6 reads the
    // charge alone, which is what it stored before posted-documents-only.
    const json = await analyze()
    const issuu = json.vendors.find((v: any) => v.vendorKey === 'issuu')

    expect(issuu.priorFYAmount).toBe(3279.14)
    expect(issuu.totalAmount).toBe(3279.14)
    expect(issuu.transactionCount).toBe(1)
    expect(issuu.avgAmount).toBe(3279.14)
    expect(issuu.transactions.map((t: any) => t.amount)).toEqual([3279.14])

    const rows = upserts.find(u => u.table === 'subscription_vendor_actuals')!.rows
    expect(rows.filter((r: any) => r.vendor_key === 'issuu')).toEqual([
      expect.objectContaining({ month: '2026-01', amount: 3279.14, tenant_id: TENANT, source: 'analyze' }),
    ])
  })

  it('a SPEND-PREPAYMENT, a SPEND-OVERPAYMENT and a RECEIVE are not charges, even when Xero returns them', async () => {
    const other = (id: string, Type: string, contact: string) => ({
      BankTransactionID: id, Type, Status: 'AUTHORISED', Date: xeroDate('2026-03-10'),
      Reference: contact, Contact: { Name: contact },
      LineItems: [{ AccountCode: '63700', LineAmount: 900, Description: contact }],
    })
    bank = [
      ...BANK,
      other('prepay', 'SPEND-PREPAYMENT', 'Webflow'),
      other('overpay', 'SPEND-OVERPAYMENT', 'Figma'),
      other('receipt', 'RECEIVE', 'Notion'),
    ]
    const json = await analyze()
    const names = json.vendors.map((v: any) => v.vendorName.toLowerCase())
    expect(names.some((n: string) => n.includes('webflow'))).toBe(false)
    expect(names.some((n: string) => n.includes('figma'))).toBe(false)
    expect(names.some((n: string) => n.includes('notion'))).toBe(false)
  })

  it('a negative line on a posted bill still comes off that bill, as it always has', async () => {
    const bills = [{
      InvoiceID: 'hubspot-1', InvoiceNumber: 'HS-1', Type: 'ACCPAY', Status: 'AUTHORISED',
      Date: xeroDate('2026-03-01'), Contact: { Name: 'HubSpot' },
      LineItems: [
        { LineItemID: 'hs-l1', AccountCode: '63700', LineAmount: 800, Description: 'HubSpot' },
        { LineItemID: 'hs-l2', AccountCode: '63700', LineAmount: -200, Description: 'HubSpot' },
      ],
    }]
    billsOverride = bills
    const json = await analyze()
    const hubspot = json.vendors.find((v: any) => v.vendorName.toLowerCase().includes('hubspot'))
    expect(hubspot.priorFYAmount).toBe(600)
    expect(hubspot.transactions.map((t: any) => t.amount).sort((a: number, b: number) => a - b)).toEqual([-200, 800])
  })

  it('asks for posted bills, keeps the SPEND bank request it always sent, and checks every document itself', async () => {
    await analyze()

    const listUrl = fetchedUrls.find(u => u.includes('/Invoices?where='))!
    expect(listUrl).toContain('Statuses=AUTHORISED,PAID')
    // `Invoices?IDs=` ignores Statuses: the mocked batch returns the draft and
    // the voided bill regardless, and only the PAID one was counted (above).
    expect(fetchedUrls.some(u => u.includes('/Invoices?IDs='))).toBe(true)

    const bankUrl = fetchedUrls.find(u => u.includes('/BankTransactions'))!
    const where = new URL(bankUrl).searchParams.get('where')!
    expect(where).toBe('Date>=DateTime(2025,7,1)&&Type=="SPEND"')
  })
})

describe('Step 6 subscription crawl — history is only ever added to', () => {
  // Pruning analyze rows the crawl no longer emits was built and taken out
  // before shipping: subscription_vendor_actuals has no account column, so a
  // run on a narrower account selection would delete history for vendors on
  // the accounts left out. Whether a narrower run should replace history is
  // the coach's decision, not a side effect.
  beforeEach(() => {
    tableRows['subscription_vendor_actuals'] = [
      { id: 'row-issuu-jan', vendor_key: 'issuu', month: '2026-01' },
      { id: 'row-algolia-feb', vendor_key: 'algolia', month: '2026-02' },
    ]
  })

  it('an analyze deletes nothing, even rows it no longer emits', async () => {
    await analyze()
    expect(deletes).toHaveLength(0)
  })
})

describe('Step 6 subscription crawl — a cap reached is reported', () => {
  it('fifty full pages of bank transactions stop the crawl with a page-cap warning', async () => {
    const full = Array.from({ length: 100 }, (_, n) => ({
      BankTransactionID: `pad-${n}`, Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-04-01'),
      Reference: 'Pad', Contact: { Name: 'Pad' },
      LineItems: [{ AccountCode: '99999', LineAmount: 1, Description: 'not a selected account' }],
    }))
    bankEveryPage = full
    await analyze()

    const bankCalls = fetchedUrls.filter(u => u.includes('/BankTransactions'))
    expect(bankCalls).toHaveLength(50)
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('BankTransactions reached the 50-page cap'),
      expect.objectContaining({ tags: expect.objectContaining({ invariant: 'subscription_xero_page_cap' }) }),
    )
  })

  it('a short page is the last page', async () => {
    await analyze()
    expect(fetchedUrls.filter(u => u.includes('/BankTransactions'))).toHaveLength(1)
    expect(fetchedUrls.filter(u => u.includes('/Invoices?where='))).toHaveLength(1)
  })

  it('exhausted 429 retries stop the crawl with a rate-limit warning, not a silent partial', async () => {
    bankStatus = 429
    await analyze()
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('429 retries exhausted'),
      expect.anything(),
    )
  })
})

/**
 * Nothing about how Step 6 reads a vendor it has always counted may change:
 * for all-posted charges with no refund in sight, these figures are what
 * origin/main (7dccafe8) returns for the same Xero documents — captured by
 * running main's route on this fixture, not recomputed by hand.
 */
describe('Step 6 subscription crawl — unchanged for posted charges', () => {
  const canvaSpend = (month: string) => ({
    BankTransactionID: `canva-${month}`, Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate(`${month}-03`),
    Reference: 'Canva', Contact: { Name: 'Canva' },
    LineItems: [{ LineItemID: `canva-${month}-l1`, AccountCode: '63700', LineAmount: 100, Description: 'Canva Pro' }],
  })
  const xeroBill = (month: string, amount: number) => ({
    InvoiceID: `xero-${month}`, InvoiceNumber: `INV-${month}`, Type: 'ACCPAY', Status: 'PAID',
    Date: xeroDate(`${month}-05`), Contact: { Name: 'Xero Limited' },
    LineItems: [{ LineItemID: `xero-${month}-l1`, AccountCode: '63700', LineAmount: amount, Description: 'Xero subscription' }],
  })
  const MONTHS = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
    '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']

  // origin/main's output for this fixture.
  const CANVA_ON_MAIN = {
    priorFYAmount: 900, currentFYAmount: 300, transactionCount: 12, avgAmount: 100,
    suggestedMonthlyBudget: 100, suggestedFrequency: 'monthly', lastPaymentAmount: 100, status: 'active',
  }
  // The FY average reads $57.50; the budget follows the current $65 price.
  const XERO_ON_MAIN = {
    priorFYAmount: 495, currentFYAmount: 195, transactionCount: 12, avgAmount: 57.5,
    suggestedMonthlyBudget: 65, suggestedFrequency: 'monthly', lastPaymentAmount: 65, status: 'active',
  }

  beforeEach(() => {
    bank = MONTHS.map(canvaSpend)
    // $50 a month, then $65 from April 2026.
    billsOverride = MONTHS.map((m, i) => xeroBill(m, i < 6 ? 50 : 65))
  })

  it('a steady monthly vendor and a monthly vendor whose price rose', async () => {
    const json = await analyze()
    const pick = (v: any) => ({
      priorFYAmount: v.priorFYAmount,
      currentFYAmount: v.currentFYAmount,
      transactionCount: v.transactionCount,
      avgAmount: v.avgAmount,
      suggestedMonthlyBudget: v.suggestedMonthlyBudget,
      suggestedFrequency: v.suggestedFrequency,
      lastPaymentAmount: v.lastPaymentAmount,
      status: v.status,
    })

    const canva = json.vendors.find((v: any) => v.vendorKey === 'canva')
    const xero = json.vendors.find((v: any) => v.vendorName.toLowerCase().includes('xero'))

    expect(pick(canva)).toEqual(CANVA_ON_MAIN)
    expect(pick(xero)).toEqual(XERO_ON_MAIN)
  })
})
