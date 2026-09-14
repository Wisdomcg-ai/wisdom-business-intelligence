/**
 * FX account split — the pure rule, on real figures.
 *
 * 1. The six committed IICT-HK / JDS P&L + Trial Balance capture pairs: the
 *    FX system accounts' month movements reproduce the merged FXGROUPID row
 *    to the cent, so all six split with residual 0.
 * 2. Urban Road Jul/Aug/Mar 2026 (CONSTRUCTED Trial Balances shaped like the
 *    captures, figures from Xero's own P&L via the read-only MCP — replaced by
 *    the gate-0 capture once Matt runs it).
 * 3. Every fallback: unreconciled at +0.06 (and not at exactly 0.05), the
 *    revenue side, no system accounts, Bank Revaluations absent from the TB.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parsePLSinglePeriod, fxGroupAccountId } from '@/lib/xero/pl-single-period-parser'
import { parseTrialBalanceMovements, type ParsedTBRow } from '@/lib/xero/trialbalance-parser'
import type { CatalogMap } from '@/lib/xero/accounts-catalog'
import {
  splitFxGroupMonth,
  fxSystemAccountIds,
  FX_SYSTEM_ACCOUNTS,
} from '@/lib/xero/fx-group-split'
import {
  UR_TENANT,
  UR_FX_GROUP_ID,
  UR_CATALOG,
  UR_FX_MERGED,
  ACC_497,
  ACC_498,
  ACC_499,
  plReport,
  tbReport,
  urbanRoadTb,
  urbanRoadBook,
} from './helpers/fx-split-harness'

function fixture(name: string): { _meta: any; response: unknown } {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'))
}

const IICT_CATALOG: CatalogMap = new Map([
  ['6bd44c18-bd28-4745-9e00-0de6cb25a03b', { account_code: '499', account_name: 'Realised Currency Gains', account_type: 'EXPENSE', system_account: 'REALISEDCURRENCYGAIN' }],
  ['6bd82684-a94f-495b-b3c3-505fbb95a960', { account_code: '498', account_name: 'Unrealised Currency Gains', account_type: 'EXPENSE', system_account: 'UNREALISEDCURRENCYGAIN' }],
])
const JDS_CATALOG: CatalogMap = new Map([
  ['c2878a4c-bef9-408c-9df6-d709c3b64e61', { account_code: '199', account_name: 'Realised Currency Gains', account_type: 'EXPENSE', system_account: 'REALISEDCURRENCYGAIN' }],
  ['63450033-d387-4f9f-857e-0927d0902019', { account_code: '198', account_name: 'Unrealised Currency Gains', account_type: 'EXPENSE', system_account: 'UNREALISEDCURRENCYGAIN' }],
])

function urCatalog(over: Partial<Record<string, Partial<{ account_type: string; system_account: string | null }>>> = {}): CatalogMap {
  return new Map(
    UR_CATALOG.map((a) => [
      a.id,
      {
        account_code: a.code,
        account_name: a.name,
        account_type: a.type,
        system_account: a.systemAccount ?? null,
        ...(over[a.id] ?? {}),
      },
    ]),
  )
}

/** Urban Road's month rows through the real parser, as the orchestrator sees them. */
function urPlRows(month: string, fxAmount?: number, section = 'Less Operating Expenses') {
  const rows = urbanRoadBook().monthRows(month).map((r) =>
    r.id === 'FXGROUPID' ? { ...r, amount: fxAmount ?? r.amount, section } : r,
  )
  return parsePLSinglePeriod(plReport(month, rows), month, 'accruals', UR_TENANT)
}

function urTb(month: string, opts: { omit497?: boolean; bump499?: number } = {}): ParsedTBRow[] {
  const rows = urbanRoadTb(month, opts).map((r) =>
    r.id === ACC_499 && opts.bump499 ? { ...r, movement: Math.round((r.movement + opts.bump499) * 100) / 100 } : r,
  )
  return parseTrialBalanceMovements(tbReport(month, rows))
}

