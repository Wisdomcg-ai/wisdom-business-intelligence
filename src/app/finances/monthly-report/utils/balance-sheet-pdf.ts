import type { BalanceSheetCompare, BalanceSheetData, BalanceSheetRow } from '../types'

/**
 * WG.1 — what the exporter hands the PDF for ONE comparison mode.
 *
 * `data` and `reason` are kept apart on purpose. "Xero wouldn't answer" and
 * "Xero answered, and the sheet doesn't add up" are different sentences, and a
 * pack that prints neither — a blank page, or worse a table of zeros — is
 * exactly the failure this widget exists to avoid. A page that cannot be
 * produced says so, in words, on the page.
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

export type BalanceSheetVerdict =
  | { ok: true; data: BalanceSheetData }
  /** `reason` completes the sentence "This page couldn't be produced: …". */
  | { ok: false; reason: string }

function fmtDollars(v: number): string {
  return `$${Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/**
 * Locate a section total by label. Copied verbatim from BalanceSheetTab's
 * `findSubtotal` — including the loose `includes(...)` fallbacks, which exist
 * because AU orgs label the equity block half a dozen ways ("Total Equity",
 * "Total Owner's Funds"…). Keeping the two identical is the point: if the tab
 * can find the totals, the PDF must find the same ones.
 */
function findSubtotal(rows: BalanceSheetRow[], predicate: (label: string) => boolean): number | null {
  const row = rows.find((r) => r.type === 'subtotal' && predicate(r.label.toLowerCase()))
  return row?.current ?? null
}

/**
 * Decide whether this comparison can be printed as a balance sheet, or has to
 * be printed as a stated reason.
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

  const totalAssets = findSubtotal(rows, (l) => l.startsWith('total asset') || l.includes('asset'))
  const totalLiabilities = findSubtotal(rows, (l) => l.startsWith('total liabilit') || l.includes('liabilit'))
  const totalEquity = findSubtotal(rows, (l) => l.includes('equity'))

  if (totalAssets === null || totalLiabilities === null || totalEquity === null) {
    return {
      ok: false,
      reason:
        'the Asset, Liability and Equity totals could not be identified in Xero’s balance sheet, so the sheet cannot be proved to balance',
    }
  }

  const residual = totalAssets - (totalLiabilities + totalEquity)
  if (Math.abs(residual) > BS_EQUATION_TOLERANCE) {
    return {
      ok: false,
      reason:
        `the balance sheet does not balance — assets ${residual > 0 ? 'exceed' : 'fall short of'} ` +
        `liabilities plus equity by ${fmtDollars(residual)}`,
    }
  }

  return { ok: true, data: entry.data }
}
