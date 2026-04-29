import { describe, it, expect } from 'vitest'
import { buildConsolidation, alignBudgetToUniverse } from './engine'
import { buildAlignedAccountUniverse } from './account-alignment'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  DRAGON_ROOFING_TENANT,
  EASY_HAIL_TENANT,
} from './__fixtures__/dragon-mar-2026'
import type { ForecastLineLike, XeroPLLineLike } from './types'

/**
 * Phase 34 Step 2 — Hybrid Budget Mode tests.
 *
 * Exercises the `consolidation_budget_mode` branch in buildConsolidation:
 *   - mode='single'     → one business-level forecast drives consolidated.budgetLines;
 *                         per-tenant budget columns stay undefined; diagnostics
 *                         flag budget_mode + single_budget_found.
 *   - mode='per_tenant' → per-tenant forecasts feed byTenant[].budgetLines and
 *                         sum into consolidated.budgetLines.
 *   - mode='per_tenant' fallback → zero tenant-scoped forecasts triggers
 *                         business-level fallback so pre-34-step2 installs
 *                         don't silently lose their budget.
 *
 * All scenarios inject budgets directly via `tenantBudgets` or
 * `singleBusinessBudget` opts so the tests don't have to mock
 * financial_forecasts / forecast_pl_lines queries.
 */

type Mode = 'single' | 'per_tenant'

/**
 * Minimal fake supabase covering every table buildConsolidation touches
 * (businesses, xero_connections, xero_pl_lines, consolidation_elimination_rules,
 * business_profiles via resolveBusinessIds). The budget mode is injected per
 * test so we can verify both branches.
 */
function makeFakeSupabase(mode: Mode) {
  return {
    from(table: string) {
      if (table === 'businesses') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: DRAGON_ROOFING_BIZ,
                  name: 'Dragon Group',
                  consolidation_budget_mode: mode,
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
                  order: async () => ({
                    data: [
                      {
                        id: 'c-dragon',
                        business_id: DRAGON_ROOFING_BIZ,
                        tenant_id: DRAGON_ROOFING_TENANT,
                        tenant_name: 'Dragon Roofing',
                        display_name: 'Dragon Roofing',
                        display_order: 0,
                        functional_currency: 'AUD',
                        include_in_consolidation: true,
                        is_active: true,
                      },
                      {
                        id: 'c-easyhail',
                        business_id: DRAGON_ROOFING_BIZ,
                        tenant_id: EASY_HAIL_TENANT,
                        tenant_name: 'Easy Hail Claim',
                        display_name: 'Easy Hail Claim',
                        display_order: 1,
                        functional_currency: 'AUD',
                        include_in_consolidation: true,
                        is_active: true,
                      },
                    ],
                    error: null,
                  }),
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
              in: async () => ({
                data: [...dragonRoofingPL, ...easyHailPL] as XeroPLLineLike[],
                error: null,
              }),
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
      throw new Error(`[test] unexpected from(${table})`)
    },
  }
}

