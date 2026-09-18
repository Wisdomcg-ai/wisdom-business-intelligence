/**
 * Actuals are filed against the quarter they HAPPENED in.
 *
 * A review is named for the quarter it PLANS, so everything backward-looking
 * belongs to the quarter before it. The Scorecard already scores
 * getPreviousQuarterOf(review.*) — a Q2 FY27 review shows "Reviewing Q1" — but
 * both writers filed the resulting numbers under review.quarter:
 *
 *   kpi_actuals.period_quarter        = Q${review.quarter}   → a quarter late
 *   quarterly_snapshots.snapshot_quarter = Q${review.quarter} → a quarter late
 *
 * And at the FY boundary a year late as well: a Q1 FY27 review reflects on
 * Q4 FY26, so period_year had to roll back too.
 *
 * It matters because QuarterlyPlanStep reads snapshot_quarter back as "the
 * quarter these actuals are FOR" to fill past quarters in the plan grid — so the
 * mislabel put last quarter's revenue in next quarter's column, in front of a
 * client, during planning.
 */
import { describe, it, expect } from 'vitest';
import {
  planQuarterKey,
  reviewedQuarterOf,
  reviewedQuarterLabel,
  type QuarterNumber,
} from '@/app/quarterly-review/types';

const review = (quarter: QuarterNumber, year: number) => ({ quarter, year });

describe('the reviewed quarter is one before the planned quarter', () => {
  it('a Q2 FY27 review reflects on Q1 FY27', () => {
    expect(reviewedQuarterOf(review(2, 2027))).toEqual({ quarter: 1, year: 2027 });
    expect(reviewedQuarterLabel(review(2, 2027))).toBe('Q1');
  });

  it('rolls the YEAR back at the FY boundary', () => {
    // The case that was wrong twice over: a Q1 FY27 review reflects on Q4 FY26.
    expect(reviewedQuarterOf(review(1, 2027))).toEqual({ quarter: 4, year: 2026 });
    expect(reviewedQuarterLabel(review(1, 2027))).toBe('Q4');
  });

  it('holds for every quarter', () => {
    expect(reviewedQuarterOf(review(3, 2027))).toEqual({ quarter: 2, year: 2027 });
    expect(reviewedQuarterOf(review(4, 2027))).toEqual({ quarter: 3, year: 2027 });
  });
});

describe('backward and forward keys never collide', () => {
  it('the actuals period is never the planning period', () => {
    for (const q of [1, 2, 3, 4] as QuarterNumber[]) {
      const r = review(q, 2027);
      expect(reviewedQuarterLabel(r).toLowerCase()).not.toBe(planQuarterKey(r));
    }
  });

  it('the plan key still points at the quarter being planned', () => {
    // Guards against "fixing" this by moving the forward key backwards too.
    expect(planQuarterKey(review(2, 2027))).toBe('q2');
  });

  it('one quarter separates them, always', () => {
    for (const q of [1, 2, 3, 4] as QuarterNumber[]) {
      const r = review(q, 2027);
      const planned = Number(planQuarterKey(r).slice(1));
      const reviewed = reviewedQuarterOf(r).quarter;
      const gap = planned === 1 ? planned + 4 - reviewed : planned - reviewed;
      expect(gap).toBe(1);
    }
  });
});

describe('the stored period labels match their table conventions', () => {
  it('uses the upper-case form kpi_actuals and quarterly_snapshots store', () => {
    // period_quarter / snapshot_quarter hold 'Q1'; strategic_initiatives.step_type
    // holds 'q1'. QuarterlyPlanStep strips the leading Q to match — a lower-case
    // label there would silently never match and the grid would read empty.
    expect(reviewedQuarterLabel(review(2, 2027))).toMatch(/^Q[1-4]$/);
    expect(planQuarterKey(review(2, 2027))).toMatch(/^q[1-4]$/);
  });
});
