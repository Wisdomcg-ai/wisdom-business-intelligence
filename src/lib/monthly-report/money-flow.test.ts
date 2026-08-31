/**
 * WD.4 — money-flow derivation.
 *
 * The load-bearing property: sources − uses ≡ Δbank with NO plug, because the
 * derivation is the accounting equation rearranged. Every not-comparable gate
 * is tested — a page that can't prove itself must say so, not render.
 */
import { describe, it, expect } from 'vitest'
import { deriveMoneyFlow, endOfMonth, priorMonth, type BsRowInput } from './money-flow'

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
// sources 2,000+4,000 − uses 500+1,000 = 4,500 = Δbank ✓
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

  it('classifies every non-bank delta as source or use', () => {
    expect(flow.sources.map((s) => s.label).sort()).toEqual(['Current Year Earnings', 'Trade Debtors'])
    expect(flow.uses.map((u) => u.label).sort()).toEqual(['Equipment', 'Trade Creditors'])
    // Profit is the biggest source; sorting is by amount desc.
    expect(flow.sources[0].label).toBe('Current Year Earnings')
    expect(flow.sources[0].amount).toBe(4_000)
  })

  it('sources − uses ≡ Δbank with zero residual', () => {
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
    expect(f.sources.map((s) => `${s.label}:${s.amount}`)).toEqual(['Loan:5000', 'Debtors:1000'])
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
    expect(f.uses).toEqual([{ label: "Owner's Drawings", section: null, amount: 4_000, kind: 'equity' }])
    expect(f.continuity_residual).toBe(0)
  })
})
