import { describe, it, expect } from 'vitest'
import {
  normaliseForecastLine,
  buildTenantBudgetColumns,
  combineTenantBudgets,
} from './engine'
import { buildAlignedAccountUniverse } from './account-alignment'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  DRAGON_ROOFING_TENANT,
  EASY_HAIL_TENANT,
} from './__fixtures__/dragon-mar-2026'
import type {
  ConsolidationTenant,
  ForecastLineLike,
  XeroPLLineLike,
} from './types'

/**
 * Phase 34.3 — per-tenant budget tests.
 *
 * Covers the pure helpers introduced alongside `loadTenantBudgets`:
 *   - normaliseForecastLine (shape + account_type coercion)
 *   - buildTenantBudgetColumns (alignment + zero-fill for absent tenants)
 *   - combineTenantBudgets (sum across tenants; NO eliminations applied)
 *
 * Uses the Dragon fixture to build the universe so the assertion keys are
 * representative of real Dragon accounts.
 */

const dragonTenant: ConsolidationTenant = {
  connection_id: 'c-dragon',
  business_id: DRAGON_ROOFING_BIZ,
  tenant_id: DRAGON_ROOFING_TENANT,
  display_name: 'Dragon Roofing',
  display_order: 0,
  functional_currency: 'AUD',
  include_in_consolidation: true,
}

const easyHailTenant: ConsolidationTenant = {
  connection_id: 'c-easyhail',
  business_id: DRAGON_ROOFING_BIZ,
  tenant_id: EASY_HAIL_TENANT,
  display_name: 'Easy Hail Claim',
  display_order: 1,
  functional_currency: 'AUD',
  include_in_consolidation: true,
}

describe('normaliseForecastLine', () => {
  it('merges actual_months + forecast_months, forecast wins on overlap', () => {
    const out = normaliseForecastLine({
      account_name: 'Sales - Deposit',
      account_type: 'revenue',
      actual_months: { '2026-03': 10000, '2026-04': 9000 },
      forecast_months: { '2026-03': 12000, '2026-05': 11000 },
    })
    // forecast wins on 2026-03, actual survives for 2026-04, forecast adds 2026-05
    expect(out.monthly_values['2026-03']).toBe(12000)
    expect(out.monthly_values['2026-04']).toBe(9000)
    expect(out.monthly_values['2026-05']).toBe(11000)
  })

  it('coerces account_class / category to canonical account_type', () => {
    const a = normaliseForecastLine({
      account_name: 'Advertising',
      account_class: 'Operating Expenses',
      forecast_months: { '2026-03': 500 },
    })
    expect(a.account_type).toBe('opex')

    const b = normaliseForecastLine({
      account_name: 'Interest Income',
      category: 'Other Income',
      forecast_months: { '2026-03': 100 },
    })
    expect(b.account_type).toBe('other_income')
  })

  it('preserves account_name as display-cased (alignment normalises later)', () => {
    const out = normaliseForecastLine({
      account_name: 'Sales - Deposit',
      account_type: 'revenue',
      forecast_months: { '2026-03': 1 },
    })
    expect(out.account_name).toBe('Sales - Deposit')
  })
})

describe('buildTenantBudgetColumns', () => {
  it('omits (returns null slot) for tenants without a budget', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    // Only Dragon has a budget.
    const budgets = new Map<string, ForecastLineLike[]>([
      [
        DRAGON_ROOFING_TENANT,
        [{ account_type: 'revenue', account_name: 'Sales - Deposit', monthly_values: { '2026-03': 5000 } }],
      ],
    ])
    const cols = buildTenantBudgetColumns(
      [dragonTenant, easyHailTenant],
      budgets,
      universe,
      FY_MONTHS,
    )
    expect(cols[0]).not.toBeNull()
    expect(cols[1]).toBeNull()
  })

  it('zero-fills months not present in the raw budget row', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const budgets = new Map<string, ForecastLineLike[]>([
      [
        DRAGON_ROOFING_TENANT,
        [{ account_type: 'revenue', account_name: 'Sales - Deposit', monthly_values: { '2026-03': 5000 } }],
      ],
    ])
    const [dragonCol] = buildTenantBudgetColumns([dragonTenant], budgets, universe, FY_MONTHS)
    expect(dragonCol).not.toBeNull()
    const row = dragonCol!.lines.find((l) => l.account_name === 'Sales - Deposit')!
    expect(row.monthly_values['2026-03']).toBe(5000)
    expect(row.monthly_values['2026-04']).toBe(0)
    expect(row.monthly_values['2025-07']).toBe(0)
    // Every fy month must be present
    for (const m of FY_MONTHS) {
      expect(row.monthly_values[m]).toBeDefined()
    }
  })

  it('emits every universe account for a budgeted tenant (absent accounts → zero months)', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const budgets = new Map<string, ForecastLineLike[]>([
      [
        DRAGON_ROOFING_TENANT,
        // Budget only covers ONE account; other universe rows should still be present with zeros.
        [{ account_type: 'revenue', account_name: 'Sales - Deposit', monthly_values: { '2026-03': 5000 } }],
      ],
    ])
    const [dragonCol] = buildTenantBudgetColumns([dragonTenant], budgets, universe, FY_MONTHS)
    expect(dragonCol!.lines.length).toBe(universe.length)
    const advertising = dragonCol!.lines.find((l) => l.account_name === 'Advertising & Marketing')
    expect(advertising).toBeDefined()
    expect(advertising!.monthly_values['2026-03']).toBe(0)
  })
})

