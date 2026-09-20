/**
 * The subscription page for a business with more than one Xero organisation:
 * every organisation translated into the report's currency before anything is
 * added up (IICT-35), and an optional column per organisation (DRG-30).
 *
 * IICT's Dues & Subscriptions, August 2026: IICT (Aust) $15,647.59, IICT Group
 * Pty Ltd $163.64 and IICT Group Limited HKD 4,213.13. The page added them
 * one-for-one and printed 20,024 where Calxa p15 prints 16,568 — the HKD org at
 * the month's average rate (0.1795357) gives $756.41 and a total of $16,567.64.
 *
 * Dragon's Subscriptions, August 2026: Calxa p15 prints Actual (Dragon · Easy
 * Hail) 4,729 / 1,786 and a total of 6,515.
 *
 * Tested through the exported POST handler, then the sheet the pack prints.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { MonthlyReportPDFService } from '@/app/finances/monthly-report/services/monthly-report-pdf-service'
import { fixtureReport, textRuns, pageContaining, docText } from '@/app/finances/monthly-report/services/__tests__/pdf-pack-fixture'
import type { PDFLayout } from '@/app/finances/monthly-report/types/pdf-layout'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret-key' }))
vi.mock('@/lib/xero/token-manager', () => ({ getValidAccessToken: vi.fn(async () => ({ success: true, accessToken: 'token' })) }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) } })),
}))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async (_c: unknown, id: string) => ({ businessId: id, profileId: 'profile-1', all: [id, 'profile-1'] })),
}))

let tableFixtures: Record<string, { rows?: any[]; single?: any | null }> = {}

function chainable(table: string): any {
  const fx = tableFixtures[table] ?? { rows: [], single: null }
  const c: any = {
    eq: () => c, in: () => c, or: () => c, is: () => c, not: () => c, order: () => c, limit: () => c,
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
      upsert: async () => ({ error: null }),
      delete: () => ({ in: async () => ({ error: null }) }),
    }),
  })),
}))

import { POST } from '@/app/api/monthly-report/subscription-detail/route'

const xeroDate = (d: string) => `/Date(${Date.parse(`${d}T00:00:00Z`)}+0000)/`
const CURRENT = 'Date>=DateTime(2026,8,1)'

const bill = (id: string, date: string, contact: string, code: string, amount: number, currency = 'AUD') => ({
  InvoiceID: id, Type: 'ACCPAY', Status: 'AUTHORISED', LineAmountTypes: 'NoTax', CurrencyCode: currency,
  Date: xeroDate(date), Contact: { Name: contact },
  LineItems: [{ AccountCode: code, LineAmount: amount, TaxAmount: 0, Description: contact }],
})

/** Xero, per organisation: the chart of accounts and the month's bills. */
function mockFetch(byTenant: Record<string, { name: string; code: string; accountName: string; bills: any[]; prior?: any[] }>) {
  return vi.fn(async (url: any, init: any) => {
    const u = String(url)
    const tenant = init?.headers?.['xero-tenant-id']
    const org = byTenant[tenant]
    const page = Number(/[?&]page=(\d+)/.exec(u)?.[1] ?? '1')
    const isCurrent = decodeURIComponent(u).includes(CURRENT)
    const body = (b: any) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
    if (u.includes('/api.xro/2.0/Accounts')) return body({ Accounts: [{ Code: org.code, Name: org.accountName }] })
    if (u.includes('/api.xro/2.0/Invoices')) return body({ Invoices: page === 1 ? (isCurrent ? org.bills : org.prior ?? []) : [] })
    return body({ BankTransactions: [] })
  })
}

const HKD_AUG = 0.1795357
const HKD_JUL = 0.1830919

const IAP = 'tenant-iap'
const IGL = 'tenant-igl'
const IGP = 'tenant-igp'

