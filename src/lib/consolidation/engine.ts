/**
 * Multi-Tenant Consolidation Engine (P&L) — Phase 34
 *
 * One business, multiple Xero tenants. The engine:
 *   1. Loads the business + its active, consolidation-included tenants from xero_connections
 *   2. Fetches xero_pl_lines for that business, groups by tenant_id
 *   3. Aligns accounts across tenants, applies FX + eliminations, produces a consolidated view
 *
 * FX translation (fx.ts) and elimination rules (eliminations.ts) are pure modules plugged in
 * via the `translate` callback and the business-scoped rules table.
 *
 * resolveBusinessIds is used ONCE to resolve the dual-ID business identifier; the subsequent
 * xero_pl_lines query uses the resolved IDs + filters by tenant_id per tenant.
 */

import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import type {
  ConsolidationBusiness,
  ConsolidationTenant,
  XeroPLLineLike,
  EntityColumn,
  EliminationEntry,
  ConsolidatedReport,
  ForecastLineLike,
  ConsolidatedLine,
} from './types'
import {
  buildAlignedAccountUniverse,
  buildEntityColumn,
  deduplicateLines,
  accountAlignmentKey,
  type AlignedAccount,
} from './account-alignment'
import { loadEliminationRulesForBusiness, applyEliminations } from './eliminations'

interface LoadedContext {
  business: ConsolidationBusiness
  tenants: ConsolidationTenant[]
}

interface TenantSnapshot {
  tenant: ConsolidationTenant
  rawLines: XeroPLLineLike[]
}

export interface BuildConsolidationOpts {
  businessId: string
  reportMonth: string // 'YYYY-MM'
  fiscalYear: number
  fyMonths: readonly string[] // 12 'YYYY-MM' keys, driven by business fiscal year
  /**
   * Optional FX translator invoked once per tenant whose `functional_currency`
   * differs from the business's `presentation_currency`. Tenants sharing the
   * presentation currency are short-circuited (pure pass-through).
   *
   * Returns:
   *   - `translated`  — same-shape XeroPLLineLike array in presentation currency
   *   - `missing`     — month keys for which no rate was available
   *   - `ratesUsed`   — flat map: `${currency_pair}::${month}` → rate
   */
  translate?: (
    tenant: ConsolidationTenant,
    lines: XeroPLLineLike[],
  ) => Promise<{
    translated: XeroPLLineLike[]
    missing: string[]
    ratesUsed: Record<string, number>
  }>
  /**
   * Inject pre-built per-tenant budgets (tests / callers that already hold the
   * forecast rows). When omitted, the engine loads via `loadTenantBudgets`.
   * Key = tenant_id, value = forecast lines (already aligned or raw).
   */
  tenantBudgets?: Map<string, ForecastLineLike[]>
  /**
   * Inject a pre-built single business-level budget (tenant_id IS NULL
   * forecast). Only consulted when the business's budget mode is 'single',
   * OR as the 'per_tenant' fallback when no tenant-scoped forecasts exist.
   * Tests inject this directly to avoid mocking financial_forecasts queries.
   */
  singleBusinessBudget?: ForecastLineLike[] | null
}

/**
 * Load business metadata + its active, consolidation-included Xero tenants.
 *
 * Phase 34 Step 2: also reads `businesses.consolidation_budget_mode` so the
 * engine can branch between the single-budget and per-tenant-budget modes.
 * The column is expected to exist (migration `20260420195612_consolidation_budget_mode.sql`)
 * but we defensively coalesce to 'single' for rows loaded before the column
 * was added (test fixtures, legacy installs).
 */
