/**
 * Which cashflow the monthly-report page builds: v1, or cash model v2 through
 * /api/monthly-report/cash-model.
 *
 * The first cut asked the route for EVERY client and read any failure — a
 * 500 from the business-id resolver, a settings read error, an auth hiccup —
 * as a refusal. So one bad response replaced the v1 cashflow pages of all
 * eighteen clients with "the cash model settings could not be checked",
 * although none of them had turned v2 on, and the preflight skipped.
 *
 * The page already holds the business's monthly_report_settings row
 * (GET /api/monthly-report/settings selects every column, cash_model
 * included once the migration is applied). Its cash_model decides:
 *
 *   absent, null, enabled: false  → 'off': v1, and the route is never called
 *   anything else                 → the route; a failed lookup is a refusal,
 *                                   never v1 in its place — the coach turned
 *                                   v2 on, and a page quietly built the old
 *                                   way would pass for the new one
 *
 * Pure apart from the fetcher it is handed.
 */
import { parseCashModelConfig } from './cash-model-config'
import type { CashModelLoadResult } from './pack-cash-model-load'

export const CASH_MODEL_LOOKUP_FAILED = 'the cash model settings could not be checked (a system error — nothing was changed)'

export async function resolvePageCashModel(
  settingsCashModel: unknown,
  fetchRoute: () => Promise<CashModelLoadResult | null>,
): Promise<CashModelLoadResult> {
  if (parseCashModelConfig(settingsCashModel).status === 'off') return { status: 'off' }
  try {
    const answer = await fetchRoute()
    if (answer && (answer.status === 'off' || answer.status === 'refused' || answer.status === 'ready')) return answer
  } catch {
    // The fetcher reports its own failure; the answer is the refusal below.
  }
  return { status: 'refused', reason: CASH_MODEL_LOOKUP_FAILED }
}