function iictFixtures(rates: { aug?: boolean } = { aug: true }) {
  const pl = (tenant: string, aug: number, jul: number) =>
    ({ tenant_id: tenant, account_id: `acct-${tenant}`, account_code: '418', account_type: 'opex', section: '', account_name: 'Dues & Subscriptions', monthly_values: { '2026-07': jul, '2026-08': aug } })
  return {
    xero_connections: {
      rows: [
        { id: 'c-iap', business_id: 'biz-iict', tenant_id: IAP, tenant_name: 'IICT (Aust) Pty Ltd', display_order: 1, is_active: true, functional_currency: 'AUD' },
        { id: 'c-igl', business_id: 'biz-iict', tenant_id: IGL, tenant_name: 'IICT Group Limited', display_order: 2, is_active: true, functional_currency: 'HKD' },
        { id: 'c-igp', business_id: 'biz-iict', tenant_id: IGP, tenant_name: 'IICT Group Pty Ltd', display_order: 3, is_active: true, functional_currency: 'AUD' },
      ],
    },
    monthly_report_settings: { single: { budget_forecast_id: null, subscription_account_codes: ['418'], budget_source: 'forecast' } },
    subscription_budgets: { rows: [] },
    xero_pl_lines_wide_compat: { rows: [pl(IAP, 15_647.59, 14_000), pl(IGL, 4_213.13, 3_000), pl(IGP, 163.64, 150)] },
    forecast_pl_lines: { rows: [] },
    financial_forecasts: { rows: [] },
    account_mappings: { rows: [] },
    fx_rates: {
      rows: [
        { currency_pair: 'HKD/AUD', rate_type: 'monthly_average', period: '2026-07-01', rate: HKD_JUL, source: 'oxr' },
        ...(rates.aug === false ? [] : [{ currency_pair: 'HKD/AUD', rate_type: 'monthly_average', period: '2026-08-01', rate: HKD_AUG, source: 'oxr' }]),
      ],
    },
  }
}

const IICT_XERO = {
  [IAP]: { name: 'IICT (Aust) Pty Ltd', code: '418', accountName: 'Dues & Subscriptions', bills: [bill('iap-1', '2026-08-04', 'Hubspot', '418', 4_552), bill('iap-2', '2026-08-06', 'itac.technology Pty Ltd', '418', 3_218)], prior: [bill('iap-p', '2026-07-04', 'Hubspot', '418', 4_552)] },
  [IGL]: { name: 'IICT Group Limited', code: '418', accountName: 'Dues & Subscriptions', bills: [bill('igl-1', '2026-08-09', 'Sakari', '418', 4_213.13, 'HKD')], prior: [] },
  [IGP]: { name: 'IICT Group Pty Ltd', code: '418', accountName: 'Dues & Subscriptions', bills: [bill('igp-1', '2026-08-11', 'Apple', '418', 163.64)], prior: [] },
}

const DRG = 'tenant-dragon'
const EHC = 'tenant-easy-hail'

function dragonFixtures() {
  const pl = (tenant: string, aug: number, jul: number) =>
    ({ tenant_id: tenant, account_id: `acct-${tenant}`, account_code: '485', account_type: 'opex', section: '', account_name: 'Subscriptions', monthly_values: { '2026-07': jul, '2026-08': aug } })
  return {
    xero_connections: {
      rows: [
        { id: 'c-ehc', business_id: 'biz-dragon', tenant_id: EHC, tenant_name: 'EASY HAIL CLAIM PTY LTD', display_order: 2, is_active: true, functional_currency: 'AUD' },
        { id: 'c-drg', business_id: 'biz-dragon', tenant_id: DRG, tenant_name: 'Dragon Roofing Pty Ltd', display_order: 1, is_active: true, functional_currency: 'AUD' },
      ],
    },
    monthly_report_settings: { single: { budget_forecast_id: null, subscription_account_codes: ['485'], budget_source: 'forecast' } },
    subscription_budgets: { rows: [{ vendor_name: 'Zendesk', vendor_key: 'zendesk', monthly_budget: 2_000, account_codes: ['485'], frequency: 'monthly', renewal_month: null, category: null }] },
    xero_pl_lines_wide_compat: { rows: [pl(DRG, 4_729.08, 4_256.13), pl(EHC, 1_786, 2_967.98)] },
    forecast_pl_lines: { rows: [] },
    financial_forecasts: { rows: [] },
    account_mappings: { rows: [] },
    fx_rates: { rows: [] },
  }
}

const DRAGON_XERO = {
  [DRG]: { name: 'Dragon Roofing Pty Ltd', code: '485', accountName: 'Subscriptions', bills: [bill('d-1', '2026-08-03', 'Zendesk', '485', 1_195), bill('d-2', '2026-08-05', 'Buildertrend', '485', 1_185), bill('d-3', '2026-08-07', 'Intellica Solution', '485', 2_349.08)], prior: [] },
  [EHC]: { name: 'EASY HAIL CLAIM PTY LTD', code: '485', accountName: 'Subscriptions', bills: [bill('e-1', '2026-08-03', 'Zendesk', '485', 745), bill('e-2', '2026-08-08', 'Open AI', '485', 1_041)], prior: [] },
}

async function run(businessId: string, accountCodes: string[]) {
  const res = await POST(new NextRequest('http://localhost/api/monthly-report/subscription-detail', {
    method: 'POST',
    body: JSON.stringify({ business_id: businessId, report_month: '2026-08', account_codes: accountCodes }),
    headers: { 'content-type': 'application/json' },
  } as any))
  expect(res.status).toBe(200)
  return (await res.json()).data
}

