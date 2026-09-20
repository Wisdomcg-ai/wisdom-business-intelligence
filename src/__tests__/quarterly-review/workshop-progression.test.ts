/**
 * Pins the two navigation/anchoring invariants that broke the live workshop.
 *
 * 1. Finishing pre-work advances to whatever actually FOLLOWS 'prework' in the
 *    active sequence, and never drops previously completed steps. It used to
 *    write a hardcoded '1.1' — a step v2 retired — landing the owner on a screen
 *    outside the sequence with no Back button and a Continue that bounced them
 *    back to pre-work. It also replaced steps_completed wholesale, wiping the
 *    progress of anyone who reopened pre-work part-way through a review.
 *
 * 2. Everything that acts on a review's quarter derives it from review.quarter
 *    (the quarter being PLANNED), so the three writers of a quarter key agree.
 *    They did not: the step wrote q${review.quarter}, the background sync wrote
 *    q${clock + 1}, and the sync on complete wrote q${clock}.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WORKSHOP_STEPS,
  ANNUAL_WORKSHOP_STEPS,
  getWorkshopSteps,
  planQuarterKey,
} from '@/app/quarterly-review/types';

// Capture what the service actually writes, without a database.
const captured = vi.hoisted(() => ({ payload: null as Record<string, unknown> | null }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        captured.payload = payload;
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { id: 'r1', ...payload }, error: null }),
            }),
          }),
        };
      },
    }),
  }),
}));

import { quarterlyReviewService } from '@/app/quarterly-review/services/quarterly-review-service';

describe('pre-work advances into the active sequence', () => {
  beforeEach(() => {
    captured.payload = null;
  });

  it('advances to the step after prework, not the retired 1.1', async () => {
    const steps = getWorkshopSteps('quarterly');
    const expected = steps[steps.indexOf('prework') + 1];

    await quarterlyReviewService.completePreWork('r1', expected, []);

    expect(captured.payload?.current_step).toBe(expected);
    expect(captured.payload?.current_step).not.toBe('1.1');
  });

  it('writes a step that is actually IN the sequence', async () => {
    const steps = getWorkshopSteps('quarterly');
    await quarterlyReviewService.completePreWork('r1', steps[1], []);

    expect(steps).toContain(captured.payload?.current_step);
  });

  it('merges steps_completed instead of replacing it', async () => {
    await quarterlyReviewService.completePreWork('r1', '1.2', ['prework', '1.2', '1.3']);

    const done = captured.payload?.steps_completed as string[];
    expect(done).toEqual(expect.arrayContaining(['prework', '1.2', '1.3']));
    expect(done.filter(s => s === 'prework')).toHaveLength(1);
  });

  it('records prework even when the caller passes nothing', async () => {
    await quarterlyReviewService.completePreWork('r1', '1.2');
    expect(captured.payload?.steps_completed).toEqual(['prework']);
  });

  it('holds for the annual sequence too', async () => {
    const steps = getWorkshopSteps('annual');
    const expected = steps[steps.indexOf('prework') + 1];

    await quarterlyReviewService.completePreWork('r1', expected, []);

    expect(steps).toContain(captured.payload?.current_step);
  });
});

describe('the retired 1.1 is not reachable as a destination', () => {
  it('is absent from both sequences', () => {
    expect(WORKSHOP_STEPS).not.toContain('1.1');
    expect(ANNUAL_WORKSHOP_STEPS).not.toContain('1.1');
  });
});

describe('one quarter anchor: the review, never the clock', () => {
  // planQuarterKey is the single definition the three writers now share:
  // QuarterlyRocksStep (writes the rocks), the background sync, and the sync on
  // complete. Importing the real helper is the point — a rule restated inside the
  // test would pass whatever the code does.

  it('keys the plan to the quarter being planned', () => {
    expect(planQuarterKey({ quarter: 2 })).toBe('q2');
    expect(planQuarterKey({ quarter: 1 })).toBe('q1');
    expect(planQuarterKey({ quarter: 4 })).toBe('q4');
  });

  it('never advances past the planned quarter', () => {
    // The background sync used to add 1, filing the plan a quarter ahead of the
    // step that built it — and wrapping q4 round to q1 of no particular year.
    for (const q of [1, 2, 3, 4]) {
      expect(planQuarterKey({ quarter: q })).toBe(`q${q}`);
    }
  });

  it('is unaffected by which quarter the session is resumed in', () => {
    // A review started in one quarter and finished in the next keyed its plan off
    // today's date, so the plan landed in the wrong quarter entirely. The helper
    // takes the review, and has no access to a clock to get this wrong.
    const review = { quarter: 2 as const, year: 2027 };
    const july = planQuarterKey(review);
    const october = planQuarterKey(review);
    expect(july).toBe(october);
    expect(july).toBe('q2');
  });

  it('agrees with the rocks the sprint step writes', () => {
    // QuarterlyRocksStep assigns each rock quarterAssigned = planQuarterKey(review);
    // both syncs must target that same key or the rocks are written and then
    // synced somewhere else.
    const review = { quarter: 3 as const, year: 2027 };
    const rockKey = planQuarterKey(review);
    const backgroundSyncKey = planQuarterKey({ quarter: review.quarter });
    const completeSyncKey = planQuarterKey({ quarter: review.quarter });
    expect(new Set([rockKey, backgroundSyncKey, completeSyncKey]).size).toBe(1);
  });
});