export async function loadBusinessContext(
  supabase: any,
  businessId: string,
): Promise<LoadedContext> {
  const { data: business, error: bErr } = await supabase
    .from('businesses')
    .select('id, name, consolidation_budget_mode')
    .eq('id', businessId)
    .single()
  if (bErr || !business) {
    throw new Error(`[Consolidation Engine] Business ${businessId} not found: ${bErr?.message ?? ''}`)
  }

  const { data: connections, error: cErr } = await supabase
    .from('xero_connections')
    .select('id, business_id, tenant_id, tenant_name, display_name, display_order, functional_currency, include_in_consolidation, is_active')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .eq('include_in_consolidation', true)
    .order('display_order', { ascending: true })
  if (cErr) {
    throw new Error(`[Consolidation Engine] Failed to load tenants: ${cErr.message}`)
  }

  const tenants: ConsolidationTenant[] = (connections ?? []).map((c: any) => ({
    connection_id: c.id,
    business_id: c.business_id,
    tenant_id: c.tenant_id,
    display_name: c.display_name || c.tenant_name || c.tenant_id,
    display_order: c.display_order ?? 0,
    functional_currency: c.functional_currency || 'AUD',
    include_in_consolidation: c.include_in_consolidation ?? true,
  }))

  // Normalise budget mode. Anything unrecognised → 'single' (safest default).
  const rawMode = (business as any).consolidation_budget_mode
  const budgetMode: 'single' | 'per_tenant' =
    rawMode === 'per_tenant' ? 'per_tenant' : 'single'

  return {
    business: {
      id: business.id,
      name: business.name,
      presentation_currency: 'AUD', // hardcoded for now — could add to businesses column later
      consolidation_budget_mode: budgetMode,
    },
    tenants,
  }
}

/**
 * Single-query per business, grouped by tenant in memory. Uses resolveBusinessIds
 * on the parent business (dual-ID safety) then slices xero_pl_lines by tenant_id.
 */
export async function loadTenantSnapshots(
  supabase: any,
  businessId: string,
  tenants: ConsolidationTenant[],
): Promise<TenantSnapshot[]> {
  if (tenants.length === 0) return []

  const ids = await resolveBusinessIds(supabase, businessId)
  const tenantIds = tenants.map((t) => t.tenant_id)

  const { data: lines, error } = await supabase
    .from('xero_pl_lines_wide_compat')
    .select('business_id, tenant_id, account_name, account_code, account_type, section, monthly_values')
    .in('business_id', ids.all)
    .in('tenant_id', tenantIds)

  if (error) {
    throw new Error(`[Consolidation Engine] Failed to load xero_pl_lines: ${error.message}`)
  }

  const byTenant = new Map<string, XeroPLLineLike[]>()
  for (const line of (lines ?? []) as XeroPLLineLike[]) {
    const arr = byTenant.get(line.tenant_id ?? '') ?? []
    arr.push(line)
    byTenant.set(line.tenant_id ?? '', arr)
  }

  return tenants.map((tenant) => ({
    tenant,
    rawLines: byTenant.get(tenant.tenant_id) ?? [],
  }))
}

/**
 * Combine per-tenant columns into a single consolidated column.
 * Formula: consolidated[account][month] = Σ tenants[account][month]
 *          plus reportMonth-scoped eliminations (applied only at reportMonth).
 */
export function combineTenants(
  byTenant: EntityColumn[],
  universe: AlignedAccount[],
  eliminations: EliminationEntry[],
  fyMonths: readonly string[],
  reportMonth: string,
): { lines: ConsolidatedLine[] } {
  const elimsByKey = new Map<string, EliminationEntry[]>()
  for (const e of eliminations) {
    const key = accountAlignmentKey({ account_type: e.account_type, account_name: e.account_name })
    const arr = elimsByKey.get(key) ?? []
    arr.push(e)
    elimsByKey.set(key, arr)
  }

  const lines = universe.map((u) => {
    const monthly: Record<string, number> = {}
    for (const m of fyMonths) {
      let sum = 0
      for (const col of byTenant) {
        const lineInTenant = col.lines.find(
          (l) =>
            accountAlignmentKey({ account_type: l.account_type, account_name: l.account_name }) ===
            u.key,
        )
        sum += lineInTenant?.monthly_values[m] ?? 0
      }
      if (m === reportMonth) {
        const elims = elimsByKey.get(u.key) ?? []
        sum += elims.reduce((acc, e) => acc + e.amount, 0)
      }
      monthly[m] = sum
    }
    return {
      account_type: u.account_type,
      account_name: u.account_name,
      monthly_values: monthly,
    }
  })

  return { lines }
}