/** The pack's subscriptions sheet for a response. */
function sheet(data: any, config: Record<string, unknown>, titleOverride?: string) {
  const layout: PDFLayout = {
    version: 1,
    pages: [{ id: 'p', orientation: 'portrait', widgets: [{ id: 'w', type: 'subscription_detail', col: 0, row: 0, colSpan: 2, rowSpan: 3, config, ...(titleOverride ? { titleOverride } : {}) }] }],
  }
  return new MonthlyReportPDFService(fixtureReport(), { pdfLayout: layout, subscriptionDetail: data, entityName: 'IICT Group Consolidated' } as never).generate() as any
}

beforeEach(() => {
  vi.stubGlobal('setTimeout', ((fn: () => void) => { Promise.resolve().then(fn); return 0 }) as any)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('IICT — every organisation is translated before anything is added up', () => {
  beforeEach(() => {
    tableFixtures = iictFixtures()
    vi.stubGlobal('fetch', mockFetch(IICT_XERO))
  })

  it('the account total is 16,567.64, not the 20,024 of three currencies added together', async () => {
    const data = await run('biz-iict', ['418'])
    expect(data.accounts[0].total_actual).toBe(16_567.64)
    expect(data.grand_total.actual).toBe(16_567.64)
    // Each organisation's own figure, in AUD, for the per-entity columns.
    expect(data.accounts[0].total_by_tenant).toEqual({ [IAP]: 15_647.59, [IGL]: 756.41, [IGP]: 163.64 })
    expect(data.statement_unavailable).toBeUndefined()
  })

  it('a vendor billed in HKD is quoted in AUD', async () => {
    const data = await run('biz-iict', ['418'])
    const sakari = data.accounts[0].vendors.find((v: any) => v.vendor_key === 'sakari')
    expect(sakari.actual).toBeCloseTo(756.41, 2)
  })

  it("the sheet's TOTAL prints 16,568, under the placement's own title", async () => {
    const data = await run('biz-iict', ['418'])
    const doc = sheet(data, { layout: 'calxa', total_budget: 'vendor_sum' }, 'Dues & Subscriptions Summary')
    const runs = textRuns(doc, pageContaining(doc, 'TOTAL'))
    // The title wraps; jsPDF sets the em dash in its own encoding.
    expect(runs.slice(0, 2).join(' ')).toMatch(/^Dues & Subscriptions Summary \W+IICT Group\s?Consolidated/)
    const at = runs.indexOf('TOTAL')
    // Last month (14,000 + 150 + HKD 3,000 at July's rate) | Budget | Aug-26 | Variance
    expect(runs.slice(at + 1, at + 5)).toEqual(['14,699', '0', '16,568', '\\(16,568\\)'])
  })

  it('prints no figures at all when the month has no rate, and says which', async () => {
    tableFixtures = iictFixtures({ aug: false })
    const data = await run('biz-iict', ['418'])
    expect(data.accounts).toEqual([])
    expect(data.translation_unavailable.missing).toEqual([{ currency_pair: 'HKD/AUD', period: '2026-08' }])
    const doc = sheet(data, { layout: 'calxa' })
    const text = docText(doc)
    expect(text).toContain('no HKD/AUD exchange rate is stored for Aug 2026')
    expect(text).not.toContain('16,568')
  })
})

describe('IICT — an organisation whose Xero connection has lapsed', () => {
  beforeEach(() => {
    // IICT Group Limited drops off the way IICT Group Pty Ltd did on 10 Sep
    // 2026: no connection, its August rows still in the mirror. Its books are
    // in HKD, and with the connection gone nothing says so.
    const fixtures = iictFixtures()
    fixtures.xero_connections.rows = fixtures.xero_connections.rows.filter((c) => c.tenant_id !== IGL)
    tableFixtures = fixtures
    vi.stubGlobal('fetch', mockFetch(IICT_XERO))
  })

  it('leaves its ledger rows out of the total rather than add HKD to AUD one-for-one', async () => {
    const data = await run('biz-iict', ['418'])
    expect(data.accounts[0].total_actual).toBe(15_811.23)
    expect(data.grand_total.actual).toBe(15_811.23)
    expect(data.accounts[0].total_by_tenant).toEqual({ [IAP]: 15_647.59, [IGP]: 163.64 })
    expect(data.unconnected_tenants).toEqual([IGL])
  })

  it('holds when only one organisation is left, where there are no columns to give the mismatch away', async () => {
    const fixtures = iictFixtures()
    fixtures.xero_connections.rows = fixtures.xero_connections.rows.filter((c) => c.tenant_id === IAP)
    tableFixtures = fixtures
    const data = await run('biz-iict', ['418'])
    expect(data.accounts[0].total_actual).toBe(15_647.59)
    expect(data.unconnected_tenants).toEqual([IGL, IGP])
    // One organisation: no split to print, and none claimed.
    expect(data.accounts[0].total_by_tenant).toBeUndefined()
    expect(docText(sheet(data, { layout: 'calxa', total_budget: 'vendor_sum' }))).toContain('2 Xero organisations posted to')
  })

  it("the sheet's columns add to its TOTAL, and it says an organisation is missing", async () => {
    const data = await run('biz-iict', ['418'])
    const doc = sheet(data, { layout: 'calxa', entity_columns: 'actuals', total_budget: 'vendor_sum' })
    const runs = textRuns(doc, pageContaining(doc, 'TOTAL'))
    const at = runs.indexOf('TOTAL')
    // Last month (14,000 + 150) | Budget | IICT (Aust) | IICT Group Pty Ltd | Aug-26 | Variance
    expect(runs.slice(at + 1, at + 7)).toEqual(['14,150', '0', '15,648', '164', '15,811', '\\(15,811\\)'])
    expect(docText(doc)).toContain('is not connected to WisdomBI')
  })
})

describe('Dragon — a column per organisation on the sheet (Calxa p15)', () => {
  beforeEach(() => {
    tableFixtures = dragonFixtures()
    vi.stubGlobal('fetch', mockFetch(DRAGON_XERO))
  })

  it('the route carries each organisation, in display order', async () => {
    const data = await run('biz-dragon', ['485'])
    expect(data.tenants).toEqual([
      { tenant_id: DRG, name: 'Dragon Roofing Pty Ltd' },
      { tenant_id: EHC, name: 'EASY HAIL CLAIM PTY LTD' },
    ])
    expect(data.accounts[0].total_by_tenant).toEqual({ [DRG]: 4_729.08, [EHC]: 1_786 })
    const zendesk = data.accounts[0].vendors.find((v: any) => v.vendor_key === 'zendesk')
    expect(zendesk.by_tenant).toEqual({ [DRG]: 1_195, [EHC]: 745 })
  })

  it('the sheet prints Dragon · Easy Hail · Total', async () => {
    const data = await run('biz-dragon', ['485'])
    const doc = sheet(data, { layout: 'calxa', entity_columns: 'actuals', total_budget: 'vendor_sum' })
    const page = pageContaining(doc, 'TOTAL')
    const runs = textRuns(doc, page)
    expect(runs).toContain('Dragon Roofing Pty Ltd')
    expect(runs).toContain('EASY HAIL CLAIM PTY LTD')
    const at = runs.indexOf('TOTAL')
    // Last month | Budget | Dragon | Easy Hail | Total | Variance
    expect(runs.slice(at + 1, at + 7)).toEqual(['7,224', '2,000', '4,729', '1,786', '6,515', '\\(4,515\\)'])
    const zendesk = runs.indexOf('Zendesk')
    expect(runs.slice(zendesk + 1, zendesk + 7)).toEqual(['0', '2,000', '1,195', '745', '1,940', '60'])
  })

  it('splits the vendor rows when the ledger has no figure for the account, never a column of zeros', async () => {
    // The P&L read came back with nothing for this account — it threw and was
    // swallowed, or the account's name was never learned — so the Actual falls
    // back to the vendor rows. The columns beside it fall back with it: a $0
    // there means "we could not read it", which is a dash's job, not a figure's.
    tableFixtures = { ...dragonFixtures(), xero_pl_lines_wide_compat: { rows: [] } }
    const data = await run('biz-dragon', ['485'])
    expect(data.accounts[0].total_actual).toBe(6_515.08)
    expect(data.accounts[0].total_by_tenant).toEqual({ [DRG]: 4_729.08, [EHC]: 1_786 })
    const runs = textRuns(sheet(data, { layout: 'calxa', entity_columns: 'actuals', total_budget: 'vendor_sum' }), 1)
    const at = runs.indexOf('TOTAL')
    expect(runs.slice(at + 1, at + 7)).toEqual(['0', '2,000', '4,729', '1,786', '6,515', '\\(4,515\\)'])
  })

  it('leaves the columns off when the placement does not ask for them', async () => {
    const data = await run('biz-dragon', ['485'])
    const runs = textRuns(sheet(data, { layout: 'calxa', total_budget: 'vendor_sum' }), 1)
    expect(runs).not.toContain('Dragon Roofing Pty Ltd')
    const at = runs.indexOf('TOTAL')
    expect(runs.slice(at + 1, at + 5)).toEqual(['7,224', '2,000', '6,515', '\\(4,515\\)'])
  })
})
