/**
 * The Contractor Analysis page, from vendor detail the platform already pulls.
 *
 * Calxa's version is a Google Sheet tab rolled by hand every month: insert a
 * column, type each contractor's payments off Xero's Account Transactions
 * report, tie the column to the cent, then extend a pivot's source range
 * without touching its value cells. The numbers were always Xero's; the sheet
 * existed because Calxa cannot reach a transaction.
 *
 * Two facts the sheet adds that Xero does not hold:
 *
 *   - WHICH accounts count as contractor spend
 *     → `monthly_report_settings.contractor_account_codes`
 *   - WHICH department a contractor works for
 *     → `subscription_budgets.category`, the row that already carries the
 *       per-vendor budget the same page prints
 *
 * Everything else — who was paid, how much, last month, against what budget —
 * comes from the vendor drill-down that powers the Subscription page, pointed
 * at a different account.
 */

import type { SubscriptionDetailData, SubscriptionVendorLine } from '@/app/finances/monthly-report/types'

export interface ContractorLine {
  vendor_name: string
  vendor_key: string
  /** Null when nobody has said which department this contractor belongs to. */
  category: string | null
  prior_month_actual: number
  actual: number
  budget: number
  /** Budget − actual: an overrun is negative, as everywhere else in the pack. */
  variance: number
}

export interface ContractorCategoryGroup {
  /** Null for the run of contractors with no category. */
  name: string | null
  contractors: ContractorLine[]
  subtotal: { budget: number; actual: number; variance: number }
}

export interface ContractorRollup {
  contractors: ContractorLine[]
  categories: ContractorCategoryGroup[]
  grand_total: { prior_month: number; budget: number; actual: number; variance: number }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * One contractor may be paid out of more than one nominated account, so the
 * accounts are flattened and the same vendor summed across them. Keying on
 * `vendor_key` rather than the display name is what makes "Upwork Global" and
 * "UPWORK GLOBAL" one contractor instead of two half-sized ones.
 */
function flattenVendors(data: SubscriptionDetailData): Map<string, SubscriptionVendorLine> {
  const byKey = new Map<string, SubscriptionVendorLine>()
  for (const account of data.accounts ?? []) {
    for (const v of account.vendors ?? []) {
      const existing = byKey.get(v.vendor_key)
      if (!existing) {
        byKey.set(v.vendor_key, { ...v })
        continue
      }
      existing.prior_month_actual += v.prior_month_actual
      existing.actual += v.actual
      existing.budget += v.budget
      existing.variance = existing.budget - existing.actual
      existing.transaction_count += v.transaction_count
      // The first account that names a department wins; a second account that
      // says nothing must not blank it.
      existing.category = existing.category ?? v.category ?? null
    }
  }
  return byKey
}

/**
 * @param data  the vendor drill-down for the contractor accounts. Each vendor
 *              line carries its own `category` — the route reads it off the
 *              same `subscription_budgets` row it takes the budget from, so
 *              this page needs no second query for it.
 * @param order the coach's category order; categories outside it sort after,
 *              alphabetically, and uncategorised contractors run last
 */
export function rollUpContractors(
  data: SubscriptionDetailData | null | undefined,
  order: readonly string[] | null | undefined = null,
): ContractorRollup {
  const empty: ContractorRollup = {
    contractors: [],
    categories: [],
    grand_total: { prior_month: 0, budget: 0, actual: 0, variance: 0 },
  }
  if (!data) return empty

  const contractors: ContractorLine[] = [...flattenVendors(data).values()]
    .map((v) => ({
      vendor_name: v.vendor_name,
      vendor_key: v.vendor_key,
      category: (v.category ?? null) || null,
      prior_month_actual: round2(v.prior_month_actual),
      actual: round2(v.actual),
      budget: round2(v.budget),
      variance: round2(v.budget - v.actual),
    }))
    // The name is what a coach scans for, and the sheet this replaces is
    // alphabetical. Sorting by spend would move a contractor every month.
    .sort((a, b) => a.vendor_name.localeCompare(b.vendor_name))

  if (contractors.length === 0) return empty

  const buckets = new Map<string, ContractorLine[]>()
  const uncategorised: ContractorLine[] = []
  for (const c of contractors) {
    if (!c.category) { uncategorised.push(c); continue }
    const bucket = buckets.get(c.category)
    if (bucket) bucket.push(c)
    else buckets.set(c.category, [c])
  }

  const declared = (order ?? []).filter((name) => buckets.has(name))
  const undeclared = [...buckets.keys()]
    .filter((name) => !declared.includes(name))
    .sort((a, b) => a.localeCompare(b))

  const groupOf = (name: string | null, lines: ContractorLine[]): ContractorCategoryGroup => {
    const budget = round2(lines.reduce((t, l) => t + l.budget, 0))
    const actual = round2(lines.reduce((t, l) => t + l.actual, 0))
    return { name, contractors: lines, subtotal: { budget, actual, variance: round2(budget - actual) } }
  }

  const categories: ContractorCategoryGroup[] = [...declared, ...undeclared]
    .map((name) => groupOf(name, buckets.get(name)!))
  if (uncategorised.length > 0) categories.push(groupOf(null, uncategorised))

  const budget = round2(contractors.reduce((t, c) => t + c.budget, 0))
  const actual = round2(contractors.reduce((t, c) => t + c.actual, 0))

  return {
    contractors,
    categories,
    grand_total: {
      prior_month: round2(contractors.reduce((t, c) => t + c.prior_month_actual, 0)),
      budget,
      actual,
      variance: round2(budget - actual),
    },
  }
}
