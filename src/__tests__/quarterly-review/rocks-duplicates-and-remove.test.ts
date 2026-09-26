/**
 * JVJ Civil and Asphalt, Sprint Planning (4.3), 25 Sep 2026: five rocks where
 * the coach set three, and no way to remove one.
 *
 * - The review was completed on 24 Sep. Completing saved the two rocks it had
 *   added in 4.2 (Training, KPI & Bonus Structure) as plan rows; re-opening it
 *   loaded those rows AND kept the session's copies — each rock twice.
 * - "Remove Initiative" appeared only on rocks added in 4.3, and even there it
 *   removed the rock from the step's working copy only: the decisions still
 *   held it, and the step's re-sync put it back within a second.
 *
 * Matt's call: flag a repeat and let the coach choose which to remove — never
 * merge or drop one on their behalf.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  duplicateListings,
  mergeSprintEdits,
  plannedRockDecisions,
  removeRockFromQuarter,
  rocksFromDecisions,
} from '@/app/quarterly-review/utils/rocks-from-decisions';
import {
  reconcileDecisions,
  onePoolEntryPerInitiative,
  listQuarterRow,
} from '@/app/quarterly-review/utils/reconcile-decisions';
import { createdByReview, liveQuarterRows } from '@/app/quarterly-review/utils/quarter-rows';
import type { InitiativeDecision } from '@/app/quarterly-review/types';

const d = (over: Partial<InitiativeDecision>): InitiativeDecision =>
  ({
    initiativeId: 'x',
    title: 'A rock',
    category: 'people',
    currentStatus: 'not_started',
    progressPercentage: 0,
    decision: 'keep',
    notes: '',
    quarterAssigned: 'q2',
    ...over,
  }) as InitiativeDecision;

const TRAINING_ROW = '05af7ff5-6023-4f36-b4b0-7db83c7c3740';
const KPI_ROW = '5d9fb9c9-11e6-4325-8d25-4d6ab6a9b2e1';

/** JVJ's review, as stored on 25 Sep 2026. */
const jvj = (): InitiativeDecision[] => [
  d({ initiativeId: TRAINING_ROW, title: 'Training', assignedTo: 'Trent Greenshields' }),
  d({ initiativeId: KPI_ROW, title: 'KPI & Bonus Structure' }),
  d({ initiativeId: 'c742f2c3-71d8-4597-acf0-04afc0833d87', title: 'Performance Management System', quarterAssigned: 'unassigned' }),
  d({ initiativeId: '0a1d1d80-5bb0-4220-8f2a-e850a050c1b7', title: 'Performance Management System', quarterAssigned: 'unassigned' }),
  d({ initiativeId: 'new-1790293272000', title: 'Training', why: 'Crews trained on the new plant' }),
  d({ initiativeId: 'new-1790293338029', title: 'KPI & Bonus Structure', assignedTo: 'Chris Panic' }),
  d({ initiativeId: 'sprint-new-1790296002208', title: 'Complete the Payroll Automations' }),
];

describe('Sprint Planning lists every copy, and says which repeat', () => {
  it('shows JVJ\'s five listings — not Performance Management System, which sits in the pool', () => {
    expect(plannedRockDecisions(jvj(), 2).map(r => r.title)).toEqual([
      'Training',
      'KPI & Bonus Structure',
      'Training',
      'KPI & Bonus Structure',
      'Complete the Payroll Automations',
    ]);
  });

  it('points each repeat at the other listing', () => {
    const dupes = duplicateListings(plannedRockDecisions(jvj(), 2));
    expect(dupes.get(TRAINING_ROW)).toEqual([3]);
    expect(dupes.get('new-1790293272000')).toEqual([1]);
    expect(dupes.get(KPI_ROW)).toEqual([4]);
    expect(dupes.get('new-1790293338029')).toEqual([2]);
    expect(dupes.has('sprint-new-1790296002208')).toBe(false);
  });

  it('judges a repeat through case and spacing, and never flags an untitled rock', () => {
    const dupes = duplicateListings([
      d({ initiativeId: 'a', title: 'Due Date Focus' }),
      d({ initiativeId: 'b', title: '  due   date FOCUS ' }),
      d({ initiativeId: 'c', title: '' }),
      d({ initiativeId: 'e', title: '' }),
    ]);
    expect(dupes.get('a')).toEqual([2]);
    expect(dupes.has('c')).toBe(false);
  });
});

