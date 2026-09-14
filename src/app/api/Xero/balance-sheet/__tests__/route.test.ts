/**
 * GET /api/Xero/balance-sheet — the full sheet the monthly report's Balance
 * Sheet page and tab render (Calxa pages 19-21).
 *
 * The rows are built and tested in lib/monthly-report/balance-sheet-rows.ts.
 * What is locked here is the route's half: that it asks Xero for TWO
 * single-date reports on true month-ends and never for the periods=/timeframe=
 * comparative the sync documents as buggy, that the two answers reach the
 * builder as current and prior, that either call failing fails the sheet
 * rather than printing a half-sheet, that the account catalogue (code and
 * Class) decides order and placement but its failure costs only those, not the
 * page, and that a business Xero holds as several organisations is refused
 * rather than printed as one of them.
 *
 * The Xero answer is a real capture (the JDS fixtures, 30 April and 31 March
 * 2026) — but captured through scripts/capture-bs-fixture.ts, which asks with
 * standardLayout=false. The route asks with standardLayout=true. Nobody has yet
 * put a standardLayout=true answer in a fixture, so where a live org's credit
 * cards land and what its groups are titled on this page are modelled, not
 * observed, until someone opens a Balance Sheet tab against live Xero.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import jdsApr from '@/__tests__/xero/fixtures/jds-bs-2026-04-30.json'
import jdsMar from '@/__tests__/xero/fixtures/jds-bs-2026-03-31.json'

const captureMessageMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: (...a: unknown[]) => captureMessageMock(...a),
  addBreadcrumb: vi.fn(),
}))
const getUserMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: getUserMock }, from: vi.fn() })),
}))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'service-key' }))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ all: ['biz-1', 'profile-1'] })),
}))
vi.mock('@/lib/consolidation/fx', () => ({ loadFxRates: vi.fn(async () => new Map()) }))
const tokenMock = vi.fn()
vi.mock('@/lib/xero/token-manager', () => ({ getValidAccessToken: (...a: unknown[]) => tokenMock(...a) }))

/**
 * The service-role client, table by table. Each query chain resolves to what
 * `tables` holds for its table when awaited; `filters` records every .eq/.in
 * so a test can see what a read was keyed on.
 */
const tables: Record<string, { data: unknown; error: unknown }> = {}
const filters: { table: string; op: string; column: string; value: unknown }[] = []
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: unknown) => (filters.push({ table, op: 'eq', column, value }), chain),
        in: (column: string, value: unknown) => (filters.push({ table, op: 'in', column, value }), chain),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(tables[table] ?? { data: null, error: null }).then(resolve, reject),
      }
      return chain
    },
  }),
}))

import { GET } from '../route'

const TENANT = '0219d3a9-c1be-4fb8-a4d3-0710b3af715a'
const req = (qs = 'business_id=biz-1&month=2026-04&compare=mom') =>
  new NextRequest(`http://localhost/api/Xero/balance-sheet?${qs}`)

const fetchMock = vi.fn()
const xeroOk = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
/** Answer each as-of date with its capture; anything else is a test bug. */
function answerByDate(overrides: Record<string, () => Response> = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    const date = new URL(url).searchParams.get('date')!
    if (overrides[date]) return overrides[date]()
    if (date === '2026-04-30') return xeroOk(jdsApr.response)
    if (date === '2026-03-31') return xeroOk(jdsMar.response)
    throw new Error(`unexpected Xero call ${url}`)
  })
}

