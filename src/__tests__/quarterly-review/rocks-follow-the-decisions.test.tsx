/**
 * A review files — and every screen shows — the rocks its decisions hold now.
 *
 * Found 26 Sep 2026 while building #605. `quarterly_rocks` had one writer: step
 * 4.3's write-back, which fires only after an EDIT in that step (arriving writes
 * nothing, deliberately). Step 4.2 changes the decisions — picks, moves, adds,
 * the reconcile on every visit — without touching the rocks, and completion
 * synced the stored list as it stood. So a review finished without a 4.3 edit
 * after its last 4.2 change filed stale rocks, or none. Production, 26 Sep:
 *
 * - Sydney Pressed Metal's Q2 FY2027 review was completed on 25 Sep with five
 *   rocks in its decisions and an empty list.
 * - Digital Bond's, Efficient Living's and JVJ's Q2 lists kept initiatives
 *   from 4.2's Available pool that their decisions stopped counting as rocks
 *   (#604), until a data repair re-derived them.
 * - Precision's Q2 FY2027 review, in progress at 4.2, holds two rocks in its
 *   decisions and none stored.
 *
 * The rocks are now worked out from the decisions wherever they are used
 * (reviewRocks): at completion, which records the list it filed; in the 4.3
 * background sync; on the close screen, the summary, history, the PDF and the
 * next quarter's rocks review. Stored rocks nothing in the workshop built —
 * Precision's seeded demo rocks — are kept (Matt, 26 Sep 2026).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { renderHook, waitFor, act } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InitiativeDecision, Rock } from '@/app/quarterly-review/types';

const h = vi.hoisted(() => ({
  review: null as Record<string, unknown> | null,
  syncAll: vi.fn(),
  syncRocks: vi.fn(),
  updateReview: vi.fn(),
  completeWorkshop: vi.fn(),
}));

// One client, as the app's browser client is: the hook creates one per render.
vi.mock('@/lib/supabase/client', () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit', 'in']) b[m] = () => b;
      b.maybeSingle = async () =>
        table === 'business_profiles' ? { data: { id: 'profile-1' }, error: null } : { data: null, error: null };
      return b;
    },
  };
  return { createClient: () => client };
});
vi.mock('@/lib/business/resolveBusinessId', () => ({ resolveBusinessId: async () => ({ businessId: 'biz-1' }) }));
const businessContext = { activeBusiness: { id: 'biz-1', ownerId: 'owner-1' }, currentUser: { role: 'coach' } };
vi.mock('@/contexts/BusinessContext', () => ({ useBusinessContext: () => businessContext }));
vi.mock('@/app/quarterly-review/services/quarterly-review-service', () => ({
  quarterlyReviewService: {
    getReviewById: async () => h.review,
    updateReview: h.updateReview,
    updateProgress: async () => undefined,
    completeWorkshop: h.completeWorkshop,
    createQuarterlySnapshot: async () => undefined,
    saveKpiActuals: async () => undefined,
  },
}));
vi.mock('@/app/quarterly-review/services/strategic-sync-service', () => ({
  strategicSyncService: { syncAll: h.syncAll, syncRocks: h.syncRocks },
}));
vi.mock('@/app/quarterly-review/services/foundation-plan-service', () => ({ planWritesSettled: async () => undefined }));
vi.mock('@/app/one-page-plan/services/plan-data-assembler', () => ({ assemblePlanData: async () => null }));
vi.mock('@/app/one-page-plan/services/plan-snapshot-service', () => ({
  planSnapshotService: { createSnapshot: async () => undefined },
}));
vi.mock('@/app/quarterly-review/utils/capture-write-failure', () => ({ captureReviewWriteFailure: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useCoachView', () => ({ useCoachView: () => ({ getPath: (p: string) => p }) }));

import { rocksFromDecisions, reviewRocks } from '@/app/quarterly-review/utils/rocks-from-decisions';
import { useQuarterlyReview } from '@/app/quarterly-review/hooks/useQuarterlyReview';
import { WorkshopCompleteStep } from '@/app/quarterly-review/components/steps/WorkshopCompleteStep';

const decision = (over: Partial<InitiativeDecision> = {}): InitiativeDecision =>
  ({
    initiativeId: 'd-1',
    title: 'Capacity Planning',
    category: 'operations',
    currentStatus: 'not_started',
    progressPercentage: 0,
    decision: 'keep',
    notes: '',
    quarterAssigned: 'q2',
    ...over,
  }) as InitiativeDecision;

/** Sydney Pressed Metal's Q2 FY2027 review: five rocks in its decisions, none stored. */
const spmDecisions = [
  ['f98a8bfa-f2cf-41a8-b667-8f70bd820572', 'Capacity Planning', 'q2'],
  ['21ac007a-7098-48f5-822c-016bde6380d6', 'Client Success System', 'q2'],
  ['7395d376-f452-4ceb-a371-ac9423e233e4', 'Daily Brief Framework - pre-start - builder trend', 'q2'],
  ['01bb15a7-16e1-4ce9-8d83-36b9e735b0b3', 'People Power', 'q2'],
  ['8b984f4f-03bc-4be5-870f-d2c727217458', 'Sales Team Launch', 'q2'],
  ['a1111111-1111-4111-8111-111111111111', 'Hire a workshop foreman', 'q3'],
  ['b2222222-2222-4222-8222-222222222222', 'Open a second site', 'unassigned'],
].map(([initiativeId, title, quarterAssigned]) => decision({ initiativeId, title, quarterAssigned }));

