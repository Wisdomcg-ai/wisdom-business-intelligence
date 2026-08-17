/**
 * Subscription budget-vs-actual variance intelligence — phases 2+3 of the
 * 18 Aug 2026 CFO plan. Pure functions so the arithmetic that lands in a
 * client's leakage report is testable directly.
 *
 * The structural rule (from the CFO review): the P&L FORECAST smooths annual
 * subscriptions to 1/12; the VARIANCE report must not. A $12k renewal hitting
 * February against a smoothed $1k budget reads as an $11k blowout — and eleven
 * months of phantom "savings" — which trains people to ignore the report, and
 * an ignored variance report is how leakage survives. Budget-by-month here is
 * therefore LUMPY: the renewal month carries the whole annual amount.
 */

export interface BudgetRowForVariance {
  vendor_key: string
  vendor_name: string
  /** Smoothed monthly figure as stored on subscription_budgets. */
  monthly_budget: number
  frequency?: 'monthly' | 'quarterly' | 'annual' | 'ad-hoc' | null
  /** Calendar month 1-12 for annual subs; null otherwise. */
  renewal_month?: number | null
}

/**
 * What this vendor is EXPECTED to bill in the given report month.
 *
 *  - annual + known renewal month: 12 × the smoothed figure in that month,
 *    $0 in the other eleven — cash rhythm, not P&L smoothing.
 *  - annual with UNKNOWN renewal month: smoothed. Wrong in two months a year,
 *    but the honest fallback until the renewal month is set.
 *  - quarterly: smoothed — the quarter phase isn't stored, so a lumpy guess
 *    would be wrong two months in three. Excluded from lapse-flagging for the
 *    same reason.
 *  - monthly / ad-hoc: the smoothed figure.
 */
export function expectedMonthlyBudget(row: BudgetRowForVariance, reportMonth: string): number {
  const monthNum = parseInt(reportMonth.slice(5, 7), 10)
  if (row.frequency === 'annual' && row.renewal_month) {
    return row.renewal_month === monthNum ? row.monthly_budget * 12 : 0
  }
  return row.monthly_budget
}

export interface VendorActualForVariance {
  vendor_key: string
  vendor_name: string
  actual: number
  /** Bank-transaction lines behind `actual` — 0 means budget-backfill only. */
  transaction_count: number
}

export interface LeakageLine {
  vendor_key: string
  vendor_name: string
  actual: number
  expected: number
  delta: number
}

export interface LeakageSummary {
  /** Vendors billing this month with NO budget row — the biggest SME leak. */
  new_unbudgeted: LeakageLine[]
  /** Monthly vendors billing materially above their budget. */
  price_rises: LeakageLine[]
  /** Monthly vendors with a budget and NO billing this month — possibly
   *  cancelled but still budgeted (the inverse leak: overstated budget masks
   *  overspend elsewhere). */
  lapsed_still_budgeted: LeakageLine[]
  totals: { new_unbudgeted: number; price_rises: number; lapsed_still_budgeted: number }
}

/** A price rise must clear BOTH gates: ≥10% above budget AND ≥$10 — cents of
 *  FX drift on a $3 sub is not a finding. */
const PRICE_RISE_MIN_RATIO = 1.1
const PRICE_RISE_MIN_DOLLARS = 10

export function classifyLeakage(
  actuals: VendorActualForVariance[],
  budgets: BudgetRowForVariance[],
  reportMonth: string,
): LeakageSummary {
  const budgetByKey = new Map(budgets.map((b) => [b.vendor_key, b]))
  const actualByKey = new Map(actuals.map((a) => [a.vendor_key, a]))

  const new_unbudgeted: LeakageLine[] = []
  const price_rises: LeakageLine[] = []
  const lapsed_still_budgeted: LeakageLine[] = []

  for (const a of actuals) {
    if (a.actual <= 0) continue
    const b = budgetByKey.get(a.vendor_key)
    if (!b) {
      new_unbudgeted.push({
        vendor_key: a.vendor_key,
        vendor_name: a.vendor_name,
        actual: a.actual,
        expected: 0,
        delta: a.actual,
      })
      continue
    }
    // Price-rise detection only where the cadence makes "this month vs the
    // monthly budget" a fair comparison. An annual renewal already compares
    // against its lumpy expected figure; quarterly phase is unknown.
    if ((b.frequency ?? 'monthly') !== 'monthly') continue
    const expected = expectedMonthlyBudget(b, reportMonth)
    if (expected > 0 && a.actual >= expected * PRICE_RISE_MIN_RATIO && a.actual - expected >= PRICE_RISE_MIN_DOLLARS) {
      price_rises.push({
        vendor_key: a.vendor_key,
        vendor_name: a.vendor_name,
        actual: a.actual,
        expected,
        delta: a.actual - expected,
      })
    }
  }

  for (const b of budgets) {
    // Only monthly cadence can be "lapsed" on a one-month view: an annual or
    // quarterly vendor legitimately bills nothing most months.
    if ((b.frequency ?? 'monthly') !== 'monthly') continue
    if (b.monthly_budget <= 0) continue
    const a = actualByKey.get(b.vendor_key)
    if (!a || a.transaction_count === 0) {
      lapsed_still_budgeted.push({
        vendor_key: b.vendor_key,
        vendor_name: b.vendor_name,
        actual: 0,
        expected: b.monthly_budget,
        delta: -b.monthly_budget,
      })
    }
  }

  const sum = (xs: LeakageLine[]) => Math.round(xs.reduce((s, x) => s + Math.abs(x.delta), 0) * 100) / 100
  const byImpact = (xs: LeakageLine[]) => [...xs].sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta))

  return {
    new_unbudgeted: byImpact(new_unbudgeted),
    price_rises: byImpact(price_rises),
    lapsed_still_budgeted: byImpact(lapsed_still_budgeted),
    totals: {
      new_unbudgeted: sum(new_unbudgeted),
      price_rises: sum(price_rises),
      lapsed_still_budgeted: sum(lapsed_still_budgeted),
    },
  }
}

// ── Phase 2: vendor × month actuals persistence ──

export interface VendorMonthActualRow {
  business_id: string
  tenant_id: string
  vendor_key: string
  vendor_name: string
  /** 'YYYY-MM' */
  month: string
  amount: number
  source: 'analyze' | 'report'
}

/**
 * Collapse a vendor's raw transactions into per-tenant per-month rows for
 * `subscription_vendor_actuals`. The wizard's analyze crawl computes exactly
 * this and used to throw it away — persisting it is what makes month-on-month
 * price-creep and lapse HISTORY queryable instead of re-crawling Xero.
 */
export function aggregateVendorMonthActuals(
  businessId: string,
  vendorKey: string,
  vendorName: string,
  transactions: { date: string; amount: number; tenantId: string }[],
  source: VendorMonthActualRow['source'] = 'analyze',
): VendorMonthActualRow[] {
  const byTenantMonth = new Map<string, number>()
  for (const tx of transactions) {
    if (!tx.date || tx.date.length < 7) continue
    const key = `${tx.tenantId}|${tx.date.slice(0, 7)}`
    byTenantMonth.set(key, (byTenantMonth.get(key) ?? 0) + tx.amount)
  }
  const rows: VendorMonthActualRow[] = []
  for (const [key, amount] of byTenantMonth) {
    const [tenant_id, month] = key.split('|')
    rows.push({
      business_id: businessId,
      tenant_id,
      vendor_key: vendorKey,
      vendor_name: vendorName,
      month,
      amount: Math.round(amount * 100) / 100,
      source,
    })
  }
  return rows
}