describe('fxGroupAccountId', () => {
  it("derives Urban Road's prod merged-row id", () => {
    expect(fxGroupAccountId(UR_TENANT)).toBe(UR_FX_GROUP_ID)
  })
})

describe('splitFxGroupMonth — the six committed capture pairs tie to the cent', () => {
  const pairs: Array<[string, string, string, CatalogMap, number]> = [
    ['iict-hk-pl-single-2026-02', 'iict-hk-trialbalance-2026-02-28', '2026-02-01', IICT_CATALOG, 2927.64],
    ['iict-hk-pl-single-2026-03', 'iict-hk-trialbalance-2026-03-31', '2026-03-01', IICT_CATALOG, -10950.18],
    ['iict-hk-pl-single-2026-04', 'iict-hk-trialbalance-2026-04-30', '2026-04-01', IICT_CATALOG, 14523.03],
    ['jds-pl-single-2026-02', 'jds-trialbalance-2026-02-28', '2026-02-01', JDS_CATALOG, -2216.38],
    ['jds-pl-single-2026-03', 'jds-trialbalance-2026-03-31', '2026-03-01', JDS_CATALOG, 5061.84],
    ['jds-pl-single-2026-04', 'jds-trialbalance-2026-04-30', '2026-04-01', JDS_CATALOG, -3235.74],
  ]
  for (const [plName, tbName, month, catalog, merged] of pairs) {
    it(`${plName} ${merged}`, () => {
      const pl = fixture(plName)
      const tenantId = pl._meta.tenant_id
      expect(fixture(tbName)._meta.tenant_id).toBe(tenantId)
      const plRows = parsePLSinglePeriod(pl.response, month, 'accruals', tenantId)
      const out = splitFxGroupMonth({
        plRows,
        tbMovements: parseTrialBalanceMovements(fixture(tbName).response),
        catalog,
        tenantId,
      })
      expect(out.kind).toBe('split')
      if (out.kind !== 'split') return
      expect(out.merged.amount).toBe(merged)
      expect(out.residual).toBe(0)
      const sum = out.rows.reduce((s, r) => s + r.amount, 0)
      expect(Math.round(sum * 100) / 100).toBe(merged)
      for (const r of out.rows) {
        expect(r.account_type).toBe('opex')
        expect(r.basis).toBe('accruals')
        expect(r.period_month).toBe(month)
        expect(['198', '199', '498', '499']).toContain(r.account_code)
      }
    })
  }

  it('IICT Mar-26 rows are the exact TB facts: Unrealised −11,014.60, Realised 64.42, catalog names', () => {
    const pl = fixture('iict-hk-pl-single-2026-03')
    const out = splitFxGroupMonth({
      plRows: parsePLSinglePeriod(pl.response, '2026-03-01', 'accruals', pl._meta.tenant_id),
      tbMovements: parseTrialBalanceMovements(fixture('iict-hk-trialbalance-2026-03-31').response),
      catalog: IICT_CATALOG,
      tenantId: pl._meta.tenant_id,
    })
    if (out.kind !== 'split') throw new Error(out.kind)
    // Print order: Unrealised before Realised.
    expect(out.rows.map((r) => [r.account_code, r.account_name, r.amount])).toEqual([
      ['498', 'Unrealised Currency Gains', -11014.6],
      ['499', 'Realised Currency Gains', 64.42],
    ])
  })
})

