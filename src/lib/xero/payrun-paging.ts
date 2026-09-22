/**
 * Pay-run pagination decisions for Xero AU Payroll GET /PayRuns.
 *
 * Xero returns at most 100 pay runs per call ("e.g. page=1 – Up to 100 PayRuns
 * will be returned in a single API call"). Fetching the endpoint unpaged and
 * unordered only ever sees whichever 100 runs come first — a weekly-payroll
 * client passes 100 runs in about two years, after which a report month can be
 * silently absent (the W0.2 wages-detail bug).
 *
 * Introduced in W0.2 inside the wages-detail route; moved here in WB.1 because
 * the payroll sync needs the same decisions. Pure functions — the fetch loops
 * around them stay thin. Order newest-first, page until safely past the window.
 */
/** Xero returns at most this many pay runs per page. */
export const PAY_RUNS_PAGE_SIZE = 100;

/** Hard stop so a misbehaving cursor cannot loop. 10 pages = 1000 pay runs. */
export const PAY_RUNS_MAX_PAGES = 10;

/** Order clause that makes paging deterministic (newest period first). */
export const PAY_RUNS_ORDER = 'PayRunPeriodEndDate DESC';

/**
 * Oldest `PayRunPeriodEndDate` still worth fetching for a report month.
 *
 * The report selects pay runs by PAYMENT date, but paging is ordered by PERIOD
 * END date, and the two differ — a period ending 30 Jun can be paid 3 Jul. So
 * the cutoff sits `monthsBack` whole months before the report month begins,
 * which comfortably covers any real payment lag.
 *
 * @param reportMonth 'YYYY-MM'
 */
export function payRunLookbackCutoff(reportMonth: string, monthsBack = 2): Date {
  const [year, month] = reportMonth.split('-').map(Number);
  if (!year || !month) {
    // Unparseable month — return the epoch so the caller pages to the hard stop
    // rather than silently truncating to a window it cannot justify.
    return new Date(0);
  }
  // Date handles month underflow (month 1 - 2 → November of the prior year).
  return new Date(Date.UTC(year, month - 1 - monthsBack, 1));
}

/**
 * Given a page of pay runs ordered newest-first, decide whether to fetch another.
 *
 * Stops when the page was short (Xero had no more), when the oldest run on it is
 * already past the cutoff, or at the hard page limit.
 */
export function shouldFetchNextPayRunPage(args: {
  /** Number of pay runs returned by the page just fetched. */
  pageCount: number;
  /** 1-based page number just fetched. */
  pageNumber: number;
  /** Oldest PayRunPeriodEndDate on that page, or null if none parsed. */
  oldestPeriodEnd: Date | null;
  /** From payRunLookbackCutoff(). */
  cutoff: Date;
  maxPages?: number;
}): boolean {
  const { pageCount, pageNumber, oldestPeriodEnd, cutoff } = args;
  const maxPages = args.maxPages ?? PAY_RUNS_MAX_PAGES;

  if (pageNumber >= maxPages) return false;
  // A short page is the last page.
  if (pageCount < PAY_RUNS_PAGE_SIZE) return false;
  // A full page whose dates were all unparseable: keep going rather than
  // silently stopping on a window we cannot prove we have covered.
  if (oldestPeriodEnd === null) return true;
  return oldestPeriodEnd.getTime() >= cutoff.getTime();
}

/** Oldest parseable PayRunPeriodEndDate in a page, or null. */
export function oldestPeriodEnd(
  runs: ReadonlyArray<{ PayRunPeriodEndDate?: string }>,
  parseDate: (s: string) => Date | null,
): Date | null {
  let oldest: Date | null = null;
  for (const run of runs) {
    const d = run.PayRunPeriodEndDate ? parseDate(run.PayRunPeriodEndDate) : null;
    if (!d) continue;
    if (oldest === null || d.getTime() < oldest.getTime()) oldest = d;
  }
  return oldest;
}