/** Precision's Q1 FY2027 review, rocks exactly as seeded: no decision built them. */
const precisionRocks = [
  {
    id: 'rock-q1fy27-1',
    owner: 'James Mitchell',
    title: 'Hire and onboard a second leading hand',
    status: 'not_started',
    successCriteria: 'Qualified electrician hired, inducted, and running their own crew by end of Q1',
    progressPercentage: 0,
  },
  {
    id: 'rock-q1fy27-2',
    owner: 'James Mitchell',
    title: 'Close the 3rd strata contract and lock quoting sign-off',
    status: 'not_started',
    successCriteria: '3rd strata contract signed; quoting sign-off live for jobs over $100K',
    progressPercentage: 0,
  },
  {
    id: 'rock-q1fy27-3',
    owner: 'Mark Thompson (Operations Manager)',
    title: 'Stand up materials staging and progress-claim process',
    status: 'not_started',
    successCriteria: 'Material ordering staged per job; progress claims lodged fortnightly on jobs over $100K',
    progressPercentage: 0,
  },
] as Rock[];

/** Envisage's Q4 2025 review stores one rock with nothing in it at all. */
const envisageEmptyRock = { id: 'rock-1764161895890', owner: '', title: '', status: 'not_started', priority: 1, doneDefinition: '' } as unknown as Rock;

const titles = (rocks: Rock[]) => rocks.map(r => r.title);
const review = (over: Record<string, unknown> = {}) => ({
  quarter: 2,
  initiative_decisions: [] as InitiativeDecision[],
  quarterly_rocks: [] as Rock[],
  ...over,
}) as Parameters<typeof reviewRocks>[0];

describe('the rocks are the ones the decisions hold now', () => {
  it('files the five rocks Sydney Pressed Metal planned, though its stored list is empty', () => {
    expect(titles(reviewRocks(review({ initiative_decisions: spmDecisions })))).toEqual([
      'Capacity Planning',
      'Client Success System',
      'Daily Brief Framework - pre-start - builder trend',
      'People Power',
      'Sales Team Launch',
    ]);
  });

  it('includes an initiative moved into the quarter in 4.2 after Sprint Planning last saved', () => {
    const training = decision({ initiativeId: 'd-t', title: 'Training' });
    const payroll = decision({ initiativeId: 'd-p', title: 'Complete the Payroll Automations', quarterAssigned: 'unassigned' });
    const stored = rocksFromDecisions([training, payroll], 2); // what 4.3 last wrote: Training only
    const moved = [training, { ...payroll, quarterAssigned: 'q2' }];

    expect(titles(reviewRocks(review({ initiative_decisions: moved, quarterly_rocks: stored })))).toEqual([
      'Training',
      'Complete the Payroll Automations',
    ]);
  });

  it('drops the Available-pool initiatives Digital Bond\'s stored list carried', () => {
    // Stored by the rule before #604, which counted 4.2's pool as rocks. The
    // decisions are unchanged; they simply are not this quarter's rocks.
    const planned = ['Process for delivering a scalable solution', 'Productise AI Systems Audits'];
    const pool = ['Create a Clear Offer Ladder', 'Build Recurring Revenue Targets'];
    const decisions = [
      ...planned.map((title, i) => decision({ initiativeId: `p-${i}`, title })),
      ...pool.map((title, i) => decision({ initiativeId: `u-${i}`, title, quarterAssigned: 'unassigned' })),
    ];
    const storedBeforeTheFix = decisions.map((d, i) => ({
      id: d.initiativeId,
      title: d.title,
      owner: '',
      status: 'not_started',
      progressPercentage: 0,
      successCriteria: '',
      linkedInitiatives: [d.initiativeId],
      priority: i + 1,
    })) as Rock[];

    expect(titles(reviewRocks(review({ initiative_decisions: decisions, quarterly_rocks: storedBeforeTheFix })))).toEqual(
      planned,
    );
  });

  it('keeps out a rock moved to another quarter, dropped, or removed in Sprint Planning', () => {
    const kept = decision({ initiativeId: 'd-1', title: 'Kept' });
    const moved = decision({ initiativeId: 'd-2', title: 'Moved' });
    const dropped = decision({ initiativeId: 'd-3', title: 'Dropped' });
    const removed = decision({ initiativeId: 'sprint-new-1790296002208', title: 'Removed in Sprint Planning' });
    const stored = rocksFromDecisions([kept, moved, dropped, removed], 2);

    const now = [kept, { ...moved, quarterAssigned: 'q3' }, { ...dropped, decision: 'kill' as const }];
    expect(titles(reviewRocks(review({ initiative_decisions: now, quarterly_rocks: stored })))).toEqual(['Kept']);
  });

  it('answers empty when the session planned nothing and stored nothing', () => {
    expect(reviewRocks(review())).toEqual([]);
    expect(reviewRocks(review({ initiative_decisions: null, quarterly_rocks: null }))).toEqual([]);
  });
});

