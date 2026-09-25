/**
 * The completion sync files under the quarter the REVIEW plans, and reports
 * what failed.
 *
 * Two faults, both found on 24 Sep 2026 — six days before quarter end, with
 * client sessions running that day.
 *
 * 1. `resolveQuarterKey` threw away the key its caller passed and derived
 *    "the quarter after the one we are in" from `new Date()`, keeping the
 *    caller's key only when `year_type` could not be read. A review is NAMED
 *    for the quarter it plans (`planQuarterKey`), which is a different thing:
 *    complete a Q1 review inside Q1 and the clock says q2. Targets, rocks and
 *    sprint rows then file under a quarter nobody planned. #561 unified three
 *    disagreeing writers behind planQuarterKey / reviewedQuarterOf; this was
 *    the same bug overriding them from underneath.
 *
 * 2. `syncAll` REPORTS failure — every sub-writer catches its own error into
 *    `{ success: false, error }` — and the hook awaited it inside a try/catch
 *    and trusted the absence of a throw. A failed push of the targets rendered
 *    "Review Complete!".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { InitiativeDecision } from '@/app/quarterly-review/types';
import { rocksFromDecisions } from '@/app/quarterly-review/utils/rocks-from-decisions';

type InitiativeRow = { id: string; title: string; status?: string; step_type?: string; [column: string]: unknown };
type RowFilter = (row: Record<string, unknown>) => boolean;

const db = vi.hoisted(() => ({
  /** Every business_financial_goals update, in order. */
  targetUpdates: [] as Array<Record<string, unknown>>,
  failTargetUpdate: false,
  /**
   * strategic_initiatives as the fake holds it. Inserts and updates land here,
   * so a later read in the same sync sees them, as the database would. A row
   * given no step_type sits in whichever quarter is read — how the earlier
   * tests place "a row the quarter already holds".
   */
  existingInitiatives: [] as InitiativeRow[],
  initiativeInserts: [] as Array<{ title: string; step_type: string }>,
  initiativeUpdates: [] as Array<{ id: string; title: string }>,
  /** Every strategic_initiatives update, whole: the row it named and what it wrote. */
  initiativeWrites: [] as Array<{ id: string; payload: Record<string, unknown> }>,
  /** Every strategic_initiatives insert, whole. */
  initiativeInsertRows: [] as Array<Record<string, unknown>>,
  failInitiativeRead: false,
  /** Fail only a read by a list of ids — the read of the initiatives a review picked. */
  failPickedRead: false,
  failInitiativeInsert: false,
  failInitiativeUpdate: false,
}));

vi.mock('@/lib/supabase/client', () => {
  const matches = (row: Record<string, unknown>, column: string, value: unknown) =>
    row[column] === undefined && (column === 'step_type' || column === 'business_id') ? true : row[column] === value;

  const initiativeQuery = (filters: RowFilter[], byIds: boolean): Record<string, unknown> => ({
    eq: (column: string, value: unknown) => initiativeQuery([...filters, (row) => matches(row, column, value)], byIds),
    in: (column: string, values: unknown[]) => initiativeQuery([...filters, (row) => values.includes(row[column])], true),
    order: () => initiativeQuery(filters, byIds),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(
        db.failInitiativeRead || (byIds && db.failPickedRead)
          ? { data: null, error: { message: 'statement timeout' } }
          : { data: db.existingInitiatives.filter((row) => filters.every((f) => f(row))).map((row) => ({ ...row })), error: null },
      ).then(resolve, reject),
  });

  const initiatives = {
    select: () => initiativeQuery([], false),
    update: (payload: Record<string, unknown>) => {
      const filters: RowFilter[] = [];
      let id = '';
      const chain: Record<string, unknown> = {
        eq: (column: string, value: unknown) => {
          if (!id) id = String(value);
          filters.push((row) => matches(row, column, value));
          return chain;
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          db.initiativeUpdates.push({ id, title: String(payload.title ?? '') });
          db.initiativeWrites.push({ id, payload });
          if (db.failInitiativeUpdate) {
            return Promise.resolve({ error: { message: 'permission denied for strategic_initiatives' } }).then(resolve, reject);
          }
          for (const row of db.existingInitiatives) if (filters.every((f) => f(row))) Object.assign(row, payload);
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
    insert: async (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
      if (db.failInitiativeInsert) return { error: { message: 'null value in column \"user_id\"' } };
      for (const row of Array.isArray(payload) ? payload : [payload]) {
        db.initiativeInserts.push({
          title: String(row.title ?? ''),
          step_type: String(row.step_type ?? ''),
        });
        db.initiativeInsertRows.push(row);
        const n = String(db.initiativeInsertRows.length).padStart(12, '0');
        db.existingInitiatives.push({ status: 'not_started', ...row, id: `00000000-0000-4000-8000-${n}` } as InitiativeRow);
      }
      return { error: null };
    },
  };

  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      from: (table: string) => {
        if (table === 'strategic_initiatives') return initiatives;
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () =>
            table === 'business_financial_goals'
              // year_type present on purpose: it is what the old clock-derived
              // resolveQuarterKey keyed off. Without it that code path fell back
              // to the caller's key and the override went untested.
              ? { data: { id: 'goals-1', quarterly_targets: {}, year_type: 'FY' }, error: null }
              : { data: null, error: null },
          update: (payload: Record<string, unknown>) => {
            if (table === 'business_financial_goals') db.targetUpdates.push(payload);
            const chain: Record<string, unknown> = {
              eq: () => chain,
              then: (resolve: (v: unknown) => unknown) =>
                Promise.resolve(
                  db.failTargetUpdate && table === 'business_financial_goals'
                    ? { error: { message: 'permission denied for business_financial_goals' } }
                    : { error: null },
                ).then(resolve),
            };
            return chain;
          },
          insert: async () => ({ error: null }),
        };
        return builder;
      },
    }),
  };
});

