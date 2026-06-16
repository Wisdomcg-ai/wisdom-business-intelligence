/**
 * Tests for getFiscalYearActuals (historical-pl-summary.ts) — the deterministic
 * single-FY Xero read used by the Annual Reset (Option B seeding).
 *
 * Focus: the fail-closed guards that protect the seeded financial baseline.
 *   - complete vs partial FY coverage counting (drives the route's ===12 gate)
 *   - FX skip on any non-AUD active tenant
 *   - FX guard fails CLOSED on a connections probe ERROR (not fall-through)
 *   - no Xero rows → has_xero_data:false
 */
import { describe, it, expect, vi } from 'vitest'

// resolveBusinessProfileIds does its own supabase reads — mock it so the test
// supabase only has to answer the two queries getFiscalYearActuals makes.
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ all: ['p1'], businessId: 'p1' })),
}))

import { getFiscalYearActuals } from '@/lib/services/historical-pl-summary'
import { generateFiscalMonthKeys } from '@/lib/utils/fiscal-year-utils'

const FY = 2026
const YSM = 7
const keys = generateFiscalMonthKeys(FY, YSM) // 2025-07 .. 2026-06 (12 keys)

function revRow(monthKeys: string[], perMonth = 100_000) {
  const monthly_values: Record<string, number> = {}
  for (const k of monthKeys) monthly_values[k] = perMonth
  return { account_name: 'Sales', account_type: 'revenue', monthly_values }
}

function makeSupabase(opts: {
  conn?: { data?: unknown; error?: unknown }
  pl?: { data?: unknown; error?: unknown }
}) {
  const chain = (result: unknown) => {
    const b: any = {
      select: () => b,
      in: () => b,
      eq: () => b,
      then: (resolve: (v: unknown) => void) => resolve(result),
    }
    return b
  }
  return {
    from: (table: string) => {
      if (table === 'xero_connections') {
        return chain(opts.conn ?? { data: [{ functional_currency: 'AUD' }], error: null })
      }
      if (table === 'xero_pl_lines_wide_compat') {
        return chain(opts.pl ?? { data: [], error: null })
      }
      throw new Error('unexpected table ' + table)
    },
  }
}

describe('getFiscalYearActuals — deterministic FY read + fail-closed guards', () => {
  it('complete 12-month AUD year → has_xero_data, months_covered=12, totals summed', async () => {
    const sb = makeSupabase({ pl: { data: [revRow(keys)], error: null } })
    const r = await getFiscalYearActuals(sb, 'p1', FY, YSM)
    expect(r.has_xero_data).toBe(true)
    expect(r.months_covered).toBe(12)
    expect(r.revenue).toBe(1_200_000)
    expect(r.gross_profit).toBe(1_200_000) // no cogs row
    expect(r.net_profit).toBe(1_200_000)   // no opex/other rows
  })

  it('partial year (11 months) → months_covered=11 (route ===12 gate would reject)', async () => {
    const sb = makeSupabase({ pl: { data: [revRow(keys.slice(0, 11))], error: null } })
    const r = await getFiscalYearActuals(sb, 'p1', FY, YSM)
    expect(r.months_covered).toBe(11)
  })

  it('FX: any non-AUD active tenant → skip (has_xero_data false), keep D3', async () => {
    const sb = makeSupabase({
      conn: { data: [{ functional_currency: 'HKD' }], error: null },
      pl: { data: [revRow(keys)], error: null },
    })
    const r = await getFiscalYearActuals(sb, 'p1', FY, YSM)
    expect(r.has_xero_data).toBe(false)
    expect(r.revenue).toBe(0)
  })

  it('FX guard fails CLOSED on a connections probe error (does NOT fall through)', async () => {
    const sb = makeSupabase({
      conn: { data: null, error: { message: 'transient' } },
      pl: { data: [revRow(keys)], error: null },
    })
    const r = await getFiscalYearActuals(sb, 'p1', FY, YSM)
    expect(r.has_xero_data).toBe(false)
  })

  it('all-AUD multi-tenant (no FX) proceeds', async () => {
    const sb = makeSupabase({
      conn: { data: [{ functional_currency: 'AUD' }, { functional_currency: 'aud' }], error: null },
      pl: { data: [revRow(keys)], error: null },
    })
    const r = await getFiscalYearActuals(sb, 'p1', FY, YSM)
    expect(r.has_xero_data).toBe(true)
    expect(r.months_covered).toBe(12)
  })

  it('no Xero P&L rows → has_xero_data:false, months_covered=0', async () => {
    const sb = makeSupabase({ pl: { data: [], error: null } })
    const r = await getFiscalYearActuals(sb, 'p1', FY, YSM)
    expect(r.has_xero_data).toBe(false)
    expect(r.months_covered).toBe(0)
  })
})