describe('removing a listing removes exactly that listing — and it stays removed', () => {
  it('drops a copy the review added itself; the saved row is untouched', () => {
    const next = removeRockFromQuarter(jvj(), 'new-1790293272000', 2);
    expect(next.some(r => r.initiativeId === 'new-1790293272000')).toBe(false);
    expect(next.find(r => r.initiativeId === TRAINING_ROW)?.decision).toBe('keep');
    expect(plannedRockDecisions(next, 2).filter(r => r.title === 'Training')).toHaveLength(1);
  });

  it('marks a saved rock Drop — never deletes it — when it has no other listing', () => {
    const next = removeRockFromQuarter(jvj(), 'c742f2c3-71d8-4597-acf0-04afc0833d87', 2);
    // Not a rock this quarter (it is in the pool), but still removable by id.
    expect(next.find(r => r.initiativeId === 'c742f2c3-71d8-4597-acf0-04afc0833d87')?.decision).toBe('kill');
    expect(next).toHaveLength(7);
  });

  it('removing the SAVED listing keeps the one the coach kept — on the saved row, not cancelled', () => {
    // Dropping the row would leave the kept copy to be matched to it by title
    // on completion — and saved as cancelled.
    const next = removeRockFromQuarter(jvj(), TRAINING_ROW, 2);
    const training = plannedRockDecisions(next, 2).filter(r => r.title === 'Training');
    expect(training).toHaveLength(1);
    expect(training[0].initiativeId).toBe(TRAINING_ROW);
    expect(training[0].decision).toBe('keep');
    // Everything on the kept card came with it; what was only on the removed one did not.
    expect(training[0].why).toBe('Crews trained on the new plant');
    expect(training[0].assignedTo).toBeUndefined();
    expect(next.some(r => r.initiativeId === 'new-1790293272000')).toBe(false);
  });

  it('saves the rocks the coach chose, once each', () => {
    let next = removeRockFromQuarter(jvj(), 'new-1790293272000', 2);
    next = removeRockFromQuarter(next, KPI_ROW, 2);
    expect(rocksFromDecisions(next, 2).map(r => [r.title, r.owner])).toEqual([
      ['Training', 'Trent Greenshields'],
      ['KPI & Bonus Structure', 'Chris Panic'],
      ['Complete the Payroll Automations', ''],
    ]);
  });

  it('answers the same array when there is nothing to remove', () => {
    const all = jvj();
    expect(removeRockFromQuarter(all, 'not-there', 2)).toBe(all);
  });
});

describe('the step\'s edits are written onto their own decisions', () => {
  it('merges each rock\'s detail by id and appends rocks added in the step', () => {
    const merged = mergeSprintEdits(jvj(), [
      d({ initiativeId: KPI_ROW, title: 'KPI & Bonus Structure', outcome: 'Scheme signed off' }),
      d({ initiativeId: 'sprint-new-2', title: 'New crew leader' }),
    ]);
    expect(merged.find(r => r.initiativeId === KPI_ROW)?.outcome).toBe('Scheme signed off');
    expect(merged.at(-1)?.initiativeId).toBe('sprint-new-2');
    expect(merged).toHaveLength(8);
  });
});

describe('4.2 re-loading the plan never lists a rock twice on its own account', () => {
  const freshRow = (id: string, title: string) =>
    d({ initiativeId: id, title, currentStatus: 'not_started' });

  it('folds the copy a completion saved back into the row it created', () => {
    // Before completion: the session's own copy. After: the plan has a row for it.
    const session = [d({ initiativeId: 'new-1', title: 'Training', decision: 'accelerate', why: 'Crews trained' })];
    const out = reconcileDecisions(session, [freshRow(TRAINING_ROW, 'Training')]);
    expect(out).toHaveLength(1);
    expect(out[0].initiativeId).toBe(TRAINING_ROW);
    expect(out[0].decision).toBe('accelerate');
    expect(out[0].why).toBe('Crews trained');
  });

  it('leaves both listed when the review already held the row — the coach chooses (JVJ today)', () => {
    const out = reconcileDecisions(jvj(), [
      freshRow(TRAINING_ROW, 'Training'),
      freshRow(KPI_ROW, 'KPI & Bonus Structure'),
    ]);
    expect(out.filter(r => r.title === 'Training').map(r => r.initiativeId)).toEqual([TRAINING_ROW, 'new-1790293272000']);
  });

  it('folds back one copy per row — a second copy of the title stays listed', () => {
    const session = [
      d({ initiativeId: 'new-1', title: 'Training' }),
      d({ initiativeId: 'new-2', title: 'Training' }),
    ];
    const out = reconcileDecisions(session, [freshRow(TRAINING_ROW, 'Training')]);
    expect(out.map(r => r.initiativeId)).toEqual([TRAINING_ROW, 'new-2']);
  });

  it('keeps a rock added in Sprint Planning when the coach goes back to 4.2', () => {
    const session = [d({ initiativeId: 'sprint-new-1', title: 'Complete the Payroll Automations' })];
    const out = reconcileDecisions(session, [freshRow(TRAINING_ROW, 'Training')]);
    expect(out.map(r => r.initiativeId)).toEqual([TRAINING_ROW, 'sprint-new-1']);
  });

  it('does not fold a copy into a row of the same title in another quarter', () => {
    const session = [d({ initiativeId: 'new-1', title: 'Training', quarterAssigned: 'q2' })];
    const out = reconcileDecisions(session, [d({ initiativeId: TRAINING_ROW, title: 'Training', quarterAssigned: 'q3' })]);
    expect(out).toHaveLength(2);
  });
});

