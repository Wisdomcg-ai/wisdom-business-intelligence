/**
 * The quarter's rocks reach the column every rock reader depends on.
 *
 * `quarterly_reviews.quarterly_rocks` had no writer at all. The updater existed
 * (`useQuarterlyReview.updateQuarterlyRocks`) and was destructured on the
 * workshop page, and then handed to no component — step 4.3 received only
 * `onUpdateInitiativeDecisions`. Six readers depended on the column: the close
 * screen, the summary, the history list, the client PDF, the background sync,
 * and `syncAll`, whose `syncRocks` returns early on an empty list, so no
 * quarter rows were written either. Production confirms it: every review ever
 * completed carries an empty rocks array.
 *
 * Step 4.3 has no rock editor — it works in decisions, and a rock IS a kept
 * initiative for the quarter being planned. The rule here is deliberately the
 * same one the PDF's reader-side fallback uses for older reviews, so a review
 * shows the same rocks whether they were stored or derived.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { rocksFromDecisions, isForPlannedQuarter } from '@/app/quarterly-review/utils/rocks-from-decisions';
import type { InitiativeDecision } from '@/app/quarterly-review/types';

const decision = (over: Partial<InitiativeDecision> = {}): InitiativeDecision =>
  ({
    initiativeId: 'init-1',
    title: 'Win three new maintenance contracts',
    category: 'sales',
    currentStatus: 'not_started',
    progressPercentage: 0,
    decision: 'keep',
    notes: '',
    ...over,
  }) as InitiativeDecision;

describe('which decisions are this quarter\'s rocks', () => {
  it('keeps what the coach kept or accelerated', () => {
    const rocks = rocksFromDecisions(
      [
        decision({ initiativeId: 'a', decision: 'keep' }),
        decision({ initiativeId: 'b', decision: 'accelerate' }),
        decision({ initiativeId: 'c', decision: 'defer' }),
        decision({ initiativeId: 'd', decision: 'kill' }),
      ],
      2,
    );
    expect(rocks.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('counts a decision with no quarter as this quarter\'s', () => {
    // The step assigns a quarter only when the coach drags into one; an
    // untouched decision in 4.3 is about the quarter being planned.
    expect(isForPlannedQuarter({ quarterAssigned: undefined }, 2)).toBe(true);
    expect(isForPlannedQuarter({ quarterAssigned: 'unassigned' }, 2)).toBe(true);
    expect(isForPlannedQuarter({ quarterAssigned: 'q2' }, 2)).toBe(true);
    expect(isForPlannedQuarter({ quarterAssigned: 'Q2' }, 2)).toBe(true);
  });

  it('leaves another quarter\'s work out of this quarter\'s rocks', () => {
    const rocks = rocksFromDecisions(
      [
        decision({ initiativeId: 'this', quarterAssigned: 'q2' }),
        decision({ initiativeId: 'later', quarterAssigned: 'q4' }),
      ],
      2,
    );
    expect(rocks.map(r => r.id)).toEqual(['this']);
  });

  it('carries the sprint detail the step collected', () => {
    const [rock] = rocksFromDecisions(
      [
        decision({
          initiativeId: 'init-9',
          title: 'Hire a second estimator',
          assignedTo: 'Steve',
          why: 'Quoting is the bottleneck',
          outcome: 'Two estimators quoting by 30 Nov',
          startDate: '2026-10-01',
          endDate: '2026-11-30',
          notes: 'Budget approved',
        }),
      ],
      2,
    );

    expect(rock).toMatchObject({
      id: 'init-9',
      title: 'Hire a second estimator',
      owner: 'Steve',
      description: 'Quoting is the bottleneck',
      successCriteria: 'Two estimators quoting by 30 Nov',
      startDate: '2026-10-01',
      targetDate: '2026-11-30',
      status: 'not_started',
      progressPercentage: 0,
      priority: 1,
    });
    expect(rock.linkedInitiatives).toEqual(['init-9']);
  });

  it('answers empty for a session that planned nothing', () => {
    expect(rocksFromDecisions([], 2)).toEqual([]);
    expect(rocksFromDecisions(null, 2)).toEqual([]);
    expect(rocksFromDecisions([decision({ decision: 'kill' })], 2)).toEqual([]);
  });
});

describe('step 4.3 is wired to the rocks updater', () => {
  const page = readFileSync(
    path.resolve(__dirname, '../../app/quarterly-review/workshop/page.tsx'),
    'utf-8',
  );

  it('writes the rocks when the decisions change', () => {
    // The regression is precisely that the updater existed and was passed to
    // nobody, so a sentinel on "it is called" is the fence that matters.
    expect(page).toMatch(/updateQuarterlyRocks\(rocksFromDecisions\(/);
    expect(page).toContain("from '../utils/rocks-from-decisions'");
  });

  it('derives them from the review\'s own quarter, not the clock', () => {
    expect(page).toMatch(/rocksFromDecisions\(decisions,\s*review\.quarter\)/);
  });
});
