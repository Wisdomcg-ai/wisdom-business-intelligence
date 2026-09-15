/**
 * Commentary for a business with more than one Xero organisation reads EVERY
 * organisation, merges what it finds by account NAME, states every supplier in
 * the report's money, and paces its calls to each organisation (IICT-29,
 * DRG-19).
 *
 * The route took ONE connection — the newest by created_at, which Dragon's two
 * and IICT's three share to the microsecond — so a consolidated pack quoted one
 * organisation's suppliers under figures that are both organisations'. Calxa's
 * Dragon p13: "Legal expenses | Simpson Quinn ($2,931)" is Dragon's $1,459 and
 * Easy Hail's $1,472 together; its Virtual Contractors table has OFFICE HQ in
 * both. IICT p14 quotes "EA Consulting Services ($3,080); IGL freelance
 * services ($2,873)" — an AUD org and an HKD one under one account.
 *
 * Tested through the exported POST handler, with Xero's API faked per tenant
 * and a virtual clock, so the pacing is measured without waiting for it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { virtualClock, busiestWindow } from '@/lib/xero/__tests__/virtual-clock'

const hoisted = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  tokenFails: new Set<string>(),
  clock: null as any,
}))

vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) } })),
}))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: vi.fn(() => 'test-secret-key') }))
vi.mock('@/lib/reports/revert-report', () => ({ revertReportIfApproved: vi.fn(async () => undefined) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async (_s: unknown, id: string) => ({ businessId: id, profileId: `${id}-profile`, all: [id, `${id}-profile`] })),
}))
vi.mock('@/lib/xero/tenant-call-pacer', async (importOriginal) => {
  const actual: any = await importOriginal()
  return { ...actual, get systemClock() { return hoisted.clock } }
})

const tokenLog: { id: string; start: number; end: number }[] = []
vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn(async ({ id }: { id: string }) => {
    const start = hoisted.clock.now()
    await hoisted.clock.sleep(500)
    tokenLog.push({ id, start, end: hoisted.clock.now() })
    return hoisted.tokenFails.has(id) ? { success: false } : { success: true, accessToken: `token-${id}` }
  }),
}))

/** In-memory tables behind the service-role client, for the chains the route builds. */
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      const filters: Array<(r: any) => boolean> = []
      const sorts: Array<[string, boolean]> = []
      let cap = Infinity
      const rows = () => {
        const out = (hoisted.tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
        for (const [col, asc] of [...sorts].reverse()) out.sort((a, b) => (a[col] === b[col] ? 0 : (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1)))
        return out.slice(0, cap)
      }
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q },
        in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q },
        not: (c: string, _op: string, _v: unknown) => { filters.push((r) => r[c] !== null && r[c] !== undefined); return q },
        order: (c: string, o?: { ascending?: boolean }) => { sorts.push([c, o?.ascending ?? true]); return q },
        limit: (n: number) => { cap = n; return q },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: any, reject: any) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
      }
      return q
    },
  })),
}))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'

// ─── Xero, faked per tenant ─────────────────────────────────────────────────

type Doc = { Type: string; Status: string; Date: string; Contact: { Name: string }; CurrencyCode?: string; CurrencyRate?: number; LineAmountTypes?: string; LineItems: { AccountCode: string; LineAmount: number; TaxAmount?: number; Description?: string }[] }
const AUG = '/Date(1754611200000+0000)/'
const bill = (contact: string, code: string, amount: number, extra: Partial<Doc> = {}): Doc => ({
  Type: 'ACCPAY', Status: 'AUTHORISED', Date: AUG, Contact: { Name: contact }, LineAmountTypes: 'Exclusive',
  LineItems: [{ AccountCode: code, LineAmount: amount, TaxAmount: 0 }], ...extra,
})

const calls: { tenant: string; url: string; at: number }[] = []
const openByTenant = new Map<string, number>()
const mostOpenByTenant = new Map<string, number>()