import { strategicSyncService } from '@/app/quarterly-review/services/strategic-sync-service';

/** 24 Sep 2026 — inside FY27 Q1 (Jul–Sep), six days from its end. */
const INSIDE_Q1 = new Date('2026-09-24T02:00:00Z');

const TARGETS = { revenue: 750000, grossProfit: 450000, netProfit: 135000, kpis: [] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(INSIDE_Q1);
  db.targetUpdates = [];
  db.failTargetUpdate = false;
  db.existingInitiatives = [];
  db.initiativeInserts = [];
  db.initiativeUpdates = [];
  db.initiativeWrites = [];
  db.initiativeInsertRows = [];
  db.failInitiativeRead = false;
  db.failPickedRead = false;
  db.failInitiativeInsert = false;
  db.failInitiativeUpdate = false;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the quarter the review plans decides where its work files', () => {
  it('a Q1 review completed inside Q1 files under q1, not the clock\'s "next quarter"', async () => {
    await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q1', [], []);

    expect(db.targetUpdates).toHaveLength(1);
    const written = db.targetUpdates[0].quarterly_targets as Record<string, Record<string, string>>;
    expect(written.revenue).toEqual({ q1: '750000' });
    expect(written.revenue).not.toHaveProperty('q2');
    expect(written.netProfit).toEqual({ q1: '135000' });
  });

  it('a Q2 review files under q2', async () => {
    await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q2', [], []);
    const written = db.targetUpdates[0].quarterly_targets as Record<string, Record<string, string>>;
    expect(written.revenue).toEqual({ q2: '750000' });
  });

  it('an initiative added without a quarter goes to the quarter being planned, not q1', async () => {
    await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q3', [], [
      { title: 'Hire a second estimator', category: 'people' },
    ]);

    expect(db.initiativeInserts).toEqual([{ title: 'Hire a second estimator', step_type: 'q3' }]);
  });

  it('an initiative keeps the quarter the coach dropped it into', async () => {
    await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q3', [], [
      { title: 'Rebuild the website', category: 'marketing', quarterAssigned: 'q4' },
    ]);

    expect(db.initiativeInserts).toEqual([{ title: 'Rebuild the website', step_type: 'q4' }]);
  });
});

describe('syncAll reports its failures rather than throwing them', () => {
  it('answers success:false with the reason when a write is refused', async () => {
    db.failTargetUpdate = true;

    // It must NOT throw — the caller cannot learn anything from a try/catch.
    const result = await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q1', [], []);

    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toContain('permission denied');
  });

  it('answers success:true when everything lands', async () => {
    const result = await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q1', [], []);
    expect(result).toEqual({ success: true, errors: [] });
  });
});