// The sync now files a rock picked from the 12-month list or an earlier quarter
// under a quarter row of its own and leaves the original where it is (it used to
// MOVE the original — Digital Bond, 25 Sep 2026). Re-loading 4.2 then finds that
// quarter row, new to the review — and the pick's own row back in its place, or
// (a 12-month initiative) out of the pool altogether.
describe('4.2 re-loading the plan hands a pick over to the quarter row it was filed under', () => {
  const TWELVE_MONTH = '22222222-2222-4222-8222-222222222222';
  const Q1_ROCK = '33333333-3333-4333-8333-333333333333';
  const QUARTER_ROW = '66666666-6666-4666-8666-666666666666';
  const MONEY = 'Determine how to get money off the table and invest';

  it('a 12-month initiative picked for the quarter: its quarter row takes the coach\'s decision and sprint detail', () => {
    const saved = [
      d({ initiativeId: TWELVE_MONTH, title: MONEY, decision: 'accelerate', why: 'The owner is the bottleneck', assignedTo: 'Sam' }),
    ];
    // The 12-month row is not re-loaded: 4.2's pool hides what a quarter holds.
    const out = reconcileDecisions(saved, [d({ initiativeId: QUARTER_ROW, title: MONEY })]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      initiativeId: QUARTER_ROW,
      quarterAssigned: 'q2',
      decision: 'accelerate',
      why: 'The owner is the bottleneck',
      assignedTo: 'Sam',
    });
  });

  it('a rock carried forward from Q1: the quarter row takes the pick, and the Q1 row is listed in Q1 as the plan holds it', () => {
    const saved = [d({ initiativeId: Q1_ROCK, title: 'Hire an estimator', why: 'Quotes go out late' })];
    const out = reconcileDecisions(saved, [
      d({ initiativeId: Q1_ROCK, title: 'Hire an estimator', quarterAssigned: 'q1', currentStatus: 'in_progress' }),
      d({ initiativeId: QUARTER_ROW, title: 'Hire an estimator' }),
    ]);

    expect(out.map(r => [r.initiativeId, r.quarterAssigned, r.why])).toEqual([
      [Q1_ROCK, 'q1', undefined],
      [QUARTER_ROW, 'q2', 'Quotes go out late'],
    ]);
  });

  it('a pick taken out of the quarter takes its quarter row with it — it does not come back as a rock', () => {
    // Removed in Sprint Planning after the background sync had filed it.
    const saved = [d({ initiativeId: TWELVE_MONTH, title: MONEY, decision: 'kill' })];
    const out = reconcileDecisions(saved, [d({ initiativeId: QUARTER_ROW, title: MONEY })], new Set([QUARTER_ROW]));

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ initiativeId: QUARTER_ROW, decision: 'kill' });
    expect(plannedRockDecisions(out, 2)).toEqual([]);
  });

  it('a pick taken out never takes a quarter row the Goals wizard filed — it stays listed for the coach', () => {
    const saved = [d({ initiativeId: TWELVE_MONTH, title: MONEY, decision: 'kill' })];
    const out = reconcileDecisions(saved, [d({ initiativeId: QUARTER_ROW, title: MONEY })], new Set());

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ initiativeId: QUARTER_ROW, decision: 'keep' });
  });

  it('never takes an Available-pool entry for a pick', () => {
    // The idea row was dropped for its 12-month row of the same title (one pool
    // entry per initiative); the idea's decision is not the 12-month row's.
    const saved = [d({ initiativeId: 'c742f2c3-71d8-4597-acf0-04afc0833d87', title: 'Performance Management System', quarterAssigned: 'unassigned', decision: 'kill' })];
    const out = reconcileDecisions(saved, [
      d({ initiativeId: '0a1d1d80-5bb0-4220-8f2a-e850a050c1b7', title: 'Performance Management System', quarterAssigned: 'unassigned' }),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].decision).toBe('keep');
  });
});

