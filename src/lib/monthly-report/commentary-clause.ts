/**
 * The clause that turns a supplier list into a finding.
 *
 * Matt's Calxa commentary ends each bolded account line with a ratio, and until
 * this module that ratio was typed by hand every month for every client. It is
 * not a judgement — it is arithmetic, and the July 2026 Urban Road pack proves
 * the pattern to the reported decimal:
 *
 *   "Antons Canvas | … 40.5% of canvas revenue against a 36.2% driver"
 *      actual  201,177 / 497,243 total income = 40.46%   -> 40.5%
 *      budget  162,900 / 450,000 total income = 36.20%   -> 36.2%
 *
 *   "Freight to Customer | … 10.12% of income against 8.87% in June"
 *      Jul  50,304 / 497,243 = 10.117%
 *      Jun  50,308 / 567,254 =  8.868%
 *
 *   "Posters | … an estimate of $27,527 has been raised at 49% of Poster's income"
 *      27,527 / 56,178 Posters income = 49.0%
 *
 * So there is ONE shape — a cost as a percentage of a denominator — with two
 * comparators (the same ratio on budget, or the same ratio last month) and two
 * denominators (total income, or the revenue account that shares the cost
 * account's name). Nothing here is per-client, which is what makes it worth
 * generating rather than configuring: eighteen businesses, no rules to maintain.
 *
 * The comparator is chosen, not configured: an approved budget is the better
 * yardstick when one exists, and last month is the honest fallback when it does
 * not. Both are stated in words so a reader always knows which they are seeing.
 */

export interface RatioInputs {
  /** This month's actual for the cost account. Signed as the statement carries it. */
  accountActual: number
  /** The approved (or forecast) budget for the same account, null when none. */
  accountBudget: number | null
  /** This month's actual for the denominator — usually total income. */
  denominatorActual: number
  /** The denominator's budget, null when none. */
  denominatorBudget: number | null
  /** Last month's actuals, null when the month is not held. */
  priorAccountActual: number | null
  priorDenominatorActual: number | null
  /** How the denominator is named in the sentence, e.g. 'income'. */
  denominatorLabel: string
  /** Last month in words, e.g. 'June'. Null when there is no prior month. */
  priorMonthLabel: string | null
}

export interface RatioClause {
  text: string
  /** Which comparator was used — the UI can badge a prior-month one differently. */
  basis: 'budget' | 'prior_month' | 'none'
  ratio: number
  comparison: number | null
}

/**
 * A percentage a reader can hold in their head.
 *
 * One decimal place everywhere. Matt's hand-written lines vary (40.5%, 10.12%,
 * 49%) because each was typed on its own; a generated pack should not imitate
 * that inconsistency, and a draft he edits can carry more precision than he
 * would have bothered with.
 */
function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

/**
 * Build the ratio clause, or return null when the arithmetic cannot be done.
 *
 * Null, not "0.0%". A denominator of zero is not a cost that is 0% of income —
 * it is a month we cannot express as a ratio, and printing 0.0% would read as a
 * finding. Same for a missing month: the sentence simply gets shorter.
 */
export function buildRatioClause(input: RatioInputs): RatioClause | null {
  const {
    accountActual, accountBudget, denominatorActual, denominatorBudget,
    priorAccountActual, priorDenominatorActual, denominatorLabel, priorMonthLabel,
  } = input

  if (!Number.isFinite(accountActual) || !Number.isFinite(denominatorActual)) return null
  if (denominatorActual === 0) return null

  const ratio = accountActual / denominatorActual

  // Preferred comparator: the same ratio computed on the budget. This is the
  // "driver" in Matt's wording — what the plan said this cost should be as a
  // share of the income the plan assumed.
  if (
    accountBudget !== null && denominatorBudget !== null &&
    Number.isFinite(accountBudget) && Number.isFinite(denominatorBudget) &&
    denominatorBudget !== 0
  ) {
    const driver = accountBudget / denominatorBudget
    return {
      text: `${pct(ratio)} of ${denominatorLabel} against a ${pct(driver)} driver`,
      basis: 'budget',
      ratio,
      comparison: driver,
    }
  }

  // Fallback: the same ratio last month. Named, so nobody mistakes it for a plan.
  if (
    priorAccountActual !== null && priorDenominatorActual !== null &&
    Number.isFinite(priorAccountActual) && Number.isFinite(priorDenominatorActual) &&
    priorDenominatorActual !== 0 && priorMonthLabel
  ) {
    const prior = priorAccountActual / priorDenominatorActual
    return {
      text: `${pct(ratio)} of ${denominatorLabel} against ${pct(prior)} in ${priorMonthLabel}`,
      basis: 'prior_month',
      ratio,
      comparison: prior,
    }
  }

  // Neither comparator available. The ratio alone is still worth saying.
  return {
    text: `${pct(ratio)} of ${denominatorLabel}`,
    basis: 'none',
    ratio,
    comparison: null,
  }
}

