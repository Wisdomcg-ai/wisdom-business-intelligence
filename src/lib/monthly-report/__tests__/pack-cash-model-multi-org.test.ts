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

import { loadPackCashModel } from '../pack-cash-model-load'
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
})