// 26 Sep 2026, found building #605. A rock added in the session — 'sprint-new-'
// in 4.3, 'new-' in 4.2 — is filed by the 4.3 background sync a few seconds
// after an edit: syncRocks inserts a quarter row for it. Removing the rock after
// that dropped its listing and nothing else, so the row stayed an active rock
// (One-Page Plan, the next review's 1.3), and 4.2's next load listed it as a
// fresh 'keep' — the removal undid itself. Efficient Living's Q2 review shows
// the filing: five rows created at 00:19 and 00:26 UTC on 25 Sep, before the
// review completed at 00:31.
describe('a rock the review added, then removed, stays removed', () => {
  const HIRE = 'Hire a general manager';
  const FILED_ROW = '77777777-7777-4777-8777-777777777777';
  const GOALS_ROW = '88888888-8888-4888-8888-888888888888';
  const added = (over: Partial<InitiativeDecision> = {}) =>
    d({ initiativeId: 'sprint-new-1790296002208', title: HIRE, why: 'The owner runs every job', ...over });
  /** The row the background sync filed for it, as step 4.2 loads it. */
  const filed = (over: Partial<InitiativeDecision> = {}) =>
    d({ initiativeId: FILED_ROW, title: HIRE, source: 'quarterly_review', ...over });

  it('removing it marks it Drop: the record stays in the review, and it is no longer a rock', () => {
    const next = removeRockFromQuarter([added()], 'sprint-new-1790296002208', 2);

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ initiativeId: 'sprint-new-1790296002208', title: HIRE, decision: 'kill' });
    expect(plannedRockDecisions(next, 2)).toEqual([]);
    expect(rocksFromDecisions(next, 2)).toEqual([]);
  });

  it('the same for a rock added in 4.2', () => {
    const next = removeRockFromQuarter([added({ initiativeId: 'new-1790293272000' })], 'new-1790293272000', 2);
    expect(next[0].decision).toBe('kill');
  });

  it('a copy removed while another listing keeps the rock is removed outright — the rock stays', () => {
    const both = [added(), added({ initiativeId: 'sprint-new-2', why: '' })];

    const once = removeRockFromQuarter(both, 'sprint-new-2', 2);
    expect(once.map(r => [r.initiativeId, r.decision])).toEqual([['sprint-new-1790296002208', 'keep']]);

    // Then the last listing goes: now the rock is out of the quarter.
    const twice = removeRockFromQuarter(once, 'sprint-new-1790296002208', 2);
    expect(twice.map(r => [r.initiativeId, r.decision])).toEqual([['sprint-new-1790296002208', 'kill']]);
  });

  it('a Drop does not keep the rock: removing the other listing drops it too', () => {
    const next = removeRockFromQuarter(
      [added({ initiativeId: 'sprint-new-1', decision: 'kill' }), added({ initiativeId: 'sprint-new-2' })],
      'sprint-new-2',
      2,
    );
    expect(next.map(r => r.decision)).toEqual(['kill', 'kill']);
  });

  it('an untitled rock never had a row, so it is simply removed', () => {
    expect(removeRockFromQuarter([added({ title: '  ' })], 'sprint-new-1790296002208', 2)).toEqual([]);
  });

  it('4.2 re-loading lists the filed row once, as Drop — it is not a rock again', () => {
    const session = removeRockFromQuarter([added()], 'sprint-new-1790296002208', 2);
    const out = reconcileDecisions(session, [filed()], new Set([FILED_ROW]));

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ initiativeId: FILED_ROW, decision: 'kill', why: 'The owner runs every job' });
    expect(plannedRockDecisions(out, 2)).toEqual([]);
  });

  it('the same once the background sync has already cancelled the row', () => {
    const session = removeRockFromQuarter([added()], 'sprint-new-1790296002208', 2);
    const cancelled = listQuarterRow(
      { id: FILED_ROW, title: HIRE, status: 'cancelled', source: 'quarterly_review' },
      'q2',
    );
    const out = reconcileDecisions(session, [cancelled], new Set([FILED_ROW]));

    expect(out.map(r => [r.initiativeId, r.decision])).toEqual([[FILED_ROW, 'kill']]);
  });

  it('a Drop never takes a row of that name the plan already held — it stays listed, for the coach to decide', () => {
    // First session: 4.2 lists none of the plan's rows, so the Goals wizard's
    // own q2 "Hire a general manager" was never on screen, let alone dropped.
    const session = removeRockFromQuarter([added()], 'sprint-new-1790296002208', 2);
    const out = reconcileDecisions(session, [d({ initiativeId: GOALS_ROW, title: HIRE })], new Set());

    expect(out.map(r => [r.initiativeId, r.decision])).toEqual([
      [GOALS_ROW, 'keep'],
      ['sprint-new-1790296002208', 'kill'],
    ]);
  });

  it('a rock re-added after it was removed takes the row, not the old Drop', () => {
    const session = [
      added({ initiativeId: 'sprint-new-1', decision: 'kill' }),
      added({ initiativeId: 'sprint-new-2', why: 'Second attempt' }),
    ];
    const out = reconcileDecisions(session, [filed()], new Set([FILED_ROW]));

    expect(out.map(r => [r.initiativeId, r.decision, r.why])).toEqual([
      [FILED_ROW, 'keep', 'Second attempt'],
      ['sprint-new-1', 'kill', 'The owner runs every job'],
    ]);
  });

  it('a kept rock is never folded into a row saved as cancelled — it is listed beside the dropped one', () => {
    // syncRocks gives it a row of its own, as it does a rock re-added under a
    // dropped rock's name (#604); the dropped row stays as history.
    const cancelled = listQuarterRow({ id: FILED_ROW, title: HIRE, status: 'cancelled' }, 'q2');
    const out = reconcileDecisions([added({ initiativeId: 'sprint-new-2' })], [cancelled], new Set([FILED_ROW]));

    expect(out.map(r => [r.initiativeId, r.decision])).toEqual([
      [FILED_ROW, 'kill'],
      ['sprint-new-2', 'keep'],
    ]);
  });
});

