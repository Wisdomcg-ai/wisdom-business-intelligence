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
// W0.2 pay-run pagination helpers — moved to @/lib/xero/payrun-paging in WB.1
// so the payroll sync (lib) and this route share one implementation.
// Re-exported here so existing imports and tests keep working.
// ─────────────────────────────────────────────────────────────────────────────
export {
  PAY_RUNS_PAGE_SIZE,
  PAY_RUNS_MAX_PAGES,
  PAY_RUNS_ORDER,
  payRunLookbackCutoff,
  shouldFetchNextPayRunPage,
  oldestPeriodEnd,
} from '@/lib/xero/payrun-paging';

// ─────────────────────────────────────────────────────────────────────────────
// WB.4 / WB.5 — payroll month analysis: phasing + P&L tie-out.
//
// Pure functions; the route feeds them what it already computed. Both encode
// rules lifted from the client skills that produce the Calxa packs by hand:
//
//   Phasing — "some months have five Fridays, not four; that's a real
//   budget-phasing variance worth noting" (DD skill). An extra weekly pay run
//   inflates the month ~25% against a 4-week budget; without the note it reads
//   as an overspend.
//
//   Tie-out — every skill's sign-off checklist starts with "payroll grand
//   total ties to the P&L wages figure". PAY-TIES ships as a WARNING (per the
//   invariant-promotion convention): payment-date-keyed pay runs vs period-end
//   accruals and manual journals can legitimately move wages between months.
// ─────────────────────────────────────────────────────────────────────────────

export interface PayrollPhasing {
  /** Distinct payment dates in the month. */
  pay_runs_in_month: number;
  /** Typical run count for the dominant calendar (4 for WEEKLY, 2 for FORTNIGHTLY…). */
  typical_runs: number;
  /** Dominant calendar type among employees actually paid this month. */
  calendar_type: string;
  /** True when the month carries more runs than typical — the five-Friday case. */
  extra_run: boolean;
}

/**
 * Detect budget-phasing months. `calendarTypes` is one entry per PAID employee
 * (dominant type wins ties by first-seen); `typicalRunsFor` is the existing
 * estimatePayRunsInMonth mapping, injected so route and tests share it.
 */
export function computePayrollPhasing(args: {
  payRunDates: ReadonlyArray<string>;
  calendarTypes: ReadonlyArray<string>;
  typicalRunsFor: (frequency: string) => number;
}): PayrollPhasing | null {
  const { payRunDates, calendarTypes, typicalRunsFor } = args;
  if (payRunDates.length === 0 || calendarTypes.length === 0) return null;

  const counts = new Map<string, number>();
  let dominant = calendarTypes[0];
  for (const t of calendarTypes) {
    const n = (counts.get(t) ?? 0) + 1;
    counts.set(t, n);
    if (n > (counts.get(dominant) ?? 0)) dominant = t;
  }

  const typical = typicalRunsFor(dominant);
  return {
    pay_runs_in_month: payRunDates.length,
    typical_runs: typical,
    calendar_type: dominant,
    extra_run: typical > 0 && payRunDates.length > typical,
  };
}

export interface PayrollTies {
  /** Σ payslip gross across the month. */
  payroll_gross: number;
  /** Σ payslip super across the month. */
  payroll_super: number;
  /** Which payroll side was compared: gross, or gross+super. */
  payroll_side: number;
  /** Σ actuals of the CONFIGURED wages accounts from the P&L. */
  accounts_actual: number;
  /** Whether the configured account list appears to include a super account. */
  includes_super_account: boolean;
  delta: number;
  within_tolerance: boolean;
  /**
   * False when there is nothing real to compare: no P&L actuals existed for
   * the configured accounts (the route backfills accounts[0] from the payroll
   * total in that case, which would make the tie circular), or no payroll.
   */
  comparable: boolean;
}

/** DD's Daniel-flagged rule: cent-level rounding must not read as a break. */
export const PAY_TIES_TOLERANCE = 1;

export function computePayrollTies(args: {
  payrollGross: number;
  payrollSuper: number;
  /** P&L actual across configured wage accounts, BEFORE any backfill. */
  accountsActual: number;
  wagesAccountNames: ReadonlyArray<string>;
}): PayrollTies {
  const { payrollGross, payrollSuper, accountsActual, wagesAccountNames } = args;
  const includesSuper = wagesAccountNames.some((n) => /super/i.test(n));
  // Compare like with like: payslip gross excludes super, so super joins the
  // payroll side only when the account list carries a super account.
  const payrollSide = payrollGross + (includesSuper ? payrollSuper : 0);
  const delta = Math.round((accountsActual - payrollSide) * 100) / 100;
  const comparable = accountsActual !== 0 && payrollGross !== 0;
  return {
    payroll_gross: Math.round(payrollGross * 100) / 100,
    payroll_super: Math.round(payrollSuper * 100) / 100,
    payroll_side: Math.round(payrollSide * 100) / 100,
    accounts_actual: Math.round(accountsActual * 100) / 100,
    includes_super_account: includesSuper,
    delta,
    within_tolerance: Math.abs(delta) <= PAY_TIES_TOLERANCE,
    comparable,
  };
}
