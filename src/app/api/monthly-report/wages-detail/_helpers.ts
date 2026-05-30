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