describe('4.2 lists a quarter row the coach dropped as Drop', () => {
  it('a row saved as cancelled is Drop — not a fresh keep that the next completion saves as in progress', () => {
    // Efficient Living: fifteen repeats of its Q1 rocks, cancelled 25 Sep 2026.
    const row = listQuarterRow(
      { id: 'a1', title: 'Due Date Focus', status: 'cancelled', category: 'operations', source: 'strategic_ideas' },
      'q1',
    );
    expect(row).toMatchObject({ initiativeId: 'a1', decision: 'kill', currentStatus: 'cancelled', quarterAssigned: 'q1' });
  });

  it('every other row is listed as before', () => {
    expect(
      listQuarterRow(
        {
          id: 'a2',
          title: 'Training',
          status: 'in_progress',
          category: 'people',
          progress_percentage: 40,
          assigned_to: 'Trent Greenshields',
          source: 'roadmap',
          idea_type: 'strategic',
        },
        'q2',
      ),
    ).toEqual({
      initiativeId: 'a2',
      title: 'Training',
      category: 'people',
      currentStatus: 'in_progress',
      progressPercentage: 40,
      decision: 'keep',
      notes: '[Assigned: Trent Greenshields]',
      quarterAssigned: 'q2',
      source: 'roadmap',
      ideaType: 'strategic',
    });
    expect(listQuarterRow({ id: 'a3', title: 'Hire', status: null }, 'q3')).toMatchObject({
      decision: 'keep',
      currentStatus: 'active',
      category: 'marketing',
    });
  });

  it('a quarter\'s rocks leave out the rows saved as cancelled', () => {
    const rows = [
      { id: '1', status: 'not_started' },
      { id: '2', status: 'cancelled' },
      { id: '3', status: 'in_progress' },
      { id: '4', status: null },
    ];
    expect(liveQuarterRows(rows).map(r => r.id)).toEqual(['1', '3', '4']);
  });
});

