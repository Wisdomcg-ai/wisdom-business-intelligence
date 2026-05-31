/**
 * Phase 71-04 — S1 commentary trigger expansion (pure helper)
 *
 * Collects the 4 trigger types that should fire a commentary row:
 *
 *   1. Expense over-budget        — variance_amount ≤ -$500              (existing rule, preserved)
 *   2. Revenue under-budget       — shortfall ≥ $500 OR ≥ 10% of budget  (whichever fires)
 *   3. Favourable expense swing   — variance ≥ $500 AND ≥ 20% of budget  (both required)
 *   4. Balance-sheet movement     — |MoM change| ≥ $5,000 OR ≥ 10% of opening
 *
 * Each emitted line carries a `trigger_reason` so the commentary route + UI
 * know WHY the row surfaced. The same account never appears in more than one
 * bucket (expense / revenue / favourable are mutually exclusive by category +
 * variance sign; BS lives in its own dimension).
 *
 * Convention follows `ReportLine.variance_amount = budget - actual`:
 *   - Expense over-budget (bad)  → variance_amount NEGATIVE
 *   - Expense favourable (good)  → variance_amount POSITIVE
 *   - Revenue shortfall (bad)    → variance_amount POSITIVE (budget > actual)
 *     [revenue shortfall = budget - actual, which is the same sign convention]
 */

import type { GeneratedReport, ReportLine, BalanceSheetData, BalanceSheetRow } from '../types'

// ─── Public types ───────────────────────────────────────────────────────────

export type TriggerReason =
  | 'expense_over_budget_dollar'
  | 'revenue_under_budget_dollar'
  | 'revenue_under_budget_percent'
  | 'expense_favourable_significant'
  | 'bs_movement_dollar'
  | 'bs_movement_percent'

export interface TriggerLine {
  account_name: string
  xero_account_name: string
  trigger_reason: TriggerReason
}

export interface TriggerPayload {
  expense_lines: TriggerLine[]
  revenue_lines: TriggerLine[]
  favourable_expense_lines: TriggerLine[]
  bs_lines: TriggerLine[]
}

// ─── Thresholds (locked per CONTEXT D-S1) ──────────────────────────────────

const EXPENSE_OVER_DOLLAR = 500            // existing rule — unchanged
const REVENUE_SHORTFALL_DOLLAR = 500
const REVENUE_SHORTFALL_PCT = 0.10
const FAVOURABLE_EXPENSE_DOLLAR = 500
const FAVOURABLE_EXPENSE_PCT = 0.20
const BS_MOVEMENT_DOLLAR = 5000
const BS_MOVEMENT_PCT = 0.10

const EXPENSE_CATEGORIES = new Set(['Cost of Sales', 'Operating Expenses', 'Other Expenses'])
const REVENUE_CATEGORIES = new Set(['Revenue', 'Other Income'])

// BS row types that represent real account lines (not headers/subtotals).
// We never want to flag a "Total Assets" subtotal as a movement-worthy row.
const BS_LEAF_TYPES = new Set(['line_item'])

// ─── Helpers ────────────────────────────────────────────────────────────────

function lineXeroName(line: ReportLine): string {
  return line.xero_account_name || line.account_name
}

function toTriggerLine(line: ReportLine, reason: TriggerReason): TriggerLine {
  return {
    account_name: line.account_name,
    xero_account_name: lineXeroName(line),
    trigger_reason: reason,
  }
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export function collectCommentaryTriggers(
  report: GeneratedReport,
  balanceSheet?: BalanceSheetData | null,
): TriggerPayload {
  const expense_lines: TriggerLine[] = []
  const revenue_lines: TriggerLine[] = []
  const favourable_expense_lines: TriggerLine[] = []
  const bs_lines: TriggerLine[] = []

  for (const section of report.sections) {
    const category = section.category as string

    if (EXPENSE_CATEGORIES.has(category)) {
      for (const line of section.lines) {
        if (line.is_budget_only) continue

        // (1) Expense over-budget — existing trigger, unchanged
        if (line.variance_amount <= -EXPENSE_OVER_DOLLAR) {
          expense_lines.push(toTriggerLine(line, 'expense_over_budget_dollar'))
          continue // mutually exclusive with favourable on the same row
        }

        // (3) Favourable expense — both dollar AND percent thresholds required
        if (line.variance_amount >= FAVOURABLE_EXPENSE_DOLLAR && line.budget > 0) {
          const pct = line.variance_amount / line.budget
          if (pct >= FAVOURABLE_EXPENSE_PCT) {
            favourable_expense_lines.push(
              toTriggerLine(line, 'expense_favourable_significant'),
            )
          }
        }
      }
    } else if (REVENUE_CATEGORIES.has(category)) {
      for (const line of section.lines) {
        if (line.is_budget_only) continue

        // (2) Revenue under-budget — shortfall ≥ $500 OR ≥ 10% of budget
        // Convention: variance_amount = budget - actual. POSITIVE variance on
        // a revenue line means actual < budget (a shortfall).
        const shortfall = line.variance_amount
        if (shortfall <= 0) continue // revenue beat / met budget — not a trigger

        const dollarFires = shortfall >= REVENUE_SHORTFALL_DOLLAR
        if (dollarFires) {
          revenue_lines.push(toTriggerLine(line, 'revenue_under_budget_dollar'))
          continue
        }

        if (line.budget > 0) {
          const pct = shortfall / line.budget
          if (pct >= REVENUE_SHORTFALL_PCT) {
            revenue_lines.push(toTriggerLine(line, 'revenue_under_budget_percent'))
          }
        }
      }
    }
    // Other categories (e.g. Other Income subtotals or unknown) silently skipped.
  }

  // (4) Balance-sheet movements
  if (balanceSheet && Array.isArray(balanceSheet.rows)) {
    for (const row of balanceSheet.rows) {
      if (!BS_LEAF_TYPES.has(row.type)) continue
      if (row.current == null || row.prior == null) continue

      const momChange = row.current - row.prior
      const absChange = Math.abs(momChange)
      if (absChange === 0) continue

      if (absChange >= BS_MOVEMENT_DOLLAR) {
        bs_lines.push(bsToTriggerLine(row, 'bs_movement_dollar'))
        continue
      }

      const openingAbs = Math.abs(row.prior)
      if (openingAbs > 0 && absChange / openingAbs >= BS_MOVEMENT_PCT) {
        bs_lines.push(bsToTriggerLine(row, 'bs_movement_percent'))
      }
    }
  }

  return { expense_lines, revenue_lines, favourable_expense_lines, bs_lines }
}

function bsToTriggerLine(row: BalanceSheetRow, reason: TriggerReason): TriggerLine {
  return {
    account_name: row.label,
    xero_account_name: row.label,
    trigger_reason: reason,
  }
}
