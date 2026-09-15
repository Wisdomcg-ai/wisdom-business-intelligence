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
  /**
   * The month per Xero organisation, for a page that prints a column each
   * (Calxa's DRAGON | EHC | TOTAL — DRG-29). Absent on a single-organisation
   * business and on a response from before the route carried it.
   */
  by_tenant?: Record<string, number>
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
  grand_total: { prior_month: number; budget: number; actual: number; variance: number; by_tenant?: Record<string, number> }
  /** The organisations the columns run in, in the coach's display order. */
  tenants?: { tenant_id: string; name: string }[]
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
      // One contractor paid out of both organisations' accounts is one row,
      // with each organisation's own figure kept for the columns.
      if (v.by_tenant) {
        existing.by_tenant = { ...(existing.by_tenant ?? {}) }
        for (const [tenant, amount] of Object.entries(v.by_tenant)) {
          existing.by_tenant[tenant] = (existing.by_tenant[tenant] ?? 0) + amount
        }
      }
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
      ...(v.by_tenant ? { by_tenant: Object.fromEntries(Object.entries(v.by_tenant).map(([t, a]) => [t, round2(a)])) } : {}),
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

  // The account's own figure per organisation, as the totals are the ledger's
  // — never the contractor rows added up.
  const tenants = data.tenants ?? []
  const grandByTenant = tenants.length > 0
    ? Object.fromEntries(tenants.map((t) => [
        t.tenant_id,
        round2((data.accounts ?? []).reduce((sum, a) => sum + (a.total_by_tenant?.[t.tenant_id] ?? 0), 0)),
      ]))
    : undefined

  return {
    contractors,
    categories,
    grand_total: {
      prior_month: round2(contractors.reduce((t, c) => t + c.prior_month_actual, 0)),
      budget,
      actual,
      variance: round2(budget - actual),
      ...(grandByTenant ? { by_tenant: grandByTenant } : {}),
    },
    ...(tenants.length > 0 ? { tenants: [...tenants] } : {}),
  }
}

/**
 * What the Contractor Analysis page says about its rows, from the route's own
 * account of what it read — undefined when there is nothing to say.
 *
 * The route answers 200 with no rows for three different things: a month in
 * which nobody was paid, a business with no Xero connection, and an org whose
 * token lapsed or whose fetch came back short. Only the first may be printed
 * as "no contractor payments were found"; printed for the other two it is a
 * statement to a client about money nobody checked. So the empty sentence
 * needs `complete === true`, a partial answer names what was not read — with
 * rows too, since a missing org's contractors are not in them — and an answer
 * that does not say (an older response, a payload file) is could-not-confirm
 * when it has no rows.
 */
export function contractorLoadReason(
  data: (Pick<SubscriptionDetailData, 'complete' | 'incomplete_reason'> & { grand_total?: Pick<SubscriptionDetailData['grand_total'], 'actual'> }) | null | undefined,
  rowCount: number,
): string | undefined {
  if (data?.complete === false) {
    return data.incomplete_reason
      ? `the contractor figures could not be fully read from Xero (${data.incomplete_reason})`
      : 'the contractor figures could not be fully read from Xero'
  }
  if (rowCount > 0) return undefined
  if (data?.complete === true) {
    // A complete crawl covers bills and bank transactions only. Spend posted
    // by journal is in the ledger and in neither, and the route's grand total
    // is the ledger's figure for these accounts (kept after an account with no
    // vendors is dropped) — so "nobody was paid" is only true when it is 0.
    const ledger = data.grand_total?.actual ?? 0
    if (Math.abs(ledger) >= 0.5) {
      return `no contractor bills or payments were found in Xero, though the ledger shows $${Math.round(ledger).toLocaleString('en-AU')} on these accounts this month`
    }
    return 'no contractor payments were found in Xero for this month'
  }
  return 'the contractor figures could not be confirmed as complete'
}
