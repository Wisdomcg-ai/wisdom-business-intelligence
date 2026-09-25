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
import {
  duplicateListings,
  mergeSprintEdits,
  plannedRockDecisions,
  removeRockFromQuarter,
  rocksFromDecisions,
} from '@/app/quarterly-review/utils/rocks-from-decisions';
import { reconcileDecisions, onePoolEntryPerInitiative } from '@/app/quarterly-review/utils/reconcile-decisions';
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
