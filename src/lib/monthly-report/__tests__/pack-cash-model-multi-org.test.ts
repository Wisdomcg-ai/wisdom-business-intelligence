/**
 * P9 — cash model v2 for a business with more than one Xero organisation
 * (DRG-45, IICT-50): wave 1 refused this outright (pack-cash-model-load.ts's
 * old "multiple Xero organisations" gate). This proves the real path: every
 * organisation's rows are translated into one virtual ledger
 * (multi-org-consolidate.ts) and the EXISTING, unmodified buildPackCashModel
 * runs over it exactly as it runs over one organisation.
 *
 * Because two organisations here are a byte-for-byte duplicate of Urban
 * Road's own tied ledger under a second synthetic AUD tenant, and the config
 * lists the SAME account ids for both (balanceOf and bookedTo sum by id/code,
 * not by tenant — the same mechanism wages_codes already relies on to span
 * organisations), every actual month's bank figures must come out at EXACTLY
 * double Urban Road's own tied numbers. That is the multi-org mechanism's own
 * proof, not a coincidence of the fixture.
 */
import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from './fake-supabase'

const BUSINESS = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const PROFILE = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: BUSINESS, profileId: PROFILE, all: [BUSINESS, PROFILE] })),
}))

import { loadPackCashModel, payrollCodeCollisions } from '../pack-cash-model-load'
import { buildPackCashModel } from '../pack-cash-model'
import { CONSOLIDATED_TENANT_ID } from '../multi-org-consolidate'
import { UR_ACCOUNTS, UR_BANK_IDS, UR_BS_ROWS, UR_PAY_RUNS, UR_PL_ROWS, UR_TENANT } from './urban-road-ledger-fixture'
import { urbanRoadCashModel } from './urban-road-cash-model-config'
import { urbanRoadFullYear } from './urban-road-full-year-fixture'

const UR_TENANT_2 = 'urban-road-sibling-org'

const tables = () => ({
  monthly_report_settings: [{ business_id: BUSINESS, cash_model: urbanRoadCashModel(), bank_account_ids: UR_BANK_IDS }],
  xero_connections: [
    { business_id: BUSINESS, tenant_id: UR_TENANT, functional_currency: 'AUD', is_active: true, display_order: 1 },
    { business_id: BUSINESS, tenant_id: UR_TENANT_2, functional_currency: 'AUD', is_active: true, display_order: 2, display_name: 'Urban Road Sibling Pty Ltd' },
  ],
  business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
  xero_bs_lines_wide_compat: [
    ...UR_BS_ROWS.map((r) => ({ ...r, business_id: PROFILE })),
    ...UR_BS_ROWS.map((r) => ({ ...r, business_id: PROFILE, tenant_id: UR_TENANT_2 })),
  ],
  xero_pl_lines_wide_compat: [
    ...UR_PL_ROWS.map((r) => ({ ...r, business_id: PROFILE })),
    ...UR_PL_ROWS.map((r) => ({ ...r, business_id: PROFILE, tenant_id: UR_TENANT_2 })),
  ],
  xero_accounts: [
    ...UR_ACCOUNTS.map((a) => ({ ...a, tenant_id: UR_TENANT, business_id: BUSINESS, bank_account_type: null })),
    ...UR_ACCOUNTS.map((a) => ({ ...a, tenant_id: UR_TENANT_2, business_id: BUSINESS, bank_account_type: null })),
  ],
  xero_pay_runs: [
    ...UR_PAY_RUNS.map((r) => ({ ...r, business_id: PROFILE, tenant_id: UR_TENANT, status: 'POSTED' })),
    ...UR_PAY_RUNS.map((r) => ({ ...r, business_id: PROFILE, tenant_id: UR_TENANT_2, status: 'POSTED' })),
  ],
  fx_rates: [],
})

