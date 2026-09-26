/**
 * How a quarter's rocks went — the computation behind the History page's rocks
 * figures (src/app/quarterly-review/utils/rocks-outcome.ts).
 *
 * The page counted rock.status === 'completed' over the rocks a review PLANNED,
 * which are built from its decisions as 'not_started' and never updated on the
 * review. The outcome is recorded one review later, in step 1.3
 * (rocks_review), so a review's figure describes the quarter BEFORE the one it
 * is named for. Fixtures are production rows as at 26 Sep 2026.
 */
import { describe, it, expect } from 'vitest';
import {
  plannedRocksProgress,
  reviewedQuarterName,
  reviewedRocksOutcome,
  rocksCompletionTrend,
} from '@/app/quarterly-review/utils/rocks-outcome';
import { rocksFromDecisions } from '@/app/quarterly-review/utils/rocks-from-decisions';
import type { InitiativeDecision, QuarterlyReview, Rock, RockReviewDecision, RockReviewItem } from '@/app/quarterly-review/types';

const item = (title: string, decision: RockReviewDecision, over: Partial<RockReviewItem> = {}): RockReviewItem => ({
  rockId: `rock-${title}`,
  title,
  owner: '',
  successCriteria: '',
  progressPercentage: decision === 'completed' ? 100 : 0,
  decision,
  outcomeNarrative: '',
  lessonsLearned: '',
  ...over,
});

type ReviewRow = Pick<QuarterlyReview, 'status' | 'quarter' | 'year' | 'rocks_review'>;
const review = (quarter: number, year: number, rocks_review: unknown, status = 'completed'): ReviewRow =>
  ({ quarter, year, status, rocks_review }) as ReviewRow;

/** Digital Bond, Q2 FY2027 review: the five Q1 rocks it held to account, two done. */
const digitalBondQ2 = [
  item('Niche & Offer', 'completed'),
  item('Build YouTube as a Core Growth Channel', 'carry_forward'),
  item('Position Myself as the AI Systems Author', 'carry_forward', { progressPercentage: 75 }),
  item('Hire someone to help with Ad campaigns', 'carry_forward'),
  item('Messaging on Digital Bond Website - Update', 'completed'),
];
/** Digital Bond, Q1 FY2027 review: two Q4 FY2026 rocks, both carried forward. */
const digitalBondQ1 = [
  item('Hire someone to help with Ad campaigns', 'carry_forward'),
  item('Niche & Offer', 'carry_forward', { progressPercentage: 75 }),
];
/**
 * Efficient Living, Q2 FY2027 review: five rocks loaded four times each (the
 * duplicate rows since cleaned up). The coach carried or modified one copy of
 * each and dropped the rest.
 */
const EL = ['Skilled overseas worker', 'Sales and Marketing', 'Due Date Focus', 'Process improvement and due date focus', 'Develop/upskill grads to increase profit'];
const efficientLivingQ2 = [
  item(EL[0], 'carry_forward', { progressPercentage: 25 }),
  item(EL[0], 'carry_forward', { progressPercentage: 10 }),
  item(EL[1], 'carry_forward', { progressPercentage: 45 }),
  item(EL[2], 'carry_forward', { progressPercentage: 10 }),
  item(EL[3], 'carry_forward', { progressPercentage: 10 }),
  item(EL[4], 'modify', { progressPercentage: 75 }),
  ...EL.flatMap((title, i) => Array.from({ length: i === 0 ? 2 : 3 }, () => item(title, 'drop'))),
];
/** JVJ, Q2 FY2027 — a first session: three priorities the owner recalled, all part-way. */
const jvjQ2 = ['Building JVJ Hub', 'Implementation of automations', 'Training the team on AI & the hub'].map(title =>
  item(title, 'carry_forward', { progressPercentage: 50, selfReported: true }),
);

describe('how the rocks a review held to account went', () => {
  it('reads Digital Bond\'s Q2 FY2027 review as two of five Q1 rocks done — 40%, named Q1 2027', () => {
    expect(reviewedRocksOutcome(review(2, 2027, digitalBondQ2))).toMatchObject({
      quarter: 1,
      year: 2027,
      label: 'Q1 2027',
      completed: 2,
      total: 5,
      percentage: 40,
      selfReported: false,
    });
  });

  it('names Q4 of the year before for a Q1 review, and keeps a real 0% as 0', () => {
    const outcome = reviewedRocksOutcome(review(1, 2027, digitalBondQ1));
    expect(outcome).toMatchObject({ quarter: 4, year: 2026, label: 'Q4 2026', completed: 0, total: 2, percentage: 0 });
    expect(reviewedQuarterName({ quarter: 1, year: 2027 })).toBe('Q4 2026');
  });

  it('has no figure — not 0% — when the review holds no assessment', () => {
    // Efficient Living's Q3 2026 review, Precision's seeded ones, and every
    // review that has not reached step 1.3 store an empty list.
    for (const stored of [[], null, undefined, {}]) {
      expect(reviewedRocksOutcome(review(3, 2026, stored))).toBeNull();
    }
  });

  it('counts every decision step 1.3 writes — modify and drop included', () => {
    expect(reviewedRocksOutcome(review(2, 2027, efficientLivingQ2))).toMatchObject({
      total: 20,
      completed: 0,
      percentage: 0,
      counts: { completed: 0, carry_forward: 5, modify: 1, drop: 14 },
    });
  });

  it('marks a first session\'s recalled priorities as self-reported', () => {
    expect(reviewedRocksOutcome(review(2, 2027, jvjQ2))).toMatchObject({ selfReported: true, total: 3, percentage: 0 });
    expect(reviewedRocksOutcome(review(2, 2027, [...jvjQ2, item('Held to account', 'completed')]))?.selfReported).toBe(false);
  });
});