describe("buildConsolidation — mode='single'", () => {
  it('feeds the injected single budget into consolidated.budgetLines and leaves per-tenant budgets undefined', async () => {
    const singleBusinessBudget: ForecastLineLike[] = [
      {
        account_type: 'revenue',
        account_name: 'Sales - Deposit',
        monthly_values: { '2026-03': 25000 },
      },
      {
        account_type: 'revenue',
        account_name: 'Sales - Roofing',
        monthly_values: { '2026-03': 40000 },
      },
    ]

    const report = await buildConsolidation(makeFakeSupabase('single') as any, {
      businessId: DRAGON_ROOFING_BIZ,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
      singleBusinessBudget,
    })

    // Per-tenant budgetLines should all be undefined in 'single' mode.
    expect(report.byTenant.length).toBe(2)
    expect(report.byTenant[0].budgetLines).toBeUndefined()
    expect(report.byTenant[1].budgetLines).toBeUndefined()

    // Consolidated budget reflects the single forecast directly (not summed
    // across tenants — there's only one source).
    const deposit = report.consolidated.budgetLines.find(
      (l) => l.account_name === 'Sales - Deposit',
    )!
    expect(deposit.monthly_values['2026-03']).toBe(25000)
    const roofing = report.consolidated.budgetLines.find(
      (l) => l.account_name === 'Sales - Roofing',
    )!
    expect(roofing.monthly_values['2026-03']).toBe(40000)

    // Diagnostics reflect the mode + single_budget_found flag.
    expect(report.diagnostics.budget_mode).toBe('single')
    expect(report.diagnostics.single_budget_found).toBe(true)
    expect(report.diagnostics.tenants_with_budget).toBe(0)
    expect(report.diagnostics.tenants_without_budget).toEqual([])
  })

  it('produces zero-filled budget + single_budget_found=false when the single forecast is absent', async () => {
    const report = await buildConsolidation(makeFakeSupabase('single') as any, {
      businessId: DRAGON_ROOFING_BIZ,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
      singleBusinessBudget: null,
    })

    // Still produces a budgetLines array aligned to the universe — every row zero.
    expect(report.consolidated.budgetLines.length).toBeGreaterThan(0)
    for (const row of report.consolidated.budgetLines) {
      expect(row.monthly_values['2026-03']).toBe(0)
    }

    expect(report.diagnostics.budget_mode).toBe('single')
    expect(report.diagnostics.single_budget_found).toBe(false)
  })

  it('ignores tenantBudgets injection in single mode (single is authoritative)', async () => {
    // Even if a caller passes tenantBudgets, single mode should NOT surface them
    // on per-tenant columns. The singleBusinessBudget drives the consolidated total.
    const singleBusinessBudget: ForecastLineLike[] = [
      {
        account_type: 'revenue',
        account_name: 'Sales - Deposit',
        monthly_values: { '2026-03': 99000 },
      },
    ]
    const tenantBudgets = new Map<string, ForecastLineLike[]>([
      [
        DRAGON_ROOFING_TENANT,
        [
          {
            account_type: 'revenue',
            account_name: 'Sales - Deposit',
            monthly_values: { '2026-03': 1111 },
          },
        ],
      ],
    ])

    const report = await buildConsolidation(makeFakeSupabase('single') as any, {
      businessId: DRAGON_ROOFING_BIZ,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
      singleBusinessBudget,
      tenantBudgets,
    })

    // Per-tenant budgetLines stay undefined — tenantBudgets is ignored in single mode.
    expect(report.byTenant[0].budgetLines).toBeUndefined()
    expect(report.byTenant[1].budgetLines).toBeUndefined()

    // Consolidated budget carries the single forecast value, not the per-tenant one.
    const deposit = report.consolidated.budgetLines.find(
      (l) => l.account_name === 'Sales - Deposit',
    )!
    expect(deposit.monthly_values['2026-03']).toBe(99000)
  })
})

