/**
 * Canonical 5-bucket P&L net profit helper.
 *
 * The single source of truth for "given these bucket totals, what is net
 * profit?". Use this in any export, dashboard, summary, or AI insight that
 * needs to derive net profit from already-aggregated bucket sums.
 *
 * The forecast wizard has its own per-year calculator that subtracts more
 * granular items (team costs, depreciation, investments, user-entered
 * one-off expenses); it doesn't use this helper directly because its inputs
 * aren't pre-aggregated 5-bucket numbers. If you find yourself reaching for
 * this helper inside the wizard, refactor with care.
 */

export type PLBuckets = {
  revenue: number
  cogs: number
  opex: number
  otherIncome?: number
  otherExpense?: number
}

/**
 * Net profit = revenue − cogs − opex + other_income − other_expense.
 *
 * Mirrors the formula used by ForecastReadService.calculateNetProfit (the
 * canonical read-side computation) and historical-pl-summary.ts.
 *
 * Optional fields default to 0 — convenient for callers that don't yet
 * have the full 5-bucket breakdown (e.g. simplified forecast exports), so
 * they can adopt the helper without immediate data-flow changes.
 */
export function netProfitFromBuckets(b: PLBuckets): number {
  return b.revenue - b.cogs - b.opex + (b.otherIncome ?? 0) - (b.otherExpense ?? 0)
}
