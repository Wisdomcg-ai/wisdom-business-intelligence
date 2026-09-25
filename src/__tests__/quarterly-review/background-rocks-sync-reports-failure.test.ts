/**
 * A write refused during Sprint Planning is reported — once per failure.
 *
 * On step 4.3 the hook pushes the session's rocks to strategic_initiatives five
 * seconds after each save settles. It awaited syncRocks inside a try/catch, but
 * syncRocks REPORTS a refused write as `{ success: false, error }` ('Could not
 * read existing rocks', 'Rocks not saved — …', and since #605 'Could not read
 * the initiatives picked for q2'); it never throws one. The answer was
 * discarded, so the catch could not fire and the failure reached nobody. The
 * completion sync has read its answer since #594; this one did not.
 *
 * The hook is driven for real — renderHook, with the 800ms autosave and the 5s
 * sync on fake timers — and opened the way the workshop page opens it, by
 * review id, so the sync writes to the business_profiles id. Sentry is the
 * boundary: the contract is the `invariant:` tag, not a call to a helper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Rock } from '@/app/quarterly-review/types';

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: sentry.captureException }));

const sync = vi.hoisted(() => ({ syncRocks: vi.fn() }));
vi.mock('@/app/quarterly-review/services/strategic-sync-service', () => ({
  strategicSyncService: { syncRocks: sync.syncRocks },
}));

const service = vi.hoisted(() => ({ getReviewById: vi.fn(), updateReview: vi.fn() }));
vi.mock('@/app/quarterly-review/services/quarterly-review-service', () => ({
  quarterlyReviewService: service,
}));

// A singleton, like the real client: the hook's load effect depends on it, and
// a fresh object per render would re-fire that effect on every render.
const supabase = vi.hoisted(() => {
  const rowFor: Record<string, unknown> = {
    business_profiles: { id: 'profile-1' },
    business_financial_goals: { year_type: 'FY' },
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: rowFor[table] ?? null, error: null }),
      };
      return builder;
    },
  };
});
vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabase }));

vi.mock('@/lib/business/resolveBusinessId', () => ({
  resolveBusinessId: async () => ({ businessId: 'biz-1' }),
}));
vi.mock('@/contexts/BusinessContext', () => ({
  useBusinessContext: () => ({ activeBusiness: null, currentUser: null }),
}));
vi.mock('@/app/quarterly-review/services/foundation-plan-service', () => ({
  planWritesSettled: async () => {},
}));
vi.mock('@/app/one-page-plan/services/plan-data-assembler', () => ({ assemblePlanData: vi.fn() }));
vi.mock('@/app/one-page-plan/services/plan-snapshot-service', () => ({ planSnapshotService: {} }));

import { useQuarterlyReview } from '@/app/quarterly-review/hooks/useQuarterlyReview';

const ROCK: Rock = {
  id: 'sprint-new-1790198021629',
  title: 'Due Date Focus',
  owner: 'Steve',
  status: 'not_started',
  progressPercentage: 0,
  successCriteria: 'Every job quoted within 48h',
};
const SECOND_ROCK: Rock = { ...ROCK, id: 'sprint-new-1790198021630', title: 'Hire a second estimator' };

const PICKED_UNREADABLE = {
  success: false,
  error: 'Could not read the initiatives picked for q2: permission denied for table strategic_initiatives',
};
const INSERT_REFUSED = {
  success: false,
  error: 'Rocks not saved — insert Hire a second estimator: new row violates row-level security policy',
};

/** A Q2 review, in progress, on Sprint Planning. */
const reviewOnSprintPlanning = () => ({
  id: 'review-1',
  business_id: 'biz-1',
  user_id: 'user-1',
  quarter: 2,
  year: 2027,
  review_type: 'quarterly',
  status: 'in_progress',
  current_step: '4.3',
  steps_completed: [],
  quarterly_rocks: [ROCK],
});

/** Move the clock inside act, letting each promise chain the timers start settle. */
const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** Open the workshop by review id, as the page does, and let the load land. */
const openSprintPlanning = async () => {
  const hook = renderHook(() => useQuarterlyReview({ reviewId: 'review-1', reviewType: 'quarterly' }));
  await settle();
  expect(hook.result.current.review?.current_step).toBe('4.3');
  return hook;
};

