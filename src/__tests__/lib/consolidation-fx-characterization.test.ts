import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildConsolidation } from '@/lib/consolidation/engine'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  DRAGON_ROOFING_TENANT,
  EASY_HAIL_TENANT,
} from '@/lib/consolidation/__fixtures__/dragon-mar-2026'
import {
  IICT_AUST_BIZ,
  IICT_AUST_TENANT,
  IICT_HK_TENANT,
} from '@/lib/consolidation/__fixtures__/iict-mar-2026'
import { translatePLAtMonthlyAverage } from '@/lib/consolidation/fx'
import type { ConsolidationTenant, XeroPLLineLike } from '@/lib/consolidation/types'

/**
 * Stream 4 — Consolidation FX-wiring GOLDEN MASTERS.
 *
 * Characterization tests: these pin the engine's CURRENT FX-seam behavior to
 * the cent ahead of a refactor. They are NOT a desired spec — whatever
 * buildConsolidation does today (same-currency short-circuit, cross-currency
 * translate-callback wiring, hardcoded AUD presentation currency, NULL
 * functional_currency 1:1 treatment) is locked here exactly.
 *
 * The FX seam under test is `opts.translate` — an injectable callback the
 * engine invokes ONCE per tenant whose functional_currency differs from the
 * business presentation_currency ('AUD', hardcoded). Same-currency tenants
 * are short-circuited (callback never fires). We drive everything through the
 * public buildConsolidation entry point with a fake supabase (pure engine, no
 * real DB) and a vi.fn() spy for the translate callback.
 */

// Sentry is captured inside reportMissingCurrencyTenants — mock it so the
// NULL-currency golden can assert the invariant alert without a real client.
const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}))

beforeEach(() => {
  captureMessage.mockClear()
})

/**
 * Minimal fake supabase covering every table buildConsolidation touches in
 * 'single' budget mode with no forecast. `connections` injects the
 * xero_connections rows (so currency can be varied / nulled). `plLines` is the
 * single flat xero_pl_lines_wide_compat result the engine groups by tenant_id.
 */
