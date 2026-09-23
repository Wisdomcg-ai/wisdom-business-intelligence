/**
 * WD.4 — money-flow derivation.
 *
 * The load-bearing property: sources − uses ≡ Δbank with NO plug, because the
 * derivation is the accounting equation rearranged. Every not-comparable gate
 * is tested — a page that can't prove itself must say so, not render.
 */
import { describe, it, expect } from 'vitest'
import { deriveMoneyFlow, endOfMonth, priorMonth, summariseMonthPl, type BsRowInput } from './money-flow'
import { parseBankAccountIds } from './opening-bank'
import {
  AMEX_PLATINUM,
  BUS_ONLINE_SAVER,
  CBA_CHEQUE,
  URBAN_ROAD_BS_JUL_AUG_2026 as UR_BS,
  URBAN_ROAD_PL_AUG_2026 as UR_PL,
} from './__tests__/fixtures/urban-road-money-flow-2026-08'

const row = (
  account_name: string,
  account_type: string,
  section: string | null,
  balances: Record<string, number>,
  tenant_id = 't1',
): BsRowInput => ({ account_name, account_type, section, tenant_id, balances_by_date: balances })

// A tiny balanced world, Jun→Jul 2026:
//   Bank        10,000 → 14,500   (Δ +4,500)
//   Debtors      8,000 →  6,000   (down 2,000 → SOURCE)
//   Equipment    5,000 →  5,500   (up 500     → USE)
//   Trade Cred   3,000 →  2,000   (down 1,000 → USE)
//   CY Earnings 20,000 → 24,000   (up 4,000   → SOURCE: profit)
//   Ret. Earn        0 →      0
// Check: A(23,000)=L(3,000)+E(20,000) ✓ ; A(26,000)=L(2,000)+E(24,000) ✓
// earnings 4,000 + sources 2,000 − uses 500+1,000 = 4,500 = Δbank ✓
const world: BsRowInput[] = [
  row('Business Cheque', 'asset', 'Bank', { '2026-06-30': 10_000, '2026-07-31': 14_500 }),
  row('Trade Debtors', 'asset', 'Current Assets', { '2026-06-30': 8_000, '2026-07-31': 6_000 }),
  row('Equipment', 'asset', 'Fixed Assets', { '2026-06-30': 5_000, '2026-07-31': 5_500 }),
  row('Trade Creditors', 'liability', 'Current Liabilities', { '2026-06-30': 3_000, '2026-07-31': 2_000 }),
  row('Current Year Earnings', 'equity', null, { '2026-06-30': 20_000, '2026-07-31': 24_000 }),
  row('Retained Earnings', 'equity', null, { '2026-06-30': 0, '2026-07-31': 0 }),
]

describe('date helpers', () => {
  it('endOfMonth handles month lengths and leap years', () => {
    expect(endOfMonth('2026-07')).toBe('2026-07-31')
    expect(endOfMonth('2026-06')).toBe('2026-06-30')
    expect(endOfMonth('2026-02')).toBe('2026-02-28')
    expect(endOfMonth('2028-02')).toBe('2028-02-29')
  })
  it('priorMonth wraps the year', () => {
    expect(priorMonth('2026-07')).toBe('2026-06')
    expect(priorMonth('2026-01')).toBe('2025-12')
  })
})

describe('WD.4 — the flow adds up by construction', () => {
  const flow = deriveMoneyFlow(world, '2026-07')

  it('is comparable and reports the bank movement', () => {
    expect(flow.comparable).toBe(true)
    expect(flow.bank).toEqual({ start: 10_000, end: 14_500, delta: 4_500 })
  })

  it('classifies every non-bank, non-earnings delta as source or use, in balance-sheet order', () => {
    expect(flow.sources.map((s) => s.label)).toEqual(['Trade Debtors'])
    expect(flow.uses.map((u) => u.label)).toEqual(['Equipment', 'Trade Creditors'])
  })

  it('the profit is the earnings movement, never a source', () => {
    expect(flow.earnings_movement).toBe(4_000)
    expect(flow.summary).toBeNull()
  })

  it('earnings + sources − uses ≡ Δbank with zero residual', () => {
    expect(flow.continuity_residual).toBe(0)
  })

  it('an unmoved account produces no row', () => {
    const all = [...flow.sources, ...flow.uses].map((i) => i.label)
    expect(all).not.toContain('Retained Earnings')
  })
})

