/**
 * Phase 34 — Multi-Entity Consolidation Domain Types (Tenant Model)
 *
 * Pivoted 2026-04-18 from "multiple businesses linked by group" to
 * "one business, multiple Xero tenants". Each xero_connections row IS a tenant.
 *
 * Conventions:
 * - `currency_pair` uses a slash separator ('HKD/AUD').
 *   App-layer regex (/^[A-Z]{3}\/[A-Z]{3}$/) and DB values both expect slash.
 * - `account_type` values are lowercase: 'revenue' | 'cogs' | 'opex' |
 *   'other_income' | 'other_expense' (matches xero_pl_lines).
 * - Account alignment key: `${account_type}::${account_name.toLowerCase().trim()}`.
 * - Tenant identity = xero_connections.tenant_id (TEXT from Xero).
 */

// Shape of xero_pl_lines rows as consumed by the consolidation engine.
// tenant_id is REQUIRED for consolidation queries (nullable in DB for legacy rows).
export interface XeroPLLineLike {
  business_id: string
  tenant_id: string | null
  account_name: string
  account_code?: string | null
  account_type: string
  section: string
  monthly_values: Record<string, number> // 'YYYY-MM' → amount
}

// Parent business context (from businesses table).
export interface ConsolidationBusiness {
  id: string
  name: string
  presentation_currency: string // always 'AUD' for now
  /**
   * Hybrid budget mode (Phase 34 Step 2):
   *   - 'single'     → ONE business-level forecast (tenant_id IS NULL) feeds
   *                    the consolidated Budget column. Per-tenant budget
   *                    columns stay undefined.
   *   - 'per_tenant' → Each tenant has its own forecast; engine sums them into
   *                    the consolidated Budget column. Falls back to the legacy
   *                    tenant_id IS NULL forecast when NO tenant has a
   *                    tenant-scoped forecast (backward compatibility).
   * Defaults to 'single' at the DB layer.
   */
  consolidation_budget_mode: 'single' | 'per_tenant'
}

// One Xero tenant connected to a business (from xero_connections table).
// Replaces the pre-pivot ConsolidationMember.
export interface ConsolidationTenant {
  connection_id: string // xero_connections.id
  business_id: string
  tenant_id: string
  display_name: string
  display_order: number
  functional_currency: string // 'AUD' | 'HKD' | etc
  include_in_consolidation: boolean
}

// consolidation_elimination_rules row (business-scoped, tenant-paired).
export interface EliminationRule {
  id: string
  business_id: string
  rule_type: 'account_pair' | 'account_category' | 'intercompany_loan'
  tenant_a_id: string
  entity_a_account_code: string | null
  entity_a_account_name_pattern: string | null
  tenant_b_id: string
  entity_b_account_code: string | null
  entity_b_account_name_pattern: string | null
  direction: 'bidirectional' | 'entity_a_eliminates' | 'entity_b_eliminates'
  description: string
  active: boolean
}

// One elimination entry produced by the matcher.
// Engine subtracts `amount` from the consolidated total for that account.
export interface EliminationEntry {
  rule_id: string
  rule_description: string
  account_type: string
  account_name: string
  amount: number // negative — reduces consolidated total
  source_tenant_id: string
  source_amount: number
}

// fx_rates row (manual-only in 34.0 — no rba source yet).
export interface FxRateRow {
  currency_pair: string // 'HKD/AUD' (slash)
  rate_type: 'monthly_average' | 'closing_spot'
  period: string // 'YYYY-MM-01' for monthly_average, 'YYYY-MM-<last>' for closing_spot
  rate: number
  source: 'manual' | 'rba'
}

// Shape of forecast_pl_lines rows as consumed by the consolidation engine
// for the budget side. account_type mirrors xero_pl_lines values (lowercase).
// monthly_values merges forecast_months + actual_months (same key space as
// XeroPLLineLike.monthly_values) so the budget column aligns against the
// same account universe as actuals.
export interface ForecastLineLike {
  account_type: string
  account_name: string
  monthly_values: Record<string, number> // 'YYYY-MM' → amount
}

// Per-tenant column in the consolidated P&L response.
export interface EntityColumn {
  connection_id: string
  tenant_id: string
  display_name: string
  display_order: number
  functional_currency: string
  lines: XeroPLLineLike[] // post-translation (in presentation_currency) — ACTUALS
  /**
   * Tenant-scoped budget lines — aligned to the same account universe as
   * `lines` (every universe row appears, absent accounts get zero months).
   * Present iff a tenant-scoped forecast is found for this tenant (or the
   * legacy fallback fires — see engine.ts). Omitted when the tenant has no
   * budget for the requested fiscal year.
   */
  budgetLines?: ForecastLineLike[]
}

// One consolidated line (account-aligned sum across tenants). Used for
// actuals AND for the summed-budget column.
export interface ConsolidatedLine {
  account_type: string
  account_name: string
  monthly_values: Record<string, number>
}

// Full consolidated API response shape.
export interface ConsolidatedReport {
  business: ConsolidationBusiness
  byTenant: EntityColumn[]
  eliminations: EliminationEntry[]
  consolidated: {
    lines: ConsolidatedLine[]
    /**
     * Summed-across-tenants budget (Phase 34.3). Same account universe as
     * `lines`. Empty when no tenant has a budget AND the legacy fallback
     * did not match. NEVER includes eliminations — budgets are aggregated
     * raw; coaches factor inter-co out of their budgeting manually.
     */
    budgetLines: ConsolidatedLine[]
  }
  fx_context: {
    rates_used: Record<string, number>
    missing_rates: { currency_pair: string; period: string }[]
  }
  diagnostics: {
    tenants_loaded: number
    total_lines_processed: number
    eliminations_applied_count: number
    eliminations_total_amount: number
    processing_ms: number
    /** How many tenants had a tenant-scoped forecast (or matched the fallback). */
    tenants_with_budget: number
    /** Tenants for which no budget was found (for UI warnings). */
    tenants_without_budget: string[]
    /**
     * Which budget mode the engine ran in (from businesses.consolidation_budget_mode).
     * Phase 34 Step 2. The UI uses this to hide per-tenant Budget/Variance
     * columns in 'single' mode.
     */
    budget_mode: 'single' | 'per_tenant'
    /**
     * In 'single' mode, whether the business-level (tenant_id IS NULL)
     * forecast was actually found. False = the consolidated Budget column
     * is all zeros until a coach creates a forecast. Absent in 'per_tenant'
     * mode.
     */
    single_budget_found?: boolean
  }
}
