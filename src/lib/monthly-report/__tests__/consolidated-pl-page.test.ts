/**
 * The P&L Comparison's rows and its options (consolidated-pl-page), apart from
 * the PDF. The route-to-PDF figures are in
 * api/monthly-report/consolidated/__tests__/consolidated-pl-comparison.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { buildConsolidatedPLPageModel, parseConsolidatedPLConfig } from '../consolidated-pl-page'
import type { ConsolidatedReportVM } from '@/app/finances/monthly-report/utils/consolidated-rows'

const m = (aug: number) => ({ '2026-08': aug })
const line = (type: string, name: string, aug: number, group?: string) => ({ account_type: type, account_name: name, monthly_values: m(aug), ...(group ? { group } : {}) })

function vm(mode: 'per_tenant' | 'single' = 'per_tenant'): ConsolidatedReportVM {
  const a = [line('revenue', 'Sales', 1000), line('opex', 'Wages', 400, 'Employment Expense'), line('opex', 'Super', 50, 'Employment Expense'), line('opex', 'Rent', 0)]
  const b = [line('revenue', 'Sales', 500), line('opex', 'Wages', 100, 'Employment Expense'), line('opex', 'Super', 10, 'Employment Expense'), line('opex', 'Rent', 0)]
  const budgetA = [line('revenue', 'Sales', 1200), line('opex', 'Wages', 300), line('opex', 'Super', 40), line('opex', 'Rent', 0)]
  const budgetB = [line('revenue', 'Sales', 400), line('opex', 'Wages', 150), line('opex', 'Super', 10), line('opex', 'Rent', 0)]
  return {
    business: { id: 'b', name: 'Group', presentation_currency: 'AUD' },
    byTenant: [
      { connection_id: 'c1', tenant_id: 't1', display_name: 'Alpha', display_order: 1, functional_currency: 'AUD', lines: a, ...(mode === 'per_tenant' ? { budgetLines: budgetA } : {}) },
      { connection_id: 'c2', tenant_id: 't2', display_name: 'Beta', display_order: 2, functional_currency: 'AUD', lines: b, ...(mode === 'per_tenant' ? { budgetLines: budgetB } : {}) },
    ],
    eliminations: [],
    consolidated: {
      lines: a.map((l, i) => ({ ...l, monthly_values: m(l.monthly_values['2026-08'] + b[i].monthly_values['2026-08']) })),
      budgetLines: budgetA.map((l, i) => ({ ...l, monthly_values: m(l.monthly_values['2026-08'] + budgetB[i].monthly_values['2026-08']) })),
    },
    fx_context: { rates_used: {}, missing_rates: [] },
    diagnostics: { tenants_loaded: 2, total_lines_processed: 8, eliminations_applied_count: 0, eliminations_total_amount: 0, processing_ms: 1, tenants_with_budget: mode === 'per_tenant' ? 2 : 0, tenants_without_budget: [], budget_mode: mode, ...(mode === 'single' ? { single_budget_found: true } : {}) },
  }
}

describe('parseConsolidatedPLConfig', () => {
  it('no config is the standard page', () => {
    expect(parseConsolidatedPLConfig(undefined)).toEqual({ ok: true, config: { layout: 'standard', section: 'all', columns: 'actual_budget' } })
  })

  it('reads the calxa options', () => {
    expect(parseConsolidatedPLConfig({ layout: 'calxa', section: 'expense', columns: 'actuals' }))
      .toEqual({ ok: true, config: { layout: 'calxa', section: 'expense', columns: 'actuals' } })
  })

  it('refuses a calxa option on the standard page, and a key it does not know', () => {
    const inert = parseConsolidatedPLConfig({ columns: 'actuals' })
    expect(inert).toMatchObject({ ok: false, config: { layout: 'standard' }, reason: 'columns applies only to layout calxa' })
    const typo = parseConsolidatedPLConfig({ layout: 'calxa', actuals_only: true })
    expect(typo.ok).toBe(false)
    expect(typo.config.layout).toBe('standard')
  })
})

describe('buildConsolidatedPLPageModel', () => {
  it('a group row carries its members, and costs are signed budget − actual as on the statement', () => {
    const model = buildConsolidatedPLPageModel(vm(), '2026-08', { layout: 'calxa', section: 'expense', columns: 'actual_budget' }, { groupOrder: ['Employment Expense'], groupName: 'Group Pty Ltd' })
    expect(model.tenantBudget).toBe(true)
    expect(model.groupName).toBe('Group Pty Ltd')
    const group = model.rows.find((r) => r.kind === 'group')!
    expect(group.label).toBe('Employment Expense')
    // Alpha spent 450 against 340: (110). Beta 110 against 160: 50.
    expect(group.tenants.map((t) => [t.actual, t.budget, t.variance])).toEqual([[450, 340, -110], [110, 160, 50]])
    expect(group.group).toMatchObject({ actual: 560, budget: 500, variance: -60 })
    expect(group.group!.variancePct).toBeCloseTo(-12, 5)
    // Rent is zero in every column and is left off; its total still counts it.
    expect(model.rows.map((r) => r.label)).toEqual(['Expense', 'Employment Expense', 'Wages', 'Super', 'Total Expense'])
    expect(model.rows.find((r) => r.label === 'Wages')!.indent).toBe(2)
  })

  it('income variance is actual − budget, and the profit rows follow income', () => {
    const model = buildConsolidatedPLPageModel(vm(), '2026-08', { layout: 'calxa', section: 'all', columns: 'actual_budget' })
    const total = model.rows.find((r) => r.label === 'Total Income')!
    expect(total.tenants.map((t) => t.variance)).toEqual([-200, 100])
    const gp = model.rows.find((r) => r.label === 'Gross Profit')!
    expect(gp.tenants.map((t) => t.actual)).toEqual([1000, 500])
    const margin = model.rows.find((r) => r.kind === 'margin')!
    expect(margin.margins!.tenants).toEqual([{ actual: '100%', budget: '100%' }, { actual: '100%', budget: '100%' }])
    const np = model.rows.find((r) => r.label === 'Net Profit')!
    expect(np.tenants.map((t) => [t.actual, t.budget, t.variance])).toEqual([[550, 860, -310], [390, 240, 150]])
    expect(np.group).toMatchObject({ actual: 940, budget: 1100, variance: -160 })
  })

  it('a business-level budget has no budget per organisation', () => {
    const model = buildConsolidatedPLPageModel(vm('single'), '2026-08', { layout: 'calxa', section: 'income', columns: 'actual_budget' })
    expect(model.tenantBudget).toBe(false)
    expect(model.groupBudget).toBe(true)
    expect(model.rows.find((r) => r.label === 'Total Income')!.tenants.every((t) => t.budget === null)).toBe(true)
  })

  it('actuals only prints no budget anywhere', () => {
    const model = buildConsolidatedPLPageModel(vm(), '2026-08', { layout: 'calxa', section: 'income', columns: 'actuals' })
    expect([model.tenantBudget, model.groupBudget]).toEqual([false, false])
    expect(model.rows.find((r) => r.label === 'Total Income')!.group).toMatchObject({ actual: 1500, budget: null, variance: null })
  })
})
