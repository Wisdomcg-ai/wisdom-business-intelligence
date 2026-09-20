/**
 * GET /api/monthly-report/bank-balances — the Bank Balances & Movement page's
 * endpoint, which the pack reads when a layout places the page.
 *
 * The client is the in-memory fake that APPLIES filters, over the IICT and
 * Dragon mirror fixtures, so a read on the wrong id-space, basis or date gets
 * the wrong rows and the figures say so. What is locked here is the reading:
 * the chosen list and its fallback, the basis, the dates, and that a page the
 * loader cannot produce comes back as the sentence the pack prints rather than
 * as a 500 or a table of zeros.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import iict from '@/lib/monthly-report/__tests__/fixtures/iict-bs-mirror-2026-08.json'
import dragon from '@/lib/monthly-report/__tests__/fixtures/dragon-bs-mirror-2026-08.json'
import { fakeSupabase, type FakeTables } from '@/lib/monthly-report/__tests__/fake-supabase'
import { bsAmountText } from '@/lib/monthly-report/balance-sheet-rows'

const { state } = vi.hoisted(() => ({
  state: { tables: {} as Record<string, unknown>, ids: { businessId: '', profileId: '', all: [] as string[] } },
}))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) }, from: vi.fn() })),
}))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'service-key' }))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({ resolveBusinessProfileIds: vi.fn(async () => state.ids) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => fakeSupabase(state.tables as FakeTables).from(table) }),
}))

import { GET } from '../route'

type Fixture = typeof iict | typeof dragon

function chosen(fx: Fixture): string[] {
  return [
    ...new Set(
      fx.accounts
        .filter((a) => a.bank_account_type === 'BANK' || a.bank_account_type === 'CREDITCARD' || /cash on hand/i.test(a.account_name))
        .map((a) => a.xero_account_id),
    ),
  ]
}

/** The fixture as prod stores it — plus rows the route must not read. */
function load(fx: Fixture, over: Partial<FakeTables> = {}, settings?: Record<string, unknown>) {
  state.ids = { businessId: fx.business_id, profileId: fx.profile_id, all: [fx.profile_id, fx.business_id] }
  const mirror = fx.rows.map((r) => ({ ...r, business_id: fx.profile_id, basis: 'accruals' }))
  state.tables = {
    xero_connections: fx.connections.map((c, i) => ({
      id: `c-${i}`,
      business_id: fx.business_id,
      tenant_id: c.tenant_id,
      tenant_name: c.name,
      display_name: c.name,
      display_order: c.display_order,
      functional_currency: c.functional_currency,
      include_in_consolidation: true,
      is_active: true,
    })),
    monthly_report_settings: [
      { business_id: fx.business_id, bank_balance_account_ids: chosen(fx), bank_account_ids: null, ...(settings ?? {}) },
    ],
    xero_bs_lines: [
      ...mirror,
      // A cash-basis copy of every row, and the same organisations stored under
      // another business (IICT's orgs sit under a second business id too).
      ...mirror.map((r) => ({ ...r, basis: 'cash', balance: r.balance * 3 })),
      ...mirror.map((r) => ({ ...r, business_id: 'another-business', balance: r.balance * 5 })),
    ],
    xero_accounts: fx.accounts.map((a) => ({ ...a, last_synced_at: '2026-09-15T04:00:00Z' })),
    fx_rates: 'fx_rates' in fx ? fx.fx_rates : [],
    ...over,
  }
}

const req = (fx: Fixture, month = '2026-08') =>
  new NextRequest(`http://localhost/api/monthly-report/bank-balances?business_id=${fx.business_id}&period_month=${month}`)

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function figure(bank: any, label: string): [string, string] {
  const r = bank.rows.find((x: any) => x.label === label)
  return [bsAmountText(r.current), bsAmountText(r.prior)]
}

describe('GET /api/monthly-report/bank-balances', () => {
  it('answers IICT’s three organisations with 226,608 against 244,120, without calling Xero', async () => {
    load(iict)
    const res = await GET(req(iict))
    expect(res.status).toBe(200)
    const { bank } = await res.json()
    expect(bank.report_date).toBe('2026-08-31')
    expect(bank.prior_date).toBe('2026-07-31')
    expect(figure(bank, 'Total Bank')).toEqual(['226,608', '244,120'])
    expect(bank.organisations).toHaveLength(3)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the cashflow’s bank accounts when the page has no list of its own', async () => {
    // Dragon's three bank accounts, saved as the cashflow's set.
    load(dragon, {}, { bank_balance_account_ids: null, bank_account_ids: chosen(dragon) })
    const { bank } = await (await GET(req(dragon))).json()
    expect(figure(bank, 'Total Bank')).toEqual(['288,449', '267,246'])
  })

  it('prints the page unchanged when the new column does not exist yet', async () => {
    // The migration is applied by hand after merge, so this code reaches prod
    // first: a select naming the column comes back 42703 and the read retries
    // without it.
    load(dragon, {}, {})
    const rows = state.tables.monthly_report_settings as Record<string, unknown>[]
    state.tables.monthly_report_settings = rows.map((r) => {
      const { bank_balance_account_ids: _dropped, ...rest } = r
      return { ...rest, bank_account_ids: chosen(dragon) }
    })
    const base = fakeSupabase(state.tables as FakeTables)
    const client = {
      from: (table: string) => {
        const chain = base.from(table)
        if (table !== 'monthly_report_settings') return chain
        const select = chain.select as (cols?: string) => unknown
        return {
          ...chain,
          select: (cols?: string) =>
            cols?.includes('bank_balance_account_ids')
              ? { in: () => Promise.resolve({ data: null, error: { code: '42703', message: 'column does not exist' } }) }
              : select.call(chain, cols),
        }
      },
    }
    const { loadBankBalances } = await import('@/lib/monthly-report/bank-balances-load')
    const built = await loadBankBalances(client, dragon.business_id, '2026-08')
    expect(built.ok).toBe(true)
    expect(built.ok && figure(built.data, 'Total Bank')).toEqual(['288,449', '267,246'])
  })

  it('refuses with the sentence the page prints when no bank accounts have been chosen', async () => {
    load(dragon, {}, { bank_balance_account_ids: null, bank_account_ids: null })
    const res = await GET(req(dragon))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('no bank accounts have been chosen for this page — choose them in the report settings')
    expect(body.code).toBe('BANK_BALANCES_REFUSED')
    expect(body.bank).toBeUndefined()
  })

  it('refuses, naming the date, when the closing rate is missing — never HKD at one for one', async () => {
    load(iict, { fx_rates: iict.fx_rates.filter((r) => !(r.rate_type === 'closing_spot' && r.period === '2026-08-31')) })
    const res = await GET(req(iict))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('no HKD/AUD closing rate is stored for 31 Aug 2026')
  })

  it('500s rather than printing a partial page when the mirror cannot be read', async () => {
    load(dragon, { xero_bs_lines: { error: { message: 'boom' } } })
    const res = await GET(req(dragon))
    expect(res.status).toBe(500)
  })

  it('requires a business and a well-formed month', async () => {
    load(dragon)
    expect((await GET(new NextRequest('http://localhost/api/monthly-report/bank-balances?period_month=2026-08'))).status).toBe(400)
    expect((await GET(req(dragon, '2026-8'))).status).toBe(400)
  })
})