/**
 * Which revenue line this cost should be measured against.
 *
 * Total income is right for almost everything — Antons Canvas and Freight both
 * use it. The exception is a cost account that names the same product as a
 * revenue account: Urban Road's COGS "Posters" against income "Posters (41700)",
 * where the meaningful ratio is the product's own margin and total income would
 * bury it.
 *
 * Matched on the account NAME rather than a configured pairing, because the
 * naming convention is what a bookkeeper actually maintains — and a wrong match
 * here is visible (the percentage looks absurd) rather than silent.
 */
export function pickDenominator(
  costAccountName: string,
  revenueLines: readonly { account_name: string; actual: number; budget: number | null }[],
  totals: { actual: number; budget: number | null },
): { label: string; actual: number; budget: number | null } {
  const norm = (s: string) =>
    s.toLowerCase().replace(/\(\d+\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

  const target = norm(costAccountName)
  if (target) {
    for (const rev of revenueLines) {
      if (norm(rev.account_name) === target) {
        return { label: `${rev.account_name} income`, actual: rev.actual, budget: rev.budget }
      }
    }
  }

  return { label: 'income', actual: totals.actual, budget: totals.budget }
}

/**
 * The denominators, taken from the report the commentary sits inside.
 *
 * Deliberately extracted from the generated report rather than re-derived from
 * the database. The commentary's percentage has to be a share of the SAME
 * income the statement above it prints — and the report's own budget has
 * already been through the resolver, the effective-date stitching and the
 * account-code matching. Reading the numbers back out is the only way to
 * guarantee the two agree; a second derivation is a second answer waiting to
 * happen.
 */
export interface RatioContext {
  incomeActual: number
  incomeBudget: number | null
  revenueLines: { account_name: string; actual: number; budget: number | null }[]
}

/** Structural, not the app's GeneratedReport, so this stays server-safe. */
export interface ReportShapeForRatios {
  summary?: { revenue?: { actual?: number; budget?: number } }
  sections?: readonly {
    category?: string
    lines?: readonly { account_name?: string; actual?: number; budget?: number; is_budget_only?: boolean }[]
  }[]
  has_budget?: boolean
}

export function extractRatioContext(report: ReportShapeForRatios | null | undefined): RatioContext | null {
  const incomeActual = report?.summary?.revenue?.actual
  if (typeof incomeActual !== 'number' || !Number.isFinite(incomeActual)) return null

  // `has_budget` is the report's own answer to "was there a budget at all". A
  // budget of 0 on a report that HAS one is a real zero; on a report that does
  // not, it is an absence, and dividing by it would manufacture a driver of 0%.
  const rawBudget = report?.summary?.revenue?.budget
  const incomeBudget =
    report?.has_budget === false || typeof rawBudget !== 'number' || !Number.isFinite(rawBudget)
      ? null
      : rawBudget

  const revenueLines: RatioContext['revenueLines'] = []
  for (const section of report?.sections ?? []) {
    if (section?.category !== 'Revenue') continue
    for (const line of section.lines ?? []) {
      if (!line?.account_name || line.is_budget_only) continue
      revenueLines.push({
        account_name: line.account_name,
        actual: typeof line.actual === 'number' ? line.actual : 0,
        budget: incomeBudget === null || typeof line.budget !== 'number' ? null : line.budget,
      })
    }
  }

  return { incomeActual, incomeBudget, revenueLines }
}