function makeFakeSupabase(
  connections: Array<Record<string, unknown>>,
  plLines: XeroPLLineLike[],
  businessId: string,
) {
  return {
    from(table: string) {
      if (table === 'businesses') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: businessId,
                  name: 'Test Group',
                  consolidation_budget_mode: 'single',
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'xero_connections') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  order: async () => ({ data: connections, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'xero_pl_lines_wide_compat') {
        return {
          select: () => ({
            in: () => ({
              in: async () => ({ data: plLines, error: null }),
            }),
          }),
        }
      }
      if (table === 'consolidation_elimination_rules') {
        return {
          select: () => ({
            eq: () => ({ eq: async () => ({ data: [], error: null }) }),
          }),
        }
      }
      if (table === 'business_profiles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }
      }
      if (table === 'financial_forecasts') {
        return {
          select: () => ({
            in: () => ({
              is: () => ({
                eq: () => ({
                  order: () => ({ limit: async () => ({ data: [], error: null }) }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`[test] unexpected from(${table})`)
    },
  }
}

const dragonConn = (overrides: Record<string, unknown> = {}) => ({
  id: 'c-dragon',
  business_id: DRAGON_ROOFING_BIZ,
  tenant_id: DRAGON_ROOFING_TENANT,
  tenant_name: 'Dragon Roofing',
  display_name: 'Dragon Roofing',
  display_order: 0,
  functional_currency: 'AUD',
  include_in_consolidation: true,
  is_active: true,
  ...overrides,
})

const easyHailConn = (overrides: Record<string, unknown> = {}) => ({
  id: 'c-easyhail',
  business_id: DRAGON_ROOFING_BIZ,
  tenant_id: EASY_HAIL_TENANT,
  tenant_name: 'Easy Hail Claim',
  display_name: 'Easy Hail Claim',
  display_order: 1,
  functional_currency: 'AUD',
  include_in_consolidation: true,
  is_active: true,
  ...overrides,
})

const baseOpts = {
  reportMonth: '2026-03',
  fiscalYear: 2026,
  fyMonths: FY_MONTHS,
  singleBusinessBudget: null,
}

function lineByName(lines: { account_name: string; monthly_values: Record<string, number> }[], name: string) {
  return lines.find((l) => l.account_name === name)
}

// ─── GOLDEN 1: same-currency short-circuit (translate NEVER called) ──────────

describe('GOLDEN 1 — same-currency short-circuit (AUD == AUD presentation)', () => {
  it('does NOT call opts.translate for two AUD tenants, and consolidated == raw sums', async () => {
    const translateSpy = vi.fn()
    const supabase = makeFakeSupabase(
      [dragonConn(), easyHailConn()],
      [...dragonRoofingPL, ...easyHailPL],
      DRAGON_ROOFING_BIZ,
    )

    const report = await buildConsolidation(supabase as any, {
      ...baseOpts,
      businessId: DRAGON_ROOFING_BIZ,
      translate: translateSpy,
    })

    // The short-circuit guard (engine.ts ~line 572): functional === presentation
    // means the translate callback is bypassed entirely.
    expect(translateSpy).not.toHaveBeenCalled()

    // No FX activity recorded.
    expect(report.fx_context.rates_used).toEqual({})
    expect(report.fx_context.missing_rates).toEqual([])

    // Consolidated totals equal raw pass-through sums (no eliminations injected).
    const deposit = lineByName(report.consolidated.lines, 'Sales - Deposit')
    expect(deposit!.monthly_values['2026-03']).toBe(11652) // 11652 (EH) + 0 (Dragon)

    const adv = lineByName(report.consolidated.lines, 'Advertising & Marketing')
    expect(adv!.monthly_values['2026-03']).toBe(0) // -9015 (Dragon) + 9015 (EH)

    const referralDragon = lineByName(report.consolidated.lines, 'Referral Fee - Easy Hail')
    expect(referralDragon!.monthly_values['2026-03']).toBe(818)

    const referralEH = lineByName(report.consolidated.lines, 'Sales - Referral Fee')
    expect(referralEH!.monthly_values['2026-03']).toBe(818)

    expect(report.diagnostics.tenants_loaded).toBe(2)
    expect(report.diagnostics.tenants_missing_currency).toEqual([])
  })
})

// ─── GOLDEN 2: real cross-currency translation (HKD → AUD) ───────────────────

describe('GOLDEN 2 — cross-currency translation via opts.translate (HKD → AUD)', () => {
  // One AUD tenant + one HKD tenant. Inject explicit non-zero HKD lines (the
  // shipped iict fixture has zeroed TODO placeholders, so we build our own to
  // produce a meaningful translated golden).
  const HKD_RATE = 0.1925 // HKD/AUD monthly average for 2026-03

  const austConn = () => ({
    id: 'c-aust',
    business_id: IICT_AUST_BIZ,
    tenant_id: IICT_AUST_TENANT,
    tenant_name: 'IICT Aust',
    display_name: 'IICT (Aust) Pty Ltd',
    display_order: 0,
    functional_currency: 'AUD',
    include_in_consolidation: true,
    is_active: true,
  })
  const hkConn = () => ({
    id: 'c-hk',
    business_id: IICT_AUST_BIZ,
    tenant_id: IICT_HK_TENANT,
    tenant_name: 'IICT HK',
    display_name: 'IICT Group Limited',
    display_order: 1,
    functional_currency: 'HKD',
    include_in_consolidation: true,
    is_active: true,
  })

  // AUD member: passes through 1:1.
  const austPL: XeroPLLineLike[] = [
    {
      business_id: IICT_AUST_BIZ,
      tenant_id: IICT_AUST_TENANT,
      account_name: 'Revenue - Services',
      account_code: '200',
      account_type: 'revenue',
      section: 'Revenue',
      monthly_values: { '2026-03': 50000 },
    },
  ]
  // HKD member: raw HKD, must be translated × 0.1925.
  const hkPL: XeroPLLineLike[] = [
    {
      business_id: IICT_AUST_BIZ,
      tenant_id: IICT_HK_TENANT,
      account_name: 'Revenue - HK Operations',
      account_code: '200',
      account_type: 'revenue',
      section: 'Revenue',
      monthly_values: { '2026-03': 100000 }, // HKD
    },
    {
      business_id: IICT_AUST_BIZ,
      tenant_id: IICT_HK_TENANT,
      account_name: 'HK Operating Costs',
      account_code: '420',
      account_type: 'opex',
      section: 'Operating Expenses',
      monthly_values: { '2026-03': 40000 }, // HKD
    },
  ]

  it('invokes translate ONCE for the HKD tenant only, locks translated AUD totals + rates_used shape', async () => {
    // Real translate callback delegating to the pure FX math (fx.ts), exactly
    // as the production route wires it. Spy wraps it so we can assert call count.
    const translateImpl = async (
      tenant: ConsolidationTenant,
      lines: XeroPLLineLike[],
    ) => {
      const pair = `${tenant.functional_currency}/AUD`
      const rates = new Map<string, number>([['2026-03', HKD_RATE]])
      const { translated, missing } = translatePLAtMonthlyAverage(lines, rates)
      return {
        translated,
        missing,
        ratesUsed: { [`${pair}::2026-03`]: HKD_RATE },
      }
    }
    const translateSpy = vi.fn(translateImpl)

    const supabase = makeFakeSupabase(
      [austConn(), hkConn()],
      [...austPL, ...hkPL],
      IICT_AUST_BIZ,
    )

    const report = await buildConsolidation(supabase as any, {
      ...baseOpts,
      businessId: IICT_AUST_BIZ,
      translate: translateSpy,
    })

    // Called exactly once — only the HKD tenant crosses the short-circuit.
    expect(translateSpy).toHaveBeenCalledTimes(1)
    expect(translateSpy.mock.calls[0][0].tenant_id).toBe(IICT_HK_TENANT)

    // Translated golden numbers — pinned to the cent.
    // HK Revenue: 100000 HKD × 0.1925 = 19250.00 AUD
    const hkRev = lineByName(report.consolidated.lines, 'Revenue - HK Operations')
    expect(hkRev!.monthly_values['2026-03']).toBeCloseTo(19250, 2)

    // HK Opex: 40000 HKD × 0.1925 = 7700.00 AUD
    const hkOpex = lineByName(report.consolidated.lines, 'HK Operating Costs')
    expect(hkOpex!.monthly_values['2026-03']).toBeCloseTo(7700, 2)

    // AUD member passes through untouched.
    const austRev = lineByName(report.consolidated.lines, 'Revenue - Services')
    expect(austRev!.monthly_values['2026-03']).toBe(50000)

    // Per-tenant column for the HKD tenant carries the TRANSLATED (AUD) figures.
    const hkCol = report.byTenant.find((c) => c.tenant_id === IICT_HK_TENANT)!
    const hkColRev = lineByName(hkCol.lines, 'Revenue - HK Operations')
    expect(hkColRev!.monthly_values['2026-03']).toBeCloseTo(19250, 2)

    // rates_used / missing reporting structure the engine returns.
    expect(report.fx_context.rates_used).toEqual({ 'HKD/AUD::2026-03': 0.1925 })
    expect(report.fx_context.missing_rates).toEqual([])
  })

  it('surfaces a missing rate via fx_context.missing_rates when the translate callback reports one', async () => {
    // translate that has NO rate for 2026-03 → fx.ts preserves the raw value
    // untranslated and reports the month as missing. The engine maps it into
    // fx_context.missing_rates with the slash currency_pair.
    const translateNoRate = vi.fn(async (
      tenant: ConsolidationTenant,
      lines: XeroPLLineLike[],
    ) => {
      const { translated, missing } = translatePLAtMonthlyAverage(lines, new Map())
      return { translated, missing, ratesUsed: {} as Record<string, number> }
    })

    const supabase = makeFakeSupabase(
      [austConn(), hkConn()],
      [...austPL, ...hkPL],
      IICT_AUST_BIZ,
    )

    const report = await buildConsolidation(supabase as any, {
      ...baseOpts,
      businessId: IICT_AUST_BIZ,
      translate: translateNoRate,
    })

    expect(translateNoRate).toHaveBeenCalledTimes(1)
    // Pair built by the engine as `${functional}/${presentation}` = 'HKD/AUD'.
    expect(report.fx_context.missing_rates).toEqual([
      { currency_pair: 'HKD/AUD', period: '2026-03' },
    ])
    expect(report.fx_context.rates_used).toEqual({})

    // Untranslated (raw HKD) figure passes through 1:1 (the fx.ts contract:
    // never silently default to 1.0 — value preserved, month flagged).
    const hkRev = lineByName(report.consolidated.lines, 'Revenue - HK Operations')
    expect(hkRev!.monthly_values['2026-03']).toBe(100000)
  })
})

// ─── GOLDEN 3: hardcoded presentation currency ───────────────────────────────

describe('GOLDEN 3 — presentation_currency is hardcoded AUD', () => {
  it('returns presentation_currency = AUD regardless of tenant currencies', async () => {
    // Even with a non-AUD tenant present, the business presentation currency is
    // hardcoded to AUD (engine.ts ~line 149).
    const supabase = makeFakeSupabase(
      [dragonConn({ functional_currency: 'NZD' }), easyHailConn()],
      [...dragonRoofingPL, ...easyHailPL],
      DRAGON_ROOFING_BIZ,
    )
    const report = await buildConsolidation(supabase as any, {
      ...baseOpts,
      businessId: DRAGON_ROOFING_BIZ,
      translate: vi.fn(async (_t, lines) => ({
        translated: lines,
        missing: [],
        ratesUsed: {},
      })),
    })
    expect(report.business.presentation_currency).toBe('AUD')
  })
})

// ─── GOLDEN 4: NULL functional currency (DM-N8) ──────────────────────────────

describe('GOLDEN 4 — NULL functional_currency (DM-N8) 1:1 AUD treatment', () => {
  it('defaults NULL currency to AUD, flags currency_known=false, short-circuits FX (translate NOT called), and reports missing', async () => {
    const translateSpy = vi.fn()
    const supabase = makeFakeSupabase(
      // Easy Hail has NULL functional_currency → engine defaults to 'AUD' and
      // flags currency_known=false. Because the default equals the presentation
      // currency, it is summed 1:1 (the documented DM-N8 trap) and translate is
      // NEVER called for it.
      [dragonConn(), easyHailConn({ functional_currency: null })],
      [...dragonRoofingPL, ...easyHailPL],
      DRAGON_ROOFING_BIZ,
    )

    const report = await buildConsolidation(supabase as any, {
      ...baseOpts,
      businessId: DRAGON_ROOFING_BIZ,
      translate: translateSpy,
    })

    // DM-N8: defaulted to AUD presentation → short-circuit → no translate call.
    expect(translateSpy).not.toHaveBeenCalled()
    expect(report.fx_context.rates_used).toEqual({})
    expect(report.fx_context.missing_rates).toEqual([])

    // The NULL-currency tenant is surfaced via diagnostics + Sentry invariant.
    expect(report.diagnostics.tenants_missing_currency).toEqual([EASY_HAIL_TENANT])
    expect(captureMessage).toHaveBeenCalledTimes(1)

    // 1:1 AUD golden: the NULL-currency tenant's raw figures are summed straight
    // into consolidated totals (the current — characterized — behavior).
    const deposit = lineByName(report.consolidated.lines, 'Sales - Deposit')
    expect(deposit!.monthly_values['2026-03']).toBe(11652)

    // Report still renders (non-fatal invariant).
    expect(report.consolidated.lines.length).toBeGreaterThan(0)
    expect(report.diagnostics.tenants_loaded).toBe(2)
  })
})
