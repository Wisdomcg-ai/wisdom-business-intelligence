/**
 * bs_equation over the Path-A mirror — the pure evaluation the daily
 * invariant now calls (it previously read the other BS table).
 */
import { describe, it, expect } from 'vitest'
import { evaluateBsEquation, newestCompletedMonthEnd, type PathABsRow } from './bs-equation'

const row = (
  account_name: string,
  account_type: string | null,
  section: string | null,
  balances: Record<string, number>,
): PathABsRow => ({ tenant_id: 't1', account_name, account_type, section, balances_by_date: balances })

const AS_OF = new Date('2026-09-02T05:00:00Z')

describe('month choice — newest COMPLETED month-end', () => {
  it('skips the forward-dated current-month snapshot', () => {
    const rows = [row('Bank', 'asset', 'Bank', { '2026-07-31': 1, '2026-08-31': 2, '2026-09-30': 3 })]
    expect(newestCompletedMonthEnd(rows, AS_OF)).toBe('2026-08-31')
  })
  it('null when no completed month-end exists', () => {
    expect(newestCompletedMonthEnd([row('Bank', 'asset', 'Bank', { '2026-09-30': 3 })], AS_OF)).toBeNull()
    expect(newestCompletedMonthEnd([], AS_OF)).toBeNull()
  })
})

describe('the equation', () => {
  it('balances on a clean tenant (liabilities + equity stored positive)', () => {
    const r = evaluateBsEquation([
      row('Bank', 'asset', 'Bank', { '2026-08-31': 14_500 }),
      row('Debtors', 'asset', 'Current Assets', { '2026-08-31': 6_000 }),
      row('Creditors', 'liability', 'Current Liabilities', { '2026-08-31': 2_000 }),
      row('Current Year Earnings', 'equity', null, { '2026-08-31': 18_500 }),
    ], AS_OF)
    expect(r.balance_date).toBe('2026-08-31')
    expect(r.delta).toBe(0)
    expect(r.hasData).toBe(true)
  })

  it("reports the delta of a lingering row (JDS's $70,539.88 shape)", () => {
    const r = evaluateBsEquation([
      row('Bank', 'asset', 'Bank', { '2026-08-31': 100_000 }),
      row('Wages Payable', 'liability', 'Current Liabilities', { '2026-08-31': 70_539.88 }),
      row('Retained Earnings', 'equity', null, { '2026-08-31': 100_000 }),
    ], AS_OF)
    expect(r.delta).toBe(-70_539.88)
  })

  it('no data at the month is NOT a pass', () => {
    const r = evaluateBsEquation([row('Bank', 'asset', 'Bank', { '2026-08-31': 0 })], AS_OF)
    expect(r.hasData).toBe(false)
    expect(r.delta).toBe(0)
  })

  it('equity rows with NULL section are NOT uncategorised (parser design)', () => {
    const r = evaluateBsEquation([
      row('Bank', 'asset', 'Bank', { '2026-08-31': 500 }),
      row('Retained Earnings', 'equity', null, { '2026-08-31': 500 }),
    ], AS_OF)
    expect(r.uncategorised_count).toBe(0)
    expect(r.delta).toBe(0)
  })

  it('a row with an unknown account_type IS uncategorised and excluded from the equation', () => {
    const r = evaluateBsEquation([
      row('Bank', 'asset', 'Bank', { '2026-08-31': 500 }),
      row('Retained Earnings', 'equity', null, { '2026-08-31': 500 }),
      row('Mystery', null, null, { '2026-08-31': 42 }),
    ], AS_OF)
    expect(r.uncategorised_count).toBe(1)
    expect(r.uncategorised_total).toBe(42)
    expect(r.delta).toBe(0)
  })

  it('numeric-as-string balances are coerced (Supabase numerics)', () => {
    const r = evaluateBsEquation([
      { tenant_id: 't1', account_name: 'Bank', account_type: 'asset', section: 'Bank', balances_by_date: { '2026-08-31': '10.50' } },
      { tenant_id: 't1', account_name: 'RE', account_type: 'equity', section: null, balances_by_date: { '2026-08-31': '10.50' } },
    ], AS_OF)
    expect(r.assets).toBe(10.5)
    expect(r.delta).toBe(0)
  })
})