describe('combineTenantBudgets', () => {
  it('sums per-tenant budgets into a consolidated column (no eliminations)', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const budgets = new Map<string, ForecastLineLike[]>([
      [
        DRAGON_ROOFING_TENANT,
        [{ account_type: 'revenue', account_name: 'Sales - Deposit', monthly_values: { '2026-03': 3000 } }],
      ],
      [
        EASY_HAIL_TENANT,
        [{ account_type: 'revenue', account_name: 'Sales - Deposit', monthly_values: { '2026-03': 7000 } }],
      ],
    ])
    const cols = buildTenantBudgetColumns(
      [dragonTenant, easyHailTenant],
      budgets,
      universe,
      FY_MONTHS,
    )
    const consolidated = combineTenantBudgets(cols, universe, FY_MONTHS)
    const row = consolidated.find((l) => l.account_name === 'Sales - Deposit')!
    expect(row.monthly_values['2026-03']).toBe(10000) // 3000 + 7000
    expect(row.monthly_values['2026-04']).toBe(0)
  })

  it('produces zero consolidated budget when no tenants have budgets', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const cols = buildTenantBudgetColumns(
      [dragonTenant, easyHailTenant],
      new Map(),
      universe,
      FY_MONTHS,
    )
    const consolidated = combineTenantBudgets(cols, universe, FY_MONTHS)
    expect(consolidated.length).toBe(universe.length)
    for (const row of consolidated) {
      for (const m of FY_MONTHS) {
        expect(row.monthly_values[m]).toBe(0)
      }
    }
  })

  it('includes tenants with zero-value budget rows in the sum (distinct from missing tenant)', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const budgets = new Map<string, ForecastLineLike[]>([
      [
        DRAGON_ROOFING_TENANT,
        [{ account_type: 'revenue', account_name: 'Sales - Deposit', monthly_values: { '2026-03': 0 } }],
      ],
      [
        EASY_HAIL_TENANT,
        [{ account_type: 'revenue', account_name: 'Sales - Deposit', monthly_values: { '2026-03': 4000 } }],
      ],
    ])
    const cols = buildTenantBudgetColumns(
      [dragonTenant, easyHailTenant],
      budgets,
      universe,
      FY_MONTHS,
    )
    const consolidated = combineTenantBudgets(cols, universe, FY_MONTHS)
    const row = consolidated.find((l) => l.account_name === 'Sales - Deposit')!
    expect(row.monthly_values['2026-03']).toBe(4000)
  })
})

describe('buildConsolidation integration — budget piping via tenantBudgets opt', () => {
  it('attaches budgetLines to byTenant columns and returns a summed consolidated budget', async () => {
    // Use the tenantBudgets injection path so we don't need a live supabase mock
    // for financial_forecasts / forecast_pl_lines queries.
    const { buildConsolidation } = await import('./engine')

    // Minimal fake supabase that satisfies loadBusinessContext + loadTenantSnapshots
    // + loadEliminationRulesForBusiness.
    const fakeSupabase = {
      from(table: string) {
        if (table === 'businesses') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: DRAGON_ROOFING_BIZ,
                    name: 'Dragon Group',
                    consolidation_budget_mode: 'per_tenant',
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
              eq: (_col: string, _v: any) => ({
                eq: (_c2: string, _v2: any) => ({
                  eq: (_c3: string, _v3: any) => ({
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
        if (table === 'xero_pl_lines') {
          return {
            select: () => ({
              in: (_c: string, _v: any) => ({
                in: async (_c2: string, _v2: any) => ({
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
              eq: (_c: string, _v: any) => ({
                eq: async (_c2: string, _v2: any) => ({ data: [], error: null }),
              }),
            }),
          }
        }
        // resolveBusinessIds uses 'businesses' + 'business_profiles'
        if (table === 'business_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }
        }
        throw new Error(`[test] unexpected from(${table})`)
      },
    }

    const tenantBudgets = new Map<string, ForecastLineLike[]>([
      [
        DRAGON_ROOFING_TENANT,
        [
          { account_type: 'revenue', account_name: 'Sales - Roofing', monthly_values: { '2026-03': 10000 } },
        ],
      ],
      [
        EASY_HAIL_TENANT,
        [
          { account_type: 'revenue', account_name: 'Sales - Deposit', monthly_values: { '2026-03': 11000 } },
        ],
      ],
    ])

    const report = await buildConsolidation(fakeSupabase as any, {
      businessId: DRAGON_ROOFING_BIZ,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
      tenantBudgets,
    })

    // byTenant columns both carry budgetLines
    expect(report.byTenant.length).toBe(2)
    expect(report.byTenant[0].budgetLines).toBeDefined()
    expect(report.byTenant[1].budgetLines).toBeDefined()

    // Consolidated budget sums across tenants for Sales - Deposit (only Easy Hail budgets it)
    const deposit = report.consolidated.budgetLines.find((l) => l.account_name === 'Sales - Deposit')!
    expect(deposit.monthly_values['2026-03']).toBe(11000)

    // Dragon's Sales - Roofing appears in the budget too
    const roofing = report.consolidated.budgetLines.find((l) => l.account_name === 'Sales - Roofing')
    expect(roofing).toBeDefined()
    expect(roofing!.monthly_values['2026-03']).toBe(10000)

    // Diagnostics reflect budget presence
    expect(report.diagnostics.tenants_with_budget).toBe(2)
    expect(report.diagnostics.tenants_without_budget).toEqual([])
  })
})
