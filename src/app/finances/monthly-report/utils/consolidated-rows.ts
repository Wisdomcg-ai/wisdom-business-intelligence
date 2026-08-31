/**
 * WD.6 — one derivation of the consolidated per-entity rows, shared by the
 * web tab AND the PDF page ("fix the reader too": a second hand-rolled copy
 * in the PDF would drift the moment the tab's logic moves).
 *
 * Types mirror the /api/monthly-report/consolidated response (the engine's
 * ConsolidatedReport). Pure.
 */

export interface ConsolidatedForecastLineVM {
  account_type: string
  account_name: string
  monthly_values: Record<string, number>
}

export interface ConsolidatedEntityColumnVM {
  connection_id: string
  tenant_id: string
  display_name: string
  display_order: number
  functional_currency: string
  lines: ConsolidatedForecastLineVM[]
  budgetLines?: ConsolidatedForecastLineVM[]
}

export interface ConsolidatedEliminationVM {
  rule_id: string
  rule_description: string
  account_type: string
  account_name: string
  amount: number
  source_tenant_id: string
  source_amount: number
}

export interface ConsolidatedReportVM {
  business: { id: string; name: string; presentation_currency: string }
  byTenant: ConsolidatedEntityColumnVM[]
  eliminations: ConsolidatedEliminationVM[]
  consolidated: {
    lines: ConsolidatedForecastLineVM[]
    budgetLines: ConsolidatedForecastLineVM[]
  }
  fx_context: {
    rates_used: Record<string, number>
    missing_rates: Array<{ currency_pair: string; period: string }>
  }
  diagnostics: {
    tenants_loaded: number
    total_lines_processed: number
    eliminations_applied_count: number
    eliminations_total_amount: number
    processing_ms: number
    tenants_with_budget: number
    tenants_without_budget: string[]
    budget_mode?: 'single' | 'per_tenant'
    single_budget_found?: boolean
  }
}

export interface ConsolidatedTenantCell {
  actual: number
  budget: number
  variance: number
  hasBudget: boolean
}

export interface ConsolidatedDisplayRow {
  accountType: string
  accountName: string
  tenantCells: ConsolidatedTenantCell[]
  elim: number
  consolidatedActual: number
  consolidatedBudget: number
  consolidatedVariance: number
  consolidatedVariancePct: number | null
}

export function alignmentKey(line: { account_type: string; account_name: string }): string {
  return `${line.account_type.toLowerCase().trim()}::${line.account_name.toLowerCase().trim()}`
}

export interface ConsolidatedRowsResult {
  rows: ConsolidatedDisplayRow[]
  budgetMode: 'single' | 'per_tenant'
  isSingleMode: boolean
  hasAnyBudget: boolean
  tenantsWithoutBudget: string[]
}

export function buildConsolidatedRows(
  report: ConsolidatedReportVM,
  reportMonth: string,
): ConsolidatedRowsResult {
  // Defensive defaults — older API payloads may not ship budgetLines yet.
  const budgetLines = report.consolidated.budgetLines ?? []
  const tenantsWithoutBudget = report.diagnostics.tenants_without_budget ?? []

  // Phase 34 Step 2 — budget mode drives per-tenant column visibility.
  const budgetMode: 'single' | 'per_tenant' =
    report.diagnostics.budget_mode ?? 'per_tenant'
  const isSingleMode = budgetMode === 'single'

  // Index budgets by alignment key for O(1) lookup
  const budgetByKey = new Map<string, ConsolidatedForecastLineVM>()
  for (const b of budgetLines) budgetByKey.set(alignmentKey(b), b)

  // Per-tenant budget lookup: tenant_id → (key → row)
  const tenantBudgetIndex = new Map<string, Map<string, ConsolidatedForecastLineVM>>()
  for (const col of report.byTenant) {
    const m = new Map<string, ConsolidatedForecastLineVM>()
    for (const b of col.budgetLines ?? []) m.set(alignmentKey(b), b)
    tenantBudgetIndex.set(col.tenant_id, m)
  }

  // Aggregate eliminations by alignment key for per-row lookup
  const elimsByKey = new Map<string, number>()
  for (const e of report.eliminations) {
    const k = alignmentKey(e)
    elimsByKey.set(k, (elimsByKey.get(k) ?? 0) + e.amount)
  }

  // Build display rows from consolidated.lines (canonical order).
  const rows: ConsolidatedDisplayRow[] = report.consolidated.lines.map((l) => {
    const key = alignmentKey(l)
    const tenantCells = report.byTenant.map((col) => {
      const actualLine = col.lines.find((el) => alignmentKey(el) === key)
      const actual = actualLine?.monthly_values[reportMonth] ?? 0
      const hasBudget = col.budgetLines != null
      const budgetLine = hasBudget
        ? tenantBudgetIndex.get(col.tenant_id)?.get(key)
        : undefined
      const budget = budgetLine?.monthly_values[reportMonth] ?? 0
      const variance = actual - budget
      return { actual, budget, variance, hasBudget }
    })
    const elim = elimsByKey.get(key) ?? 0
    const consolidatedActual = l.monthly_values[reportMonth] ?? 0
    const consolidatedBudget = budgetByKey.get(key)?.monthly_values[reportMonth] ?? 0
    const consolidatedVariance = consolidatedActual - consolidatedBudget
    const consolidatedVariancePct =
      consolidatedBudget !== 0
        ? (consolidatedVariance / Math.abs(consolidatedBudget)) * 100
        : null
    return {
      accountType: l.account_type,
      accountName: l.account_name,
      tenantCells,
      elim,
      consolidatedActual,
      consolidatedBudget,
      consolidatedVariance,
      consolidatedVariancePct,
    }
  })

  const hasAnyBudget = isSingleMode
    ? report.diagnostics.single_budget_found !== false && budgetLines.length > 0
    : report.byTenant.some((c) => c.budgetLines != null)

  return { rows, budgetMode, isSingleMode, hasAnyBudget, tenantsWithoutBudget }
}