describe("buildConsolidation — mode='per_tenant'", () => {
  it('attaches per-tenant budgetLines + sums into consolidated.budgetLines', async () => {
    const tenantBudgets = new Map<string, ForecastLineLike[]>([
      [
        DRAGON_ROOFING_TENANT,
        [
          {
            account_type: 'revenue',
            account_name: 'Sales - Deposit',
            monthly_values: { '2026-03': 3000 },
          },
        ],
      ],
      [
        EASY_HAIL_TENANT,
        [
          {
            account_type: 'revenue',
            account_name: 'Sales - Deposit',
            monthly_values: { '2026-03': 7000 },
          },
        ],
      ],
    ])

    const report = await buildConsolidation(makeFakeSupabase('per_tenant') as any, {
      businessId: DRAGON_ROOFING_BIZ,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
      tenantBudgets,
    })

    // Per-tenant columns carry budgetLines.
    expect(report.byTenant[0].budgetLines).toBeDefined()
    expect(report.byTenant[1].budgetLines).toBeDefined()

    // Consolidated budget = sum across tenants for Sales - Deposit.
    const deposit = report.consolidated.budgetLines.find(
      (l) => l.account_name === 'Sales - Deposit',
    )!
    expect(deposit.monthly_values['2026-03']).toBe(10000)

    // Diagnostics
    expect(report.diagnostics.budget_mode).toBe('per_tenant')
    expect(report.diagnostics.tenants_with_budget).toBe(2)
    expect(report.diagnostics.tenants_without_budget).toEqual([])
    // single_budget_found is only surfaced in single mode.
    expect(report.diagnostics.single_budget_found).toBeUndefined()
  })

  it('records tenants_without_budget when only some tenants have forecasts', async () => {
    // Only Dragon has a per-tenant forecast.
    const tenantBudgets = new Map<string, ForecastLineLike[]>([
      [
        DRAGON_ROOFING_TENANT,
        [
          {
            account_type: 'revenue',
            account_name: 'Sales - Deposit',
            monthly_values: { '2026-03': 5000 },
          },
        ],
      ],
    ])

    const report = await buildConsolidation(makeFakeSupabase('per_tenant') as any, {
      businessId: DRAGON_ROOFING_BIZ,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
      tenantBudgets,
    })

    expect(report.byTenant[0].budgetLines).toBeDefined() // Dragon
    expect(report.byTenant[1].budgetLines).toBeUndefined() // Easy Hail
    expect(report.diagnostics.tenants_with_budget).toBe(1)
    expect(report.diagnostics.tenants_without_budget).toContain(EASY_HAIL_TENANT)
  })

  it('falls back to the business-level forecast when zero tenants have a budget', async () => {
    // Empty tenantBudgets Map → engine falls back to singleBusinessBudget so
    // pre-34-step2 installs (one legacy business-level forecast, no per-tenant
    // assignments yet) keep rendering budgets.
    const singleBusinessBudget: ForecastLineLike[] = [
      {
        account_type: 'revenue',
        account_name: 'Sales - Deposit',
        monthly_values: { '2026-03': 15000 },
      },
    ]

    const report = await buildConsolidation(makeFakeSupabase('per_tenant') as any, {
      businessId: DRAGON_ROOFING_BIZ,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
      tenantBudgets: new Map(), // zero per-tenant forecasts
      singleBusinessBudget,
    })

    // Per-tenant budgetLines stay undefined in the fallback path (budget lives
    // at the business level, not per tenant).
    expect(report.byTenant[0].budgetLines).toBeUndefined()
    expect(report.byTenant[1].budgetLines).toBeUndefined()

    // Consolidated budget carries the fallback value.
    const deposit = report.consolidated.budgetLines.find(
      (l) => l.account_name === 'Sales - Deposit',
    )!
    expect(deposit.monthly_values['2026-03']).toBe(15000)

    // Mode stays 'per_tenant' (the business hasn't opted into single mode).
    expect(report.diagnostics.budget_mode).toBe('per_tenant')
  })
})

describe('alignBudgetToUniverse', () => {
  it('zero-fills every universe row + every fy month when budget is empty', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL])
    const out = alignBudgetToUniverse([], universe, FY_MONTHS)
    expect(out.length).toBe(universe.length)
    for (const row of out) {
      for (const m of FY_MONTHS) {
        expect(row.monthly_values[m]).toBe(0)
      }
    }
  })

  it('populates matching universe rows and leaves non-matches at zero', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL])
    const budget: ForecastLineLike[] = [
      {
        account_type: 'revenue',
        account_name: 'Sales - Roofing', // present in dragonRoofingPL
        monthly_values: { '2026-03': 4242 },
      },
    ]
    const out = alignBudgetToUniverse(budget, universe, FY_MONTHS)
    const roofing = out.find((l) => l.account_name === 'Sales - Roofing')!
    expect(roofing.monthly_values['2026-03']).toBe(4242)
    // Other fy months zeroed.
    expect(roofing.monthly_values['2026-04']).toBe(0)
    // Any non-matching universe row stays zero across all months.
    const other = out.find((l) => l.account_name !== 'Sales - Roofing')!
    expect(other.monthly_values['2026-03']).toBe(0)
  })
})
