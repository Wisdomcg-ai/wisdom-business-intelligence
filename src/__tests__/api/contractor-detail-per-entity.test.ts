/**
 * Contractors for a business whose organisations use different codes for the
 * same account, printed one column per organisation (DRG-29).
 *
 * Dragon Roofing posts Virtual Contractors to 2300 and Easy Hail to 508 — the
 * same account under a different code — and 2300 names nothing in Easy Hail.
 * Reading both codes in both organisations is how a shared code becomes a
 * shared account; the ledger totals then land on one code and the other falls
 * back to its vendor rows, which double-counts the group.
 *
 * Calxa's August page: OFFICE HQ 655 / 403 / 1,058; TGY Trade Virtual
 * Assistants OPC 3,200 / 0 / 3,200; Virtual Assistant 0 / 13,013 / 13,013;
 * Virtual Contractors 11,704 / 0 / 11,704; total 15,559 / 13,416 / 28,975.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { rollUpContractors } from '@/lib/monthly-report/contractor-rollup'
import { contractorCodesByTenant, parseContractorPageConfig } from '@/lib/monthly-report/contractor-page'
import { MonthlyReportPDFService } from '@/app/finances/monthly-report/services/monthly-report-pdf-service'
import { fixtureReport, textRuns, pageContaining } from '@/app/finances/monthly-report/services/__tests__/pdf-pack-fixture'
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
    from: (table: string) => ({ select: () => chainable(table), upsert: async () => ({ error: null }), delete: () => ({ in: async () => ({ error: null }) }) }),
  })),
}))

import { POST } from '@/app/api/monthly-report/subscription-detail/route'

const DRG = 'tenant-dragon'
const EHC = 'tenant-easy-hail'
const xeroDate = (d: string) => `/Date(${Date.parse(`${d}T00:00:00Z`)}+0000)/`
const CURRENT = 'Date>=DateTime(2026,8,1)'

const bill = (id: string, contact: string, code: string, amount: number) => ({
  InvoiceID: id, Type: 'ACCPAY', Status: 'AUTHORISED', LineAmountTypes: 'NoTax', CurrencyCode: 'AUD',
  Date: xeroDate('2026-08-08'), Contact: { Name: contact },
  LineItems: [{ AccountCode: code, LineAmount: amount, TaxAmount: 0, Description: contact }],
})

/** Each organisation's chart of accounts and bills. 2300 is Dragon's code, 508 Easy Hail's. */
const XERO: Record<string, { accounts: { Code: string; Name: string }[]; bills: any[] }> = {
  [DRG]: {
    accounts: [{ Code: '2300', Name: 'Virtual Contractors' }, { Code: '508', Name: 'Superannuation Payable' }],
    bills: [
      bill('d1', 'OFFICE HQ', '2300', 655.2),
      bill('d2', 'TGY Trade Virtual Assistants OPC', '2300', 3_200),
      bill('d3', 'Virtual Contractors', '2300', 11_703.56),
      // A bill on the OTHER organisation's code: not this account, and not read.
      bill('d4', 'Not a contractor', '508', 5_000),
    ],
  },
  [EHC]: {
    accounts: [{ Code: '508', Name: 'Virtual Contractors' }, { Code: '2300', Name: 'Shareholder Loan' }],
    bills: [bill('e1', 'OFFICE HQ', '508', 403), bill('e2', 'Virtual Assistant', '508', 13_013.22)],
  },
}

function dragonFixtures() {
  const pl = (tenant: string, code: string, aug: number, jul: number) =>
    ({ tenant_id: tenant, account_id: `acct-${tenant}`, account_code: code, account_type: 'opex', section: '', account_name: 'Virtual Contractors', monthly_values: { '2026-07': jul, '2026-08': aug } })
  return {
    xero_connections: {
      rows: [
        { id: 'c-drg', business_id: 'biz-dragon', tenant_id: DRG, tenant_name: 'Dragon Roofing Pty Ltd', display_order: 1, is_active: true, functional_currency: 'AUD' },
        { id: 'c-ehc', business_id: 'biz-dragon', tenant_id: EHC, tenant_name: 'EASY HAIL CLAIM PTY LTD', display_order: 2, is_active: true, functional_currency: 'AUD' },
      ],
    },
    // The contractor accounts are NOT the client's subscription accounts: the
    // write-through must stay out of it.
    monthly_report_settings: { single: { budget_forecast_id: null, subscription_account_codes: ['485'], budget_source: 'forecast' } },
    subscription_budgets: { rows: [] },
    xero_pl_lines_wide_compat: { rows: [pl(DRG, '2300', 15_558.76, 18_525.38), pl(EHC, '508', 13_416.22, 15_955.7)] },
    forecast_pl_lines: { rows: [] },
    financial_forecasts: { rows: [] },
    account_mappings: { rows: [] },
    fx_rates: { rows: [] },
  }
}

