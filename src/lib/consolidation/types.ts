/**
 * Phase 34 — Multi-Entity Consolidation Domain Types
 *
 * These interfaces form the type backbone for the consolidation engine,
 * FX translation helpers, elimination matcher, reference fixtures, and the
 * consolidated API route.
 *
 * Conventions:
 * - `currency_pair` uses a slash separator ('HKD/AUD') per PATTERNS.md.
 *   DO NOT use underscore — app-layer regex (/^[A-Z]{3}\/[A-Z]{3}$/) and
 *   db values both expect slash. Mixing formats silently returns no matches.
 * - `account_type` values are lowercase: 'revenue' | 'cogs' | 'opex' |
 *   'other_income' | 'other_expense' (matches xero_pl_lines).
 * - Account alignment key (used by engine): `${account_type}::${account_name.toLowerCase().trim()}`.
 * - Amounts are numbers (JS Number). No currency-precision helpers in 34.0 —
 *   fx rounding uses standard JS multiplication.
 */

// Shape of xero_pl_lines rows as consumed by the consolidation engine.
// Mirrors src/app/api/monthly-report/generate/route.ts:244-265.
export interface XeroPLLineLike {
  business_id: string
  account_name: string
  account_code?: string | null
  account_type: string // 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'
  section: string
  monthly_values: Record<string, number> // 'YYYY-MM' → amount
}

// consolidation_groups row
export interface ConsolidationGroup {
  id: string
  name: string
  business_id: string
  presentation_currency: string // 'AUD' for both Dragon + IICT in 34.0
}

// consolidation_group_members row
export interface ConsolidationMember {
  id: string
  group_id: string
  source_business_id: string
  display_name: string
  display_order: number
  functional_currency: string // 'AUD' or 'HKD' for IICT Group Limited
}

// consolidation_elimination_rules row
export interface EliminationRule {
  id: string
  group_id: string
  rule_type: 'account_pair' | 'account_category' | 'intercompany_loan'
  entity_a_business_id: string
  entity_a_account_code: string | null
  entity_a_account_name_pattern: string | null
  entity_b_business_id: string
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
  source_entity_id: string
  source_amount: number
}

// fx_rates row (manual-only in 34.0 — no rba source yet)
export interface FxRateRow {
  currency_pair: string // 'HKD/AUD' (slash, NOT underscore)
  rate_type: 'monthly_average' | 'closing_spot'
  period: string // 'YYYY-MM-01' for monthly_average, 'YYYY-MM-<last>' for closing_spot
  rate: number // e.g. 0.1925 for HKD/AUD
  source: 'manual' | 'rba'
}

// Per-entity column in the consolidated P&L response.
export interface EntityColumn {
  member_id: string
  business_id: string
  display_name: string
  display_order: number
  functional_currency: string
  lines: XeroPLLineLike[] // post-translation (in presentation_currency)
}

// Full consolidated API response shape.
export interface ConsolidatedReport {
  group: ConsolidationGroup
  byEntity: EntityColumn[]
  eliminations: EliminationEntry[]
  consolidated: {
    lines: {
      account_type: string
      account_name: string
      monthly_values: Record<string, number>
    }[]
  }
  fx_context: {
    rates_used: Record<string, number> // e.g. { 'HKD/AUD::2026-03': 0.1925 }
    missing_rates: { currency_pair: string; period: string }[]
  }
  diagnostics: {
    members_loaded: number
    total_lines_processed: number
    eliminations_applied_count: number
    eliminations_total_amount: number
    processing_ms: number
  }
}
