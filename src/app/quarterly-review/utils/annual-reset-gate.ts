import { calculateQuarters, toUtcDateOnly } from '@/app/goals/utils/quarters';
import { detectAnnualResetState } from './annual-reset-entry';
import type { YearType } from '../types';

/**
 * Phase 73 v2 — the year-end annual-reset gate decision.
 *
 * Decide whether stepping from Part 3 into Part 4 of the quarterly review should
 * hand off to the annual reset, given the client's plan year (`year1EndDate`) and the
 * quarter being planned. The SYSTEM makes this call — there is no client decision.
 *
 * Pure + timezone-safe: the quarter start from `calculateQuarters` is LOCAL midnight,
 * so it is normalised to UTC-midnight of its local calendar day (`toUtcDateOnly`,
 * per #291) before the date-only comparison in `detectAnnualResetState`. Without that,
 * an AEST (UTC+10) browser collapses the FY boundary to `normal-review` and the reset
 * never fires.
 *
 * Returns `false` while `year1EndDate` is still loading (`undefined`), so an in-flight
 * load never trips an accidental reset.
 */
export function shouldRouteToAnnualReset(
  fyType: YearType,
  year1EndDate: Date | null | undefined,
  planningQuarter: { quarter: number; year: number },
): boolean {
  if (year1EndDate === undefined) return false;
  const localStart =
    calculateQuarters(fyType, planningQuarter.year).find((q) => q.id === `q${planningQuarter.quarter}`)?.startDate ??
    null;
  const planningQuarterStart = localStart ? toUtcDateOnly(localStart) : null;
  if (!planningQuarterStart) return false;
  return detectAnnualResetState({ planningQuarterStart, year1EndDate }) === 'needs-reset';
}
