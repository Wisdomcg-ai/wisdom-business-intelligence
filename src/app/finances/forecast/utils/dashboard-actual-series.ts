/**
 * Which months of the dashboard are ACTUAL, and what those actuals are.
 *
 * `forecast_pl_lines.actual_months` has not been populated since Phase 44 —
 * the sync route that used to copy Xero actuals into it was deliberately
 * retired, and nothing replaced it. Every forecast generated since then has
 * empty actual_months, so the Overview KPI strip read YTD $0 and showed the
 * FIRST month of the year as "this month" (Urban Road, 8 Sep 2026: $1.14M of
 * July–September actuals in Xero, $0 on the card). The trajectory chart on the
 * same screen was right all along because /api/forecast/dashboard-actuals
 * supplements actuals straight from xero_pl_lines.
 *
 * This derives the strip's series from that same API response, so the two
 * halves of the dashboard answer "how are we tracking" identically.
 *
 * One rule the API response does NOT carry: only a CLOSED month is an actual.
 * xero_pl_lines holds the month in progress too, and on 8 Sep 2026 Urban Road's
 * September was eight days old — $111k of revenue against a $450k month, with
 * most of its bills not yet entered. Counted as a third actual it read
 * "Behind, 76% of plan" for a client running +0.4% on the two closed months,
 * and pulled the year-end projection $334k under. So the caller passes the
 * calendar cutoff (getExpectedLastActualIndex) and everything after it keeps
 * the plan.
 */

/** One month of /api/forecast/dashboard-actuals, in fiscal-year order. */
export interface DashboardActualMonth {
  month: string
  revenueActual: number | null
  gpActual: number | null
  npActual: number | null
}

export interface ActualSeries {
  /** Actual where Xero has it, plan elsewhere — the "where we'll land" series. */
  revenue: number[]
  grossProfit: number[]
  netProfit: number[]
  /** Index of the last month with actuals, or -1 when there are none. */
  dataLastActualIndex: number
  /** True when the Xero-supplemented actuals were used. */
  fromXero: boolean
}

interface PlanTotals {
  revenue: number[]
  grossProfit: number[]
  netProfit: number[]
  dataLastActualIndex: number
}

/**
 * Overlay Xero actuals on the plan series.
 *
 * A month counts as actual only when Xero reports revenue for it: the API
 * returns null (not 0) for months it has no data for, so a genuinely $0 month
 * and a missing month stay distinguishable. Months after the last actual keep
 * the plan, which is what makes the year-end figure "actuals so far + plan for
 * the rest" rather than a pure plan.
 *
 * With no usable Xero data the caller's existing totals are returned untouched,
 * so a failed or empty fetch degrades to today's behaviour instead of zeros.
 *
 * `lastClosedIndex` is the last month whose calendar month-end has passed
 * (`getExpectedLastActualIndex`). Xero data beyond it belongs to the month in
 * progress and is ignored — a part month is not an actual. Omit it and no cap
 * is applied; -1 caps everything out, which is right for a future FY.
 */
export function deriveActualSeries(
  totals: PlanTotals,
  xeroMonths: DashboardActualMonth[] | null | undefined,
  lastClosedIndex: number = Number.POSITIVE_INFINITY,
): ActualSeries {
  const fallback: ActualSeries = {
    revenue: totals.revenue,
    grossProfit: totals.grossProfit,
    netProfit: totals.netProfit,
    dataLastActualIndex: totals.dataLastActualIndex,
    fromXero: false,
  }
  if (!xeroMonths || xeroMonths.length === 0) return fallback

  const n = Math.min(totals.revenue.length, lastClosedIndex + 1)
  let lastActual = -1
  for (let i = 0; i < Math.min(n, xeroMonths.length); i += 1) {
    if (xeroMonths[i]?.revenueActual != null) lastActual = i
  }
  if (lastActual < 0) return fallback

  const pick = (planSeries: number[], key: 'revenueActual' | 'gpActual' | 'npActual') =>
    planSeries.map((planValue, i) => {
      if (i > lastActual) return planValue
      const actual = xeroMonths[i]?.[key]
      // Within the actual window a null for GP/NP means "nothing booked", which
      // is a real 0 — the month is known to be actual because revenue is there.
      return actual != null ? actual : (xeroMonths[i]?.revenueActual != null ? 0 : planValue)
    })

  return {
    revenue: pick(totals.revenue, 'revenueActual'),
    grossProfit: pick(totals.grossProfit, 'gpActual'),
    netProfit: pick(totals.netProfit, 'npActual'),
    dataLastActualIndex: lastActual,
    fromXero: true,
  }
}
