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
  /**
   * The figures the statement prints for this line, carried so the commentary's
   * ratio is a share of the same numbers rather than a second derivation. The
   * report's budget has already been through the resolver, the effective-date
   * stitching and the account-code matching; re-deriving it downstream is a
   * second answer waiting to disagree with the first.
   *
   * `budget` is null when the report has no budget at all — distinct from a
   * budget that is genuinely zero, which is a real plan of nothing.
   */
  actual: number
  budget: number | null
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

// WD.3 — FX excluded from commentary (house rule). Currency gains/losses are
// accounting noise to a non-numbers owner, swing past $500 constantly on
// multi-currency clients (IICT), and nobody can "manage" them month to month.
const FX_KEYWORDS = [
  'currency gain', 'currency loss', 'exchange gain', 'exchange loss',
  'realised gain', 'realised loss', 'unrealised gain', 'unrealised loss',
  'realized gain', 'realized loss', 'unrealized gain', 'unrealized loss',
  'fx gain', 'fx loss', 'foreign exchange', 'foreign currency',
]

export function isFxAccount(accountName: string): boolean {
  const lower = accountName.toLowerCase()
  return FX_KEYWORDS.some(kw => lower.includes(kw))
}

function toTriggerLine(line: ReportLine, reason: TriggerReason, hasBudget = true): TriggerLine {
  return {
    account_name: line.account_name,
    xero_account_name: lineXeroName(line),
    trigger_reason: reason,
    actual: line.actual,
    budget: hasBudget ? line.budget : null,
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
  // A report with no budget still triggers commentary (the favourable and BS
  // rules do not need one), but its lines must carry budget: null rather than
  // the 0 the shape defaults to — downstream a 0 is a plan, an absence is not.
  const hasBudget = report.has_budget !== false

  for (const section of report.sections) {
    const category = section.category as string

    if (EXPENSE_CATEGORIES.has(category)) {
      for (const line of section.lines) {
        if (line.is_budget_only) continue
        // WD.3 house rule: FX never fires commentary.
        if (isFxAccount(line.account_name)) continue

        // (1) Expense over-budget — existing trigger, unchanged
        if (line.variance_amount <= -EXPENSE_OVER_DOLLAR) {
          expense_lines.push(toTriggerLine(line, 'expense_over_budget_dollar', hasBudget))
          continue // mutually exclusive with favourable on the same row
        }

        // (3) Favourable expense — both dollar AND percent thresholds required
        if (line.variance_amount >= FAVOURABLE_EXPENSE_DOLLAR && line.budget > 0) {
          const pct = line.variance_amount / line.budget
          if (pct >= FAVOURABLE_EXPENSE_PCT) {
            favourable_expense_lines.push(
              toTriggerLine(line, 'expense_favourable_significant', hasBudget),
            )
          }
        }
      }
    } else if (REVENUE_CATEGORIES.has(category)) {
      for (const line of section.lines) {
        if (line.is_budget_only) continue
        // WD.3 house rule: FX never fires commentary (FX gains sit in Other
        // Income on multi-currency clients).
        if (isFxAccount(line.account_name)) continue

        // (2) Revenue under-budget — shortfall ≥ $500 OR ≥ 10% of budget
        //
        // The sign is the opposite of what this used to assume, and the comment
        // that asserted otherwise is why it went unnoticed. calcVariance
        // (src/lib/monthly-report/shared.ts:46) writes
        //   amount = isRevenue ? actual - budget : budget - actual
        // so a POSITIVE variance on a revenue line is a BEAT, not a shortfall.
        // Reading it the other way fired commentary on every revenue account
        // that did well and on none that missed: Urban Road's August tagged
        // NZ Sales (+$48,338) "under budget" while Framed Prints (-$9,043),
        // USA Sales (-$6,678) and Shipping (-$5,421) triggered nothing.
        const shortfall = -line.variance_amount
        if (shortfall <= 0) continue // revenue beat / met budget — not a trigger

        const dollarFires = shortfall >= REVENUE_SHORTFALL_DOLLAR
        if (dollarFires) {
          revenue_lines.push(toTriggerLine(line, 'revenue_under_budget_dollar', hasBudget))
          continue
        }

        if (line.budget > 0) {
          const pct = shortfall / line.budget
          if (pct >= REVENUE_SHORTFALL_PCT) {
            revenue_lines.push(toTriggerLine(line, 'revenue_under_budget_percent', hasBudget))
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
    // A balance sheet is not budgeted, so `budget` is null rather than 0 — the
    // difference between "no plan exists" and "the plan was nothing". A BS row
    // never earns a ratio clause for the same reason.
    actual: row.current ?? 0,
    budget: null,
  }
}