describe('WD.4 — not-comparable gates (say so, never render a wrong story)', () => {
  it('empty rows → no stored balance sheet', () => {
    const f = deriveMoneyFlow([], '2026-07')
    expect(f.comparable).toBe(false)
    expect(f.reason).toContain('No stored balance sheet')
  })

  it('multi-entity business → refused until WD.6 (mixed currencies must not sum)', () => {
    const multi = [...world, row('HK Bank', 'asset', 'Bank', { '2026-06-30': 1, '2026-07-31': 1 }, 't2')]
    const f = deriveMoneyFlow(multi, '2026-07')
    expect(f.comparable).toBe(false)
    expect(f.reason).toContain('multiple Xero organisations')
  })

  it('missing prior month → refused with the month named', () => {
    const noJune = world.map((r) => ({
      ...r,
      balances_by_date: { '2026-07-31': r.balances_by_date['2026-07-31']! },
    }))
    const f = deriveMoneyFlow(noJune, '2026-07')
    expect(f.comparable).toBe(false)
    expect(f.reason).toContain('2026-06')
  })

  it('an unbalanced stored BS (the real prod condition) → refused', () => {
    const broken = world.map((r) =>
      r.account_name === 'Trade Debtors'
        ? row(r.account_name, r.account_type, r.section, { '2026-06-30': 8_000, '2026-07-31': 6_000 + 9_328 })
        : r,
    )
    const f = deriveMoneyFlow(broken, '2026-07')
    expect(f.comparable).toBe(false)
    expect(f.reason).toContain("doesn't balance")
  })

  it('a within-tolerance rounding wobble still renders', () => {
    const wobble = world.map((r) =>
      r.account_name === 'Trade Debtors'
        ? row(r.account_name, r.account_type, r.section, { '2026-06-30': 8_000, '2026-07-31': 6_000.4 })
        : r,
    )
    const f = deriveMoneyFlow(wobble, '2026-07')
    expect(f.comparable).toBe(true)
  })
})

describe('WD.4 — polarity table', () => {
  it('liability UP is a source (borrowed more), asset DOWN is a source', () => {
    const rows = [
      row('Bank', 'asset', 'Bank', { '2026-06-30': 0, '2026-07-31': 3_000 }),
      row('Loan', 'liability', 'Non-Current Liabilities', { '2026-06-30': 0, '2026-07-31': 5_000 }),
      row('Debtors', 'asset', 'Current Assets', { '2026-06-30': 2_000, '2026-07-31': 1_000 }),
      row('Truck', 'asset', 'Fixed Assets', { '2026-06-30': 0, '2026-07-31': 3_000 }),
      row('Retained Earnings', 'equity', null, { '2026-06-30': 2_000, '2026-07-31': 2_000 }),
    ]
    const f = deriveMoneyFlow(rows, '2026-07')
    expect(f.comparable).toBe(true)
    // Balance-sheet order, not amount order: the asset before the liability.
    expect(f.sources.map((s) => `${s.label}:${s.amount}`)).toEqual(['Debtors:1000', 'Loan:5000'])
    expect(f.uses.map((u) => `${u.label}:${u.amount}`)).toEqual(['Truck:3000'])
    expect(f.bank.delta).toBe(3_000)
    expect(f.continuity_residual).toBe(0)
  })

  it('equity DOWN (drawings) is a use', () => {
    const rows = [
      row('Bank', 'asset', 'Bank', { '2026-06-30': 10_000, '2026-07-31': 6_000 }),
      row("Owner's Drawings", 'equity', null, { '2026-06-30': 0, '2026-07-31': -4_000 }),
      row('Retained Earnings', 'equity', null, { '2026-06-30': 10_000, '2026-07-31': 10_000 }),
    ]
    const f = deriveMoneyFlow(rows, '2026-07')
    expect(f.uses).toMatchObject([{ label: "Owner's Drawings", section: null, amount: 4_000, kind: 'equity', opening: 0, closing: -4_000 }])
    expect(f.continuity_residual).toBe(0)
  })
})

