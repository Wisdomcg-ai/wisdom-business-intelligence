import type { BalanceSheetCompare, BalanceSheetData, BalanceSheetRow } from '../types'

/**
 * WG.1 — what the exporter hands the PDF for ONE comparison mode, and the WORDS
 * both surfaces use for a sheet that does not add up.
 *
 * The words live here because they were the thing that drifted: the tab printed
 * "Balance Sheet does not balance — residual of $2 (Assets exceed Liabilities +
 * Equity)." and the pack printed a differently-worded sentence off the same
 * threshold and the same three totals, while the comment below claimed the two
 * could not disagree. One coach, one month, two descriptions of the same $2.
 * Both surfaces now render the same string.
 *
 * `data` and `reason` are kept apart on purpose. "Xero wouldn't answer" and
 * "Xero answered, and the sheet doesn't add up" are different sentences, and a
 * pack that prints neither — a blank page, or worse a table of zeros — is
 * exactly the failure this widget exists to avoid. A page that cannot be
 * produced says so, in words, on the page.
 *
 * Note which of those two is which. Only the first is "there is nothing to
 * show". The second HAS a sheet; what it lacks is a proof that the sheet adds
 * up, and that is a warning to print above the table, not a reason to withhold
 * it. See BalanceSheetVerdict.
 */
export interface BalanceSheetPdfInput {
  /** The parsed sheet, or null when it could not be loaded at all. */
  data: BalanceSheetData | null
  /** Why it could not be loaded. Rendered verbatim into the reason card. */
  reason?: string
}

/** One entry per compare mode; a placed widget reads the one its config names. */
export type BalanceSheetPdfSources = Partial<Record<BalanceSheetCompare, BalanceSheetPdfInput>>

/**
 * Tolerance on the accounting equation, in dollars.
 *
 * This is the BalanceSheetTab's threshold, not the $0.05 the sync-time
 * reconciler uses. The two are measuring different things: the reconciler
 * compares our stored mirror against Xero's own report and wants FX per-row
 * rounding to show up, while this page compares Xero's report against itself
 * and only needs to catch a sheet that genuinely doesn't add up. It is
 * deliberately the SAME number the web tab's red banner uses — a PDF page that
 * disagrees with the tab above it is the defect, not a cosmetic difference.
 */
export const BS_EQUATION_TOLERANCE = 1

/**
 * Three states, not two.
 *
 * `ok` with no warnings is a sheet that adds up. `ok` WITH warnings is a sheet
 * printed anyway, with what is wrong with it stated above it — which is exactly
 * what BalanceSheetTab does on screen: banners on top of the full table.
 * Withholding the table instead cost a tenant out by $2 (Armstrong is the known
 * imbalanced one) four of the twenty-seven pages, replaced by one sentence,
 * while the coach's own screen showed them the figures — the tab and the pack
 * telling them different things about the same month.
 *
 * A total we cannot identify belongs here too. It is a reason to omit the
 * CHECK, not the figures: Xero's own equity SummaryRow is labelled half a dozen
 * ways by AU orgs, and an org whose sheet reads "Total Owner's Funds" balances
 * perfectly well — we simply cannot prove it from the labels. Losing four pages
 * over an unrecognised heading is the same defect as losing them over $2.
 *
 * `ok: false` is reserved for genuinely having nothing to print: Xero refused,
 * the month is empty, the comparison period does not exist. "Could not check"
 * is a third state alongside the value, not a replacement for it.
 */
export type BalanceSheetVerdict =
  /** `warnings` is every banner the tab would show, in the tab's own words. */
  | { ok: true; data: BalanceSheetData; warnings: string[] }
  /** `reason` completes the sentence "This page couldn't be produced: …". */
  | { ok: false; reason: string }

function fmtDollars(v: number): string {
  return `$${Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/**
 * The accounting-equation banner, in one place.
 *
 * Rendered above the table on BOTH surfaces — BalanceSheetTab's red banner and
 * the PDF page's red card — because a coach reading the tab and a client
 * reading the pack are being told about the same residual and must be told the
 * same thing about it. The direction is named rather than signed: "assets
 * exceed" and "assets fall short of" are what a reader can act on.
 */
export function equationImbalanceSentence(residual: number): string {
  return (
    `Balance Sheet does not balance — residual of ${fmtDollars(residual)} ` +
    `(Assets ${residual > 0 ? 'exceed' : 'fall short of'} Liabilities + Equity). ` +
    `The figures shown are Xero's; the discrepancy is not.`
  )
}

/**
 * Xero's own Net-Assets-vs-Total-Equity check — a DIFFERENT check from the
 * equation above (it compares two rows Xero printed, not the three totals),
 * computed at a 0.01 threshold in Xero/balance-sheet/route.ts. Shared for the
 * same reason.
 */
export const NET_ASSETS_EQUITY_SENTENCE =
  'Balance sheet does not balance — Net Assets and Total Equity differ. ' +
  'This may indicate unreconciled transactions in Xero.'

/**
 * The GRAND total for a class, not the first subtotal that mentions it.
 *
 * The old version took one predicate — `startsWith('total asset') ||
 * includes('asset')` — and handed it to `rows.find`, which walks the sheet in
 * order and stops at the first row satisfying EITHER branch. Xero prints "Total
 * Bank", "Total Current Assets", "Total Fixed Assets", "Total Non-current
 * Assets" and only then "Total Asset", so the loose branch always won on an
 * early row and the strict branch never got a chance. A fallback that runs
 * before the thing it is a fallback for is not a fallback.
 *
 * Urban Road, August 2026: it read Total Current Assets (249,232) and Total
 * Current Liabilities (226,068) against Total Equity (425,242) and printed, in
 * a red box on two pages of the client's pack, "Balance Sheet does not balance
 * — residual of $402,078". The sheet balances exactly, and the proof was on the
 * same page: 710,867 = 285,625 + 425,242.
 */
