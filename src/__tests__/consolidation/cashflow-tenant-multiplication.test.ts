/**
 * NFM-01 (26 Aug 2026) — consolidated cashflow multiplied every cash movement
 * by the tenant count.
 *
 * `loadBusinessBaseline` returns ONE business-wide forecast — there is a single
 * umbrella forecast per business, and `forecast_pl_lines` has no tenant_id. The
 * builder ran that same baseline once PER TENANT, varying only
 * `opening_bank_balance`, so every tenant's cash_in / cash_out / net_movement
 * series came back bit-identical. Summing them across tenants then multiplied
 * every movement by the number of tenants.
 *
 * Dragon Roofing (2 orgs) showed ~$19.9M of consolidated receipts against a
 * ~$9.9M baseline — exactly 2x — and a closing balance inflated by a whole
 * extra year of net movement. That is a cash-runway number a coach would act on.
 *
 * Opening balances are genuinely per-tenant (real bank balances) and must still
 * sum; the MOVEMENTS must be counted once.
 */
import { describe, it, expect } from 'vitest'
import { combineMemberForecasts } from '@/lib/consolidation/cashflow'

const FY = ['2026-07', '2026-08', '2026-09'] as const

const series = (net: number) =>
  FY.map((month) => ({
    month,
    cash_in: net + 1000,
    cash_out: 1000,
    net_movement: net,
    opening_balance: 0,
    closing_balance: 0,
  }))

describe('the OLD shape — summing identical per-tenant series — multiplied by tenant count', () => {
  it('two tenants carrying the SAME business-wide series double every movement', () => {
    // This is precisely what the builder used to feed combineMemberForecasts.
    const doubled = combineMemberForecasts(
      [
        { opening_balance: 100_000, months: series(50_000) },
        { opening_balance: 44_127, months: series(50_000) }, // identical series
      ],
      FY,
    )
    // Each month is 2x the true movement — the Dragon symptom.
    expect(doubled.months[0].net_movement).toBe(100_000)
    expect(doubled.months.reduce((s, m) => s + m.net_movement, 0)).toBe(300_000)
  })
})

describe('the FIX — movements counted once, openings still summed', () => {
  it('one synthetic member with the summed opening gives the true movement', () => {
    const summedOpening = 100_000 + 44_127
    const fixed = combineMemberForecasts(
      [{ opening_balance: summedOpening, months: series(50_000) }],
      FY,
    )

    // Movement is counted ONCE per month, not once per tenant.
    expect(fixed.months[0].net_movement).toBe(50_000)
    expect(fixed.months.reduce((s, m) => s + m.net_movement, 0)).toBe(150_000)

    // Opening balances still sum — they are genuinely per-tenant bank balances.
    expect(fixed.opening_balance).toBe(144_127)

    // Closing = summed opening + one year of real movement (not two).
    expect(fixed.closing_balance).toBe(144_127 + 150_000)
  })

  it('the fixed total is exactly half the old one for a 2-org business', () => {
    const old = combineMemberForecasts(
      [
        { opening_balance: 100_000, months: series(50_000) },
        { opening_balance: 44_127, months: series(50_000) },
      ],
      FY,
    )
    const fixed = combineMemberForecasts(
      [{ opening_balance: 144_127, months: series(50_000) }],
      FY,
    )
    const sum = (r: { months: { net_movement: number }[] }) =>
      r.months.reduce((s, m) => s + m.net_movement, 0)

    expect(sum(old) / sum(fixed)).toBe(2)
  })

  it('scales correctly for a 3-org business (IICT shape) — 3x becomes 1x', () => {
    const old = combineMemberForecasts(
      [
        { opening_balance: 10, months: series(1_000) },
        { opening_balance: 20, months: series(1_000) },
        { opening_balance: 30, months: series(1_000) },
      ],
      FY,
    )
    const fixed = combineMemberForecasts([{ opening_balance: 60, months: series(1_000) }], FY)
    const sum = (r: { months: { net_movement: number }[] }) =>
      r.months.reduce((s, m) => s + m.net_movement, 0)

    expect(sum(old)).toBe(9_000)
    expect(sum(fixed)).toBe(3_000)
    expect(fixed.opening_balance).toBe(60)
  })
})

describe('single-tenant businesses are unaffected', () => {
  it('one tenant produces the same result under both shapes', () => {
    const before = combineMemberForecasts(
      [{ opening_balance: 75_000, months: series(20_000) }],
      FY,
    )
    const after = combineMemberForecasts(
      [{ opening_balance: 75_000, months: series(20_000) }],
      FY,
    )
    expect(after).toEqual(before)
    expect(after.closing_balance).toBe(75_000 + 60_000)
  })
})