/**
 * Convert a raw forecast_pl_lines row into a ForecastLineLike used by the
 * consolidation engine. forecast_months + actual_months share the same
 * 'YYYY-MM' key space, so we MERGE them — forecast_months wins on overlap
 * (edited forecasts override stale actual snapshots in the forecast table).
 *
 * account_type is normalised: forecast_pl_lines uses a variety of casings
 * and the consolidation engine's alignment key expects lowercase ('revenue',
 * 'cogs', 'opex', 'other_income', 'other_expense').
 */
export function normaliseForecastLine(row: {
  account_name: string
  account_type?: string | null
  account_class?: string | null
  category?: string | null
  actual_months?: Record<string, number> | null
  forecast_months?: Record<string, number> | null
}): ForecastLineLike {
  const merged: Record<string, number> = { ...(row.actual_months ?? {}) }
  for (const [k, v] of Object.entries(row.forecast_months ?? {})) {
    merged[k] = v
  }
  // account_type prefers the explicit account_type column; falls back to
  // account_class / category string mapping. Lowercased + common aliases
  // collapsed to the five canonical values used by xero_pl_lines.
  const raw = (row.account_type ?? row.account_class ?? row.category ?? '')
    .toString()
    .toLowerCase()
    .trim()
  let account_type: string
  if (raw.includes('revenue') || raw === 'income') account_type = 'revenue'
  else if (raw.includes('cogs') || raw.includes('cost of sales')) account_type = 'cogs'
  else if (raw.includes('opex') || raw.includes('operating expense')) account_type = 'opex'
  else if (raw.includes('other income')) account_type = 'other_income'
  else if (raw.includes('other expense')) account_type = 'other_expense'
  else account_type = raw || 'opex' // conservative default — never silently drops a line
  return {
    account_type,
    account_name: row.account_name,
    monthly_values: merged,
  }
}

/**
 * Load per-tenant forecast P&L lines for the given fiscal year.
 *
 * Lookup strategy (Option B — each tenant has its own budget):
 *   1. For each tenant, find a forecast where business_id matches (via
 *      resolveBusinessIds for dual-ID safety) AND tenant_id = tenant.tenant_id
 *      AND fiscal_year matches. If found, load that forecast's pl_lines.
 *   2. If NO tenants have tenant-scoped forecasts (simpler alternative per
 *      plan): return an empty Map and let the caller render zero-budget
 *      columns + surface `tenants_without_budget` to the UI.
 *
 * Returns a Map keyed by tenant_id → ForecastLineLike[]. Tenants WITHOUT a
 * budget are absent from the Map (caller distinguishes "no budget" from
 * "empty budget").
 */
export async function loadTenantBudgets(
  supabase: any,
  businessId: string,
  tenants: ConsolidationTenant[],
  fiscalYear: number,
): Promise<Map<string, ForecastLineLike[]>> {
  const result = new Map<string, ForecastLineLike[]>()
  if (tenants.length === 0) return result

  const ids = await resolveBusinessIds(supabase, businessId)

  // 1. For each tenant, try to find a tenant-scoped forecast.
  // Uses .limit(1) — if multiple exist, pick the most recently updated one.
  // (The forecast wizard may create multiple versions per tenant.)
  for (const tenant of tenants) {
    const { data: forecasts, error } = await supabase
      .from('financial_forecasts')
      .select('id')
      .in('business_id', ids.all)
      .eq('tenant_id', tenant.tenant_id)
      .eq('fiscal_year', fiscalYear)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (error) {
      throw new Error(
        `[Consolidation Engine] Failed to load forecast for tenant ${tenant.tenant_id}: ${error.message}`,
      )
    }
    const forecastId = forecasts?.[0]?.id
    if (!forecastId) continue

    const { data: plRows, error: plErr } = await supabase
      .from('forecast_pl_lines')
      .select('account_name, account_type, account_class, category, actual_months, forecast_months')
      .eq('forecast_id', forecastId)
    if (plErr) {
      throw new Error(
        `[Consolidation Engine] Failed to load forecast_pl_lines for forecast ${forecastId}: ${plErr.message}`,
      )
    }
    const lines = (plRows ?? []).map(normaliseForecastLine)
    result.set(tenant.tenant_id, lines)
  }

  return result
}