type Hook = Awaited<ReturnType<typeof openSprintPlanning>>;

/** A Sprint Planning edit: the 800ms autosave lands, then the 5s sync runs. */
const editRocks = async (hook: Hook, rocks: Rock[]) => {
  act(() => hook.result.current.updateQuarterlyRocks(rocks));
  await settle(800);
  await settle(5000);
};

const captured = () =>
  sentry.captureException.mock.calls.map(([err, ctx]) => ({
    message: (err as Error).message,
    ...(ctx as { tags: Record<string, string>; extra: Record<string, unknown> }),
  }));

beforeEach(() => {
  vi.useFakeTimers();
  sentry.captureException.mockReset();
  sync.syncRocks.mockReset();
  service.getReviewById.mockReset();
  service.getReviewById.mockResolvedValue(reviewOnSprintPlanning());
  service.updateReview.mockReset();
  service.updateReview.mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the background rocks sync reads the answer syncRocks gives', () => {
  it('captures a refused write with the invariant tag, the review, and the id it wrote to', async () => {
    sync.syncRocks.mockResolvedValue(PICKED_UNREADABLE);

    await openSprintPlanning();
    await settle(5000);

    // Written under the business_profiles id and the quarter the review plans.
    expect(sync.syncRocks).toHaveBeenCalledTimes(1);
    expect(sync.syncRocks).toHaveBeenCalledWith('profile-1', 'user-1', [ROCK], 'q2');
    expect(captured()).toEqual([
      {
        message: PICKED_UNREADABLE.error,
        tags: { invariant: 'quarterly_review_write_failed', qr_operation: 'background-rocks-sync-partial' },
        extra: { reviewId: 'review-1', businessId: 'profile-1', quarterKey: 'q2' },
      },
    ]);
    expect(sentry.captureException.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('captures nothing when the rocks land', async () => {
    sync.syncRocks.mockResolvedValue({ success: true });

    await openSprintPlanning();
    await settle(5000);

    expect(sync.syncRocks).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('leaves the workshop screen alone — the completion sync is what tells the coach', async () => {
    sync.syncRocks.mockResolvedValue(PICKED_UNREADABLE);

    const hook = await openSprintPlanning();
    await settle(5000);

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(hook.result.current.saveError).toBeNull();
    expect(hook.result.current.planSyncFailed).toBe(false);
    expect(hook.result.current.error).toBeNull();
  });

  it('still captures a sync that throws, as before', async () => {
    sync.syncRocks.mockRejectedValue(new Error('Failed to fetch'));

    await openSprintPlanning();
    await settle(5000);

    expect(captured()).toMatchObject([
      { message: 'Failed to fetch', tags: { qr_operation: 'background-rocks-sync' } },
    ]);
  });
});

describe('a failure that persists is captured once, not on every cycle', () => {
  it('the same failure on every save is one capture', async () => {
    sync.syncRocks.mockResolvedValue(PICKED_UNREADABLE);

    const hook = await openSprintPlanning();
    await settle(5000);
    await editRocks(hook, [ROCK, SECOND_ROCK]);
    await editRocks(hook, [SECOND_ROCK]);

    expect(sync.syncRocks).toHaveBeenCalledTimes(3);
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('a different failure is captured', async () => {
    sync.syncRocks.mockResolvedValueOnce(PICKED_UNREADABLE).mockResolvedValueOnce(INSERT_REFUSED);

    const hook = await openSprintPlanning();
    await settle(5000);
    await editRocks(hook, [ROCK, SECOND_ROCK]);

    expect(captured().map(c => c.message)).toEqual([PICKED_UNREADABLE.error, INSERT_REFUSED.error]);
  });

  it('a clean sync clears it — the same failure coming back is captured again', async () => {
    sync.syncRocks
      .mockResolvedValueOnce(PICKED_UNREADABLE)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(PICKED_UNREADABLE);

    const hook = await openSprintPlanning();
    await settle(5000);
    await editRocks(hook, [ROCK, SECOND_ROCK]);
    await editRocks(hook, [ROCK]);

    expect(sync.syncRocks).toHaveBeenCalledTimes(3);
    expect(captured().map(c => c.message)).toEqual([PICKED_UNREADABLE.error, PICKED_UNREADABLE.error]);
  });
});
