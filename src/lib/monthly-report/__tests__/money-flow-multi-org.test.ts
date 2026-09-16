/**
 * P9 — Where Did Our Money Go for a business Xero holds as several
 * organisations: Dragon Roofing + Easy Hail Claim (two AUD organisations,
 * DRG-49) and IICT Group (IICT (Aust) Pty Ltd AUD + IICT Group Limited HKD,
 * IICT-55/IICT-56 — IICT Group Pty Ltd is excluded, permanently gone from the
 * consolidation per Matt's 16 Sep 2026 confirmation).
 *
 * Fixtures: fixtures/dragon-bs-mirror-2026-08.json and
 * fixtures/iict-bs-mirror-2026-08.json, the same read-only prod snapshots P8's
 * consolidated-balance-sheet.test.ts already pins (16 Sep 2026).
 */
import { describe, it, expect } from 'vitest'
import dragon from './fixtures/dragon-bs-mirror-2026-08.json'
import iict from './fixtures/iict-bs-mirror-2026-08.json'
import { deriveConsolidatedMoneyFlow, type BsRowInput, type MoneyFlowOrganisation } from '../money-flow'
import { moneyFlowRows, parseMoneyFlowConfig } from '../money-flow-rows'
import type { FxRateLike } from '../multi-org-consolidate'

const IICT_IAP = '1d83c9a4-bf6d-448f-bb87-88e2684317bf'
const IICT_IGL = 'de943481-389d-4134-b0af-410f025f53c2'

function orgsOf(fixture: { connections: Array<{ tenant_id: string; name: string; functional_currency: string | null }> }, tenantIds?: string[]): MoneyFlowOrganisation[] {
  return fixture.connections
    .filter((c) => !tenantIds || tenantIds.includes(c.tenant_id))
    .map((c) => ({ tenant_id: c.tenant_id, name: c.name, functional_currency: c.functional_currency }))
}

/** xero_bs_lines fixtures are narrow (one row per date). deriveMoneyFlow reads
 * xero_bs_lines_wide_compat (one row per account, balances_by_date keyed by
 * date) — the same shape money-flow-load.ts hands it. */
interface NarrowBsRow {
  tenant_id: string
  account_id: string | null
  account_code: string | null
  account_name: string
  account_type: string
  section: string | null
  balance_date: string
  balance: number | string | null
}

function toWideRows(narrow: readonly NarrowBsRow[]): BsRowInput[] {
  // Xero can recode an account between one sync and the next (IICT (Aust)'s
  // "Loan - IICT Group Pty Ltd" moved from a liability to an asset between 30
  // Jun and 31 Jul 2025, per the same fixture P8's consolidated-balance-sheet
  // test uses) — a wide row carries ONE class, so the latest date's wins, the
  // same way xero_bs_lines_wide_compat's own view is built.
  const sorted = [...narrow].sort((a, b) => (a.balance_date < b.balance_date ? -1 : 1))
  const byAccount = new Map<string, BsRowInput>()
  for (const r of sorted) {
    const key = `${r.tenant_id}::${r.account_id ?? r.account_name}`
    const row: BsRowInput = byAccount.get(key) ?? { account_id: r.account_id ?? null, account_code: null, account_name: r.account_name, account_type: r.account_type, section: r.section, tenant_id: r.tenant_id, balances_by_date: {} }
    row.account_code = r.account_code ?? null
    row.account_name = r.account_name
    row.account_type = r.account_type
    row.section = r.section
    row.balances_by_date[r.balance_date] = r.balance
    byAccount.set(key, row)
  }
  return [...byAccount.values()]
}

