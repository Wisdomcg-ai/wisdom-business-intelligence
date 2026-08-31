/**
 * WD.6 — the shared consolidated row derivation (tab + PDF read the same fn).
 */
import { describe, it, expect } from 'vitest'
import { buildConsolidatedRows, type ConsolidatedReportVM } from '../consolidated-rows'

const M = '2026-07'

function vm(overrides: Partial<ConsolidatedReportVM> = {}): ConsolidatedReportVM {
  return {
    business: { id: 'biz', name: 'Dragon Group', presentation_currency: 'AUD' },
    byTenant: [
      {
        connection_id: 'c1', tenant_id: 't1', display_name: 'Dragon Roofing',
        display_order: 0, functional_currency: 'AUD',
        lines: [
          { account_type: 'revenue', account_name: 'Sales', monthly_values: { [M]: 100_000 } },
          { account_type: 'opex', account_name: 'Rent', monthly_values: { [M]: 8_000 } },
        ],
        budgetLines: [
          { account_type: 'revenue', account_name: 'Sales', monthly_values: { [M]: 90_000 } },
        ],
      },
      {
        connection_id: 'c2', tenant_id: 't2', display_name: 'Easy Hail Claim',
        display_order: 1, functional_currency: 'AUD',
        lines: [
          { account_type: 'revenue', account_name: 'Sales', monthly_values: { [M]: 40_000 } },
        ],
        // no budgetLines — hasBudget false
      },
    ],
    eliminations: [
      {
        rule_id: 'r1', rule_description: 'interco mgmt fee', account_type: 'revenue',
        account_name: 'Sales', amount: -5_000, source_tenant_id: 't1', source_amount: -5_000,
      },
    ],
    consolidated: {
      lines: [
        { account_type: 'revenue', account_name: 'Sales', monthly_values: { [M]: 135_000 } },
        { account_type: 'opex', account_name: 'Rent', monthly_values: { [M]: 8_000 } },
      ],
      budgetLines: [
        { account_type: 'revenue', account_name: 'Sales', monthly_values: { [M]: 90_000 } },
      ],
    },
    fx_context: { rates_used: {}, missing_rates: [] },
    diagnostics: {
      tenants_loaded: 2, total_lines_processed: 3, eliminations_applied_count: 1,
      eliminations_total_amount: -5_000, processing_ms: 1, tenants_with_budget: 1,
      tenants_without_budget: ['Easy Hail Claim'], budget_mode: 'per_tenant',
    },
    ...overrides,
  }
}

describe('WD.6 — buildConsolidatedRows', () => {
  const { rows, isSingleMode, hasAnyBudget, tenantsWithoutBudget } = buildConsolidatedRows(vm(), M)

  it('one display row per consolidated line, canonical order', () => {
    expect(rows.map((r) => r.accountName)).toEqual(['Sales', 'Rent'])
  })

  it('tenant cells carry the month actual; budget only where the tenant has one', () => {
    const sales = rows[0]
    expect(sales.tenantCells[0]).toEqual({ actual: 100_000, budget: 90_000, variance: 10_000, hasBudget: true })
    expect(sales.tenantCells[1]).toEqual({ actual: 40_000, budget: 0, variance: 40_000, hasBudget: false })
  })

  it('eliminations aggregate per alignment key', () => {
    expect(rows[0].elim).toBe(-5_000)
    expect(rows[1].elim).toBe(0)
  })

  it('consolidated cells and variance pct (null on zero budget)', () => {
    expect(rows[0].consolidatedActual).toBe(135_000)
    expect(rows[0].consolidatedVariancePct).toBeCloseTo(50)
    expect(rows[1].consolidatedBudget).toBe(0)
    expect(rows[1].consolidatedVariancePct).toBeNull()
  })

  it('per_tenant mode: hasAnyBudget from tenant budgets; missing tenants surfaced', () => {
    expect(isSingleMode).toBe(false)
    expect(hasAnyBudget).toBe(true)
    expect(tenantsWithoutBudget).toEqual(['Easy Hail Claim'])
  })

  it('single mode: hasAnyBudget requires the business-level forecast to be found', () => {
    const single = vm()
    single.diagnostics.budget_mode = 'single'
    single.diagnostics.single_budget_found = false
    const r = buildConsolidatedRows(single, M)
    expect(r.isSingleMode).toBe(true)
    expect(r.hasAnyBudget).toBe(false)
  })
})
