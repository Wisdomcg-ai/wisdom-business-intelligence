/**
 * Does the forecast that was STORED equal the forecast that was APPROVED?
 *
 * The wizard computes an on-screen summary from `WizardState`; the materialiser
 * independently derives `forecast_pl_lines` from `ForecastAssumptions`. Nothing
 * has ever compared the two, which is why "the number on screen isn't the number
 * in the report" has been the most expensive recurring defect in this codebase —
 * every fix so far addressed one bucket rather than the divergence itself.
 *
 * This re-aggregates the materialised lines back into the summary's totals and
 * reports the difference. It deliberately compares at CATEGORY level rather than
 * per bucket: the stored lines carry only four categories (Revenue, Other Income,
 * Cost of Sales, Operating Expenses), so the summary's finer buckets — team,
 * subscriptions, depreciation, one-offs, investments — are collapsed into
 * operating expenses on the way out and cannot be recovered individually. What
 * CAN be checked is the part that reaches the client: revenue, cost of sales,
 * total operating expense and net profit.
 *
 * Reports differences; never throws and never mutates. The caller decides
 * whether a divergence blocks, warns, or is merely recorded.
 */

/** The four categories the materialiser emits. Anything else is counted as an expense. */
const REVENUE_CATEGORIES = new Set(['revenue', 'other income'])
const COGS_CATEGORIES = new Set(['cost of sales', 'cogs'])

/** Minimum a stored line must carry to be re-aggregated. */
export interface ParityLine {
  category?: string | null
  /** Month key → amount, as stored in forecast_pl_lines.forecast_months. */
  forecast_months?: Record<string, number> | null
}

/** The approved summary's shape, as held in `financial_forecasts.wizard_state`. */
export interface ParityYearSummary {
  revenue?: number
  cogs?: number
  teamCosts?: number
  subscriptions?: number
  opex?: number
  depreciation?: number
  investments?: number
  /**
   * Legacy only. The user-entered other-expenses bucket was removed — it had no
   * editor, so it could only ever be zero — but this reads summaries already
   * stored in `wizard_state`, and dropping the field would turn any historic
   * non-zero value into a false divergence. Kept deliberately.
   */
  otherExpenses?: number
  otherIncome?: number
  xeroOtherExpense?: number
  netProfit?: number
}

export interface ParityBucketResult {
  approved: number
  stored: number
  difference: number
}

export interface ParityResult {
  /** True when every bucket agrees within tolerance. */
  matches: boolean
  /** Buckets that diverged beyond tolerance, worst first. */
  divergences: (ParityBucketResult & { bucket: string })[]
  revenue: ParityBucketResult
  cogs: ParityBucketResult
  operatingExpenses: ParityBucketResult
  netProfit: ParityBucketResult
  /** Months the stored lines actually covered — 0 means nothing was materialised. */
  monthsCovered: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Total the approved summary's operating-expense side.
 *
 * Mirrors the canonical net-profit formula in `useForecastWizard`:
 *   netProfit = grossProfit − teamCosts − subscriptions − opex − depreciation
 *               − otherExpenses − investments + xeroOtherIncome − xeroOtherExpense
 * Everything subtracted after gross profit is an operating expense once
 * materialised, so they sum here. `otherIncome` is NOT included — it is added,
 * and is re-aggregated on the revenue side where the materialiser files it.
 */
export function approvedOperatingExpenses(s: ParityYearSummary): number {
  return (
    (s.teamCosts || 0) +
    (s.subscriptions || 0) +
    (s.opex || 0) +
    (s.depreciation || 0) +
    (s.otherExpenses || 0) +
    (s.investments || 0) +
    (s.xeroOtherExpense || 0)
  )
}

/** Sum a line's stored months, restricted to `monthKeys` when given. */
function sumMonths(line: ParityLine, monthKeys?: Set<string>): number {
  const months = line.forecast_months
  if (!months) return 0
  let total = 0
  for (const [key, value] of Object.entries(months)) {
    if (monthKeys && !monthKeys.has(key)) continue
    const n = Number(value)
    if (Number.isFinite(n)) total += n
  }
  return total
}

/**
 * Compare an approved year summary against the P&L lines that were stored for it.
 *
 * @param monthKeys Restrict to one forecast year. Omit only for a single-year
 *   forecast — otherwise a 3-year line set is compared against a 1-year summary
 *   and every bucket diverges for a reason that is not a defect.
 * @param tolerance Absolute dollars. Defaults to $1 — the materialiser rounds
 *   each line to cents, so a many-line forecast accumulates sub-dollar drift
 *   that is arithmetic, not error.
 */
export function checkSummaryParity(
  approved: ParityYearSummary | null | undefined,
  storedLines: ParityLine[] | null | undefined,
  monthKeys?: string[],
  tolerance = 1,
): ParityResult {
  const summary = approved || {}
  const lines = storedLines || []
  const keys = monthKeys && monthKeys.length > 0 ? new Set(monthKeys) : undefined

  let storedRevenue = 0
  let storedCogs = 0
  let storedOpEx = 0
  const coveredMonths = new Set<string>()

  for (const line of lines) {
    const category = (line.category || '').trim().toLowerCase()
    const amount = sumMonths(line, keys)

    for (const key of Object.keys(line.forecast_months || {})) {
      if (!keys || keys.has(key)) coveredMonths.add(key)
    }

    if (REVENUE_CATEGORIES.has(category)) storedRevenue += amount
    else if (COGS_CATEGORIES.has(category)) storedCogs += amount
    // Unknown categories count as expense. A new category silently treated as
    // income would overstate profit — the safer default is the one that shows up
    // as a divergence rather than hiding one.
    else storedOpEx += amount
  }

  // The approved revenue side is revenue + other income, because the
  // materialiser files Xero other income under a revenue-like category.
  const approvedRevenue = (summary.revenue || 0) + (summary.otherIncome || 0)
  const approvedCogs = summary.cogs || 0
  const approvedOpEx = approvedOperatingExpenses(summary)
  const approvedNet =
    summary.netProfit != null
      ? summary.netProfit
      : approvedRevenue - approvedCogs - approvedOpEx

  const storedNet = storedRevenue - storedCogs - storedOpEx

  const bucket = (approvedValue: number, storedValue: number): ParityBucketResult => ({
    approved: round2(approvedValue),
    stored: round2(storedValue),
    difference: round2(storedValue - approvedValue),
  })

  const revenue = bucket(approvedRevenue, storedRevenue)
  const cogs = bucket(approvedCogs, storedCogs)
  const operatingExpenses = bucket(approvedOpEx, storedOpEx)
  const netProfit = bucket(approvedNet, storedNet)

  const divergences = (
    [
      { bucket: 'revenue', ...revenue },
      { bucket: 'cogs', ...cogs },
      { bucket: 'operatingExpenses', ...operatingExpenses },
      { bucket: 'netProfit', ...netProfit },
    ] as (ParityBucketResult & { bucket: string })[]
  )
    .filter(b => Math.abs(b.difference) > tolerance)
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))

  return {
    matches: divergences.length === 0,
    divergences,
    revenue,
    cogs,
    operatingExpenses,
    netProfit,
    monthsCovered: coveredMonths.size,
  }
}