describe("Urban Road, August 2026 — Calxa's Where Did Our Money Go? (p26)", () => {
  const calxaBank = [CBA_CHEQUE, BUS_ONLINE_SAVER]
  const flow = deriveMoneyFlow(UR_BS, '2026-08', {
    bankAccountIds: calxaBank,
    plRows: UR_PL,
    creditCardAccountIds: [AMEX_PLATINUM],
  })
  const line = (items: typeof flow.sources) => items.map((i) => [i.label, Math.round(i.opening), Math.round(i.closing), Math.round(i.amount)])

  it('balances, and reads the month the way Calxa does on its two bank accounts', () => {
    expect(flow.comparable).toBe(true)
    expect(flow.bank_basis).toBe('chosen')
    expect(flow.bank_accounts).toEqual([
      { label: 'CBA Cheque Account', account_id: CBA_CHEQUE, opening: 59432.86, closing: 18724.85, movement: -40708.01 },
      { label: 'Bus Online Saver', account_id: BUS_ONLINE_SAVER, opening: 90000, closing: 99000, movement: 9000 },
    ])
    expect(flow.bank).toEqual({ start: 149432.86, end: 117724.85, delta: -31708.01 })
  })

  it('the summary is August from the P&L — 853.80 below Calxa, the credit note posted after it ran', () => {
    expect(flow.summary).toEqual({
      income: 527561.8, cost_of_sales: 232736.92, expense: 162234.55, other_income: 110.93, other_expense: 0, surplus: 132701.26,
    })
    // …and the balance sheet saw the same profit, to the cent.
    expect(flow.earnings_movement).toBe(132701.26)
  })

  it('Where Our Money Came From: the six accounts Calxa lists, Tax Savings and PayPal among them', () => {
    expect(line(flow.sources)).toEqual([
      ['Urban Road Tax Savings acct', 111000, 90000, 21000],
      ['AUD PayPal#001', 5030, 2095, 2935],        // Calxa 1,935 / 3,095 — a ~$160 receipt posted after Calxa ran
      ['Stock on Hand (Zoho)', -47975, -55005, 7030],
      ['ATO Creditors (BAS)', -39282, 10741, 50023],
      ['GST Collected & Paid', 41229, 69411, 28181], // Calxa 69,496 / 28,267 — the credit note's $85.38 GST
      ['Superannuation Payable', 0, 1260, 1260],
    ])
    expect(Math.round(flow.sources.reduce((s, i) => s + i.amount, 0))).toBe(110429) // Calxa 110,674
  })

  it("Where We've Spent Our Money: Amex a negative asset, first, as Calxa prints it", () => {
    expect(line(flow.uses)).toEqual([
      ['American Express® Platinum Business Card', -65919, -64332, 1586],
      ['Wise account', 222, 365, 142],
      ['Trade Debtors', 130253, 278428, 148175],     // Calxa 279,527 / 149,274 — the credit note's $939.18 and the ~$160 PayPal receipt
      ['Trade Creditors', 482774, 380205, 102568],
      ['QLD Govt Loan', 141761, 138826, 2935],
      ['Forklift Loan', -8487, -9140, 653],
      ['SKA Family Trust Loan a/c', -447329, -456782, 9453],
      ['Shopify loan 2 $100000', 97572, 89418, 8154],
      ['Latitude Gem Visa', -2739, -3910, 1171],
    ])
    expect(Math.round(flow.uses.reduce((s, i) => s + i.amount, 0))).toBe(274838) // Calxa 275,938
  })

  it('no Current Year Earnings source and no Rounding row; the 7c still counts', () => {
    const labels = [...flow.sources, ...flow.uses].map((i) => i.label)
    expect(labels).not.toContain('Current Year Earnings')
    expect(labels).not.toContain('Rounding')
    expect(flow.unlisted_movement).toBe(0.07)
  })

  it('surplus + came from − spent = the bank movement, to the cent', () => {
    expect(flow.continuity_residual).toBe(0)
    const cameFrom = flow.sources.reduce((s, i) => s + i.amount, 0)
    const spent = flow.uses.reduce((s, i) => s + i.amount, 0)
    expect(Math.round((flow.summary!.surplus + cameFrom - spent + flow.unlisted_movement) * 100) / 100).toBe(-31708.01)
  })

  it('by default every Bank-section account is bank, as before — and it still reconciles', () => {
    const f = deriveMoneyFlow(UR_BS, '2026-08', { plRows: UR_PL })
    expect(f.bank_basis).toBe('section')
    expect(f.bank).toEqual({ start: 265684.92, end: 210184.59, delta: -55500.33 })
    expect(f.bank_accounts.map((b) => b.label)).toEqual([
      'CBA Cheque Account', 'Urban Road Tax Savings acct', 'AUD PayPal#001', 'Bus Online Saver', 'Wise account',
    ])
    expect(f.continuity_residual).toBe(0)
  })

  it('a chosen account that is a liability is not bank, and is reported', () => {
    const f = deriveMoneyFlow(UR_BS, '2026-08', { bankAccountIds: [CBA_CHEQUE, AMEX_PLATINUM] })
    expect(f.bank.end).toBe(18724.85)
    expect(f.unmatched_bank_account_ids).toEqual([])
    expect(f.non_asset_bank_accounts.map((a) => a.account_id)).toEqual([AMEX_PLATINUM])
    expect(f.continuity_residual).toBe(0)
  })

  it('an AccountID pasted in upper case is still the account — Xero ids are case-insensitive', () => {
    const f = deriveMoneyFlow(UR_BS, '2026-08', { bankAccountIds: parseBankAccountIds([CBA_CHEQUE, BUS_ONLINE_SAVER.toUpperCase()]), plRows: UR_PL })
    expect(f.bank.delta).toBe(-31708.01)
    expect(f.unmatched_bank_account_ids).toEqual([])
    expect(f.non_asset_bank_accounts).toEqual([])
  })

  it('an upper-case list passed straight in, not through parseBankAccountIds, still counts both accounts', () => {
    const f = deriveMoneyFlow(UR_BS, '2026-08', { bankAccountIds: [CBA_CHEQUE.toUpperCase(), BUS_ONLINE_SAVER.toUpperCase()], plRows: UR_PL })
    expect(f.bank.delta).toBe(-31708.01)
    expect(f.bank_accounts.map((b) => b.label).sort()).toEqual(['Bus Online Saver', 'CBA Cheque Account'])
    expect(f.unmatched_bank_account_ids).toEqual([])
    expect(f.continuity_residual).toBe(0)
  })

  it('a chosen account the sheet does not hold is told apart from one that is not an asset', () => {
    const f = deriveMoneyFlow(UR_BS, '2026-08', { bankAccountIds: [CBA_CHEQUE, AMEX_PLATINUM, 'a-closed-account'] })
    expect(f.unmatched_bank_account_ids).toEqual(['a-closed-account'])
    expect(f.non_asset_bank_accounts).toEqual([{ account_id: AMEX_PLATINUM, label: 'American Express® Platinum Business Card', kind: 'liability' }])
  })

  it('a chosen set matching nothing refuses the page rather than print a $0 bank', () => {
    const f = deriveMoneyFlow(UR_BS, '2026-08', { bankAccountIds: ['not-an-account'] })
    expect(f.comparable).toBe(false)
    expect(f.reason).toContain('None of the bank accounts chosen')
  })

  it("never takes another organisation's P&L into the surplus", () => {
    const f = deriveMoneyFlow(UR_BS, '2026-08', {
      plRows: [...UR_PL, { tenant_id: 'another-org', account_type: 'revenue', monthly_values: { '2026-08': 1_000_000 } }],
    })
    expect(f.summary!.surplus).toBe(132701.26)
  })
})