describe('the caller reads that answer', () => {
  const hook = readFileSync(
    path.resolve(__dirname, '../../app/quarterly-review/hooks/useQuarterlyReview.ts'),
    'utf-8',
  );

  it('completeWorkshop checks syncAll\'s result, not just the absence of a throw', () => {
    // The bug was a bare `await syncAll(...)` followed by setPlanSyncFailed(false):
    // syncAll never throws for a sub-failure, so the catch could not fire.
    expect(hook).toMatch(/const syncResult = await strategicSyncService\.syncAll\(/);
    expect(hook).toMatch(/if\s*\(\s*!syncResult\.success\s*\)/);
    expect(hook).toContain('final-strategic-sync-partial');
  });

  it('passes each added initiative\'s quarter through to the sync', () => {
    expect(hook).toMatch(/quarterAssigned:\s*a\.quarterAssigned/);
  });
});

describe('completing twice does not store the rock twice', () => {
  const rock = (over: Record<string, unknown> = {}) => ({
    // What step 4.3 mints for a rock created in the session: not a UUID, so the
    // old code took the INSERT branch every single time.
    id: 'sprint-new-1790198021629',
    title: 'Due Date Focus',
    owner: 'Steve',
    status: 'not_started' as const,
    progressPercentage: 0,
    successCriteria: 'Every job quoted within 48h',
    ...over,
  });

  it('updates the row it already wrote instead of inserting a second', async () => {
    db.existingInitiatives = [{ id: '11111111-2222-4333-8444-555555555555', title: 'Due Date Focus' }];

    await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q1', [rock() as never], []);

    expect(db.initiativeInserts).toEqual([]);
    expect(db.initiativeUpdates).toEqual([
      { id: '11111111-2222-4333-8444-555555555555', title: 'Due Date Focus' },
    ]);
  });

  it('matches on the title whatever its spacing or case', async () => {
    db.existingInitiatives = [{ id: '11111111-2222-4333-8444-555555555555', title: '  due date FOCUS ' }];

    await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q1', [rock() as never], []);

    expect(db.initiativeInserts).toEqual([]);
    expect(db.initiativeUpdates).toHaveLength(1);
  });

  it('inserts a rock the quarter has never seen', async () => {
    db.existingInitiatives = [];

    await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q1', [rock() as never], []);

    expect(db.initiativeInserts).toEqual([{ title: 'Due Date Focus', step_type: 'q1' }]);
  });

  it('inserts two rocks of the same title only once', async () => {
    db.existingInitiatives = [];

    await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q1', [
      rock() as never,
      rock({ id: 'sprint-new-1790198021630' }) as never,
    ], []);

    expect(db.initiativeInserts).toHaveLength(1);
  });

  it('refuses to guess when the existing rocks cannot be read', async () => {
    // Inserting blind on a failed read is exactly what built the duplicates.
    db.failInitiativeRead = true;

    const result = await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q1', [rock() as never], []);

    expect(db.initiativeInserts).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toContain('Could not read existing rocks');
  });

  it('reports a rock that failed to save instead of counting it', async () => {
    db.existingInitiatives = [];
    db.failInitiativeInsert = true;

    const result = await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q1', [rock() as never], []);

    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toContain('Rocks not saved');
  });
});

// ---------------------------------------------------------------------------
// 25 Sep 2026 — JVJ Civil and Asphalt. Completing a review appended its added
// initiatives to the quarter every time, on top of the rows syncRocks had just
// saved by title; and it did so through the Goals wizard's list save, which
// hard-deletes every row of the quarter missing from the list it is handed.
// ---------------------------------------------------------------------------
describe('the initiatives a review added are saved once, and nothing else is touched', () => {
  it('skips an initiative the quarter already holds — the row syncRocks saved moments earlier', async () => {
    db.existingInitiatives = [{ id: '11111111-2222-4333-8444-555555555555', title: '  training ' }];

    const result = await strategicSyncService.syncNewInitiatives('biz-1', 'user-1', [
      { title: 'Training', category: 'people', quarterAssigned: 'q2' },
    ]);

    expect(result).toEqual({ success: true });
    expect(db.initiativeInserts).toEqual([]);
  });

  it('inserts what the quarter does not hold — and never updates or deletes a row', async () => {
    db.existingInitiatives = [{ id: '11111111-2222-4333-8444-555555555555', title: 'Training' }];

    await strategicSyncService.syncNewInitiatives('biz-1', 'user-1', [
      { title: 'Training', category: 'people', quarterAssigned: 'q2' },
      { title: 'KPI & Bonus Structure', category: 'people', quarterAssigned: 'q2' },
    ]);

    expect(db.initiativeInserts).toEqual([{ title: 'KPI & Bonus Structure', step_type: 'q2' }]);
    expect(db.initiativeUpdates).toEqual([]);
  });

  it('adds two of the same title only once', async () => {
    await strategicSyncService.syncNewInitiatives('biz-1', 'user-1', [
      { title: 'Training', category: 'people', quarterAssigned: 'q2' },
      { title: 'TRAINING', category: 'people', quarterAssigned: 'q2' },
    ]);

    expect(db.initiativeInserts).toHaveLength(1);
  });

  it('writes nothing, and says so, when the quarter cannot be read', async () => {
    // A failed read used to look like an empty quarter — and the list save
    // then deleted every row the quarter held.
    db.failInitiativeRead = true;

    const result = await strategicSyncService.syncNewInitiatives('biz-1', 'user-1', [
      { title: 'Training', category: 'people', quarterAssigned: 'q2' },
    ]);

    expect(db.initiativeInserts).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('could not read q2');
  });
});