/**
 * Load the single business-level forecast (tenant_id IS NULL) for the given
 * fiscal year. Used by:
 *   - 'single' budget mode: the ONLY forecast that feeds consolidated.budgetLines
 *   - 'per_tenant' fallback: when zero tenants have a tenant-scoped forecast
 *     for the fiscal year, we fall back to the legacy business-level forecast
 *     so existing workflows keep rendering.
 *
 * Returns null when no such forecast exists; returns its aligned lines otherwise.
 */
export async function loadSingleBusinessBudget(
  supabase: any,
  businessId: string,
  fiscalYear: number,
): Promise<ForecastLineLike[] | null> {
  const ids = await resolveBusinessIds(supabase, businessId)

  const { data: forecasts, error } = await supabase
    .from('financial_forecasts')
    .select('id')
    .in('business_id', ids.all)
    .is('tenant_id', null)
    .eq('fiscal_year', fiscalYear)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) {
    throw new Error(
      `[Consolidation Engine] Failed to load business-level forecast: ${error.message}`,
    )
  }
  const forecastId = forecasts?.[0]?.id
  if (!forecastId) return null

  const { data: plRows, error: plErr } = await supabase
    .from('forecast_pl_lines')
    .select('account_name, account_type, account_class, category, actual_months, forecast_months')
    .eq('forecast_id', forecastId)
  if (plErr) {
    throw new Error(
      `[Consolidation Engine] Failed to load forecast_pl_lines for forecast ${forecastId}: ${plErr.message}`,
    )
  }
  return (plRows ?? []).map(normaliseForecastLine)
}

/**
 * Align a flat ForecastLineLike[] to the engine's account universe. Produces
 * a ConsolidatedLine[] with every universe row present (zero-filled if the
 * source budget doesn't mention that account) and every fy month populated.
 *
 * Used by 'single' mode to produce the `consolidated.budgetLines` column
 * directly from the business-level forecast (no per-tenant stitching).
 */
export function alignBudgetToUniverse(
  budget: ForecastLineLike[],
  universe: AlignedAccount[],
  fyMonths: readonly string[],
): ConsolidatedLine[] {
  const byKey = new Map<string, ForecastLineLike>()
  for (const line of budget) {
    byKey.set(accountAlignmentKey(line), line)
  }
  return universe.map((u) => {
    const existing = byKey.get(u.key)
    const monthly: Record<string, number> = {}
    for (const m of fyMonths) {
      monthly[m] = existing?.monthly_values[m] ?? 0
    }
    return {
      account_type: u.account_type,
      account_name: u.account_name,
      monthly_values: monthly,
    }
  })
}

/**
 * Build per-tenant budget columns aligned to the P&L universe.
 *
 * For each tenant we emit a ForecastLineLike[] with EXACTLY the same
 * (account_type, account_name) rows as the consolidated universe. Missing
 * rows get zero-filled months. When a tenant has no budget at all, its
 * entry is OMITTED from the returned array (caller records this as a
 * `tenants_without_budget` diagnostic).
 */
