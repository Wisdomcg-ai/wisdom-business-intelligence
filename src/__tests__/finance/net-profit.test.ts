/**
 * Tests for the canonical 5-bucket P&L net profit helper.
 *
 * The helper is the single source of truth for net profit math used by
 * exports and any future read site that aggregates from already-summed
 * bucket totals. The forecast wizard's per-year calculator has its own
 * formula (more granular subtractions); these tests do NOT cover it.
 */
import { describe, it, expect } from 'vitest'
import { netProfitFromBuckets } from '@/lib/finance/net-profit'

describe('netProfitFromBuckets', () => {
  it('computes the 5-bucket formula: revenue - cogs - opex + other_income - other_expense', () => {
    expect(netProfitFromBuckets({
      revenue: 10000,
      cogs: 3000,
      opex: 2000,
      otherIncome: 500,
      otherExpense: 200,
    })).toBe(5300)
  })

  it('JDS FY26 YTD-Mar — exact reconciliation match', () => {
    // Numbers verified against Xero web PDF on 2026-04-30 after Phase 44.2-06B.
    expect(
      netProfitFromBuckets({
        revenue: 5193696.27,
        cogs: 2560414.47,
        opex: 2398445.78,
        otherIncome: 2573.90,
        otherExpense: 0,
      }),
    ).toBeCloseTo(237409.92, 2)
  })

  it('JDS FY25 — exact reconciliation match (trust distribution year-end zeros profit)', () => {
    // Without the +otherIncome term we get -$651.16; with it we get $0.
    // The wizard pre-fix was missing this term — that was the long-standing
    // display bug surfaced when Phase 44.2 made the underlying data accurate.
    expect(
      netProfitFromBuckets({
        revenue: 9910955.24,
        cogs: 6097303.11,
        opex: 3814303.30,
        otherIncome: 651.16,
        otherExpense: 0,
      }),
    ).toBeCloseTo(0, 1) // within 1c rounding
  })

  it('treats missing otherIncome and otherExpense as 0 (3-bucket fallback)', () => {
    expect(netProfitFromBuckets({ revenue: 10000, cogs: 3000, opex: 2000 })).toBe(5000)
  })

  it('handles a tenant with non-zero other_expense (e.g. interest expense, exceptional items)', () => {
    expect(netProfitFromBuckets({
      revenue: 10000,
      cogs: 3000,
      opex: 2000,
      otherIncome: 0,
      otherExpense: 800,
    })).toBe(4200)
  })

  it('handles negative inputs (e.g. credit notes pushing a bucket negative)', () => {
    expect(netProfitFromBuckets({
      revenue: 10000,
      cogs: -500, // refund/credit increasing GP
      opex: 2000,
      otherIncome: 100,
      otherExpense: 50,
    })).toBe(8550)
  })
})