// A dropped rock is saved as cancelled, never deleted, and no screen that lists
// a quarter's rocks read the status: the One-Page Plan, the next review's 1.3
// and 4.2 all showed it as a live rock.
describe('the screens that list a quarter\'s rocks treat a dropped one as dropped', () => {
  const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf-8');

  it('the One-Page Plan leaves it out of the quarter\'s rocks', () => {
    const assembler = read('../../app/one-page-plan/services/plan-data-assembler.ts');
    expect(assembler).toMatch(/quarterlyRocks: liveQuarterRows\(quarterInitiatives \|\| \[\]\)/);
  });

  it('the next review\'s 1.3 does not review it, from either of its sources', () => {
    const step = read('../../app/quarterly-review/components/steps/RocksReviewStep.tsx');
    expect(step).toMatch(/const quarterInitiatives = liveQuarterRows\(quarterRows \|\| \[\]\)/);
    expect(step).toMatch(/const allInitiatives = liveQuarterRows\(allRows \|\| \[\]\)/);
  });

  it('4.2 lists it as Drop, and hands the reconcile the rows this review filed', () => {
    const step = read('../../app/quarterly-review/components/steps/QuarterlyPlanStep.tsx');
    expect(step).toMatch(/allDecisions\.push\(listQuarterRow\(/);
    expect(step).toMatch(/createdByReview\(i, review\.created_at\)/);
    expect(step).toMatch(/reconcileDecisions\(decisions, allDecisions, ownRows\)/);
    // What createdByReview reads, selected for every quarter.
    expect(step.match(/source, idea_type, created_at'\)/g)).toHaveLength(4);
  });
});

describe('which quarter rows this review\'s own sync created', () => {
  // Production, 26 Sep 2026: rows as syncRocks left them, against the reviews.
  const EFFICIENT_LIVING_Q2_REVIEW = '2026-09-23 22:07:59.156721+00';
  const DIGITAL_BOND_Q2_REVIEW = '2026-09-24T22:52:36.927431+00:00';

  it('a row it inserted: filed by the background sync mid-session', () => {
    // Efficient Living's "Generate New Leads", 00:19 UTC — the review completed at 00:31.
    const row = { id: 'x', source: 'quarterly_review', created_at: '2026-09-25T00:19:20.144881+00:00' };
    expect(createdByReview(row, EFFICIENT_LIVING_Q2_REVIEW)).toBe(true);
  });

  it('not a row it only relabelled when it moved it — that row is older than the review', () => {
    // Digital Bond's "Build Client Delivery Playbooks": created in June, labelled
    // 'quarterly_review' by the 25 Sep completion that moved it into q2.
    const row = { id: 'y', source: 'quarterly_review', created_at: '2026-06-19 00:25:59.685821+00' };
    expect(createdByReview(row, DIGITAL_BOND_Q2_REVIEW)).toBe(false);
  });

  it('never a row another writer created, however new', () => {
    const row = { id: 'z', source: 'strategic_ideas', created_at: '2026-09-25T00:19:20.144881+00:00' };
    expect(createdByReview(row, EFFICIENT_LIVING_Q2_REVIEW)).toBe(false);
  });

  it('never a row it cannot date, nor for a review it cannot date', () => {
    expect(createdByReview({ id: 'a', source: 'quarterly_review' }, EFFICIENT_LIVING_Q2_REVIEW)).toBe(false);
    expect(createdByReview({ id: 'b', source: 'quarterly_review', created_at: 'soon' }, EFFICIENT_LIVING_Q2_REVIEW)).toBe(false);
    expect(createdByReview({ id: 'c', source: 'quarterly_review', created_at: '2026-09-25T00:19:20Z' }, null)).toBe(false);
  });

  it('a row created the same instant as the review counts', () => {
    const at = '2026-09-25T00:19:20.144881+00:00';
    expect(createdByReview({ id: 'd', source: 'quarterly_review', created_at: at }, at)).toBe(true);
  });
});

describe('4.2\'s Available pool lists an initiative once', () => {
  it('keeps the 12-month row when the plan also holds the idea it came from', () => {
    const rows = [
      { id: 'c742', title: 'Performance Management System', step_type: 'strategic_ideas' },
      { id: 'other', title: 'Hire a GM', step_type: 'strategic_ideas' },
      { id: '0a1d', title: 'Performance Management System', step_type: 'twelve_month' },
    ];
    expect(onePoolEntryPerInitiative(rows).map(r => r.id)).toEqual(['other', '0a1d']);
  });

  it('never merges rows with no title', () => {
    const rows = [
      { id: 'a', title: '', step_type: 'strategic_ideas' },
      { id: 'b', title: null, step_type: 'twelve_month' },
    ];
    expect(onePoolEntryPerInitiative(rows).map(r => r.id)).toEqual(['a', 'b']);
  });
});
