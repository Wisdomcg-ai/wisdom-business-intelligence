/**
 * JVJ Civil and Asphalt, step 4.2, 25 Sep 2026: the quarter targets came up
 * NEGATIVE — about −$1.4M revenue, −$812k gross profit and −$350k net profit a
 * quarter.
 *
 * Their plan row existed with every annual target at $0. Step 4.1 computed
 * remaining = $0 − YTD actuals ($4.2M / $2.436M / $1.05M), and step 4.2 spread
 * that "gap" over the three quarters left as the suggested targets.
 *
 * Two rules, one each:
 *   - a plan row with no annual revenue target is not a plan (planHasAnnualTarget)
 *   - a quarter is never pre-filled with a negative target (suggestedQuarterTarget)
 */
import { describe, it, expect } from 'vitest';
import { planHasAnnualTarget } from '@/app/quarterly-review/utils/review-readiness';
import { suggestedQuarterTarget, runRateForRemaining } from '@/app/quarterly-review/types';

describe('what counts as a plan', () => {
  it('a row with a revenue target is a plan', () => {
    expect(planHasAnnualTarget({ revenue_year1: 1200000 })).toBe(true);
  });

  it('a row with every target at $0 is not (JVJ, Envisage)', () => {
    expect(planHasAnnualTarget({ revenue_year1: 0 })).toBe(false);
  });

  it('reads the numeric strings PostgREST returns for numeric columns', () => {
    expect(planHasAnnualTarget({ revenue_year1: '0' })).toBe(false);
    expect(planHasAnnualTarget({ revenue_year1: '15200000' })).toBe(true);
  });

  it('a missing row, or a NULL target, is not a plan', () => {
    expect(planHasAnnualTarget(null)).toBe(false);
    expect(planHasAnnualTarget(undefined)).toBe(false);
    expect(planHasAnnualTarget({ revenue_year1: null })).toBe(false);
    expect(planHasAnnualTarget({})).toBe(false);
  });

  it('a negative revenue figure is not a target anyone set', () => {
    expect(planHasAnnualTarget({ revenue_year1: -5 })).toBe(false);
  });
});

describe('a quarter is never pre-filled with a negative target', () => {
  const Q2 = 2; // planning Q2 → three quarters left, Q2 included

  it('JVJ: a $0 year pre-fills nothing — it used to pre-fill −$1.4M revenue a quarter', () => {
    // What the old code did with JVJ's stored snapshot:
    expect(runRateForRemaining(-4200000, Q2)).toBe(-1400000);
    // What the Quarterly Plan now pre-fills:
    expect(suggestedQuarterTarget(0, -4200000, Q2)).toBe(0);
    expect(suggestedQuarterTarget(0, -2436000, Q2)).toBe(0);
    expect(suggestedQuarterTarget(0, -1050000, Q2)).toBe(0);
  });

  it('a target already beaten pre-fills nothing either', () => {
    expect(suggestedQuarterTarget(4000000, -200000, Q2)).toBe(0);
    expect(suggestedQuarterTarget(4000000, 0, Q2)).toBe(0);
  });

  it('a real gap is still spread over the quarters left, the planned one included', () => {
    // $15.2M year, $4.2M done in Q1 → $11M over Q2–Q4.
    expect(suggestedQuarterTarget(15200000, 11000000, Q2)).toBe(3666667);
    expect(suggestedQuarterTarget(15200000, 11000000, Q2)).toBe(runRateForRemaining(11000000, Q2));
  });

  it('a missing snapshot line pre-fills nothing', () => {
    expect(suggestedQuarterTarget(undefined, undefined, Q2)).toBe(0);
    expect(suggestedQuarterTarget(null, 500000, Q2)).toBe(0);
  });
});