function fakeXero(docs: Record<string, Doc[]>, opts: { fullPages?: boolean; rateLimitOnce?: boolean } = {}) {
  const limited = new Set<string>()
  return vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
    const tenant = init.headers['xero-tenant-id']
    calls.push({ tenant, url, at: hoisted.clock.now() })
    openByTenant.set(tenant, (openByTenant.get(tenant) ?? 0) + 1)
    mostOpenByTenant.set(tenant, Math.max(mostOpenByTenant.get(tenant) ?? 0, openByTenant.get(tenant)!))
    await hoisted.clock.sleep(150)
    openByTenant.set(tenant, (openByTenant.get(tenant) ?? 1) - 1)
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? 1)
    const key = `${tenant}|${url.replace(/[?&]page=\d+/, '')}|${page}`
    if (opts.rateLimitOnce && page === 3 && !limited.has(key)) {
      limited.add(key)
      return { ok: false, status: 429, json: async () => ({}) }
    }
    const dataKey = url.includes('/Invoices?') ? 'Invoices' : url.includes('/BankTransactions?') ? 'BankTransactions' : 'CreditNotes'
    if (opts.fullPages && page <= 10) {
      // A full page of documents on no commented account: the pager reads to its cap.
      const filler = Array.from({ length: 100 }, (_, i) => bill(`Filler ${i}`, '999', 1))
      const own = page === 1 && dataKey === 'Invoices' ? docs[tenant] ?? [] : []
      return { ok: true, status: 200, json: async () => ({ [dataKey]: [...own, ...filler].slice(0, 100) }) }
    }
    const items = dataKey === 'Invoices' && decodeURIComponent(url).includes('ACCPAY') ? docs[tenant] ?? [] : []
    return { ok: true, status: 200, json: async () => ({ [dataKey]: items }) }
  })
}

// ─── Dragon Roofing & Easy Hail ─────────────────────────────────────────────

const DRAGON = 'c7df2983-5711-4959-8ec8-a48030d62666'
const DRG = 'tenant-dragon'
const EHC = 'tenant-easy-hail'
const SHARED_CREATED_AT = '2026-04-19T20:55:56.588378+00:00'

function dragonTables() {
  const pl = (tenant: string, name: string, code: string, type = 'opex', jul = 0) =>
    ({ business_id: `${DRAGON}-profile`, tenant_id: tenant, account_name: name, account_code: code, account_type: type, monthly_values: { '2026-07': jul } })
  return {
    // Easy Hail's id sorts first, and both rows share created_at: only
    // display_order puts Dragon first.
    xero_connections: [
      { id: 'a-ehc-connection', business_id: DRAGON, tenant_id: EHC, tenant_name: 'EASY HAIL CLAIM PTY LTD', display_order: 2, functional_currency: 'AUD', is_active: true, created_at: SHARED_CREATED_AT },
      { id: 'b-dragon-connection', business_id: DRAGON, tenant_id: DRG, tenant_name: 'Dragon Roofing Pty Ltd', display_order: 1, functional_currency: 'AUD', is_active: true, created_at: SHARED_CREATED_AT },
    ],
    xero_pl_lines_wide_compat: [
      pl(DRG, 'Legal expenses', '441', 'opex', 2_456.32),
      pl(EHC, 'Legal expenses', '441'),
      pl(DRG, 'Virtual Contractors', '2300', 'opex', 18_525.38),
      pl(EHC, 'Virtual Contractors', '508', 'opex', 15_955.7),
      // One code, two different accounts: 402 is Dragon's Bad Debts and Easy Hail's Marketing.
      pl(DRG, 'Bad Debts expense', '402'),
      pl(EHC, 'Marketing', '402'),
      pl(DRG, 'Sales - Insurance', '200.1', 'revenue', 950_933.04),
    ],
    account_mappings: [
      // A business-level mapping carries no organisation: its code must not be tried in both.
      { business_id: DRAGON, xero_account_name: 'Consultants', xero_account_code: '510' },
    ],
    monthly_report_settings: [{ business_id: DRAGON, subscription_account_codes: ['485'], wages_account_names: [] }],
    fx_rates: [],
  }
}

const DRAGON_DOCS: Record<string, Doc[]> = {
  [DRG]: [
    bill('Simpson Quinn Lawyers Pty Ltd', '441', 1_459),
    bill('OFFICE HQ', '2300', 655.2),
    bill('TGY Trade Virtual Assistants OPC', '2300', 3_200),
    bill('Debt Recoveries Australia', '402', 999),
  ],
  [EHC]: [
    bill('Simpson Quinn Lawyers Pty Ltd', '441', 1_472),
    bill('Coleman Greig Lawyers', '441', 604),
    bill('OFFICE HQ', '508', 403),
    bill('Virtual Assistant', '508', 13_013.22),
    bill('ActiveCampaign', '402', 175.7),
  ],
}

function post(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/monthly-report/commentary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_month: '2026-08', ...body }),
  })
}

const vendorsOf = (row: any) => Object.fromEntries((row?.vendor_summary ?? []).map((v: any) => [v.vendor.toLowerCase(), v.amount]))

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.clock = virtualClock()
  hoisted.tokenFails = new Set()
  calls.length = 0
  tokenLog.length = 0
  openByTenant.clear()
  mostOpenByTenant.clear()
})