describe('Dragon Roofing + Easy Hail Claim — two AUD organisations (DRG-49)', () => {
  const orgs = orgsOf(dragon as any)
  const rows = toWideRows((dragon as any).rows as NarrowBsRow[])

  it('sums both organisations\' bank with no rate needed at all', () => {
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', orgs)
    expect(flow.comparable).toBe(true)
    // The audit's own gap-checks arithmetic: 288,448.84 − 267,245.93 = 21,202.91.
    expect(flow.bank.start).toBeCloseTo(267245.93, 2)
    expect(flow.bank.end).toBeCloseTo(288448.84, 2)
    expect(flow.bank.delta).toBeCloseTo(21202.91, 2)
    expect(Math.round(flow.bank.delta)).toBe(21203)
  })

  it('names both organisations it added, and neither needed translating', () => {
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', orgs)
    expect(flow.organisations).toEqual([
      { name: 'Dragon Roofing Pty Ltd', currency: 'AUD' },
      { name: 'EASY HAIL CLAIM PTY LTD', currency: 'AUD' },
    ])
  })

  it('proves itself: earnings + sources − uses + unlisted = Δbank, to the cent', () => {
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', orgs)
    expect(flow.continuity_residual).toBeCloseTo(0, 2)
  })

  it('every bank account keeps its own organisation\'s row — never merged by name', () => {
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', orgs)
    // Dragon Roofing Main and SUPA/PAYG Savings sit under Dragon; Easy Hail
    // Claim's own account is a third, separate line — three rows, not one.
    expect(flow.bank_accounts.map((b) => b.label).sort()).toEqual([
      'Dragon Roofing Pty Ltd — Dragon Roofing Main',
      'Dragon Roofing Pty Ltd — SUPA/ PAYG Savings',
      'EASY HAIL CLAIM PTY LTD — Easy Hail Claim',
    ])
  })

  it('the page prints which organisations it added — nothing else on it does', () => {
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', orgs)
    const config = parseMoneyFlowConfig({})
    if (!config.ok) throw new Error(config.reason)
    const { notes } = moneyFlowRows(flow, config.config)
    expect(notes[0]).toBe('Added together: Dragon Roofing Pty Ltd and EASY HAIL CLAIM PTY LTD.')
  })

  it('one organisation missing its balance sheet at a printed month refuses, naming it', () => {
    const dragonTenant = orgs[0].tenant_id
    // Drop Dragon's own 31 Aug rows entirely — Easy Hail's are untouched.
    const withoutAugust = toWideRows(((dragon as any).rows as NarrowBsRow[]).filter((r) => !(r.tenant_id === dragonTenant && r.balance_date === '2026-08-31')))
    const flow = deriveConsolidatedMoneyFlow(withoutAugust, '2026-08', orgs)
    expect(flow.comparable).toBe(false)
    expect(flow.reason).toContain('Dragon Roofing Pty Ltd')
  })
})

describe('IICT (Aust) Pty Ltd + IICT Group Limited (HKD) — IICT-55, IICT-56', () => {
  const orgs = orgsOf(iict as any, [IICT_IAP, IICT_IGL])
  const rows = toWideRows(((iict as any).rows as NarrowBsRow[]).filter((r) => [IICT_IAP, IICT_IGL].includes(r.tenant_id)))
  const rates = (iict as any).fx_rates as FxRateLike[]

  it('translates IICT Group Limited\'s HKD bank at the closing rate of each date and sums with IAP\'s AUD', () => {
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', orgs, { rates })
    expect(flow.comparable).toBe(true)
    // Bank-section default (no bank_account_ids chosen yet for IICT — the
    // client set-up work, same precedent as Distinct Directions' DD-01/DD-03):
    // AUD 3,150.36 + 4,145.74 either side of HKD translated at the OXR closing
    // rate the audit's own tie-arithmetic stored (0.181785 Jul, 0.177902 Aug).
    expect(flow.bank.start).toBeCloseTo(3150.36 + 1303713.43 * 0.18178479899016947, 1)
    expect(flow.bank.end).toBeCloseTo(4145.74 + 1237808.62 * 0.17790200084322572, 1)
    // Within a few dollars of Calxa's own (17,511) (p26) and P8's mirror
    // ((17,510)) — the residual is IICT Group Pty Ltd's own small movement,
    // which both of those included and this consolidation correctly does not:
    // it is gone from the business (Matt confirmed, 16 Sep 2026).
    expect(flow.bank.delta).toBeGreaterThan(-16200)
    expect(flow.bank.delta).toBeLessThan(-15400)
  })

  it('names IICT Group Limited\'s currency — the reader is told this figure was translated', () => {
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', orgs, { rates })
    expect(flow.organisations).toEqual([
      { name: 'IICT (Aust) Pty Ltd', currency: 'AUD' },
      { name: 'IICT Group Limited', currency: 'HKD' },
    ])
  })

  it('still proves itself in a foreign currency: the identity holds to the cent after translation', () => {
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', orgs, { rates })
    expect(flow.continuity_residual).toBeCloseTo(0, 1)
  })

  it('refuses, naming IICT Group Limited and the date, when its closing rate for a needed month is missing', () => {
    const withoutAugustRate = rates.filter((r) => !(r.rate_type === 'closing_spot' && r.period === '2026-08-31'))
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', orgs, { rates: withoutAugustRate })
    expect(flow.comparable).toBe(false)
    expect(flow.reason).toContain('HKD/AUD')
    expect(flow.reason).toContain('2026-08-31')
  })

  it('a currency that was never recorded refuses, naming the organisation', () => {
    const unrecorded = orgs.map((o) => (o.tenant_id === IICT_IGL ? { ...o, functional_currency: null } : o))
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', unrecorded, { rates })
    expect(flow.comparable).toBe(false)
    expect(flow.reason).toContain('IICT Group Limited')
  })
})

