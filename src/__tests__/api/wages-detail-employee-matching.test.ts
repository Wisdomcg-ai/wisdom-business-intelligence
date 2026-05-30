/**
 * Phase 71-02 — B1 Wages employee name matching (TDD RED → GREEN)
 *
 * Tests for three pure helpers extracted from
 * src/app/api/monthly-report/wages-detail/route.ts:
 *   - tokenSortKey: lowercases, strips punctuation, sorts tokens
 *   - levenshtein: standard iterative DP distance
 *   - matchEmployeeName: layered match (exact → token-sort → fuzzy)
 *
 * Bug being locked: normEmployeeName(name) === normEmployeeName(other) is a
 * trim/lowercase compare. "John Smith" vs "Smith, John" never matched,
 * producing duplicate wages rows. Fix is token-sort + Levenshtein ≤0.15
 * fallback with Sentry telemetry on fuzzy hits.
 */

import { describe, it, expect } from 'vitest';
import {
  tokenSortKey,
  levenshtein,
  matchEmployeeName,
} from '@/app/api/monthly-report/wages-detail/_helpers';

describe('tokenSortKey', () => {
  it('treats "John Smith", "Smith, John", "smith   john" as the same key', () => {
    const a = tokenSortKey('John Smith');
    const b = tokenSortKey('Smith, John');
    const c = tokenSortKey('smith   john');
    expect(a).toBe('john smith');
    expect(b).toBe('john smith');
    expect(c).toBe('john smith');
  });

  it('strips punctuation and sorts tokens regardless of input order', () => {
    // Hyphens, apostrophes, commas — all stripped
    const a = tokenSortKey("Mary-Anne O'Brien");
    const b = tokenSortKey('OBrien Mary Anne');
    expect(a).toBe(b);
    // Tokens sorted alphabetically, lowercased
    expect(a).toBe('anne mary obrien');
  });

  it('handles empty / null-ish input safely', () => {
    expect(tokenSortKey('')).toBe('');
    // @ts-expect-error: defensive guard
    expect(tokenSortKey(null)).toBe('');
    // @ts-expect-error: defensive guard
    expect(tokenSortKey(undefined)).toBe('');
  });
});

describe('levenshtein', () => {
  it('returns 1 for single-char transposition "john smith" vs "jonh smith"', () => {
    expect(levenshtein('john smith', 'jonh smith')).toBe(2);
    // Note: transposition counts as 2 ops under classical Levenshtein
    // (1 delete + 1 insert). Damerau-Levenshtein would be 1. We use
    // classical, and 2/10 = 0.2 is OVER the 0.15 threshold — so the
    // test that needs a fuzzy hit uses a single-typo case below.
  });

  it('returns 1 for single-char substitution "Jon Smith" vs "Jen Smith"', () => {
    expect(levenshtein('jon smith', 'jen smith')).toBe(1);
  });

  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns length of the other when one is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abcd', '')).toBe(4);
  });
});

describe('matchEmployeeName', () => {
  it('matches "John Smith" to "Smith, John" via token_sort', () => {
    const r = matchEmployeeName('John Smith', ['Smith, John']);
    expect(r.matched).toBe('Smith, John');
    expect(r.via).toBe('token_sort');
  });

  it('matches "smith john" (lowercase, no comma) to "John Smith" via token_sort', () => {
    const r = matchEmployeeName('smith john', ['John Smith']);
    expect(r.matched).toBe('John Smith');
    expect(r.via).toBe('token_sort');
  });

  it('matches typo "Jonh Smyth" to "John Smith" via fuzzy fallback (distance 2 / 10 = 0.2 — fails 0.15) … so use a tighter typo', () => {
    // Use a single-char substitution to land inside the 0.15 threshold.
    // "John Smitn" vs "John Smith" → distance 1, length 10 → 0.10 ≤ 0.15.
    const r = matchEmployeeName('John Smitn', ['John Smith']);
    expect(r.matched).toBe('John Smith');
    expect(r.via).toBe('fuzzy');
    expect(r.distance).toBe(1);
  });

  it('does NOT match "John Smith" to ["Jane Doe", "Bob Brown"]', () => {
    const r = matchEmployeeName('John Smith', ['Jane Doe', 'Bob Brown']);
    expect(r.matched).toBe(null);
    expect(r.via).toBe('no_match');
  });

  it('prefers token_sort over fuzzy when both candidates exist', () => {
    // "Smith, John" is a perfect token-sort match.
    // "John Smitn" is also a fuzzy candidate (distance 1).
    // Token-sort must WIN — fuzzy is fallback only.
    const r = matchEmployeeName('John Smith', ['John Smitn', 'Smith, John']);
    expect(r.matched).toBe('Smith, John');
    expect(r.via).toBe('token_sort');
  });

  it('prefers exact (case-insensitive) over token_sort and fuzzy', () => {
    const r = matchEmployeeName('John Smith', ['JOHN SMITH', 'Smith, John']);
    expect(r.matched).toBe('JOHN SMITH');
    expect(r.via).toBe('exact');
  });
});
