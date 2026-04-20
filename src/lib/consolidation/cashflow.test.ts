/**
 * Unit tests for the Consolidated Cashflow engine — pure combine math.
 *
 * Full integration (Supabase mock covering tenant loading + per-tenant
 * cashflow engine invocation) lives in the route-level test suite.
 * These tests exercise the pure helper `combineMemberForecasts` directly.
 *
 * Key invariants exercised:
 *   1. Opening balances SUM across tenants (consolidated opening = Σ tenant opening)
 *   2. Monthly net movements SUM across tenants per month
 *   3. Consolidated closing balance threads: month[i].close = month[i].open + net
 *      and month[i+1].open = month[i].close (no reset, no double-sum)
 *   4. Per-tenant opening balance is NOT reset when combining — each tenant
 *      keeps its own pre-combine running balance
 */

import { describe, it, expect } from 'vitest'
import {
  combineMemberForecasts,
  type ConsolidatedCashflowMonth,
} from './cashflow'

// 12-month FY window (Jul 2025 → Jun 2026) matching AU FY convention
const FY: readonly string[] = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
]

/** Build a per-tenant forecast with constant monthly net movement. */
function memberForecast(
  opening: number,
  monthlyNet: number,
): { opening_balance: number; closing_balance: number; months: ConsolidatedCashflowMonth[] } {
  let running = opening
  const months: ConsolidatedCashflowMonth[] = FY.map((m) => {
    const open = running
    const close = open + monthlyNet
    running = close
    return {
      month: m,
      cash_in: monthlyNet > 0 ? monthlyNet : 0,
      cash_out: monthlyNet < 0 ? -monthlyNet : 0,
      net_movement: monthlyNet,
      opening_balance: open,
      closing_balance: close,
    }
  })
  return { opening_balance: opening, closing_balance: running, months }
}

describe('combineMemberForecasts — opening balance threading (Iteration 34.2)', () => {
  it('sums opening balances across two tenants', () => {
    const result = combineMemberForecasts(
      [memberForecast(10_000, 0), memberForecast(20_000, 0)],
      FY,
    )
    expect(result.opening_balance).toBe(30_000)
    expect(result.months[0].opening_balance).toBe(30_000)
  })

  it('threads closing balances from combined opening + cumulative net', () => {
    // One tenant, opening 0, +100/month => month[0].close=100, month[11].close=1200
    const result = combineMemberForecasts([memberForecast(0, 100)], FY)
    expect(result.months[0].opening_balance).toBe(0)
    expect(result.months[0].closing_balance).toBe(100)
    expect(result.months[11].closing_balance).toBe(1_200)
    expect(result.closing_balance).toBe(1_200)
  })

  it('sums monthly movements across tenants per month', () => {
    // Tenant A: +100/month, Tenant B: +50/month → combined +150/month
    const result = combineMemberForecasts(
      [memberForecast(0, 100), memberForecast(0, 50)],
      FY,
    )
    for (const m of result.months) {
      expect(m.net_movement).toBe(150)
      expect(m.cash_in).toBe(150) // both tenants net positive → cash_in summed
    }
    expect(result.closing_balance).toBe(150 * 12)
  })

  it('two-tenant month-end consolidation matches spec math (10k + 5k) + (20k + 3k) → 38k', () => {
    // Tenant A: opening 10k, +5k/month → month[0].close = 15k
    // Tenant B: opening 20k, +3k/month → month[0].close = 23k
    // Consolidated: opening = 30k, net = 8k → month[0].close = 38k
    const tenantA = memberForecast(10_000, 5_000)
    const tenantB = memberForecast(20_000, 3_000)
    const result = combineMemberForecasts([tenantA, tenantB], FY)
    expect(result.opening_balance).toBe(30_000)
    expect(result.months[0].net_movement).toBe(8_000)
    expect(result.months[0].closing_balance).toBe(38_000)
  })

  it('does NOT reset per-tenant opening balance when combining', () => {
    // Guarantees tenant.opening stays = tenant.opening after combine pass.
    // The pure function operates on inputs without mutating them.
    const tenantA = memberForecast(10_000, 0)
    const tenantB = memberForecast(20_000, 0)
    const snapshotA = JSON.parse(JSON.stringify(tenantA))
    const snapshotB = JSON.parse(JSON.stringify(tenantB))

    combineMemberForecasts([tenantA, tenantB], FY)

    expect(tenantA).toEqual(snapshotA)
    expect(tenantB).toEqual(snapshotB)
  })

  it('consolidated closing[i] == opening[i+1] (running-balance continuity)', () => {
    // Tenant A: +100/month from 5k, Tenant B: -50/month from 2k
    const tenantA = memberForecast(5_000, 100)
    const tenantB = memberForecast(2_000, -50)
    const result = combineMemberForecasts([tenantA, tenantB], FY)

    for (let i = 0; i < result.months.length - 1; i++) {
      expect(result.months[i + 1].opening_balance).toBe(result.months[i].closing_balance)
    }
  })

  it('preserves monthly net = cash_in - cash_out after combine', () => {
    // Tenant A +100 net, Tenant B -40 net → combined +60 net/month
    // cash_in should be (tenantA net 100) + 0 from B = 100
    // cash_out should be 0 from A + (tenantB out 40) = 40
    // net = 100 - 40 = 60 ✓
    const tenantA = memberForecast(0, 100)
    const tenantB = memberForecast(0, -40)
    const result = combineMemberForecasts([tenantA, tenantB], FY)

    for (const m of result.months) {
      expect(m.cash_in - m.cash_out).toBeCloseTo(m.net_movement, 6)
      expect(m.net_movement).toBe(60)
    }
  })

  it('handles empty member list (no tenants) gracefully', () => {
    const result = combineMemberForecasts([], FY)
    expect(result.opening_balance).toBe(0)
    expect(result.closing_balance).toBe(0)
    expect(result.months).toHaveLength(12)
    for (const m of result.months) {
      expect(m.net_movement).toBe(0)
      expect(m.opening_balance).toBe(0)
      expect(m.closing_balance).toBe(0)
    }
  })
})