describe('Dragon Roofing & Easy Hail — suppliers from both organisations', () => {
  beforeEach(() => {
    hoisted.tables = dragonTables()
    global.fetch = fakeXero(DRAGON_DOCS) as any
  })

  const lines = {
    business_id: DRAGON,
    expense_lines: [
      { account_name: 'Legal expenses', xero_account_name: 'Legal expenses', actual: 3_535, budget: 1_000 },
      { account_name: 'Virtual Contractors', xero_account_name: 'Virtual Contractors', actual: 28_974.98, budget: 20_000 },
      { account_name: 'Marketing', xero_account_name: 'Marketing', actual: 10_108.61, budget: 5_000 },
    ],
  }

  it('merges both organisations\' suppliers under the account name', async () => {
    const { POST } = await import('@/app/api/monthly-report/commentary/route')
    const res = await POST(post(lines))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.checked).toBe(true)
    // Dragon's 1,459 and Easy Hail's 1,472: one supplier, one row (Calxa p13).
    expect(vendorsOf(body.commentary['Legal expenses'])).toMatchObject({ 'simpson quinn lawyers pty ltd': 2_931, 'coleman greig lawyers': 604 })
    // Dragon's code 2300 and Easy Hail's 508 are one account.
    const contractors = vendorsOf(body.commentary['Virtual Contractors'])
    expect(contractors['virtual assistant']).toBe(13_013)
    expect(contractors['office hq']).toBe(1_058)
    expect(Object.values(contractors).reduce((t: number, v: any) => t + v, 0)).toBe(13_013 + 3_200 + 1_058)
  })

  it('never merges on a shared code: Dragon\'s 402 is not Easy Hail\'s Marketing', async () => {
    const { POST } = await import('@/app/api/monthly-report/commentary/route')
    const body = await (await POST(post(lines))).json()
    const marketing = vendorsOf(body.commentary.Marketing)
    expect(marketing).toHaveProperty('activecampaign')
    expect(JSON.stringify(body.commentary.Marketing)).not.toMatch(/Debt Recoveries/i)
  })

  it('reads the organisations one after another, in display_order, never refreshing two tokens at once', async () => {
    const { POST } = await import('@/app/api/monthly-report/commentary/route')
    await POST(post(lines))
    expect(tokenLog.map((t) => t.id)).toEqual(['b-dragon-connection', 'a-ehc-connection'])
    expect(tokenLog[1].start).toBeGreaterThanOrEqual(tokenLog[0].end)
    const lastDragon = Math.max(...calls.filter((c) => c.tenant === DRG).map((c) => c.at))
    const firstEasyHail = Math.min(...calls.filter((c) => c.tenant === EHC).map((c) => c.at))
    expect(firstEasyHail).toBeGreaterThan(lastDragon)
  })

  it('says which organisation could not be read, and still quotes the other', async () => {
    hoisted.tokenFails = new Set(['a-ehc-connection'])
    const { POST } = await import('@/app/api/monthly-report/commentary/route')
    const body = await (await POST(post(lines))).json()
    expect(body.checked).toBe(true)
    expect(vendorsOf(body.commentary['Legal expenses'])).toEqual({ 'simpson quinn lawyers pty ltd': 1_459 })
    expect(body.commentary['Legal expenses'].draft_warnings.join(' ')).toContain('EASY HAIL CLAIM PTY LTD')
  })

  it('an answer from no organisation at all is could-not-check', async () => {
    hoisted.tokenFails = new Set(['a-ehc-connection', 'b-dragon-connection'])
    const { POST } = await import('@/app/api/monthly-report/commentary/route')
    const body = await (await POST(post(lines))).json()
    expect(body).toMatchObject({ success: true, commentary: {}, checked: false })
  })
})

describe('pacing — every page to every organisation, with a rate-limited retry', () => {
  it('no organisation gets more than 50 calls in any minute or more than 4 at once', async () => {
    hoisted.tables = dragonTables()
    global.fetch = fakeXero(DRAGON_DOCS, { fullPages: true, rateLimitOnce: true }) as any
    const { POST } = await import('@/app/api/monthly-report/commentary/route')
    const res = await POST(post({
      business_id: DRAGON,
      expense_lines: [{ account_name: 'Legal expenses', xero_account_name: 'Legal expenses', actual: 3_535, budget: 1_000 }],
      // A revenue line adds the sales-invoice pager: four pagers per organisation.
      revenue_lines: [{ account_name: 'Sales - Insurance', xero_account_name: 'Sales - Insurance', actual: 673_764.84, budget: 1_000_000 }],
    }))
    expect(res.status).toBe(200)
    for (const tenant of [DRG, EHC]) {
      const times = calls.filter((c) => c.tenant === tenant).map((c) => c.at)
      // Four pagers to their ten-page cap, and the rate-limited page 3 of each asked again.
      expect(times.length).toBe(44)
      expect(busiestWindow(times)).toBeLessThanOrEqual(50)
      expect(mostOpenByTenant.get(tenant)).toBeLessThanOrEqual(4)
    }
  })
})