describe('the first month of a fiscal year', () => {
  it("counts July's profit, not the year-end close of Current Year Earnings into Retained Earnings", () => {
    // Urban Road at 30 Jun / 31 Jul 2026: CYE (16,961.64) → 14,067.26 while
    // Retained Earnings fell 16,961.63 as Xero closed FY2026 into it.
    const rows = [
      row('Bank', 'asset', 'Bank', { '2026-06-30': 278_271.61, '2026-07-31': 292_338.88 }),
      row('Current Year Earnings', 'equity', null, { '2026-06-30': -16_961.64, '2026-07-31': 14_067.26 }),
      row('Retained Earnings', 'equity', null, { '2026-06-30': 295_233.25, '2026-07-31': 278_271.62 }),
    ]
    const f = deriveMoneyFlow(rows, '2026-07')
    expect(f.earnings_movement).toBe(14_067.27)
    expect([...f.sources, ...f.uses]).toEqual([])
    expect(f.continuity_residual).toBe(0)
  })
})

describe('summariseMonthPl', () => {
  it('is null when the sync holds no row for the month — absent, not a $0 month', () => {
    expect(summariseMonthPl(UR_PL, '2026-09')).toBeNull()
  })

  it('subtracts other expenses', () => {
    const s = summariseMonthPl([
      { tenant_id: 't', account_type: 'revenue', monthly_values: { '2026-08': 100 } },
      { tenant_id: 't', account_type: 'other_expense', monthly_values: { '2026-08': '30' } },
    ], '2026-08')
    expect(s).toMatchObject({ income: 100, other_expense: 30, surplus: 70 })
  })
})