describe('a rock nothing in the workshop built is kept (Matt, 26 Sep 2026)', () => {
  it('keeps Precision\'s seeded rocks, after the decisions\' rocks and exactly as stored', () => {
    const rocks = reviewRocks(
      review({
        quarter: 1,
        initiative_decisions: [decision({ initiativeId: 'd-9', title: 'Recurring maintenance drive', quarterAssigned: 'q1' })],
        quarterly_rocks: precisionRocks,
      }),
    );
    expect(titles(rocks)).toEqual([
      'Recurring maintenance drive',
      'Hire and onboard a second leading hand',
      'Close the 3rd strata contract and lock quoting sign-off',
      'Stand up materials staging and progress-claim process',
    ]);
    // Owner, success criteria and status stay as the seed wrote them.
    expect(rocks.slice(1)).toEqual(precisionRocks);
  });

  it('keeps them when the decisions plan nothing for the quarter at all', () => {
    // Precision's Q1 FY2027 review holds 20 decisions and none of them is a Q1 rock.
    const rocks = reviewRocks(
      review({
        quarter: 1,
        initiative_decisions: [decision({ quarterAssigned: 'q2' }), decision({ initiativeId: 'd-2', quarterAssigned: 'unassigned' })],
        quarterly_rocks: precisionRocks,
      }),
    );
    expect(rocks).toEqual(precisionRocks);
  });

  it('keeps a rock the old editor linked to initiatives by hand', () => {
    // The retired rock editor let a coach type initiative ids into the rock.
    // Built from a decision, a rock lists itself; this one never does.
    const handLinked = { id: 'rock-1764161800000', title: 'Launch the site', owner: 'Sam', status: 'not_started', progressPercentage: 0, successCriteria: '', linkedInitiatives: ['0eeafa02-d04e-4d54-856b-cd499ab312fb'] } as Rock;
    expect(reviewRocks(review({ quarterly_rocks: [handLinked] }))).toEqual([handLinked]);
  });

  it('leaves a title a decision holds to that decision, whatever it says', () => {
    const [seeded] = precisionRocks;
    const sameTitle = (over: Partial<InitiativeDecision>) =>
      decision({ initiativeId: 'd-5', title: '  hire and ONBOARD a second leading hand ', quarterAssigned: 'q1', ...over });

    // Planned: the decision's rock is the rock — once.
    const planned = reviewRocks(review({ quarter: 1, initiative_decisions: [sameTitle({})], quarterly_rocks: [seeded] }));
    expect(planned).toHaveLength(1);
    expect(planned[0].id).toBe('d-5');

    // Dropped, or moved to another quarter: the coach took it out.
    expect(reviewRocks(review({ quarter: 1, initiative_decisions: [sameTitle({ decision: 'kill' })], quarterly_rocks: [seeded] }))).toEqual([]);
    expect(reviewRocks(review({ quarter: 1, initiative_decisions: [sameTitle({ quarterAssigned: 'q3' })], quarterly_rocks: [seeded] }))).toEqual([]);
  });

  it('does not keep Envisage\'s empty rock — it has no title and nothing else', () => {
    expect(reviewRocks(review({ quarter: 4, quarterly_rocks: [envisageEmptyRock] }))).toEqual([]);
  });

  it('lists two stored rocks of one title once, the first filled in from the second', () => {
    const rocks = reviewRocks(
      review({
        quarterly_rocks: [
          { id: 'rock-a', title: 'Hire', owner: '', status: 'not_started', progressPercentage: 0, successCriteria: '' },
          { id: 'rock-b', title: ' hire ', owner: 'Sam', status: 'not_started', progressPercentage: 0, successCriteria: 'Two hired', targetDate: '2026-11-30' },
        ] as Rock[],
      }),
    );
    expect(rocks).toHaveLength(1);
    expect(rocks[0]).toMatchObject({ id: 'rock-a', title: 'Hire', owner: 'Sam', successCriteria: 'Two hired', targetDate: '2026-11-30' });
  });

  it('reads back the list completion records as the same list', () => {
    // Completion stores what it filed; reading that record must not change it.
    const r = review({
      quarter: 1,
      initiative_decisions: [decision({ initiativeId: 'd-9', title: 'Recurring maintenance drive', quarterAssigned: 'q1' })],
      quarterly_rocks: [...precisionRocks, envisageEmptyRock],
    });
    const recorded = reviewRocks(r);
    expect(reviewRocks({ ...r, quarterly_rocks: recorded })).toEqual(recorded);
  });
});

