/**
 * The database half of cash model v2, through the in-memory client that
 * applies its filters: the switch (and its fallback before the migration),
 * the one-organisation refusal, tenant-scoped tax types and pay runs, and the
 * whole read path composed into Urban Road's tied year.
 */
import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from './fake-supabase'

const BUSINESS = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const PROFILE = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: BUSINESS, profileId: PROFILE, all: [BUSINESS, PROFILE] })),
}))

import { loadCashModelConfig } from '../cash-model-config-load'
import { loadPackCashModel } from '../pack-cash-model-load'
import { buildPackCashModel } from '../pack-cash-model'
import { UR_ACCOUNT_IDS, UR_BANK_IDS, UR_BS_ROWS, UR_PAY_RUNS, UR_PL_ROWS, UR_TAX_TYPES, UR_TENANT } from './urban-road-ledger-fixture'
import { urbanRoadCashModel } from './urban-road-cash-model-config'
import { urbanRoadFullYear } from './urban-road-full-year-fixture'

const tables = (over: Record<string, unknown> = {}) => ({
  monthly_report_settings: [{ business_id: BUSINESS, cash_model: urbanRoadCashModel(), bank_account_ids: UR_BANK_IDS }],
  xero_connections: [{ business_id: BUSINESS, tenant_id: UR_TENANT, functional_currency: 'AUD', is_active: true }],
  business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
  xero_bs_lines_wide_compat: [
    ...UR_BS_ROWS.map((r) => ({ ...r, business_id: PROFILE })),
    // Another business sharing nothing: must not be read.
    { ...UR_BS_ROWS[0], business_id: 'someone-else', balances_by_date: { '2026-08-31': 1e9 } },
  ],
  xero_pl_lines_wide_compat: UR_PL_ROWS.map((r) => ({ ...r, business_id: PROFILE })),
  xero_accounts: [
    ...Object.entries(UR_TAX_TYPES).map(([code, tax_type]) => ({ tenant_id: UR_TENANT, business_id: BUSINESS, xero_account_id: `id-${code}`, account_code: code, account_name: code, tax_type, bank_account_type: null })),
    { tenant_id: UR_TENANT, business_id: BUSINESS, xero_account_id: 'x', account_code: null, account_name: 'Foreign Currency Gains and Losses', tax_type: 'BASEXCLUDED', bank_account_type: null },
    // Xero's own class, for the cash model's role check (Trade Debtors is an ASSET).
    { tenant_id: UR_TENANT, business_id: BUSINESS, xero_account_id: UR_ACCOUNT_IDS.tradeDebtors, account_code: '11200', account_name: 'Trade Debtors', tax_type: 'BASEXCLUDED', bank_account_type: null, xero_class: 'ASSET', xero_type: 'CURRENT' },
    // Same code in another org, different tax type: must never be pooled in.
    { tenant_id: 'other-org', business_id: BUSINESS, xero_account_id: 'y', account_code: '41000', account_name: 'Canvas Sales', tax_type: 'EXEMPTOUTPUT', bank_account_type: null },
  ],
  xero_pay_runs: [
    ...UR_PAY_RUNS.map((r) => ({ ...r, business_id: PROFILE, tenant_id: UR_TENANT, status: 'POSTED' })),
    { payment_date: '2026-08-31', wages: 99999, tax: 99999, super_amount: 0, business_id: PROFILE, tenant_id: UR_TENANT, status: 'DRAFT' },
  ],
  ...over,
})