beforeEach(() => {
  getUserMock.mockReset()
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  tokenMock.mockReset()
  tokenMock.mockResolvedValue({ success: true, accessToken: 'tok' })
  captureMessageMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  filters.length = 0
  for (const k of Object.keys(tables)) delete tables[k]
  tables.xero_connections = {
    data: [{ id: 'c-1', business_id: 'biz-1', tenant_id: TENANT, tenant_name: 'JDS', functional_currency: 'AUD', is_active: true }],
    error: null,
  }
  tables.xero_accounts = { data: [], error: null }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/Xero/balance-sheet — the full sheet', () => {
  it('asks Xero for each month-end on its own — no periods=, no timeframe=', async () => {
    answerByDate()
    const res = await GET(req())
    expect(res.status).toBe(200)

    const urls = fetchMock.mock.calls.map(([u]) => new URL(u as string))
    expect(urls.map((u) => u.searchParams.get('date')).sort()).toEqual(['2026-03-31', '2026-04-30'])
    for (const u of urls) {
      expect(u.pathname).toBe('/api.xro/2.0/Reports/BalanceSheet')
      expect(u.searchParams.has('periods')).toBe(false)
      expect(u.searchParams.has('timeframe')).toBe(false)
      expect(u.searchParams.get('standardLayout')).toBe('true')
    }
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).headers).toMatchObject({ 'xero-tenant-id': TENANT })
    }
  })

  it('the prior-year comparison is the same month-end a year back', async () => {
    fetchMock.mockImplementation(async () => xeroOk(jdsApr.response))
    await GET(req('business_id=biz-1&month=2026-09&compare=yoy'))
    const dates = fetchMock.mock.calls.map(([u]) => new URL(u as string).searchParams.get('date')).sort()
    expect(dates).toEqual(['2025-09-30', '2026-09-30'])
  })

  it('returns the two reports merged — 30 April as current, 31 March as prior', async () => {
    answerByDate()
    const body = await (await GET(req())).json()
    expect(body).toMatchObject({
      business_id: 'biz-1',
      report_date: '2026-04-30',
      compare: 'mom',
      current_label: 'Apr 2026',
      prior_label: 'Mar 2026',
      balances: true,
    })
    const netAssets = body.rows.find((r: { type: string }) => r.type === 'net_assets')
    expect(netAssets).toMatchObject({ label: 'Net Assets', current: 662_903.57, prior: 237_409.92 })
    // The prior column came from the March report, not from April's second
    // value column (30 April 2025), which the builder never reads.
    expect(netAssets.prior).not.toBe(-126_319.41)
  })

  it.each([
    ['current', '2026-04-30', 400],
    ['prior', '2026-03-31', 404],
  ])('502s, with no rows, when the %s report fails (%s → %i)', async (_which, date, status) => {
    answerByDate({ [date]: () => new Response('refused', { status }) })
    const res = await GET(req())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toEqual({ error: 'Xero API error', status })
    expect(body.rows).toBeUndefined()
  })

  describe('under Xero\'s rate limit', () => {
    // The pack asks this route twice (mom, then yoy) and each ask is two
    // reports, while sync-all-xero may be crawling the same org. A minute-limit
    // 429 used to fail the sheet on the spot and print "Xero API error".
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const throttled = (headers: Record<string, string>) => () =>
      new Response('throttled', { status: 429, headers })

    it('waits out Retry-After on a minute 429 and returns the sheet', async () => {
      let first = true
      answerByDate({
        '2026-04-30': () => {
          if (first) { first = false; return throttled({ 'X-Rate-Limit-Problem': 'minute', 'Retry-After': '7' })() }
          return xeroOk(jdsApr.response)
        },
      })
      const pending = GET(req())
      await vi.advanceTimersByTimeAsync(6_000)
      // Not yet: Retry-After said seven seconds.
      expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('2026-04-30'))).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(2_000)
      const res = await pending
      expect(res.status).toBe(200)
      expect((await res.json()).rows.find((r: { type: string }) => r.type === 'net_assets').current).toBe(662_903.57)
    })

    it('a limit that does not clear says Xero is rate-limiting, not "Xero API error"', async () => {
      answerByDate({ '2026-03-31': throttled({ 'X-Rate-Limit-Problem': 'minute', 'Retry-After': '1' }) })
      const pending = GET(req())
      await vi.advanceTimersByTimeAsync(5_000)
      const res = await pending
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error).toBe('Xero is rate-limiting — try again in a minute')
      expect(body.rows).toBeUndefined()
    })

    it('a 5xx gets one more try, then fails the sheet with its status', async () => {
      answerByDate({ '2026-03-31': () => new Response('unavailable', { status: 503 }) })
      const pending = GET(req())
      await vi.advanceTimersByTimeAsync(2_000)
      const res = await pending
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: 'Xero API error', status: 503 })
      expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('2026-03-31'))).toHaveLength(2)
    })

    it('the daily limit is not retried, and says when it clears', async () => {
      answerByDate({ '2026-04-30': throttled({ 'X-Rate-Limit-Problem': 'daily' }) })
      const res = await GET(req())
      expect(res.status).toBe(429)
      expect((await res.json()).error).toBe("Xero's daily limit for this organisation is used up — try again tomorrow")
      expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('2026-04-30'))).toHaveLength(1)
    })
  })

  /** The account lines of one class, in page order. */
  const classLines = (rows: { type: string; label: string }[], heading: string) => {
    const at = rows.findIndex((r) => r.type === 'section_header' && r.label === heading)
    const end = rows.findIndex((r, i) => i > at && r.type === 'subtotal')
    return rows.slice(at + 1, end).map((r) => r.label)
  }

  it('keys the catalogue on the tenant, orders each class by code and places each account by its Class', async () => {
    answerByDate()
    tables.xero_accounts = {
      data: [
        // Code order, compared as text: Cheque before Paypal before Capital Growth.
        { xero_account_id: 'ee98734b-0682-495a-9b69-c1fe29f5b9d1', account_code: '090', xero_class: 'ASSET' },
        { xero_account_id: 'acab7333-ee1f-493f-bf62-1ffc6baf03c4', account_code: '091', xero_class: 'ASSET' },
        { xero_account_id: '149faa9e-1ba7-44d9-990e-1323bbd03524', account_code: '092', xero_class: 'ASSET' },
        // A credit card: Class ASSET, filed by the report under Current Liabilities.
        { xero_account_id: 'df7e5fda-6c21-44e3-ba48-6ab077831a71', account_code: '800', xero_class: 'ASSET' },
      ],
      error: null,
    }
    const body = await (await GET(req())).json()
    expect(filters).toContainEqual({ table: 'xero_accounts', op: 'eq', column: 'tenant_id', value: TENANT })
    const assets = classLines(body.rows, 'Asset')
    expect(assets.slice(0, 4)).toEqual([
      'Cheque A/C Aeris Solutions P/L', 'Aeris Paypal', 'Capital Growth Account', 'Mastercard Aeris',
    ])
    expect(classLines(body.rows, 'Liability')).not.toContain('Mastercard Aeris')
    expect(body.rows.find((r: { label: string }) => r.label === 'Mastercard Aeris').current).toBe(-248.08)
    // No Xero groups on the page, and the card moved without moving Net Assets.
    expect(body.rows.map((r: { label: string }) => r.label)).not.toContain('Bank')
    expect(body.rows.find((r: { type: string }) => r.type === 'net_assets').current).toBe(662_903.57)
    expect(body.balances).toBe(true)
  })

  it('a failed catalogue read still returns the sheet, in Xero\'s order and placement, and says so in Sentry', async () => {
    answerByDate()
    tables.xero_accounts = { data: null, error: { message: 'statement timeout' } }
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(classLines(body.rows, 'Asset').slice(0, 3)).toEqual([
      'Aeris Paypal', 'Capital Growth Account', 'Cheque A/C Aeris Solutions P/L',
    ])
    expect(classLines(body.rows, 'Liability')).toContain('Mastercard Aeris')
    expect(body.rows.find((r: { type: string }) => r.type === 'net_assets').current).toBe(662_903.57)
    expect(captureMessageMock).toHaveBeenCalledWith(
      '[BalanceSheet] account catalogue unavailable — rows keep Xero order and placement',
      expect.objectContaining({ extra: expect.objectContaining({ tenantId: TENANT, error: 'statement timeout' }) }),
    )
  })

  it('refuses to print one organisation as the whole business when Xero holds it as several', async () => {
    // Dragon Roofing is two orgs, IICT three. The page used to print whichever
    // connection the query returned first, and say nothing.
    tables.xero_connections = {
      data: [
        { id: 'c-1', business_id: 'biz-1', tenant_id: 't-1', tenant_name: 'EASY HAIL CLAIM PTY LTD', functional_currency: 'AUD', is_active: true },
        { id: 'c-2', business_id: 'biz-1', tenant_id: 't-2', tenant_name: 'Dragon Roofing Pty Ltd', functional_currency: 'AUD', is_active: true },
      ],
      error: null,
    }
    const res = await GET(req())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('MULTI_ORG')
    // The pack prints this after "This page couldn't be produced: ".
    expect(body.error).toBe(
      'Xero holds this business as 2 organisations (EASY HAIL CLAIM PTY LTD, Dragon Roofing Pty Ltd), ' +
      'and this page can show only one of them — the consolidated balance sheet covers them together',
    )
    expect(body.rows).toBeUndefined()
    expect(tokenMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('two connection rows for ONE organisation are one organisation, not a refusal', async () => {
    // The dual-ID incident class: the connections are read across both
    // id-spaces, so one org can come back as a businesses-keyed row and a
    // profiles-keyed row. Counting rows would 409 a single-org business.
    tables.xero_connections = {
      data: [
        { id: 'c-1', business_id: 'biz-1', tenant_id: TENANT, tenant_name: 'JDS', functional_currency: 'AUD', is_active: true },
        { id: 'c-2', business_id: 'profile-1', tenant_id: TENANT, tenant_name: 'JDS', functional_currency: 'AUD', is_active: true },
      ],
      error: null,
    }
    answerByDate()
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect((await res.json()).rows.length).toBeGreaterThan(0)
    expect(tokenMock).toHaveBeenCalledTimes(1)
  })

  it('cash for one organisation held on two connection rows is counted once', async () => {
    tables.xero_connections = {
      data: [
        { id: 'c-1', business_id: 'biz-1', tenant_id: TENANT, tenant_name: 'JDS', functional_currency: 'AUD', is_active: true },
        { id: 'c-2', business_id: 'profile-1', tenant_id: TENANT, tenant_name: 'JDS', functional_currency: 'AUD', is_active: true },
      ],
      error: null,
    }
    fetchMock.mockImplementation(async () => xeroOk(jdsApr.response))
    const res = await GET(req('business_id=biz-1&cash_only=true&as_of=2026-04-30'))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('401s on an expired Xero connection before calling Xero', async () => {
    tokenMock.mockResolvedValue({ success: false })
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