describe('cash model v2, two same-currency organisations', () => {
  it('no longer refuses — reads and translates (trivially, at rate 1) both organisations onto one virtual ledger', async () => {
    const db = fakeSupabase(tables())
    const load = await loadPackCashModel(db, BUSINESS, '2026-08')
    if (load.status !== 'ready') throw new Error(JSON.stringify(load))
    expect(load.inputs.bsRows.every((r) => r.tenant_id === CONSOLIDATED_TENANT_ID)).toBe(true)
    expect(load.inputs.plRows.every((r) => r.tenant_id === CONSOLIDATED_TENANT_ID)).toBe(true)
    // Both organisations' pay runs, not just one.
    expect(load.inputs.payRuns.filter((r) => r.payment_date === '2026-08-31')).toHaveLength(2)
  })

  it('produces a real forecast: every actual month\'s bank movement is exactly double the single-organisation ledger\'s own tied figure', async () => {
    const db = fakeSupabase(tables())
    const load = await loadPackCashModel(db, BUSINESS, '2026-08')
    if (load.status !== 'ready') throw new Error(JSON.stringify(load))
    const model = buildPackCashModel({ fullYear: urbanRoadFullYear(), reportMonth: '2026-08', config: load.config, inputs: load.inputs })
    if (model.status !== 'ready') throw new Error(model.reason)
    // Single-organisation Urban Road ties net_movement to [31446.33, -31708.01]
    // for July and August (pack-cash-model-load.test.ts, and the harness).
    const actual = model.cashflow.months.filter((m) => m.source === 'actual')
    expect(actual.map((m) => m.net_movement)).toEqual([31446.33 * 2, -31708.01 * 2])
    // September — the first forecast month — opens on August's own closing
    // bank, doubled: the multi-org mechanism carries the SAME "opens on the
    // last actual month's real bank" invariant buildPackCashModel already
    // enforces for one organisation.
    const september = model.cashflow.months.find((m) => m.month === '2026-09')
    const august = actual[actual.length - 1]
    expect(september?.bank_at_beginning).toBeCloseTo(august.bank_at_end, 2)
  })

  it('reads every organisation\'s own pay runs, not just the first', async () => {
    const db = fakeSupabase(tables())
    const load = await loadPackCashModel(db, BUSINESS, '2026-08')
    if (load.status !== 'ready') throw new Error(JSON.stringify(load))
    expect(load.inputs.payRuns.length).toBe(UR_PAY_RUNS.length * 2)
  })
})