describe('a rock the coach dropped is not the rock planned now', () => {
  it('gives a rock re-added under a dropped rock\'s name a row of its own', async () => {
    // Matched by title, it was written onto the cancelled row and stayed cancelled.
    db.existingInitiatives = [
      { id: '11111111-2222-4333-8444-555555555555', title: 'Due Date Focus', status: 'cancelled' },
    ];

    await strategicSyncService.syncRocks(
      'biz-1',
      'user-1',
      [{ id: 'sprint-new-1790198021629', title: 'Due Date Focus', owner: '', status: 'not_started', progressPercentage: 0, successCriteria: '' } as never],
      'q1',
    );

    expect(db.initiativeUpdates).toEqual([]);
    expect(db.initiativeInserts).toEqual([{ title: 'Due Date Focus', step_type: 'q1' }]);
  });
});

// ---------------------------------------------------------------------------
// 25 Sep 2026 — Digital Bond. Completing the Q2 review MOVED a 12-month
// initiative the coach had picked as a rock: syncRocks updated the 12-month row
// through its own id, step_type included, and relabelled it 'quarterly_review'.
// "Determine how to get money off the table and invest" is in the pre-sync
// snapshot's 12-month list at 00:51:40 UTC and gone from the post-sync one. A
// q1 rock carried into q2 was moved out of q1's record the same way, and the
// sprint detail followed the decision's id onto the original row.
//
// The Goals wizard files an initiative put in a quarter as a row of the
// quarter's own, a copy with the same title, and leaves the original where it
// is — production holds such a copy for 95 of its 141 12-month titles.
// ---------------------------------------------------------------------------
const TWELVE_MONTH = '22222222-2222-4222-8222-222222222222';
const Q1_ROCK = '33333333-3333-4333-8333-333333333333';
const Q2_ROW = '44444444-4444-4444-8444-444444444444';
const MONEY = 'Determine how to get money off the table and invest';

const twelveMonthRow = (): InitiativeRow => ({
  id: TWELVE_MONTH,
  title: MONEY,
  step_type: 'twelve_month',
  status: 'not_started',
  source: 'strategic_ideas',
  category: 'finance',
  idea_type: 'strategic',
  priority: 'high',
  timeline: 'H2 FY27',
  assigned_to: 'Mel',
  description: 'Exit planning',
});

/** The 12-month initiative, as step 4.2 lists it once the coach drags it into Q2. */
const pick = (over: Partial<InitiativeDecision> = {}): InitiativeDecision => ({
  initiativeId: TWELVE_MONTH,
  title: MONEY,
  category: 'finance',
  currentStatus: 'not_started',
  progressPercentage: 0,
  decision: 'keep',
  notes: '',
  quarterAssigned: 'q2',
  ...over,
});

const TASK = {
  id: 't1',
  task: 'Book the adviser',
  assignedTo: 'Sam',
  minutesAllocated: 90,
  dueDate: '2026-10-15',
  status: 'not_started' as const,
  order: 0,
};
const MILESTONE = { id: 'm1', description: 'Adviser engaged', targetDate: '2026-10-31', isCompleted: false };

/** What completion hands syncRocks: the review's rocks, built by the writer's own rule. */
const rocksOf = (decisions: InitiativeDecision[]) => rocksFromDecisions(decisions, 2);
const writesTo = (id: string) => db.initiativeWrites.filter((w) => w.id === id);
const rowById = (id: string) => db.existingInitiatives.find((r) => r.id === id);
const rowsIn = (stepType: string) => db.existingInitiatives.filter((r) => r.step_type === stepType);

