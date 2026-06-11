/**
 * Review-relative quarter helpers — the FY-boundary math the quarterly-review
 * workshop relies on so a "plan Q1 FY27 / review Q4 FY26" session reads identically
 * whether it runs in June (Q4 FY26) or July–Aug (already Q1 FY27).
 *
 * Anchor model: review.quarter/year = the quarter being PLANNED (e.g. Q1 FY27).
 *   - reflect steps look at getPreviousQuarterOf(review.*) = Q4 FY26
 *   - plan steps target review.* = Q1 FY27
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { getPreviousQuarterOf, getNextQuarterOf, getPlanningQuarter } from '../types';

describe('getPreviousQuarterOf', () => {
  it('rolls Q1 back to Q4 of the prior year (the 1 July boundary)', () => {
    // Planning Q1 FY27 → reflect on Q4 FY26
    expect(getPreviousQuarterOf(1, 2027)).toEqual({ quarter: 4, year: 2026 });
  });

  it('decrements within the same year for Q2–Q4', () => {
    expect(getPreviousQuarterOf(2, 2027)).toEqual({ quarter: 1, year: 2027 });
    expect(getPreviousQuarterOf(3, 2027)).toEqual({ quarter: 2, year: 2027 });
    expect(getPreviousQuarterOf(4, 2027)).toEqual({ quarter: 3, year: 2027 });
  });
});

describe('getNextQuarterOf', () => {
  it('rolls Q4 forward to Q1 of the next year (the 1 July boundary)', () => {
    // Reviewing Q4 FY26 → plan Q1 FY27
    expect(getNextQuarterOf(4, 2026)).toEqual({ quarter: 1, year: 2027 });
  });

  it('increments within the same year for Q1–Q3', () => {
    expect(getNextQuarterOf(1, 2027)).toEqual({ quarter: 2, year: 2027 });
    expect(getNextQuarterOf(2, 2027)).toEqual({ quarter: 3, year: 2027 });
    expect(getNextQuarterOf(3, 2027)).toEqual({ quarter: 4, year: 2027 });
  });
});

describe('round-trip invariants', () => {
  it('next then previous returns the original quarter/year', () => {
    for (const q of [1, 2, 3, 4] as const) {
      const year = 2026;
      const next = getNextQuarterOf(q, year);
      expect(getPreviousQuarterOf(next.quarter, next.year)).toEqual({ quarter: q, year });
    }
  });
});

describe('getPlanningQuarter (FY) across the review window', () => {
  afterEach(() => vi.useRealTimers());

  const expectPlanningQuarter = (isoDate: string, expected: { quarter: number; year: number }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(isoDate));
    expect(getPlanningQuarter('FY')).toEqual(expected);
  };

  it('mid-June 2026 (last month of Q4 FY26) → plan Q1 FY27', () => {
    // Final month of a quarter → plan the upcoming quarter.
    expectPlanningQuarter('2026-06-17T03:00:00', { quarter: 1, year: 2027 });
  });

  it('early July 2026 (Q1 FY27 just started) → plan Q1 FY27', () => {
    expectPlanningQuarter('2026-07-10T03:00:00', { quarter: 1, year: 2027 });
  });

  it('early August 2026 (mid Q1 FY27) → plan Q1 FY27', () => {
    expectPlanningQuarter('2026-08-05T03:00:00', { quarter: 1, year: 2027 });
  });
});
