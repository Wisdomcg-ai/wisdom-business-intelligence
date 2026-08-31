/**
 * Phase 71-02 — B1 Wages employee name matching helpers
 *
 * Pure, unit-testable helpers extracted from route.ts. Replaces the previous
 * `normEmployeeName` trim/lowercase compare with a layered matcher:
 *
 *   1. exact     — case-insensitive trim equality
 *   2. token_sort — punctuation stripped, tokens sorted, joined (catches
 *                   "John Smith" vs "Smith, John")
 *   3. fuzzy     — Levenshtein distance / max(needle.length, candidate.length)
 *                   <= 0.15 (catches one-char typos in 7+ char names)
 *
 * No external dependency added: levenshtein is an inline iterative DP
 * implementation per Phase 71 CONTEXT D-B1 (no library in package.json).
 */

export type MatchVia = 'exact' | 'token_sort' | 'fuzzy' | 'no_match';

export interface MatchResult {
  matched: string | null;
  via: MatchVia;
  /** Levenshtein distance when via='fuzzy', undefined otherwise */
  distance?: number;
}

/**
 * Normalize a name into a token-sorted key for order-/punctuation-insensitive
 * comparison. Examples:
 *   "John Smith"   → "john smith"
 *   "Smith, John"  → "john smith"
 *   "smith   john" → "john smith"
 *   "Mary-Anne O'Brien" → "anne mary obrien"
 */
export function tokenSortKey(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    // Apostrophes / curly-quotes are intra-name (O'Brien → obrien) — strip in place.
    .replace(/['’‘]/g, '')
    // All other punctuation (commas, hyphens, periods, etc) → spaces (token separators).
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Classic iterative DP Levenshtein distance. O(a.length * b.length) time,
 * O(b.length) space (rolling rows). Returns the minimum number of single-char
 * insertions / deletions / substitutions to transform `a` into `b`.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const m = a.length;
  const n = b.length;

  // Two rolling rows
  let prev: number[] = new Array(n + 1);
  let curr: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,    // insertion
        prev[j] + 1,        // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/** Threshold for fuzzy fallback: distance / max(a.length, b.length) must be <= this. */
export const FUZZY_RATIO_THRESHOLD = 0.15;

/**
 * Match `needle` against a list of `haystack` candidates. Tries exact first,
 * then token-sort, then Levenshtein fuzzy fallback. Returns the FIRST winning
 * candidate at the highest-priority match level.
 *
 *   matchEmployeeName('John Smith', ['Smith, John'])
 *     → { matched: 'Smith, John', via: 'token_sort' }
 *
 *   matchEmployeeName('John Smitn', ['John Smith'])
 *     → { matched: 'John Smith', via: 'fuzzy', distance: 1 }
 *
 *   matchEmployeeName('John Smith', ['Jane Doe'])
 *     → { matched: null, via: 'no_match' }
 */
export function matchEmployeeName(
  needle: string,
  haystack: string[],
): MatchResult {
  if (!needle || haystack.length === 0) {
    return { matched: null, via: 'no_match' };
  }

  const needleTrim = needle.trim();
  const needleLower = needleTrim.toLowerCase();
  const needleKey = tokenSortKey(needleTrim);

  // 1. exact (case-insensitive trim)
  for (const cand of haystack) {
    if (cand && cand.trim().toLowerCase() === needleLower) {
      return { matched: cand, via: 'exact' };
    }
  }

  // 2. token_sort
  for (const cand of haystack) {
    if (cand && tokenSortKey(cand) === needleKey && needleKey !== '') {
      return { matched: cand, via: 'token_sort' };
    }
  }

  // 3. fuzzy — pick the candidate with the smallest distance that also
  //    sits inside the ratio threshold. Ties go to first-seen.
  let bestCand: string | null = null;
  let bestDist = Infinity;
  for (const cand of haystack) {
    if (!cand) continue;
    const candLower = cand.trim().toLowerCase();
    const dist = levenshtein(needleLower, candLower);
    const ratio = dist / Math.max(needleLower.length, candLower.length);
    if (ratio <= FUZZY_RATIO_THRESHOLD && dist < bestDist) {
      bestDist = dist;
      bestCand = cand;
    }
  }
  if (bestCand !== null) {
    return { matched: bestCand, via: 'fuzzy', distance: bestDist };
  }

  return { matched: null, via: 'no_match' };
}

// ─────────────────────────────────────────────────────────────────────────────
// W0.2 — Pay-run pagination
//
// Xero's AU Payroll spec is explicit on GET /PayRuns: "e.g. page=1 – Up to 100
// PayRuns will be returned in a single API call." This route used to call the
// endpoint with no page, no order and no date filter, then filter the response
// by payment date client-side — so it only ever saw whichever 100 runs Xero
// happened to return first. A weekly-payroll client passes 100 runs in about two
// years, after which the report month can be missing entirely and the page
// renders an empty state rather than an error.
//
// The fix is to order newest-first and page until we are safely past the window.
// The decisions are extracted here so they can be tested without a live Xero.
// ─────────────────────────────────────────────────────────────────────────────

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
