/**
 * GET /api/Xero/balance-sheet for a business Xero holds as several
 * organisations — the route the Balance Sheet tab, the pack's balance_sheet
 * placement, the Finalise freeze and Approve & Send all read.
 *
 * It used to answer 409 MULTI_ORG, so none of those could print a sheet for
 * Dragon Roofing or IICT Group (DRG-41, IICT-45). It now answers with the
 * consolidated sheet built from the stored mirror (consolidated-balance-
 * sheet-load.ts), in the single-org sheet's shape — which is what lets the
 * freeze and the sent copy keep it exactly as they keep one organisation's —
 * and never calls Xero for it. A sheet it cannot build is a 422 whose `error`
 * the pack prints after "This page couldn't be produced: ".
 *
 * The client is the in-memory fake that APPLIES filters, over the IICT and
 * Dragon mirror fixtures, so a read on the wrong id-space, basis or date gets
 * the wrong rows and the figures say so.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import iict from '@/lib/monthly-report/__tests__/fixtures/iict-bs-mirror-2026-08.json'
import dragon from '@/lib/monthly-report/__tests__/fixtures/dragon-bs-mirror-2026-08.json'
import { fakeSupabase, type FakeTables } from '@/lib/monthly-report/__tests__/fake-supabase'
import { bsAmountText } from '@/lib/monthly-report/balance-sheet-rows'

const { state } = vi.hoisted(() => ({ state: { tables: {} as Record<string, unknown>, ids: { businessId: '', profileId: '', all: [] as string[] } } }))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) }, from: vi.fn() })),
}))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'service-key' }))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({ resolveBusinessProfileIds: vi.fn(async () => state.ids) }))
const tokenMock = vi.fn()
vi.mock('@/lib/xero/token-manager', () => ({ getValidAccessToken: (...a: unknown[]) => tokenMock(...a) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => fakeSupabase(state.tables as FakeTables).from(table) }),
}))

import { GET } from '../route'

type Fixture = typeof iict | typeof dragon

/** The fixture as prod stores it: mirror rows under the profile id, accruals — plus rows the route must not read. */
function load(fx: Fixture, over: Partial<FakeTables> = {}) {
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
    business_profiles: [{ id: fx.profile_id, business_id: fx.business_id, fiscal_year_start: 7 }],
    xero_bs_lines: [
      ...mirror,
      // A cash-basis copy of every row, and the same organisations stored under
      // another business (IICT's orgs sit under a second business id too).
      ...mirror.map((r) => ({ ...r, basis: 'cash', balance: r.balance * 3 })),
      ...mirror.map((r) => ({ ...r, business_id: 'another-business', balance: r.balance * 5 })),
    ],
    xero_accounts: fx.accounts.map((a) => ({ ...a, last_synced_at: '2026-09-15T04:00:00Z' })),
    fx_rates: 'fx_rates' in fx ? fx.fx_rates : [],
    consolidation_elimination_rules: [],
    ...over,
  }
}

const req = (fx: Fixture, compare: 'mom' | 'yoy' = 'mom') =>
  new NextRequest(`http://localhost/api/Xero/balance-sheet?business_id=${fx.business_id}&month=2026-08&compare=${compare}`)

const fetchMock = vi.fn()

function figure(body: any, label: string): [string, string] {
  const r = body.rows.find((x: any) => x.label === label)
  return [bsAmountText(r.current), bsAmountText(r.prior)]
}