describe('cash model v2, one foreign organisation with no stored rate', () => {
  it('refuses, naming the currency pair and the month — never HKD pooled at 1:1', async () => {
    const db = fakeSupabase({
      ...tables(),
      xero_connections: [
        { business_id: BUSINESS, tenant_id: UR_TENANT, functional_currency: 'AUD', is_active: true, display_order: 1 },
        { business_id: BUSINESS, tenant_id: 'hk-sibling', functional_currency: 'HKD', is_active: true, display_order: 2 },
      ],
      xero_bs_lines_wide_compat: [
        ...UR_BS_ROWS.map((r) => ({ ...r, business_id: PROFILE })),
        ...UR_BS_ROWS.map((r) => ({ ...r, business_id: PROFILE, tenant_id: 'hk-sibling' })),
      ],
    })
    const load = await loadPackCashModel(db, BUSINESS, '2026-08')
    expect(load).toMatchObject({ status: 'refused', reason: expect.stringContaining('HKD/AUD') })
  })

  it('extra balance-sheet history only the AUD organisation carries — from years before the HKD one existed or fx_rates began — never blocks a report the rates DO cover (IICT-50)', async () => {
    // Real prod (IICT): IAP's mirror has been synced since 2024-07-31, nine
    // months before IGL was even connected and before HKD/AUD rates begin.
    // xero_bs_lines_wide_compat is unfiltered, so a real read hands the loader
    // every one of those dates for the AUD organisation, alongside the HKD
    // one's much shorter history. The fiscal-year window this build actually
    // reads (cashModelNeededBalanceSheetDates) is only 2026-06-30/07-31/08-31
    // — those are the only closing rates provided here. The old, buggy code
    // required an HKD/AUD rate for every date ANY row of ANY organisation
    // carried (datesPresentIn over the whole unfiltered read), so it refused
    // this business even though the two months it actually reports are fully
    // covered.
    const oldHistory = { account_id: null, account_code: null, account_name: 'Old Suspense', account_type: 'asset' as const, section: null, tenant_id: UR_TENANT, balances_by_date: { '2024-06-30': 100, '2025-06-30': 100 } }
    const rates = [
      { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-06-30', rate: 1 },
      { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-07-31', rate: 1 },
      { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-08-31', rate: 1 },
    ]
    const db = fakeSupabase({
      ...tables(),
      xero_connections: [
        { business_id: BUSINESS, tenant_id: UR_TENANT, functional_currency: 'AUD', is_active: true, display_order: 1 },
        { business_id: BUSINESS, tenant_id: 'hk-sibling', functional_currency: 'HKD', is_active: true, display_order: 2 },
      ],
      xero_bs_lines_wide_compat: [
        ...UR_BS_ROWS.map((r) => ({ ...r, business_id: PROFILE })),
        { ...oldHistory, business_id: PROFILE },
        ...UR_BS_ROWS.map((r) => ({ ...r, business_id: PROFILE, tenant_id: 'hk-sibling' })),
      ],
      fx_rates: rates,
    })
    const load = await loadPackCashModel(db, BUSINESS, '2026-08')
    if (load.status !== 'ready') throw new Error(JSON.stringify(load))
    const model = buildPackCashModel({ fullYear: urbanRoadFullYear(), reportMonth: '2026-08', config: load.config, inputs: load.inputs })
    if (model.status !== 'ready') throw new Error(model.reason)
    // Rate 1 both dates: the HKD sibling is a byte-for-byte translated copy
    // of UR_TENANT's own ledger, so — as the plain two-AUD-organisation test
    // above proves — the actual months' net movement is exactly double.
    const actual = model.cashflow.months.filter((m) => m.source === 'actual')
    expect(actual.map((m) => m.net_movement)).toEqual([31446.33 * 2, -31708.01 * 2])
  })
})

describe('cash model v2, an organisation whose sync stalled for one month', () => {
  it('refuses, naming the organisation and the date — never silently treats the missing month as $0', async () => {
    // UR_TENANT_2's sync never reached 31 Jul 2026 (every row simply has no
    // key for that date — the real shape of a stalled sync, not a $0). Every
    // OTHER date is present, and UR_TENANT's own rows are untouched, so the
    // merged ledger still "has" a balance sheet at 2026-07-31 from UR_TENANT
    // alone — without a guard, buildPackCashModel would proceed and silently
    // halve July's true movement.
    const stalledTenant2Rows = UR_BS_ROWS.map((r) => {
      const { ['2026-07-31']: _drop, ...rest } = r.balances_by_date
      return { ...r, business_id: PROFILE, tenant_id: UR_TENANT_2, balances_by_date: rest }
    })
    const db = fakeSupabase({
      ...tables(),
      xero_bs_lines_wide_compat: [
        ...UR_BS_ROWS.map((r) => ({ ...r, business_id: PROFILE })),
        ...stalledTenant2Rows,
      ],
    })
    const load = await loadPackCashModel(db, BUSINESS, '2026-08')
    expect(load).toMatchObject({ status: 'refused', reason: expect.stringContaining('Urban Road Sibling Pty Ltd') })
    expect((load as { reason: string }).reason).toContain('2026-07-31')
  })
})

describe('cash model v2, fx_rates read is bounded to what this report needs', () => {
  it('the fx_rates query is scoped by period, the same convention consolidated-balance-sheet-load.ts uses — never an unfiltered read of the whole currency pair', async () => {
    const rates = [
      { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-06-30', rate: 1 },
      { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-07-31', rate: 1 },
      { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-08-31', rate: 1 },
    ]
    const db = fakeSupabase({
      ...tables(),
      xero_connections: [
        { business_id: BUSINESS, tenant_id: UR_TENANT, functional_currency: 'AUD', is_active: true, display_order: 1 },
        { business_id: BUSINESS, tenant_id: 'hk-sibling', functional_currency: 'HKD', is_active: true, display_order: 2 },
      ],
      xero_bs_lines_wide_compat: [
        ...UR_BS_ROWS.map((r) => ({ ...r, business_id: PROFILE })),
        ...UR_BS_ROWS.map((r) => ({ ...r, business_id: PROFILE, tenant_id: 'hk-sibling' })),
      ],
      fx_rates: rates,
    })
    const load = await loadPackCashModel(db, BUSINESS, '2026-08')
    expect(load.status).toBe('ready')
    const rateCall = db.calls.find((c) => c.table === 'fx_rates')
    expect(rateCall).toBeDefined()
    const ops = new Set(rateCall!.filters.map(([op]) => op))
    expect(ops.has('gte')).toBe(true)
    expect(ops.has('lte')).toBe(true)
    const gte = rateCall!.filters.find(([op, col]) => op === 'gte' && col === 'period')
    const lte = rateCall!.filters.find(([op, col]) => op === 'lte' && col === 'period')
    // Bounded to what this report could need — the fiscal-year window
    // (2026-06-30 to 2026-08-31) widened to cover each organisation's own
    // pay-run translation window (a full year back from the report month,
    // the same span the pay-run query itself uses) — never unbounded, and
    // nowhere near the years of balance-sheet history a real mirror carries.
    expect(gte?.[2]).toBe('2025-08-01')
    expect(lte?.[2]).toBe('2026-08-31')
  })
})

describe('payrollCodeCollisions', () => {
  const orgA = { tenant_id: 'a', name: 'Org A', functional_currency: 'AUD' }
  const orgB = { tenant_id: 'b', name: 'Org B', functional_currency: 'AUD' }

  it('is silent when a shared code names the same account in every organisation that has it', () => {
    const accounts = [
      { tenant_id: 'a', account_code: '62170', account_name: 'Wages' },
      { tenant_id: 'b', account_code: '62170', account_name: 'Wages' },
    ]
    expect(payrollCodeCollisions(accounts, [orgA, orgB], [{ role: 'wages_codes', code: '62170' }])).toBeNull()
  })

  it('refuses, naming both organisations and both account names, when a shared code names DIFFERENT accounts (DRG-40)', () => {
    const accounts = [
      { tenant_id: 'a', account_code: '62170', account_name: 'Wages' },
      { tenant_id: 'b', account_code: '62170', account_name: 'Motor Vehicle Expenses' },
    ]
    const reason = payrollCodeCollisions(accounts, [orgA, orgB], [{ role: 'wages_codes', code: '62170' }])
    expect(reason).toContain('wages_codes 62170')
    expect(reason).toContain('Org A calls it "wages"')
    expect(reason).toContain('Org B calls it "motor vehicle expenses"')
  })

  it('is silent for a code only one organisation carries at all', () => {
    const accounts = [{ tenant_id: 'a', account_code: '62170', account_name: 'Wages' }]
    expect(payrollCodeCollisions(accounts, [orgA, orgB], [{ role: 'wages_codes', code: '62170' }])).toBeNull()
  })
})

describe('cash model v2, two organisations that reuse the same code for different accounts', () => {
  it('refuses building a real forecast on a corrupted wages figure — DRG-40, the exact collision the codebase has already documented for this pair', async () => {
    // UR_TENANT's own code 62170 (wages_codes) is genuinely wages. Give the
    // sibling the SAME code for an unrelated account, exactly as DRG-40
    // documents happened for 26 of Dragon Roofing and Easy Hail Claim's 74
    // shared codes. Without a guard, bookedTo (pack-cash-model.ts) would sum
    // both organisations' postings to code 62170 into one "wages booked"
    // figure with no warning.
    const db = fakeSupabase({
      ...tables(),
      xero_accounts: [
        ...UR_ACCOUNTS.map((a) => ({ ...a, tenant_id: UR_TENANT, business_id: BUSINESS, bank_account_type: null })),
        ...UR_ACCOUNTS.map((a) => ({
          ...a,
          tenant_id: UR_TENANT_2,
          business_id: BUSINESS,
          bank_account_type: null,
          account_name: a.account_code === '62170' ? 'Motor Vehicle Expenses' : a.account_name,
        })),
      ],
    })
    const load = await loadPackCashModel(db, BUSINESS, '2026-08')
    expect(load).toMatchObject({ status: 'refused', reason: expect.stringContaining('62170') })
    expect((load as { reason: string }).reason).toContain('Urban Road Sibling Pty Ltd')
  })
})