describe('loadCashModelConfig', () => {
  it('a schema without the column is off — v1, before the migration is applied', async () => {
    const db = fakeSupabase({ monthly_report_settings: { error: { code: '42703', message: 'column cash_model does not exist' } as never } })
    expect(await loadCashModelConfig(db, BUSINESS)).toEqual({ status: 'off' })
    const stale = fakeSupabase({ monthly_report_settings: { error: { code: 'PGRST204', message: 'x' } as never } })
    expect(await loadCashModelConfig(stale, BUSINESS)).toEqual({ status: 'off' })
  })

  it('no row, or a null column, is off', async () => {
    expect(await loadCashModelConfig(fakeSupabase({ monthly_report_settings: [] }), BUSINESS)).toEqual({ status: 'off' })
    expect(await loadCashModelConfig(fakeSupabase({ monthly_report_settings: [{ business_id: BUSINESS, cash_model: null }] }), BUSINESS)).toEqual({ status: 'off' })
  })

  it('any other database error throws', async () => {
    await expect(loadCashModelConfig(fakeSupabase({ monthly_report_settings: { error: { code: '57014', message: 'timeout' } as never } }), BUSINESS)).rejects.toMatchObject({ code: '57014' })
  })

  it('prefers the businesses-space row', async () => {
    const db = fakeSupabase({ monthly_report_settings: [{ business_id: PROFILE, cash_model: { enabled: false } }, { business_id: BUSINESS, cash_model: urbanRoadCashModel() }] })
    expect((await loadCashModelConfig(db, BUSINESS)).status).toBe('on')
  })
})

describe('loadPackCashModel', () => {
  it('off reads nothing but the settings', async () => {
    const db = fakeSupabase(tables({ monthly_report_settings: [] }))
    expect(await loadPackCashModel(db, BUSINESS, '2026-08')).toEqual({ status: 'off' })
  })

  it('invalid settings are a refusal with the reason', async () => {
    const db = fakeSupabase(tables({ monthly_report_settings: [{ business_id: BUSINESS, cash_model: { enabled: true } }] }))
    const r = await loadPackCashModel(db, BUSINESS, '2026-08')
    expect(r.status).toBe('refused')
  })

  it('refuses two Xero organisations, and a foreign currency — never pooled', async () => {
    const two = fakeSupabase(tables({ xero_connections: [
      { business_id: BUSINESS, tenant_id: UR_TENANT, functional_currency: 'AUD', is_active: true },
      { business_id: BUSINESS, tenant_id: 'hk', functional_currency: 'HKD', is_active: true },
    ] }))
    const r2 = await loadPackCashModel(two, BUSINESS, '2026-08')
    expect(r2).toMatchObject({ status: 'refused', reason: expect.stringContaining('multiple Xero organisations') })
    const hkd = fakeSupabase(tables({ xero_connections: [{ business_id: BUSINESS, tenant_id: UR_TENANT, functional_currency: 'HKD', is_active: true }] }))
    expect((await loadPackCashModel(hkd, BUSINESS, '2026-08')).status).toBe('refused')
  })

  it('reads this business\'s org only — tax types by tenant, posted pay runs, the chosen bank set — and ties the year', async () => {
    const db = fakeSupabase(tables())
    const load = await loadPackCashModel(db, BUSINESS, '2026-08')
    if (load.status !== 'ready') throw new Error(JSON.stringify(load))
    expect(load.inputs.bsRows.every((r) => r.tenant_id === UR_TENANT)).toBe(true)
    expect(load.inputs.accounts.some((a) => a.xero_account_id === 'y')).toBe(false)
    expect(load.inputs.payRuns.some((r) => Number(r.wages) === 99999)).toBe(false)
    expect(load.inputs.bankAccountIds).toEqual(UR_BANK_IDS)
    expect(load.inputs.accounts.find((a) => a.xero_account_id === UR_ACCOUNT_IDS.tradeDebtors)?.xero_class).toBe('ASSET')
    expect(load.inputs.accounts.find((a) => a.xero_account_id === UR_ACCOUNT_IDS.tradeDebtors)?.xero_type).toBe('CURRENT')
    const model = buildPackCashModel({ fullYear: urbanRoadFullYear(), reportMonth: '2026-08', config: load.config, inputs: load.inputs })
    if (model.status !== 'ready') throw new Error(model.reason)
    expect(model.cashflow.months.slice(0, 2).map((m) => m.net_movement)).toEqual([31446.33, -31708.01])
    expect(model.reconciliation.flatMap((r) => r.unknown_tax_accounts)).toEqual([])
  })

  it('an override config wins over the stored one (the harness\'s --settings-override)', async () => {
    const db = fakeSupabase(tables({ monthly_report_settings: [] }))
    const r = await loadPackCashModel(db, BUSINESS, '2026-08', { config: { status: 'on', config: urbanRoadCashModel() }, bankAccountIds: UR_BANK_IDS })
    expect(r.status).toBe('ready')
  })
})
