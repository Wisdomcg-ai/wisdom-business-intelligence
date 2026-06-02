import { describe, it, expect } from 'vitest'
import { assertGate4 } from '@/lib/xero/reconciliation-gates'
import type { ParsedBSRow } from '@/lib/xero/bs-single-period-parser'

// Build a ParsedBSRow; account_type is cast so we can simulate the malformed /
// out-of-union runtime rows that R34/DM-N9 is about (raw DB reads, future parser
// changes). BSAccountType is strictly asset|liability|equity at the type level.
function row(account_type: string, balance: number, account_name = 'acct'): ParsedBSRow {
  return {
    account_id: '00000000-0000-4000-8000-000000000000',
    account_code: null,
    account_name,
    account_type: account_type as ParsedBSRow['account_type'],
    section: null,
    balance_date: '2026-06-30',
    balance,
    basis: 'accrual' as ParsedBSRow['basis'],
  }
}

describe('assertGate4 — uncategorized rows (R34/DM-N9)', () => {
  it('passes a balanced BS with only asset/liability/equity', () => {
    const r = assertGate4([row('asset', 100), row('liability', 40), row('equity', 60)])
    expect(r.pass).toBe(true)
    expect(r.uncategorized_count).toBe(0)
    expect(r.uncategorized_total).toBe(0)
  })

  it('FAILS when a balance-bearing row has an unexpected account_type (no longer silently dropped)', () => {
    // The known-type rows balance, but a misclassified row carries $25 that the
    // old code silently dropped — letting the equation "pass".
    const r = assertGate4([
      row('asset', 100),
      row('liability', 40),
      row('equity', 60),
      row('bank', 25, 'Mystery Bank'),
    ])
    expect(r.uncategorized_count).toBe(1)
    expect(r.uncategorized_total).toBe(25)
    expect(r.pass).toBe(false)
  })

  it('still passes when an unexpected-type row has zero balance', () => {
    const r = assertGate4([
      row('asset', 100),
      row('liability', 40),
      row('equity', 60),
      row('bank', 0),
    ])
    expect(r.uncategorized_count).toBe(1)
    expect(r.pass).toBe(true)
  })

  it('catches canceling misclassified rows via the absolute-sum check', () => {
    const r = assertGate4([
      row('asset', 100),
      row('liability', 40),
      row('equity', 60),
      row('bank', 50),
      row('bank', -50),
    ])
    expect(r.uncategorized_count).toBe(2)
    expect(r.uncategorized_total).toBe(0) // nets to zero...
    expect(r.pass).toBe(false) // ...but |sum| is material, so the gate still fails
  })
})