describe('a rock picked from elsewhere in the plan is filed under the quarter; the original stays where it is', () => {
  it('a 12-month initiative picked as a rock gets a quarter row of its own — the 12-month row is never written', async () => {
    db.existingInitiatives = [twelveMonthRow()];

    const result = await strategicSyncService.syncRocks(
      'biz-1',
      'user-1',
      rocksOf([pick({ assignedTo: 'Sam', outcome: 'Advice taken' })]),
      'q2',
    );

    expect(result).toEqual({ success: true });
    expect(writesTo(TWELVE_MONTH)).toEqual([]);
    expect(rowById(TWELVE_MONTH)).toEqual(twelveMonthRow());
    expect(db.initiativeInsertRows).toHaveLength(1);
    expect(db.initiativeInsertRows[0]).toMatchObject({
      title: MONEY,
      step_type: 'q2',
      source: 'quarterly_review',
      // A copy of the initiative, as the Goals wizard files one...
      category: 'finance',
      idea_type: 'strategic',
      priority: 'high',
      timeline: 'H2 FY27',
      // ...with what the review set on the rock.
      assigned_to: 'Sam',
      outcome: 'Advice taken',
    });
  });

  it('an earlier quarter\'s rock carried forward is filed under the new quarter — q1 keeps its record', async () => {
    db.existingInitiatives = [
      { id: Q1_ROCK, title: 'Hire an estimator', step_type: 'q1', status: 'in_progress', category: 'people' },
    ];

    await strategicSyncService.syncRocks(
      'biz-1',
      'user-1',
      rocksOf([pick({ initiativeId: Q1_ROCK, title: 'Hire an estimator', category: 'people' })]),
      'q2',
    );

    expect(writesTo(Q1_ROCK)).toEqual([]);
    expect(rowById(Q1_ROCK)).toMatchObject({ step_type: 'q1', status: 'in_progress' });
    expect(db.initiativeInserts).toEqual([{ title: 'Hire an estimator', step_type: 'q2' }]);
    expect(db.initiativeInsertRows[0]).toMatchObject({ category: 'people' });
  });

  it('completing twice files the pick once — the second completion updates the row the first one made', async () => {
    db.existingInitiatives = [twelveMonthRow()];
    const rocks = rocksOf([pick({ assignedTo: 'Sam' })]);

    await strategicSyncService.syncRocks('biz-1', 'user-1', rocks, 'q2');
    await strategicSyncService.syncRocks('biz-1', 'user-1', rocks, 'q2');

    expect(db.initiativeInserts).toHaveLength(1);
    const [quarterRow] = rowsIn('q2');
    expect(writesTo(quarterRow.id)).toHaveLength(1);
    expect(writesTo(TWELVE_MONTH)).toEqual([]);
  });

  it('a pick the quarter already holds a row for — the Goals wizard\'s own copy — updates that row', async () => {
    db.existingInitiatives = [twelveMonthRow(), { id: Q2_ROW, title: MONEY, step_type: 'q2', status: 'not_started' }];

    await strategicSyncService.syncRocks('biz-1', 'user-1', rocksOf([pick({ assignedTo: 'Sam' })]), 'q2');

    expect(db.initiativeInserts).toEqual([]);
    expect(writesTo(Q2_ROW)).toHaveLength(1);
    expect(rowById(Q2_ROW)).toMatchObject({ step_type: 'q2', assigned_to: 'Sam' });
    expect(writesTo(TWELVE_MONTH)).toEqual([]);
  });

  it('a rock already in the quarter is updated in place, by its own id', async () => {
    // Two rows of one title in the quarter: the rock is the one it names.
    const other = '55555555-5555-4555-8555-555555555555';
    db.existingInitiatives = [
      { id: other, title: 'Due Date Focus', step_type: 'q2' },
      { id: Q2_ROW, title: 'Due Date Focus', step_type: 'q2' },
    ];

    await strategicSyncService.syncRocks(
      'biz-1',
      'user-1',
      rocksOf([pick({ initiativeId: Q2_ROW, title: 'Due Date Focus', assignedTo: 'Steve' })]),
      'q2',
    );

    expect(writesTo(Q2_ROW)).toHaveLength(1);
    expect(writesTo(other)).toEqual([]);
    expect(db.initiativeInserts).toEqual([]);
  });

  it('files nothing, and says so, when the picked initiative cannot be read', async () => {
    // Filed without it, the quarter's copy would keep the wrong category for good.
    db.existingInitiatives = [twelveMonthRow()];
    db.failPickedRead = true;

    const result = await strategicSyncService.syncRocks('biz-1', 'user-1', rocksOf([pick()]), 'q2');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not read the initiatives picked for q2');
    expect(db.initiativeInserts).toEqual([]);
    expect(db.initiativeWrites).toEqual([]);
  });
});