beforeEach(() => {
  tableFixtures = dragonFixtures()
  vi.stubGlobal('setTimeout', ((fn: () => void) => { Promise.resolve().then(fn); return 0 }) as any)
  vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => {
    const u = String(url)
    const org = XERO[init?.headers?.['xero-tenant-id']]
    const page = Number(/[?&]page=(\d+)/.exec(u)?.[1] ?? '1')
    const isCurrent = decodeURIComponent(u).includes(CURRENT)
    const body = (b: any) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
    if (u.includes('/api.xro/2.0/Accounts')) return body({ Accounts: org.accounts })
    if (u.includes('/api.xro/2.0/Invoices')) return body({ Invoices: page === 1 && isCurrent ? org.bills : [] })
    return body({ BankTransactions: [] })
  }))
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function run(body: Record<string, unknown>) {
  const res = await POST(new NextRequest('http://localhost/api/monthly-report/subscription-detail', {
    method: 'POST',
    body: JSON.stringify({ business_id: 'biz-dragon', report_month: '2026-08', ...body }),
    headers: { 'content-type': 'application/json' },
  } as any))
  expect(res.status).toBe(200)
  return (await res.json()).data
}

describe('a code each: 2300 in Dragon, 508 in Easy Hail', () => {
  it('reads each organisation on its own code, and the account totals do not double-count', async () => {
    const data = await run({
      account_codes: ['2300', '508'],
      account_codes_by_tenant: { [DRG]: ['2300'], [EHC]: ['508'] },
    })
    const total = data.accounts.reduce((t: number, a: any) => t + a.total_actual, 0)
    expect(total).toBeCloseTo(28_974.98, 2)
    expect(data.grand_total.actual).toBeCloseTo(28_974.98, 2)
    // Dragon's bill on Easy Hail's code is on another account entirely.
    expect(JSON.stringify(data)).not.toContain('Not a contractor')
    const byName = Object.fromEntries(data.accounts.map((a: any) => [a.account_code, a.account_name]))
    expect(byName).toEqual({ '2300': 'Virtual Contractors', '508': 'Virtual Contractors' })
  })

  it('every organisation carries its own figure for the columns', async () => {
    const data = await run({
      account_codes: ['2300', '508'],
      account_codes_by_tenant: { [DRG]: ['2300'], [EHC]: ['508'] },
    })
    const rollup = rollUpContractors(data)
    expect(rollup.tenants).toEqual([
      { tenant_id: DRG, name: 'Dragon Roofing Pty Ltd' },
      { tenant_id: EHC, name: 'EASY HAIL CLAIM PTY LTD' },
    ])
    // Named as every other reader names it (extractVendorName title-cases).
    const office = rollup.contractors.find((c) => c.vendor_key === 'officehq')!
    expect(office.by_tenant).toEqual({ [DRG]: 655.2, [EHC]: 403 })
    expect(rollup.grand_total.by_tenant).toEqual({ [DRG]: 15_558.76, [EHC]: 13_416.22 })
  })

  it('the page prints DRAGON | EHC | TOTAL when the placement asks for it', async () => {
    const data = await run({
      account_codes: ['2300', '508'],
      account_codes_by_tenant: { [DRG]: ['2300'], [EHC]: ['508'] },
    })
    const rollup = rollUpContractors(data)
    const layout: PDFLayout = {
      version: 1,
      pages: [{ id: 'p', orientation: 'portrait', widgets: [{ id: 'w', type: 'contractor_detail', col: 0, row: 0, colSpan: 2, rowSpan: 3, config: { entity_columns: 'actuals' } }] }],
    }
    const doc: any = new MonthlyReportPDFService(fixtureReport(), { pdfLayout: layout, contractorDetail: rollup, contractorDetailReport: data } as never).generate()
    const runs = textRuns(doc, pageContaining(doc, 'Office Hq'))
    // The column headings wrap in their own columns.
    expect(runs.join(' ')).toContain('Dragon Roofing Pty Ltd')
    expect(runs.join(' ')).toContain('EASY HAIL CLAIM PTY LTD')
    const office = runs.indexOf('Office Hq')
    // Department | last month | budget | Dragon | Easy Hail | this month | variance
    expect(runs.slice(office + 4, office + 8)).toEqual(['655', '403', '1,058', '\\(1,058\\)'])
    const total = runs.indexOf('Total')
    expect(runs.slice(total + 4, total + 7)).toEqual(['15,559', '13,416', '28,975'])
  })
})

describe('the placement that names the codes', () => {
  it('reads the map off a contractor page, and a placement with none says so', () => {
    const widgets = [{ type: 'contractor_detail', config: { entity_columns: 'actuals', account_codes_by_tenant: { [DRG]: ['2300'], [EHC]: ['508'] } } }]
    expect(contractorCodesByTenant(widgets)).toEqual({ [DRG]: ['2300'], [EHC]: ['508'] })
    expect(contractorCodesByTenant([{ type: 'contractor_detail', config: {} }])).toBeUndefined()
    expect(contractorCodesByTenant([])).toBeUndefined()
  })

  it('is what the export sends with the contractor figures', () => {
    // page.tsx cannot be mounted here (its import tree pulls the whole app in),
    // so the wiring is read off the source, as the month-change tests do.
    const page = readFileSync(join(process.cwd(), 'src/app/finances/monthly-report/page.tsx'), 'utf8')
    expect(page).toContain('contractorCodesByTenant(contractorWidgets)')
    expect(page).toMatch(/account_codes_by_tenant: codesByTenant/)
  })

  it('is a config the page accepts on its standard layout', () => {
    const parsed = parseContractorPageConfig({ entity_columns: 'actuals', account_codes_by_tenant: { [DRG]: ['2300'] } })
    expect(parsed.ok).toBe(true)
    expect(parsed.config.entity_columns).toBe('actuals')
  })
})
