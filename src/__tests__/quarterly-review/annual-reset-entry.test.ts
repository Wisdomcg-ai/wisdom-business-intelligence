/**
 * detectAnnualResetState — pure entry-point detection for annual plan reset.
 *
 * Decision rule (locked):
 *   1. year1EndDate null/absent → 'initial-setup'
 *   2. planningQuarterStart (date-only) > year1EndDate (date-only) → 'needs-reset'
 *   3. otherwise → 'normal-review'
 *
 * Comparison is date-only (strip time). The > is strict:
 * start exactly on year1End counts as within Year 1 (normal-review).
 *
 * Verified production data:
 *   - 10 FY26 clients: year1_end_date = 2026-06-30 → needs-reset (Q1 FY27 start 2026-07-01 > 2026-06-30)
 *   - Armstrong & Co, Fit2Shine: year1_end_date = 2027-06-29 → normal-review for Q1 FY27
 *   - Oh Nine (CY): year1_end_date = 2026-12-31 → depends on quarter
 *   - JVJ: no plan dates → initial-setup
 */

import { describe, it, expect } from 'vitest';
import { detectAnnualResetState, type AnnualResetState } from '@/app/quarterly-review/utils/annual-reset-entry';

describe('detectAnnualResetState', () => {
  // ── initial-setup ──────────────────────────────────────────────────────────

  it('returns initial-setup when year1EndDate is null (no plan — JVJ)', () => {
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2026-07-01'),
      year1EndDate: null,
    });
    expect(result).toBe<AnnualResetState>('initial-setup');
  });

  it('returns initial-setup when year1EndDate is undefined', () => {
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2026-07-01'),
      year1EndDate: undefined,
    });
    expect(result).toBe<AnnualResetState>('initial-setup');
  });

  // ── needs-reset ────────────────────────────────────────────────────────────

  it('returns needs-reset for a standard FY26 client (Q1 FY27 start 2026-07-01 > year1End 2026-06-30)', () => {
    // 10 active FY26 clients — canonical case
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2026-07-01'),
      year1EndDate: new Date('2026-06-30'),
    });
    expect(result).toBe<AnnualResetState>('needs-reset');
  });

  it('returns needs-reset for Oh Nine CY client when Q1 2027 start (2027-01-01) > year1End (2026-12-31)', () => {
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2027-01-01'),
      year1EndDate: new Date('2026-12-31'),
    });
    expect(result).toBe<AnnualResetState>('needs-reset');
  });

  it('returns needs-reset when planningQuarterStart is well past year1EndDate', () => {
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2027-07-01'),
      year1EndDate: new Date('2026-06-30'),
    });
    expect(result).toBe<AnnualResetState>('needs-reset');
  });

  // ── normal-review ──────────────────────────────────────────────────────────

  /**
   * CRITICAL: Armstrong & Co and Fit2Shine both have year1_end_date = 2027-06-29.
   * For the current planning quarter (Q1 FY27, start 2026-07-01):
   *   2026-07-01 < 2027-06-29 → within Year 1 → normal-review.
   * These clients MUST NEVER be prompted to reset.
   */
  it('returns normal-review for Armstrong & Co (year1End 2027-06-29, Q1 FY27 start 2026-07-01) — MUST NOT reset', () => {
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2026-07-01'),
      year1EndDate: new Date('2027-06-29'),
    });
    expect(result).toBe<AnnualResetState>('normal-review');
  });

  it('returns normal-review for Fit2Shine (year1End 2027-06-29, Q1 FY27 start 2026-07-01) — MUST NOT reset', () => {
    // Same data signal, explicit test so the client name is visible in CI output
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2026-07-01'),
      year1EndDate: new Date('2027-06-29'),
    });
    expect(result).toBe<AnnualResetState>('normal-review');
  });

  it('returns normal-review for Oh Nine CY when still within plan year (Q4 2026 start 2026-10-01 < year1End 2026-12-31)', () => {
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2026-10-01'),
      year1EndDate: new Date('2026-12-31'),
    });
    expect(result).toBe<AnnualResetState>('normal-review');
  });

  it('returns normal-review for a mid-year quarter within the plan', () => {
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2026-10-01'),
      year1EndDate: new Date('2027-06-30'),
    });
    expect(result).toBe<AnnualResetState>('normal-review');
  });

  // ── boundary: start === year1End → normal-review (strict >) ───────────────

  it('returns normal-review when planningQuarterStart exactly equals year1EndDate (strict >, not >=)', () => {
    // Start on the exact day the plan ends still counts as within Year 1
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2026-06-30'),
      year1EndDate: new Date('2026-06-30'),
    });
    expect(result).toBe<AnnualResetState>('normal-review');
  });

  // ── time-component ignored (date-only comparison) ──────────────────────────

  it('ignores time when planningQuarterStart has a time component — still needs-reset', () => {
    // 2026-07-01T03:00:00 (AEST midnight) vs 2026-06-30 — must still be needs-reset
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2026-07-01T03:00:00Z'),
      year1EndDate: new Date('2026-06-30'),
    });
    expect(result).toBe<AnnualResetState>('needs-reset');
  });

  it('ignores time on year1EndDate — still needs-reset when start is next day', () => {
    const result = detectAnnualResetState({
      planningQuarterStart: new Date('2026-07-01'),
      year1EndDate: new Date('2026-06-30T23:59:59Z'),
    });
    expect(result).toBe<AnnualResetState>('needs-reset');
  });
});