export function buildTenantBudgetColumns(
  tenants: ConsolidationTenant[],
  budgetsByTenant: Map<string, ForecastLineLike[]>,
  universe: AlignedAccount[],
  fyMonths: readonly string[],
): Array<{ tenantId: string; lines: ForecastLineLike[] } | null> {
  return tenants.map((tenant) => {
    const raw = budgetsByTenant.get(tenant.tenant_id)
    if (!raw) return null
    // Align raw budget rows to the universe — same pattern as buildEntityColumn
    // but for forecast shape.
    const byKey = new Map<string, ForecastLineLike>()
    for (const line of raw) {
      byKey.set(accountAlignmentKey(line), line)
    }
    const zeroMonths = (): Record<string, number> => {
      const z: Record<string, number> = {}
      for (const m of fyMonths) z[m] = 0
      return z
    }
    const lines: ForecastLineLike[] = universe.map((u) => {
      const existing = byKey.get(u.key)
      if (existing) {
        // Normalise monthly_values to include every fy month (defensive).
        const filled: Record<string, number> = {}
        for (const m of fyMonths) filled[m] = existing.monthly_values[m] ?? 0
        return {
          account_type: u.account_type,
          account_name: u.account_name,
          monthly_values: filled,
        }
      }
      return {
        account_type: u.account_type,
        account_name: u.account_name,
        monthly_values: zeroMonths(),
      }
    })
    return { tenantId: tenant.tenant_id, lines }
  })
}

/**
 * Sum per-tenant budget columns into a single consolidated budget column.
 * Every universe row is represented; months with no data in any tenant
 * become 0. Eliminations are NOT applied to budgets (budgets are already
 * coach-entered at a "net" level — plan simplification).
 */
export function combineTenantBudgets(
  tenantBudgetColumns: Array<{ tenantId: string; lines: ForecastLineLike[] } | null>,
  universe: AlignedAccount[],
  fyMonths: readonly string[],
): ConsolidatedLine[] {
  return universe.map((u) => {
    const monthly: Record<string, number> = {}
    for (const m of fyMonths) {
      let sum = 0
      for (const col of tenantBudgetColumns) {
        if (!col) continue
        const line = col.lines.find(
          (l) =>
            accountAlignmentKey({ account_type: l.account_type, account_name: l.account_name }) ===
            u.key,
        )
        sum += line?.monthly_values[m] ?? 0
      }
      monthly[m] = sum
    }
    return {
      account_type: u.account_type,
      account_name: u.account_name,
      monthly_values: monthly,
    }
  })
}

/**
 * Main entry point. Input: a business_id. Output: consolidated P&L with per-tenant columns.
 */