beforeEach(() => {
  tokenMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/Xero/balance-sheet — several organisations', () => {
  it('answers Dragon Roofing’s two organisations with the consolidated sheet, from the mirror, without calling Xero', async () => {
    load(dragon)
    const res = await GET(req(dragon))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.report_date).toBe('2026-08-31')
    expect(body.compare).toBe('mom')
    expect(figure(body, 'Total Asset')[0]).toBe('2,050,535')
    expect(figure(body, 'Net Assets')[0]).toBe('270,523')
    expect(body.balances).toBe(true)
    expect(body.consolidation.organisations.map((o: any) => o.name)).toEqual(['Dragon Roofing Pty Ltd', 'EASY HAIL CLAIM PTY LTD'])
    expect(tokenMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('eliminates the loan pair the coach set as a rule: assets 1,562,415, net assets 270,523', async () => {
    load(dragon, {
      consolidation_elimination_rules: [
        {
          id: 'r1', business_id: dragon.business_id, rule_type: 'intercompany_loan', active: true, direction: 'bidirectional',
          tenant_a_id: '42735fc3-21f2-4668-9783-93ce0f66f481', entity_a_account_code: '700', entity_a_account_name_pattern: null,
          tenant_b_id: '3b67e5b6-780c-4158-831c-82293f34ca04', entity_b_account_code: '906', entity_b_account_name_pattern: null,
          description: 'Dragon ↔ Easy Hail loan',
        },
        // Retired: must not be read.
        {
          id: 'r2', business_id: dragon.business_id, rule_type: 'intercompany_loan', active: false, direction: 'bidirectional',
          tenant_a_id: '42735fc3-21f2-4668-9783-93ce0f66f481', entity_a_account_code: '610', entity_a_account_name_pattern: null,
          tenant_b_id: '3b67e5b6-780c-4158-831c-82293f34ca04', entity_b_account_code: '800', entity_b_account_name_pattern: null,
          description: 'old',
        },
      ],
    })
    const body = await (await GET(req(dragon))).json()
    expect(figure(body, 'Total Asset')).toEqual(['1,562,415', '1,711,072'])
    expect(figure(body, 'Net Assets')).toEqual(['270,523', '317,081'])
    expect(body.consolidation.notes).toEqual([
      'Added together: Dragon Roofing Pty Ltd and EASY HAIL CLAIM PTY LTD.',
      'Eliminated on consolidation: Loan Receivable - Easy Hail Claim Pty Ltd (Dragon Roofing Pty Ltd) against ' +
        'Loan Payable - Dragon Roofing Pty Ltd (EASY HAIL CLAIM PTY LTD), 488,120 at Aug 2026.',
    ])
    expect(body.consolidation.warnings).toEqual([])
  })

  it('answers IICT’s three organisations year on year with 31 Aug 2025 net assets of 1,101,808', async () => {
    load(iict)
    const res = await GET(req(iict, 'yoy'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(figure(body, 'Net Assets')).toEqual(['1,138,255', '1,101,808'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses with a sentence the page prints when the closing rate is missing — never HKD at one for one', async () => {
    load(iict, { fx_rates: iict.fx_rates.filter((r) => !(r.rate_type === 'closing_spot' && r.period === '2026-08-31')) })
    const res = await GET(req(iict))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('no HKD/AUD closing rate is stored for 31 Aug 2026')
    expect(body.code).toBe('CONSOLIDATED_BS_REFUSED')
    expect(body.rows).toBeUndefined()
  })

  it('adds only the organisations included in the consolidation, and says which it leaves out', async () => {
    load(dragon)
    ;(state.tables.xero_connections as any[])[1].include_in_consolidation = false
    const body = await (await GET(req(dragon))).json()
    expect(body.consolidation.organisations.map((o: any) => o.name)).toEqual(['Dragon Roofing Pty Ltd'])
    expect(figure(body, 'Net Assets')[0]).toBe('378,230')
    // One organisation, so no intercompany to disclose — but the sheet still
    // names what it added as well as what it left out.
    expect(body.consolidation.notes).toEqual([
      'Added together: Dragon Roofing Pty Ltd.',
      'Leaves out EASY HAIL CLAIM PTY LTD, which is not included in this consolidation.',
    ])
  })

  it('one organisation on two connection rows is still one organisation’s live sheet, not a consolidation', async () => {
    load(dragon)
    const one = (state.tables.xero_connections as any[])[0]
    state.tables.xero_connections = [one, { ...one, id: 'c-dup', business_id: dragon.profile_id }]
    tokenMock.mockResolvedValue({ success: false })
    const res = await GET(req(dragon))
    // The single-org path: it goes for a token (and here finds it expired).
    expect(res.status).toBe(401)
    expect(tokenMock).toHaveBeenCalledTimes(1)
  })

  it('500s with a sentence rather than a partial sheet when the mirror cannot be read', async () => {
    load(dragon, { xero_bs_lines: { error: { message: 'boom' } } })
    const res = await GET(req(dragon))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('the stored balance sheet could not be read — export again in a minute or two')
  })
})