describe('a genuine currency translation difference — self-proving, on its own line (decision 7)', () => {
  // A tiny two-organisation, one-foreign world: IAP-like (AUD) plus a foreign
  // org whose average P&L rate differs from its closing balance-sheet rate —
  // exactly what makes a P&L-translated surplus disagree with a
  // closing-rate-translated balance-sheet earnings movement, the way a real
  // month's currency movement does.
  const AUD_ORG: MoneyFlowOrganisation = { tenant_id: 'aud', name: 'Aussie Co', functional_currency: 'AUD' }
  const FX_ORG: MoneyFlowOrganisation = { tenant_id: 'fx', name: 'Foreign Co', functional_currency: 'XYZ' }
  const rates: FxRateLike[] = [
    { currency_pair: 'XYZ/AUD', rate_type: 'closing_spot', period: '2026-07-31', rate: 0.5 },
    { currency_pair: 'XYZ/AUD', rate_type: 'closing_spot', period: '2026-08-31', rate: 0.4 },
    { currency_pair: 'XYZ/AUD', rate_type: 'monthly_average', period: '2026-08-01', rate: 0.45 },
  ]
  const rows: BsRowInput[] = [
    { account_id: 'aud-bank', account_name: 'Bank', account_type: 'asset', section: 'Bank', tenant_id: 'aud', balances_by_date: { '2026-07-31': 1000, '2026-08-31': 1100 } },
    { account_id: 'aud-cye', account_name: 'Current Year Earnings', account_type: 'equity', section: null, tenant_id: 'aud', balances_by_date: { '2026-07-31': 1000, '2026-08-31': 1100 } },
    // Foreign Co: bank moves from FX 2,000 to FX 2,500 (a real inflow of FX 500), and
    // its only equity is Current Year Earnings, which the accounting equation
    // ties to the same FX 500 profit.
    { account_id: 'fx-bank', account_name: 'Bank', account_type: 'asset', section: 'Bank', tenant_id: 'fx', balances_by_date: { '2026-07-31': 2000, '2026-08-31': 2500 } },
    { account_id: 'fx-cye', account_name: 'Current Year Earnings', account_type: 'equity', section: null, tenant_id: 'fx', balances_by_date: { '2026-07-31': 2000, '2026-08-31': 2500 } },
  ]
  const plRows = [
    { tenant_id: 'aud', account_type: 'revenue', monthly_values: { '2026-08': 100 } },
    // Foreign Co's August P&L: FX 500 of revenue — the same profit the balance
    // sheet shows, in the organisation's own currency.
    { tenant_id: 'fx', account_type: 'revenue', monthly_values: { '2026-08': 500 } },
  ]

  it('the printed Surplus is the P&L translated at the AVERAGE rate, not the balance sheet\'s closing-rate movement', () => {
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', [AUD_ORG, FX_ORG], { plRows, rates })
    expect(flow.comparable).toBe(true)
    // AUD 100 + FX 500 × 0.45 (August's average) = 325.
    expect(flow.summary!.surplus).toBeCloseTo(325, 2)
  })

  it('the bank movement is translated at the CLOSING rate — a different number from the average-rate profit, and the page still proves itself', () => {
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', [AUD_ORG, FX_ORG], { plRows, rates })
    // Δbank = (1100 − 1000) + (2500×0.4 − 2000×0.5) = 100 + (1000 − 1000) = 100.
    expect(flow.bank.delta).toBeCloseTo(100, 2)
    // Surplus (325) alone does not explain a 100 bank movement — the
    // difference is exactly the currency translation difference, and the
    // page's own proof (continuity_residual, always earnings-movement-based)
    // still ties to zero: nothing is silently plugged.
    expect(flow.continuity_residual).toBeCloseTo(0, 2)
  })

  it('the gap between the average-rate surplus and the bank movement prints as its own disclosed note — never folded into the Surplus figure', () => {
    const flow = deriveConsolidatedMoneyFlow(rows, '2026-08', [AUD_ORG, FX_ORG], { plRows, rates })
    const config = parseMoneyFlowConfig({})
    if (!config.ok) throw new Error(config.reason)
    const { rows: printed, notes } = moneyFlowRows(flow, config.config)
    const surplusRow = printed.find((r): r is Extract<typeof printed[number], { type: 'total' }> => r.type === 'total' && r.label === 'Surplus / Deficit')
    expect(surplusRow?.movement).toBeCloseTo(325, 2)
    expect(notes.some((n) => n.includes('differ by that much'))).toBe(true)
  })
})
