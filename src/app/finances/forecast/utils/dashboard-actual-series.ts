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
 */
export function deriveActualSeries(
  totals: PlanTotals,
  xeroMonths: DashboardActualMonth[] | null | undefined,
): ActualSeries {
  const fallback: ActualSeries = {
    revenue: totals.revenue,
    grossProfit: totals.grossProfit,
    netProfit: totals.netProfit,
    dataLastActualIndex: totals.dataLastActualIndex,
    fromXero: false,
  }
  if (!xeroMonths || xeroMonths.length === 0) return fallback

  const n = totals.revenue.length
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