// ---------------------------------------------------------------------------
// The workshop itself: the real completeWorkshop and background sync, with the
// services they write through stubbed at the edge.
// ---------------------------------------------------------------------------

const workshopReview = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  business_id: 'biz-1',
  user_id: 'user-1',
  quarter: 2,
  year: 2027,
  review_type: 'quarterly',
  status: 'in_progress',
  current_step: '4.2',
  steps_completed: ['prework', '1.2', '1.3', '1.4', '2.2', '2.4', '2.5', '3.1', '4.1'],
  quarterly_targets: { revenue: 0, grossProfit: 0, netProfit: 0, kpis: [] },
  initiatives_changes: { added: [], removed: [], deferred: [] },
  initiative_decisions: [],
  quarterly_rocks: [],
  ...over,
});

async function openReview(stored: Record<string, unknown>) {
  h.review = stored;
  const hook = renderHook(() => useQuarterlyReview({ reviewId: String(stored.id) }));
  await waitFor(() => expect(hook.result.current.review?.id).toBe(stored.id));
  return hook;
}

/** The rocks syncAll was handed, and the rocks completion recorded on the review. */
const filed = () => h.syncAll.mock.calls.at(-1)?.[5] as Rock[];
const recorded = () => h.completeWorkshop.mock.calls.at(-1)?.[1] as Rock[];

describe('completing a review files the rocks its decisions hold', () => {
  beforeEach(() => {
    h.syncAll.mockReset().mockResolvedValue({ success: true, errors: [] });
    h.syncRocks.mockReset().mockResolvedValue({ success: true });
    h.updateReview.mockReset().mockImplementation(async (_id: string, data: unknown) => data);
    h.completeWorkshop.mockReset().mockImplementation(async (_id: string, rocks: Rock[]) => ({
      ...h.review,
      status: 'completed',
      current_step: 'complete',
      quarterly_rocks: rocks,
    }));
  });

  it('files Sydney Pressed Metal\'s five rocks, though Sprint Planning was never edited', async () => {
    const { result } = await openReview(workshopReview({ initiative_decisions: spmDecisions, quarterly_rocks: [] }));

    await act(async () => {
      await result.current.completeWorkshop();
    });

    expect(titles(filed())).toEqual([
      'Capacity Planning',
      'Client Success System',
      'Daily Brief Framework - pre-start - builder trend',
      'People Power',
      'Sales Team Launch',
    ]);
    // The review records exactly what it filed, and the close screen reads that.
    expect(recorded()).toEqual(filed());
    expect(result.current.review?.quarterly_rocks).toEqual(filed());
  });

  it('files an initiative moved into the quarter in 4.2 after Sprint Planning last saved', async () => {
    const training = decision({ initiativeId: '05af7ff5-6023-4f36-b4b0-7db83c7c3740', title: 'Training' });
    const payroll = decision({ initiativeId: 'c742f2c3-71d8-4597-acf0-04afc0833d87', title: 'Payroll Automations', quarterAssigned: 'unassigned' });
    const { result } = await openReview(
      workshopReview({ initiative_decisions: [training, payroll], quarterly_rocks: rocksFromDecisions([training], 2) }),
    );

    // Step 4.2 moves it — the decisions change, the stored list does not.
    act(() => result.current.updateInitiativeDecisions([training, { ...payroll, quarterAssigned: 'q2' }]));
    await act(async () => {
      await result.current.completeWorkshop();
    });

    expect(titles(filed())).toEqual(['Training', 'Payroll Automations']);
    expect(recorded()).toEqual(filed());
  });

  it('does not file a rock moved out of the quarter in 4.2', async () => {
    const a = decision({ initiativeId: 'd-a', title: 'Stays' });
    const b = decision({ initiativeId: 'd-b', title: 'Moves to Q3' });
    const { result } = await openReview(
      workshopReview({ initiative_decisions: [a, b], quarterly_rocks: rocksFromDecisions([a, b], 2) }),
    );

    act(() => result.current.updateInitiativeDecisions([a, { ...b, quarterAssigned: 'q3' }]));
    await act(async () => {
      await result.current.completeWorkshop();
    });

    expect(titles(filed())).toEqual(['Stays']);
  });

  it('files and keeps Precision\'s seeded rocks', async () => {
    const { result } = await openReview(
      workshopReview({
        quarter: 1,
        initiative_decisions: [decision({ quarterAssigned: 'q2' })],
        quarterly_rocks: precisionRocks,
      }),
    );

    await act(async () => {
      await result.current.completeWorkshop();
    });

    expect(filed()).toEqual(precisionRocks);
    expect(recorded()).toEqual(precisionRocks);
  });
});