// ─── IICT Group: an AUD organisation and an HKD one ─────────────────────────

const IICT = 'fbc6dffd-677d-47ec-8277-7157982938e7'
const IAP = 'tenant-iap'
const IGL = 'tenant-igl'

function iictTables(rates = true) {
  return {
    xero_connections: [
      { id: 'c-igl', business_id: IICT, tenant_id: IGL, tenant_name: 'IICT Group Limited', display_order: 2, functional_currency: 'HKD', is_active: true, created_at: '2026-09-15T20:14:12+00:00' },
      { id: 'c-iap', business_id: IICT, tenant_id: IAP, tenant_name: 'IICT (Aust) Pty Ltd', display_order: 1, functional_currency: 'AUD', is_active: true, created_at: '2026-09-15T20:14:12+00:00' },
    ],
    xero_pl_lines_wide_compat: [
      { business_id: `${IICT}-profile`, tenant_id: IAP, account_name: 'Offshore Virtual Assistants', account_code: '457', account_type: 'opex', monthly_values: {} },
      { business_id: `${IICT}-profile`, tenant_id: IGL, account_name: 'Offshore Virtual Assistants', account_code: '457', account_type: 'opex', monthly_values: {} },
    ],
    account_mappings: [],
    monthly_report_settings: [{ business_id: IICT, subscription_account_codes: ['418'], wages_account_names: [] }],
    fx_rates: rates
      ? [
          { currency_pair: 'HKD/AUD', rate_type: 'monthly_average', period: '2026-07-01', rate: 0.1830919, source: 'oxr' },
          { currency_pair: 'HKD/AUD', rate_type: 'monthly_average', period: '2026-08-01', rate: 0.1795357, source: 'oxr' },
        ]
      : [{ currency_pair: 'HKD/AUD', rate_type: 'monthly_average', period: '2026-07-01', rate: 0.1830919, source: 'oxr' }],
  }
}

const IICT_DOCS: Record<string, Doc[]> = {
  [IAP]: [bill('EA Consulting Services', '457', 3_080)],
  // IICT Group Limited keeps its books in HKD: HKD 16,000 at August's average is $2,873.
  [IGL]: [bill('IGL freelance services', '457', 16_000, { CurrencyCode: 'HKD' })],
}

describe('IICT — the HKD organisation\'s suppliers at the month\'s average rate', () => {
  const lines = {
    business_id: IICT,
    expense_lines: [{ account_name: 'Offshore Virtual Assistants', xero_account_name: 'Offshore Virtual Assistants', actual: 27_586, budget: 25_000 }],
  }

  it('quotes both organisations in AUD', async () => {
    hoisted.tables = iictTables()
    global.fetch = fakeXero(IICT_DOCS) as any
    const { POST } = await import('@/app/api/monthly-report/commentary/route')
    const body = await (await POST(post(lines))).json()
    expect(vendorsOf(body.commentary['Offshore Virtual Assistants'])).toEqual({ 'ea consulting services': 3_080, 'igl freelance services': 2_873 })
    // The supplier is named as every other reader names it (extractVendorInfo).
    expect(body.commentary['Offshore Virtual Assistants'].draft_facts).toMatch(/Igl freelance services \(\$2,873\)/i)
  })

  it('leaves the HKD organisation out, and says why, when August has no rate', async () => {
    hoisted.tables = iictTables(false)
    global.fetch = fakeXero(IICT_DOCS) as any
    const { POST } = await import('@/app/api/monthly-report/commentary/route')
    const body = await (await POST(post(lines))).json()
    const row = body.commentary['Offshore Virtual Assistants']
    expect(vendorsOf(row)).toEqual({ 'ea consulting services': 3_080 })
    expect(row.draft_warnings.join(' ')).toContain('no HKD/AUD exchange rate is stored for Aug 2026')
    expect(row.draft_warnings.join(' ')).toContain('IICT Group Limited')
  })
})