export async function buildConsolidation(
  supabase: any,
  opts: BuildConsolidationOpts,
): Promise<ConsolidatedReport> {
  const startedAt = Date.now()

  // 1. Load business + tenants
  const { business, tenants } = await loadBusinessContext(supabase, opts.businessId)

  // 2. Load P&L for all tenants in one query, grouped by tenant_id
  const snapshots = await loadTenantSnapshots(supabase, opts.businessId, tenants)

  // 3. Dedup per tenant (xero sync race duplicates)
  const deduped = snapshots.map((s) => ({
    ...s,
    lines: deduplicateLines(s.rawLines),
  }))

  // 4. FX translation — only invoked when tenant.functional_currency != business.presentation_currency.
  // Missing rates surface via fx_context.missing_rates[]. NEVER silently falls back to 1.0.
  const fxRatesUsed: Record<string, number> = {}
  const fxMissing: { currency_pair: string; period: string }[] = []
  const translated = await Promise.all(
    deduped.map(async (d) => {
      if (!opts.translate || d.tenant.functional_currency === business.presentation_currency) {
        return d
      }
      const { translated: tLines, missing, ratesUsed } = await opts.translate(d.tenant, d.lines)
      Object.assign(fxRatesUsed, ratesUsed)
      const pair = `${d.tenant.functional_currency}/${business.presentation_currency}`
      for (const m of missing) {
        fxMissing.push({ currency_pair: pair, period: m })
      }
      return { ...d, lines: tLines }
    }),
  )

  // 5. Load budgets (Phase 34.3 → 34-step2 hybrid mode).
  //
  //    Two modes (businesses.consolidation_budget_mode):
  //      'single'     → load ONE business-level forecast (tenant_id IS NULL).
  //                     Per-tenant budgets are INTENTIONALLY empty.
  //      'per_tenant' → load one forecast per tenant (existing behaviour).
  //                     Fallback: if NO tenants have a tenant-scoped forecast
  //                     for this fy, we use the tenant_id IS NULL forecast to
  //                     avoid a silent zero-budget regression for installs
  //                     that pre-date the mode toggle.
  //
  //    Both branches produce `budgetsByTenant` (Map<tenant_id, lines>) and
  //    `singleModeBudget` (ForecastLineLike[] | null) — exactly one of them
  //    will be non-empty per run. The universe builder consumes both.
  const budgetMode: 'single' | 'per_tenant' = business.consolidation_budget_mode

  let budgetsByTenant = new Map<string, ForecastLineLike[]>()
  let singleModeBudget: ForecastLineLike[] | null = null
  let singleBudgetFound = false
  let fallbackFired = false

  if (budgetMode === 'single') {
    // Single mode: one forecast drives consolidated.budgetLines. Tests can
    // inject singleBusinessBudget; otherwise the engine loads it.
    const loaded =
      opts.singleBusinessBudget !== undefined
        ? opts.singleBusinessBudget
        : await loadSingleBusinessBudget(supabase, opts.businessId, opts.fiscalYear)
    singleModeBudget = loaded
    singleBudgetFound = loaded !== null && loaded.length > 0
  } else {
    // Per-tenant mode: each tenant has its own forecast.
    budgetsByTenant = opts.tenantBudgets
      ?? (await loadTenantBudgets(supabase, opts.businessId, tenants, opts.fiscalYear))

    // Legacy fallback: if NO tenants have a tenant-scoped forecast, fall
    // back to the business-level (tenant_id IS NULL) forecast. This keeps
    // pre-34-step2 installs working — they have one legacy forecast and
    // mode defaulted to 'per_tenant' would otherwise render zero budgets.
    if (budgetsByTenant.size === 0) {
      const fallback =
        opts.singleBusinessBudget !== undefined
          ? opts.singleBusinessBudget
          : await loadSingleBusinessBudget(supabase, opts.businessId, opts.fiscalYear)
      if (fallback && fallback.length > 0) {
        singleModeBudget = fallback
        fallbackFired = true
      }
    }
  }

  // 6. Build universe — include budget accounts so budget-only rows render.
  //    The consolidation account universe is the union of actuals + budget
  //    accounts across all tenants. This is critical: a fully-forecasted
  //    account with no actuals this fiscal year still needs a row so the
  //    variance = 0 - budget can be computed and shown.
  const budgetLinesForUniverse: XeroPLLineLike[][] = []
  for (const tenant of tenants) {
    const raw = budgetsByTenant.get(tenant.tenant_id)
    if (!raw) continue
    budgetLinesForUniverse.push(
      raw.map((r) => ({
        business_id: '',
        tenant_id: tenant.tenant_id,
        account_name: r.account_name,
        account_code: null,
        account_type: r.account_type,
        section: '',
        monthly_values: r.monthly_values,
      })),
    )
  }
  if (singleModeBudget && singleModeBudget.length > 0) {
    // Single-mode (or fallback) budget also contributes accounts to the universe.
    budgetLinesForUniverse.push(
      singleModeBudget.map((r) => ({
        business_id: '',
        tenant_id: null,
        account_name: r.account_name,
        account_code: null,
        account_type: r.account_type,
        section: '',
        monthly_values: r.monthly_values,
      })),
    )
  }
  const universe = buildAlignedAccountUniverse([
    ...translated.map((t) => t.lines),
    ...budgetLinesForUniverse,
  ])

  // 7. Per-tenant actual columns aligned to the universe
  const byTenantActuals = translated.map((t) =>
    buildEntityColumn(t.tenant, t.lines, universe, opts.fyMonths),
  )

  // 8. Per-tenant budget columns aligned to the universe.
  //    - 'single' mode: all columns null (no per-tenant budget by design).
  //    - 'per_tenant' mode: build per-tenant columns normally. When the
  //      legacy fallback fired, per-tenant budgetLines stay undefined — the
  //      consolidated column will carry the business-level forecast instead.
  const budgetColumns =
    budgetMode === 'per_tenant' && !fallbackFired
      ? buildTenantBudgetColumns(tenants, budgetsByTenant, universe, opts.fyMonths)
      : tenants.map(() => null as null | { tenantId: string; lines: ForecastLineLike[] })

  // Stitch budget columns onto byTenant so the API/UI get one cohesive object.
  const byTenant: EntityColumn[] = byTenantActuals.map((col, idx) => {
    const budget = budgetColumns[idx]
    if (budget) {
      return { ...col, budgetLines: budget.lines }
    }
    return col
  })

  // Budget-coverage diagnostics differ per mode:
  //   - 'single': tenants_with_budget is always 0 (per-tenant cols unused);
  //     `tenants_without_budget` stays empty (it's not meaningful in this mode).
  //   - 'per_tenant': count non-null columns; list tenants without a forecast.
  //     When the legacy fallback fired, all tenants are flagged as "without"
  //     because the budget sits at the business level.
  const tenantsWithBudget =
    budgetMode === 'per_tenant' ? budgetColumns.filter((b) => b !== null).length : 0
  const tenantsWithoutBudget =
    budgetMode === 'per_tenant'
      ? tenants.filter((t) => !budgetsByTenant.has(t.tenant_id)).map((t) => t.tenant_id)
      : []

  // 9. Elimination application — business-scoped rules, filter BS-only (intercompany_loan)
  const allRules = await loadEliminationRulesForBusiness(supabase, opts.businessId)
  const plRules = allRules.filter((r) => r.rule_type !== 'intercompany_loan')
  const eliminations = applyEliminations(plRules, byTenant, opts.reportMonth)

  // 10. Combine actuals (with eliminations) and budgets.
  //     Budget combination branches on mode:
  //       - 'single'     → align the business-level budget (or zeros) to the universe.
  //       - 'per_tenant' → sum per-tenant budget columns; when the fallback
  //                        fired, fall back to the business-level budget too.
  const consolidatedActuals = combineTenants(
    byTenant,
    universe,
    eliminations,
    opts.fyMonths,
    opts.reportMonth,
  )

  let consolidatedBudget: ConsolidatedLine[]
  if (singleModeBudget && singleModeBudget.length > 0) {
    consolidatedBudget = alignBudgetToUniverse(singleModeBudget, universe, opts.fyMonths)
  } else if (budgetMode === 'per_tenant') {
    consolidatedBudget = combineTenantBudgets(budgetColumns, universe, opts.fyMonths)
  } else {
    // Single mode with no forecast found → zero-filled universe.
    consolidatedBudget = alignBudgetToUniverse([], universe, opts.fyMonths)
  }

  const totalLines = deduped.reduce((acc, d) => acc + d.lines.length, 0)

  return {
    business,
    byTenant,
    eliminations,
    consolidated: {
      lines: consolidatedActuals.lines,
      budgetLines: consolidatedBudget,
    },
    fx_context: { rates_used: fxRatesUsed, missing_rates: fxMissing },
    diagnostics: {
      tenants_loaded: tenants.length,
      total_lines_processed: totalLines,
      eliminations_applied_count: eliminations.length,
      eliminations_total_amount: eliminations.reduce((acc, e) => acc + Math.abs(e.amount), 0),
      processing_ms: Date.now() - startedAt,
      tenants_with_budget: tenantsWithBudget,
      tenants_without_budget: tenantsWithoutBudget,
      budget_mode: budgetMode,
      // Only surface single_budget_found in 'single' mode. In 'per_tenant'
      // mode the flag isn't meaningful (even if the fallback fired).
      ...(budgetMode === 'single' ? { single_budget_found: singleBudgetFound } : {}),
    },
  }
}