describe('the sprint detail lands on the quarter row the rock was filed under', () => {
  const detail = {
    assignedTo: 'Sam',
    why: 'The owner is the bottleneck',
    outcome: 'Advice taken',
    startDate: '2026-10-01',
    endDate: '2026-12-31',
    tasks: [TASK],
    milestones: [MILESTONE],
    totalHours: 1.5,
  };

  it('a picked rock\'s tasks, milestones, why and outcome land on its quarter row — none on the 12-month row', async () => {
    db.existingInitiatives = [twelveMonthRow()];
    const decisions = [pick(detail)];

    const result = await strategicSyncService.syncAll('biz-1', 'user-1', decisions, TARGETS, 'q2', rocksOf(decisions), []);

    expect(result).toEqual({ success: true, errors: [] });
    expect(writesTo(TWELVE_MONTH)).toEqual([]);
    expect(rowById(TWELVE_MONTH)).toEqual(twelveMonthRow());
    expect(rowsIn('q2')).toHaveLength(1);
    expect(rowsIn('q2')[0]).toMatchObject({
      assigned_to: 'Sam',
      why: 'The owner is the bottleneck',
      outcome: 'Advice taken',
      start_date: '2026-10-01',
      end_date: '2026-12-31',
      tasks: [TASK],
      milestones: [MILESTONE],
      total_hours: 1.5,
    });
  });

  it('a rock added in Sprint Planning gets its tasks and milestones too — they used to be dropped', async () => {
    const decisions = [
      pick({ initiativeId: 'sprint-new-1790296002208', title: 'Complete the Payroll Automations', ...detail }),
    ];

    const result = await strategicSyncService.syncAll('biz-1', 'user-1', decisions, TARGETS, 'q2', rocksOf(decisions), []);

    expect(result).toEqual({ success: true, errors: [] });
    expect(rowsIn('q2')).toHaveLength(1);
    expect(rowsIn('q2')[0]).toMatchObject({ tasks: [TASK], milestones: [MILESTONE], why: 'The owner is the bottleneck' });
  });

  it('a rock listed twice writes one row: the first listing\'s detail, the second filling only what it lacks', async () => {
    db.existingInitiatives = [twelveMonthRow(), { id: Q2_ROW, title: MONEY, step_type: 'q2' }];

    await strategicSyncService.syncSprintPlanningToQuarter(
      'biz-1',
      [pick({ initiativeId: Q2_ROW, why: 'First listing' }), pick({ why: 'Second listing', tasks: [TASK] })],
      'q2',
    );

    expect(writesTo(Q2_ROW)).toHaveLength(1);
    expect(writesTo(Q2_ROW)[0].payload).toMatchObject({ why: 'First listing', tasks: [TASK] });
    expect(writesTo(TWELVE_MONTH)).toEqual([]);
  });

  it('reports detail with no quarter row to land on, instead of dropping it', async () => {
    db.existingInitiatives = [twelveMonthRow()];

    const result = await strategicSyncService.syncSprintPlanningToQuarter('biz-1', [pick(detail)], 'q2');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Sprint detail not saved');
    expect(result.error).toContain(MONEY);
    expect(db.initiativeWrites).toEqual([]);
  });

  it('writes only the planned quarter\'s rocks — 4.3 plans nothing else', async () => {
    db.existingInitiatives = [twelveMonthRow(), { id: Q1_ROCK, title: 'Hire an estimator', step_type: 'q3' }];

    const result = await strategicSyncService.syncSprintPlanningToQuarter(
      'biz-1',
      [
        pick({ quarterAssigned: 'unassigned', ...detail }),
        pick({ initiativeId: Q1_ROCK, title: 'Hire an estimator', quarterAssigned: 'q3', ...detail }),
      ],
      'q2',
    );

    expect(result).toEqual({ success: true });
    expect(db.initiativeWrites).toEqual([]);
  });

  it('reports a refused write instead of counting only the successes', async () => {
    db.existingInitiatives = [{ id: Q2_ROW, title: 'Due Date Focus', step_type: 'q2' }];
    db.failInitiativeUpdate = true;

    const result = await strategicSyncService.syncSprintPlanningToQuarter(
      'biz-1',
      [pick({ initiativeId: Q2_ROW, title: 'Due Date Focus', why: 'Quotes out in 48h' })],
      'q2',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('permission denied');
  });
});

describe('the quarter\'s decisions are saved on its own rows — taking a pick out never cancels the original', () => {
  it('removing a picked rock drops its quarter row, never the 12-month initiative', async () => {
    // The quarter row a background sync filed while the coach worked in 4.3.
    db.existingInitiatives = [twelveMonthRow(), { id: Q2_ROW, title: MONEY, step_type: 'q2', status: 'not_started' }];

    await strategicSyncService.syncAll('biz-1', 'user-1', [pick({ decision: 'kill' })], TARGETS, 'q2', [], []);

    expect(writesTo(TWELVE_MONTH)).toEqual([]);
    expect(rowById(TWELVE_MONTH)?.status).toBe('not_started');
    expect(rowById(Q2_ROW)?.status).toBe('cancelled');
  });

  it('a pick taken out before it has a quarter row writes nothing at all', async () => {
    db.existingInitiatives = [twelveMonthRow()];

    const result = await strategicSyncService.syncAll('biz-1', 'user-1', [pick({ decision: 'kill' })], TARGETS, 'q2', [], []);

    expect(result).toEqual({ success: true, errors: [] });
    expect(db.initiativeWrites).toEqual([]);
    expect(db.initiativeInserts).toEqual([]);
  });

  it('dropping one listing of a rock listed twice keeps the rock', async () => {
    db.existingInitiatives = [twelveMonthRow(), { id: Q2_ROW, title: MONEY, step_type: 'q2', status: 'in_progress' }];

    await strategicSyncService.syncInitiativeChanges(
      'biz-1',
      'user-1',
      [pick({ initiativeId: Q2_ROW, currentStatus: 'in_progress' }), pick({ decision: 'kill' })],
      'q2',
    );

    expect(writesTo(Q2_ROW)).toHaveLength(1);
    expect(rowById(Q2_ROW)?.status).toBe('in_progress');
    expect(writesTo(TWELVE_MONTH)).toEqual([]);
  });

  it('a quarter row dropped through its own listing is not the row for a rock picked under its name', async () => {
    db.existingInitiatives = [twelveMonthRow(), { id: Q2_ROW, title: MONEY, step_type: 'q2', status: 'not_started' }];
    const decisions = [pick({ initiativeId: Q2_ROW, decision: 'kill' }), pick({ assignedTo: 'Sam' })];

    const result = await strategicSyncService.syncAll('biz-1', 'user-1', decisions, TARGETS, 'q2', rocksOf(decisions), []);

    expect(result).toEqual({ success: true, errors: [] });
    expect(rowById(Q2_ROW)?.status).toBe('cancelled');
    // The pick gets a row of its own, as a rock re-added under a dropped rock's name does.
    const live = rowsIn('q2').filter((r) => r.status !== 'cancelled');
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ title: MONEY, assigned_to: 'Sam' });
    expect(writesTo(TWELVE_MONTH)).toEqual([]);
  });

  it('a decision outside the planned quarter still saves on its own row', async () => {
    // Dropped from the Available pool, the 12-month initiative itself is dropped.
    db.existingInitiatives = [twelveMonthRow()];

    await strategicSyncService.syncInitiativeChanges(
      'biz-1',
      'user-1',
      [pick({ quarterAssigned: 'unassigned', decision: 'kill' })],
      'q2',
    );

    expect(rowById(TWELVE_MONTH)?.status).toBe('cancelled');
  });

  it('saves nothing for the quarter, and says so, when the quarter cannot be read', async () => {
    db.existingInitiatives = [twelveMonthRow()];
    db.failInitiativeRead = true;

    const result = await strategicSyncService.syncInitiativeChanges('biz-1', 'user-1', [pick({ decision: 'kill' })], 'q2');

    expect(result.success).toBe(false);
    expect(result.error).toContain('could not read it');
    expect(db.initiativeWrites).toEqual([]);
  });
});
