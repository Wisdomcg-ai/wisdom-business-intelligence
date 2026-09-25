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
import { rocksFromDecisions, isForPlannedQuarter, titleKey } from '@/app/quarterly-review/utils/rocks-from-decisions';
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
    // Every rock step 4.3 shows is tagged with the quarter being planned.
    quarterAssigned: 'q2',
    ...over,
  }) as InitiativeDecision;

describe('which decisions are this quarter\'s rocks', () => {
  it('keeps what the coach kept or accelerated', () => {
    const rocks = rocksFromDecisions(
      [
        decision({ initiativeId: 'a', title: 'Win three maintenance contracts', decision: 'keep' }),
        decision({ initiativeId: 'b', title: 'Hire a second estimator', decision: 'accelerate' }),
        decision({ initiativeId: 'c', title: 'Rebuild the website', decision: 'defer' }),
        decision({ initiativeId: 'd', title: 'Open a second yard', decision: 'kill' }),
      ],
      2,
    );
    expect(rocks.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('leaves 4.2\'s Available pool out — "unassigned", or no quarter at all', () => {
    // Step 4.2 loads every idea and 12-month initiative nobody has put in a
    // quarter as quarterAssigned 'unassigned', decision 'keep', and groups a
    // missing quarter the same way. In production not one of those decisions
    // has ever carried sprint detail (owner, why, outcome, tasks, dates), while
    // the rocks coaches actually planned in 4.3 all do: the pool was never the
    // plan. Counting it (25 Sep 2026) stored Performance Management System as a
    // JVJ rock 4.3 never showed, and four extra each for Digital Bond and
    // Efficient Living.
    expect(isForPlannedQuarter({ quarterAssigned: 'unassigned' }, 2)).toBe(false);
    expect(isForPlannedQuarter({ quarterAssigned: undefined }, 2)).toBe(false);
    expect(isForPlannedQuarter({ quarterAssigned: '' }, 2)).toBe(false);
    expect(isForPlannedQuarter({ quarterAssigned: 'q2' }, 2)).toBe(true);
    expect(isForPlannedQuarter({ quarterAssigned: 'Q2' }, 2)).toBe(true);
  });

  it('leaves another quarter\'s work out of this quarter\'s rocks', () => {
    const rocks = rocksFromDecisions(
      [
        decision({ initiativeId: 'this', title: 'This quarter', quarterAssigned: 'q2' }),
        decision({ initiativeId: 'later', title: 'A later quarter', quarterAssigned: 'q4' }),
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

describe('one rock per title', () => {
  // initiative_decisions repeats titles in production: Digital Bond's completed
  // Q1 FY2027 review holds three twice over, Efficient Living's Q3 holds five
  // FOUR times. The ids differ each time, so id-based grouping never caught it,
  // and three screens read quarterly_rocks directly.
  it('stores the coach\'s five rocks once, not eight', () => {
    const rocks = rocksFromDecisions(
      [
        decision({ initiativeId: '1', title: 'Messaging on Digital Bond Website - Update' }),
        decision({ initiativeId: '2', title: 'Process for delivering a scalable solution' }),
        decision({ initiativeId: '3', title: 'Determine how to get money off the table and invest' }),
        decision({ initiativeId: '4', title: 'Messaging on Digital Bond Website - Update' }),
        decision({ initiativeId: '5', title: 'Process for delivering a scalable solution' }),
        decision({ initiativeId: '6', title: 'Determine how to get money off the table and invest' }),
      ],
      2,
    );
    expect(rocks).toHaveLength(3);
    expect(rocks.map(r => r.priority)).toEqual([1, 2, 3]);
  });

  it('takes the detail from whichever copy carries it', () => {
    // One of Efficient Living's four copies has the owner; the others do not.
    const [rock] = rocksFromDecisions(
      [
        decision({ initiativeId: 'a', title: 'Due Date Focus' }),
        decision({ initiativeId: 'b', title: 'Due Date Focus', assignedTo: 'Steve', outcome: 'Every job quoted in 48h' }),
        decision({ initiativeId: 'c', title: 'Due Date Focus', endDate: '2026-12-31' }),
      ],
      2,
    );
    expect(rock.owner).toBe('Steve');
    expect(rock.successCriteria).toBe('Every job quoted in 48h');
    expect(rock.targetDate).toBe('2026-12-31');
    // The first copy's identity is kept, and every decision behind it recorded.
    expect(rock.id).toBe('a');
    expect(rock.linkedInitiatives).toEqual(['a', 'b', 'c']);
  });

  it('does not let the first copy\'s value be overwritten by a later one', () => {
    const [rock] = rocksFromDecisions(
      [
        decision({ initiativeId: 'a', title: 'Due Date Focus', assignedTo: 'Steve' }),
        decision({ initiativeId: 'b', title: 'Due Date Focus', assignedTo: 'Someone else' }),
      ],
      2,
    );
    expect(rock.owner).toBe('Steve');
  });

  it('judges titles the same through case and spacing', () => {
    expect(titleKey('  Due   Date  FOCUS ')).toBe('due date focus');
    const rocks = rocksFromDecisions(
      [
        decision({ initiativeId: 'a', title: 'Due Date Focus' }),
        decision({ initiativeId: 'b', title: '  due   date focus  ' }),
      ],
      2,
    );
    expect(rocks).toHaveLength(1);
  });

  it('drops a decision with no title at all', () => {
    expect(rocksFromDecisions([decision({ title: '   ' })], 2)).toEqual([]);
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