describe('the Avg Rocks Completion card', () => {
  it('averages the quarters completed reviews held to account, oldest first', () => {
    // Envisage, newest first as getAllReviews returns them. Its Q4 2025 review
    // has no step 1.3 record; the other two held Q2 and Q3 2026 to account.
    const trend = rocksCompletionTrend([
      review(4, 2026, [item('Test Test', 'carry_forward'), item('Client Success System', 'carry_forward'), item('People Power', 'carry_forward')]),
      review(3, 2026, [item('Client Success System', 'carry_forward'), item('Test Test', 'completed'), item('People Power', 'carry_forward')]),
      review(4, 2025, []),
    ]);
    expect(trend?.quarters.map(q => [q.label, q.percentage])).toEqual([
      ['Q2 2026', 33],
      ['Q3 2026', 0],
    ]);
    // The mean of the figures the timeline shows: (33 + 0) / 2, rounded.
    expect(trend?.average).toBe(17);
  });

  it('reads a real 0% average as 0', () => {
    // Sydney Pressed Metal: none of the Q2 2026 or Q1 2027 rocks were finished.
    const trend = rocksCompletionTrend([
      review(2, 2027, Array.from({ length: 5 }, (_, i) => item(`Q1 rock ${i}`, i === 2 ? 'modify' : 'carry_forward'))),
      review(3, 2026, Array.from({ length: 3 }, (_, i) => item(`Q2 rock ${i}`, 'carry_forward'))),
    ]);
    expect(trend).toMatchObject({ average: 0 });
    expect(trend?.quarters).toHaveLength(2);
  });

  it('leaves out a review still in progress, and is null when no completed review holds an assessment', () => {
    // Precision: its two in-progress reviews have step 1.3 records, its two
    // completed (seeded) reviews do not. Their hand-set rock statuses stay out
    // of the average (Matt, 27 Sep 2026).
    expect(
      rocksCompletionTrend([
        review(2, 2027, [item('Tender margin discipline', 'carry_forward'), item('Cashflow & debtor collection', 'carry_forward')], 'in_progress'),
        review(1, 2027, [item('Win First 3 Strata Contracts', 'carry_forward'), item('Launch 24/7 Emergency Service', 'completed'), item('Recruit 2 Apprentices', 'completed')], 'in_progress'),
        { ...review(2, 2026, []), quarterly_rocks: [{ status: 'completed' }, { status: 'on_track' }, { status: 'on_track' }] } as ReviewRow,
        { ...review(1, 2026, []), quarterly_rocks: [{ status: 'completed' }, { status: 'completed' }, { status: 'on_track' }] } as ReviewRow,
      ]),
    ).toBeNull();
  });

  it('leaves out a first session\'s recalled priorities — they were never rocks (Matt, 27 Sep 2026)', () => {
    // JVJ's first session, then a later review holding two of three rocks done.
    const trend = rocksCompletionTrend([
      review(3, 2027, [item('Hub rollout', 'completed'), item('Automations live', 'completed'), item('AI training', 'carry_forward')]),
      review(2, 2027, jvjQ2),
    ]);
    expect(trend?.quarters.map(q => q.label)).toEqual(['Q2 2027']);
    expect(trend?.average).toBe(67);
    expect(rocksCompletionTrend([review(2, 2027, jvjQ2)])).toBeNull();
  });
});

describe('the rocks a review set carry a completion count only where one was recorded', () => {
  it('is null for rocks the workshop built — they are all not_started', () => {
    const decisions = [
      { initiativeId: 'a1111111-1111-4111-8111-111111111111', title: 'Niche & Offer', decision: 'keep', quarterAssigned: 'q2' },
      { initiativeId: 'b2222222-2222-4222-8222-222222222222', title: 'Build YouTube as a Core Growth Channel', decision: 'keep', quarterAssigned: 'q2' },
    ] as InitiativeDecision[];
    const built = rocksFromDecisions(decisions, 2);
    expect(built).toHaveLength(2);
    expect(plannedRocksProgress(built)).toBeNull();
  });

  it('counts Precision\'s seeded rocks, which carry the status someone set', () => {
    const seeded = [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'on_track' },
    ] as Rock[];
    expect(plannedRocksProgress(seeded)).toEqual({ completed: 2, total: 3 });
  });

  it('does not take a rock with no status as a recorded one', () => {
    expect(plannedRocksProgress([{ status: undefined } as unknown as Rock])).toBeNull();
  });
});