describe('splitFxGroupMonth — Urban Road', () => {
  it('Jul-26: 76.93 + (124.09) + 285.77 = 238.61 → three coded rows, residual 0', () => {
    const out = splitFxGroupMonth({ plRows: urPlRows('2026-07-01'), tbMovements: urTb('2026-07-01'), catalog: urCatalog(), tenantId: UR_TENANT })
    if (out.kind !== 'split') throw new Error(JSON.stringify(out))
    expect(out.merged.account_id).toBe(UR_FX_GROUP_ID)
    expect(out.merged.amount).toBe(238.61)
    expect(out.residual).toBe(0)
    expect(out.rows.map((r) => [r.account_id, r.account_code, r.account_name, r.account_type, r.amount])).toEqual([
      [ACC_497, '497', 'Bank Revaluations', 'opex', 76.93],
      [ACC_498, '498', 'Unrealised Currency Gains', 'opex', -124.09],
      [ACC_499, '499', 'Realised Currency Gains', 'opex', 285.77],
    ])
  })

  it('Aug-26: 96.72 + 484.27 + 338.26 = 919.25', () => {
    const out = splitFxGroupMonth({ plRows: urPlRows('2026-08-01'), tbMovements: urTb('2026-08-01'), catalog: urCatalog(), tenantId: UR_TENANT })
    if (out.kind !== 'split') throw new Error(JSON.stringify(out))
    expect(out.rows.map((r) => r.amount)).toEqual([96.72, 484.27, 338.26])
    expect(out.residual).toBe(0)
  })

  it('YTD Jul+Aug per account prints Calxa p10: 174 / 360 / 624', () => {
    const ytd = new Map<string, number>()
    for (const m of ['2026-07-01', '2026-08-01']) {
      const out = splitFxGroupMonth({ plRows: urPlRows(m), tbMovements: urTb(m), catalog: urCatalog(), tenantId: UR_TENANT })
      if (out.kind !== 'split') throw new Error(out.kind)
      for (const r of out.rows) ytd.set(r.account_code!, Math.round(((ytd.get(r.account_code!) ?? 0) + r.amount) * 100) / 100)
    }
    expect(Object.fromEntries(ytd)).toEqual({ '497': 173.65, '498': 360.18, '499': 624.03 })
    expect([...ytd.values()].map((v) => Math.round(v))).toEqual([174, 360, 624])
  })

  it('Mar-26: 368.44 across the accounts against 368.43 merged → split, residual 0.01 recorded, rows unadjusted', () => {
    expect(UR_FX_MERGED['2026-03-01']).toBe(368.43)
    const out = splitFxGroupMonth({ plRows: urPlRows('2026-03-01'), tbMovements: urTb('2026-03-01'), catalog: urCatalog(), tenantId: UR_TENANT })
    if (out.kind !== 'split') throw new Error(JSON.stringify(out))
    expect(out.residual).toBe(0.01)
    expect(out.rows.map((r) => r.amount)).toEqual([-123.21, 292.02, 199.63])
  })

  it('perturbed by +0.06 → kept, unreconciled, delta 0.06', () => {
    const out = splitFxGroupMonth({ plRows: urPlRows('2026-08-01'), tbMovements: urTb('2026-08-01', { bump499: 0.06 }), catalog: urCatalog(), tenantId: UR_TENANT })
    expect(out).toMatchObject({ kind: 'kept', reason: 'unreconciled', delta: 0.06 })
  })

  it('perturbed by exactly 0.05 → split (> materiality fails, = passes)', () => {
    const up = splitFxGroupMonth({ plRows: urPlRows('2026-08-01'), tbMovements: urTb('2026-08-01', { bump499: 0.05 }), catalog: urCatalog(), tenantId: UR_TENANT })
    expect(up).toMatchObject({ kind: 'split', residual: 0.05 })
    const down = splitFxGroupMonth({ plRows: urPlRows('2026-08-01'), tbMovements: urTb('2026-08-01', { bump499: -0.05 }), catalog: urCatalog(), tenantId: UR_TENANT })
    expect(down).toMatchObject({ kind: 'split', residual: -0.05 })
  })

  it('Bank Revaluations absent from the TB → kept, unreconciled by exactly its 76.93', () => {
    const out = splitFxGroupMonth({ plRows: urPlRows('2026-07-01'), tbMovements: urTb('2026-07-01', { omit497: true }), catalog: urCatalog(), tenantId: UR_TENANT })
    expect(out).toMatchObject({ kind: 'kept', reason: 'unreconciled', delta: -76.93 })
  })

  it('merged row on the revenue side → kept, section (never re-signed)', () => {
    const out = splitFxGroupMonth({ plRows: urPlRows('2026-08-01', undefined, 'Other Income'), tbMovements: urTb('2026-08-01'), catalog: urCatalog(), tenantId: UR_TENANT })
    expect(out).toMatchObject({ kind: 'kept', reason: 'section' })
  })

  it('a system account that is not an expense type → kept, section', () => {
    const out = splitFxGroupMonth({ plRows: urPlRows('2026-08-01'), tbMovements: urTb('2026-08-01'), catalog: urCatalog({ [ACC_499]: { account_type: 'OTHERINCOME' } }), tenantId: UR_TENANT })
    expect(out).toMatchObject({ kind: 'kept', reason: 'section' })
  })

  it('catalog names no FX system account → kept, no_system_accounts', () => {
    const cat = urCatalog({ [ACC_497]: { system_account: null }, [ACC_498]: { system_account: null }, [ACC_499]: { system_account: null } })
    expect(fxSystemAccountIds(cat)).toEqual([])
    const out = splitFxGroupMonth({ plRows: urPlRows('2026-08-01'), tbMovements: urTb('2026-08-01'), catalog: cat, tenantId: UR_TENANT })
    expect(out).toMatchObject({ kind: 'kept', reason: 'no_system_accounts' })
  })

  it('TB carries none of the FX accounts → kept, no_system_accounts', () => {
    const tb = urTb('2026-08-01').filter((r) => ![ACC_497, ACC_498, ACC_499].includes(r.account_id!))
    const out = splitFxGroupMonth({ plRows: urPlRows('2026-08-01'), tbMovements: tb, catalog: urCatalog(), tenantId: UR_TENANT })
    expect(out).toMatchObject({ kind: 'kept', reason: 'no_system_accounts' })
  })

  it('a merged row of exactly 0.00 → zero (nothing emitted, no TB needed)', () => {
    const out = splitFxGroupMonth({ plRows: urPlRows('2026-08-01', 0), tbMovements: [], catalog: urCatalog(), tenantId: UR_TENANT })
    expect(out.kind).toBe('zero')
  })

  it('a month with no merged row → none', () => {
    const rows = urPlRows('2026-08-01').filter((r) => r.account_id !== UR_FX_GROUP_ID)
    expect(splitFxGroupMonth({ plRows: rows, tbMovements: urTb('2026-08-01'), catalog: urCatalog(), tenantId: UR_TENANT }).kind).toBe('none')
  })

  it("another tenant's merged row is not this tenant's", () => {
    const out = splitFxGroupMonth({ plRows: urPlRows('2026-08-01'), tbMovements: urTb('2026-08-01'), catalog: urCatalog(), tenantId: 'de943481-389d-4134-b0af-410f025f53c2' })
    expect(out.kind).toBe('none')
  })

  it('an account with no movement gets no row, and the rest still tie', () => {
    const tb = urTb('2026-08-01').map((r) => (r.account_id === ACC_497 ? { ...r, debit: 0, credit: 0 } : r))
    const plRows = urPlRows('2026-08-01', 822.53)
    const out = splitFxGroupMonth({ plRows, tbMovements: tb, catalog: urCatalog(), tenantId: UR_TENANT })
    if (out.kind !== 'split') throw new Error(JSON.stringify(out))
    expect(out.rows.map((r) => r.account_code)).toEqual(['498', '499'])
  })

  it('print order is Bank Revaluations, Unrealised, Realised', () => {
    expect(FX_SYSTEM_ACCOUNTS).toEqual(['BANKCURRENCYGAIN', 'UNREALISEDCURRENCYGAIN', 'REALISEDCURRENCYGAIN'])
    expect(fxSystemAccountIds(urCatalog())).toEqual([ACC_497, ACC_498, ACC_499])
  })
})