describe('the Sprint Planning background sync files the decisions\' rocks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    h.syncRocks.mockReset().mockResolvedValue({ success: true });
    h.updateReview.mockReset().mockImplementation(async (_id: string, data: unknown) => data);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs what the decisions hold, not what the step last stored', async () => {
    // Arriving at 4.3 writes nothing back, so the stored list is whatever the
    // step last saved — here, before 4.2 added the second rock.
    const a = decision({ initiativeId: 'd-a', title: 'Already planned' });
    const b = decision({ initiativeId: 'd-b', title: 'Added in 4.2 since' });
    await openReview(
      workshopReview({ current_step: '4.3', initiative_decisions: [a, b], quarterly_rocks: rocksFromDecisions([a], 2) }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });

    expect(h.syncRocks).toHaveBeenCalledTimes(1);
    const [businessId, userId, rocks, quarterKey] = h.syncRocks.mock.calls[0];
    expect([businessId, userId, quarterKey]).toEqual(['profile-1', 'user-1', 'q2']);
    expect(titles(rocks)).toEqual(['Already planned', 'Added in 4.2 since']);
  });
});

describe('the close screen shows the rocks the review set', () => {
  it('lists the decisions\' rocks when the stored list is stale', () => {
    const planned = decision({ initiativeId: 'd-a', title: 'People Power' });
    const pool = decision({ initiativeId: 'd-u', title: 'From the Available pool', quarterAssigned: 'unassigned' });
    const html = renderToStaticMarkup(
      <WorkshopCompleteStep
        review={
          {
            ...workshopReview({ status: 'completed', current_step: 'complete' }),
            initiative_decisions: [planned, pool],
            // Stored when the pool still counted: a rock the decisions no longer make.
            quarterly_rocks: [{ id: 'd-u', title: 'From the Available pool', owner: '', status: 'not_started', progressPercentage: 0, successCriteria: '', linkedInitiatives: ['d-u'] }],
          } as never
        }
      />,
    );
    expect(html).toContain('People Power');
    expect(html).not.toContain('From the Available pool');
  });
});

describe('nothing reads the stored rocks around the rule', () => {
  // Every screen and sync takes a review's rocks from reviewRocks. A reader of
  // the raw column would show the stale list again — the close screen, the
  // summary, history and the PDF each did.
  const src = path.resolve(__dirname, '../..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === '__tests__' ? [] : files(full);
      return /\.(ts|tsx)$/.test(name) ? [full] : [];
    });

  it('is read raw only by the rule itself and the retired rock editor', () => {
    const rawReaders = files(src)
      .filter(f => /\.quarterly_rocks\b/.test(readFileSync(f, 'utf8')))
      .map(f => path.relative(src, f))
      .sort();
    expect(rawReaders).toEqual([
      // Retired: not routed into the workshop since the v2 step sequence.
      'app/quarterly-review/components/steps/SprintRocksStep.tsx',
      'app/quarterly-review/utils/rocks-from-decisions.ts',
    ]);
  });
});
