/**
 * Turn a Xero budget into the rows of a locked budget version.
 *
 * The one thing that separates this from the forecast seed: it takes the WHOLE
 * fiscal year, elapsed months included. The seed deliberately drops closed
 * months — correct for a forecast, which projects what is left — but every
 * monthly report is about a closed month, so a budget that skips them can never
 * supply the column it exists for. Distinct Directions on 8 Sep 2026 is the
 * case: its seeded forecast held Sep–Jun and its August budget read $0 against
 * a $471,250 actual.
 *
 * Classification happens HERE, once, and is stored on the row. The report must
 * not re-derive it: two consumers deriving separately is how one account lands
 * in Revenue on one screen and Operating Expenses on another, and the expense
 * bucket flips the variance sign silently because the fallback is a push rather
 * than a throw.
 */
import { mapTypeToCategory } from '@/lib/monthly-report/shared'
import { resolveBudgetLineIdentities, type PLBucket, type CatalogAccount, type AccountActuals } from '@/lib/services/xero-budget-seed-service'
import type { XeroBudgetLine } from '@/lib/xero/budgets'

/** One row destined for budget_lines. */
export interface BudgetLineRow {
  account_code: string
  account_name: string
  /** Report display vocabulary, or null when the account could not be classified. */
  category: string | null
  /** The 5-bucket PLBucket, or null. */
  account_type: PLBucket | null
  month: string
  amount: number
}

export interface BuiltBudget {
  lines: BudgetLineRow[]
  /** Distinct fiscal-year months carrying at least one line. */
  monthsCovered: number
  firstPeriod: string | null
  lastPeriod: string | null
  /** Accounts whose P&L bucket could not be determined — imported, category null. */
  unclassified: Array<{ accountCode: string; accountName: string }>
  /** Archived-but-budgeted accounts and similar, surfaced not swallowed. */
  warnings: string[]
  /** Accounts whose budget cells were all absent or zero across the FY. */
  zeroBudgetAccounts: Array<{ accountCode: string; accountName: string }>
}

/**
 * `fyMonthKeys` is the full twelve-month window in fiscal order. Months Xero
 * omitted are simply absent: a blank budget cell means $0, and it is never
 * filled from actuals. A partial import stays visible through monthsCovered
 * rather than being quietly completed.
 */
export function buildBudgetFromXero(input: {
  budgetLines: readonly XeroBudgetLine[]
  catalog: readonly CatalogAccount[]
  actuals?: readonly AccountActuals[]
  fyMonthKeys: readonly string[]
}): BuiltBudget {
  const { lines: resolved, warnings } = resolveBudgetLineIdentities({
    budgetLines: input.budgetLines as XeroBudgetLine[],
    catalog: input.catalog,
    actuals: input.actuals,
  })

  const fyMonths = new Set(input.fyMonthKeys)
  const rows: BudgetLineRow[] = []
  const unclassified: Array<{ accountCode: string; accountName: string }> = []
  const zeroBudgetAccounts: Array<{ accountCode: string; accountName: string }> = []
  const monthsSeen = new Set<string>()

  for (const line of resolved) {
    if (!line.bucket) {
      unclassified.push({ accountCode: line.accountCode, accountName: line.accountName })
    }

    // A null bucket stores a null category rather than guessing. The report
    // already defaults a null category to Operating Expenses; guessing here
    // would put revenue into the expense bucket and invert its variance.
    const category = line.bucket ? mapTypeToCategory(line.bucket) : null

    let any = false
    for (const month of Object.keys(line.months)) {
      if (!fyMonths.has(month)) continue
      const amount = Number(line.months[month])
      if (!Number.isFinite(amount) || amount === 0) continue
      any = true
      monthsSeen.add(month)
      rows.push({
        account_code: line.accountCode,
        account_name: line.accountName,
        category,
        account_type: line.bucket,
        month,
        // Carried through as Xero reports it. Xero's budget amounts are already
        // positive for expenses, matching the actuals convention the variance
        // arithmetic assumes — normalising the sign here would invert them.
        amount,
      })
    }

    if (!any) {
      zeroBudgetAccounts.push({ accountCode: line.accountCode, accountName: line.accountName })
    }
  }

  const ordered = input.fyMonthKeys.filter((m) => monthsSeen.has(m))

  return {
    lines: rows,
    monthsCovered: ordered.length,
    firstPeriod: ordered[0] ?? null,
    lastPeriod: ordered[ordered.length - 1] ?? null,
    unclassified,
    warnings,
    zeroBudgetAccounts,
  }
}

/**
 * The month a newly imported version should take effect.
 *
 * A budget applies prospectively: months already reported keep the budget they
 * were reported against. So a version starts at the first fiscal month with no
 * finalised report — for a business with none, that is the start of the year.
 */
export function defaultEffectiveFrom(
  fyMonthKeys: readonly string[],
  finalisedMonths: readonly string[],
): string {
  const finalised = new Set(finalisedMonths)
  for (const month of fyMonthKeys) {
    if (!finalised.has(month)) return month
  }
  // Every month reported: the revision can only apply after the year.
  return fyMonthKeys[fyMonthKeys.length - 1]
}
