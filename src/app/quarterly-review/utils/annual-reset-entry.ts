/**
 * detectAnnualResetState — pure, side-effect-free entry-point detection
 * for the annual plan reset flow (Phase 73).
 *
 * Decision rule (locked design):
 *   1. No plan dates (year1EndDate null/undefined) → 'initial-setup'
 *   2. planningQuarterStart (date-only) > year1EndDate (date-only) → 'needs-reset'
 *   3. otherwise → 'normal-review'
 *
 * Comparison is date-only — time components are stripped before comparison.
 * The > is strict: a planningQuarterStart exactly equal to year1EndDate still
 * falls within Year 1 → 'normal-review'.
 *
 * This function is READ-ONLY — it has no side effects and issues no writes.
 * A reset only begins when the client explicitly clicks through to /goals?reset=annual.
 *
 * Verified data contracts:
 *   - 10 FY26 clients: year1_end_date=2026-06-30, Q1 FY27 start=2026-07-01 → 'needs-reset'
 *   - Armstrong & Co, Fit2Shine: year1_end_date=2027-06-29, Q1 FY27 start=2026-07-01 → 'normal-review'
 *   - Oh Nine (CY): year1_end_date=2026-12-31 → needs-reset when Q1 2027 starts, normal-review within 2026
 *   - JVJ: no plan dates → 'initial-setup'
 */

export type AnnualResetState = 'initial-setup' | 'needs-reset' | 'normal-review';

export interface DetectAnnualResetStateArgs {
  /** Start date of the quarter being planned (used for comparison). */
  planningQuarterStart: Date;
  /**
   * The client's `business_financial_goals.year1_end_date`.
   * Null or undefined means no plan has been set up yet → 'initial-setup'.
   */
  year1EndDate: Date | null | undefined;
}

/**
 * Determines which annual-plan entry state applies to a client.
 *
 * Returns:
 *   'initial-setup'  — no plan dates on record; route to /goals (first-time setup)
 *   'needs-reset'    — plan year has ended; route to /goals?reset=annual
 *   'normal-review'  — still within the current plan year; normal quarterly CTA
 */
export function detectAnnualResetState({
  planningQuarterStart,
  year1EndDate,
}: DetectAnnualResetStateArgs): AnnualResetState {
  // Rule 1: no plan dates → initial setup
  if (year1EndDate == null) {
    return 'initial-setup';
  }

  // Strip time components for date-only comparison.
  // Use UTC midnight so AEST/NZST offsets cannot accidentally shift the date.
  const startDateOnly = toDateOnly(planningQuarterStart);
  const endDateOnly = toDateOnly(year1EndDate);

  // Rule 2: strict >; start exactly on year1End counts as within Year 1.
  if (startDateOnly > endDateOnly) {
    return 'needs-reset';
  }

  // Rule 3: still within Year 1
  return 'normal-review';
}

/**
 * Returns a new Date representing midnight UTC of the CALENDAR DATE encoded
 * in the Date value, treating the stored date's wall-clock date (YYYY-MM-DD)
 * as the canonical date and stripping any time-of-day component.
 *
 * We use UTC getters (getUTCFullYear / getUTCMonth / getUTCDate) so that a
 * value like "2026-06-30T23:59:59Z" is always treated as 2026-06-30 — the
 * date that was stored in the database — regardless of the local timezone of
 * the machine running this code (AEST +10/+11, NZST +12/+13 would otherwise
 * shift "2026-06-30T23:59:59Z" into 2026-07-01 in local getters, producing
 * a false positive needs-reset when start date is also 2026-07-01).
 */
function toDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}