function findClassTotal(
  rows: BalanceSheetRow[],
  strict: (label: string) => boolean,
  loose: (label: string) => boolean,
): number | null {
  const subtotals = rows.filter((r) => r.type === 'subtotal')
  // Last exact match rather than first: the grand total is the closing row of
  // its class, and a sheet that repeats the heading means the later one.
  const exact = [...subtotals].reverse().find((r) => strict(r.label.toLowerCase()))
  if (exact) return exact.current ?? null
  const fallback = subtotals.find((r) => loose(r.label.toLowerCase()))
  return fallback?.current ?? null
}

/**
 * The three totals the accounting equation needs, by the same rules on both
 * surfaces. Exported so BalanceSheetTab reads the identical numbers the pack
 * does — the two disagreeing about the same month is the defect this file
 * exists to prevent, and they disagreed for as long as each kept its own copy.
 */
export function balanceSheetClassTotals(rows: BalanceSheetRow[]): {
  assets: number | null
  liabilities: number | null
  equity: number | null
} {
  return {
    assets: findClassTotal(rows, (l) => l.startsWith('total asset'), (l) => l.includes('asset')),
    liabilities: findClassTotal(rows, (l) => l.startsWith('total liabilit'), (l) => l.includes('liabilit')),
    // The loose branch catches "Equity" and "Total Shareholders Equity"; it
    // does NOT catch "Total Owner's Funds", which contains the word nowhere.
    // That label yields null and the caller says the equation could not be
    // checked — which is the designed third state, and better than a residual
    // derived from a total we did not actually identify.
    equity: findClassTotal(rows, (l) => l.startsWith('total equity'), (l) => l.includes('equity')),
  }
}

/**
 * Decide what this comparison can print: the table, the table under stated
 * warnings, or a stated reason and no table.
 *
 * Order matters: check that we HAVE a sheet before checking that it balances,
 * and check the comparison column before the equation, so the reader is told
 * the first thing that went wrong rather than a downstream symptom of it.
 */
export function assessBalanceSheetForPdf(
  entry: BalanceSheetPdfInput | undefined,
  compare: BalanceSheetCompare,
): BalanceSheetVerdict {
  const comparisonName = compare === 'mom' ? 'prior month' : 'same month last year'

  if (!entry) {
    return {
      ok: false,
      reason: `the ${comparisonName} balance sheet wasn't loaded for this export`,
    }
  }
  if (!entry.data) {
    return { ok: false, reason: entry.reason || 'the balance sheet could not be loaded from Xero' }
  }

  const { rows, prior_label } = entry.data
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, reason: 'Xero returned no balance sheet rows for this month' }
  }

  // The comparison column is half of what this page is FOR. An entirely empty
  // prior column means the org has no history at that date (a first-year
  // client asking for last August); printing dashes down a whole column reads
  // as "everything was zero", which is a different and false claim.
  const hasAnyPrior = rows.some((r) => r.prior !== null)
  if (!hasAnyPrior) {
    return {
      ok: false,
      reason: `there are no ${prior_label || comparisonName} figures in Xero to compare against`,
    }
  }

  const warnings: string[] = []

  // The API's own Net-Assets-vs-Total-Equity check, computed at a 0.01
  // threshold in Xero/balance-sheet/route.ts and rendered by BalanceSheetTab as
  // an amber badge. It is a DIFFERENT check from the equation below — it
  // compares two rows Xero printed, not the three totals — and reading only the
  // equation left a sheet 13c out showing the coach a warning on screen and the
  // client a clean page. Same sentence as the badge, deliberately.
  if (entry.data.balances === false) {
    warnings.push(NET_ASSETS_EQUITY_SENTENCE)
  }

  const { assets: totalAssets, liabilities: totalLiabilities, equity: totalEquity } =
    balanceSheetClassTotals(rows)

  if (totalAssets === null || totalLiabilities === null || totalEquity === null) {
    // Not a reason to withhold the sheet. The predicate above is a label match
    // against strings Xero lets each org choose: an equity block headed "Total
    // Owner's Funds" — real enough that this file's own comment names it, and
    // that mapSubtotalLabel in Xero/balance-sheet/route.ts passes it through
    // untouched because only the exact strings are normalised — makes
    // totalEquity null on a sheet that adds up perfectly. Print it and say the
    // equation is unproven, which is what the tab does: it skips its banner and
    // renders the table.
    warnings.push(
      'The Asset, Liability and Equity totals could not be identified in Xero’s balance ' +
      'sheet, so the accounting equation could not be checked on this page. The figures ' +
      'below are Xero’s, unverified.',
    )
    return { ok: true, data: entry.data, warnings }
  }

  const residual = totalAssets - (totalLiabilities + totalEquity)
  if (Math.abs(residual) > BS_EQUATION_TOLERANCE) {
    // The figures are still the figures. Print them, and say on the page that
    // the equation does not close — literally the sentence BalanceSheetTab
    // renders, from equationImbalanceSentence, off the same threshold and the
    // same three totals.
    warnings.push(equationImbalanceSentence(residual))
  }

  return { ok: true, data: entry.data, warnings }
}
