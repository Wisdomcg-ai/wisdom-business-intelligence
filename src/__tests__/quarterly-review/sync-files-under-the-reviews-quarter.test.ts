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
  /**
   * The statuses strategic_initiatives_status_check allows, read from the
   * schema below. A write of any other status is refused, as the database
   * refuses it — without this the fake took 'planned' and 'deferred' happily.
   */
  allowedStatuses: [] as string[],
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

  const statusRefused = (row: Record<string, unknown>) =>
    row.status !== undefined && row.status !== null && !db.allowedStatuses.includes(String(row.status));
  const CHECK_VIOLATION = {
    code: '23514',
    message: 'new row for relation "strategic_initiatives" violates check constraint "strategic_initiatives_status_check"',
  };

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
          if (statusRefused(payload)) return Promise.resolve({ error: CHECK_VIOLATION }).then(resolve, reject);
          for (const row of db.existingInitiatives) if (filters.every((f) => f(row))) Object.assign(row, payload);
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
    insert: async (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
      if (db.failInitiativeInsert) return { error: { message: 'null value in column \"user_id\"' } };
      if ((Array.isArray(payload) ? payload : [payload]).some(statusRefused)) return { error: CHECK_VIOLATION };
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
import { assignedIn, assignmentTag, withAssignment, withoutAssignment } from '@/app/quarterly-review/utils/assignment-tag';
import { INITIATIVE_STATUSES } from '@/app/quarterly-review/utils/decision-writes';

/** strategic_initiatives_status_check, read from the schema the database was built from. */
const STATUS_CHECK = (() => {
  const schema = readFileSync(
    path.resolve(__dirname, '../../../supabase/migrations/00000000000000_baseline_schema.sql'),
    'utf-8',
  );
  const check = /CONSTRAINT "strategic_initiatives_status_check" CHECK \(\("status" = ANY \(ARRAY\[([^\]]+)\]/.exec(schema);
  if (!check) throw new Error('strategic_initiatives_status_check is not in the baseline schema');
  return [...check[1].matchAll(/'([a-z_]+)'::"text"/g)].map((m) => m[1]);
})();
db.allowedStatuses = STATUS_CHECK;

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
// initiative into the quarter: syncRocks updated the 12-month row through its
// own id, step_type included, and relabelled it 'quarterly_review'.
// "Determine how to get money off the table and invest" is in the pre-sync
// snapshot's 12-month list at 00:51:40 UTC and gone from the post-sync one. It
// got there from 4.2's Available pool, which #604 has since excluded — but a
// 12-month initiative the coach genuinely picks for the quarter, or a q1 rock
// carried into q2, took the same path, and the sprint detail followed the
// decision's id onto the original row.
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

    // The kept listing decides the row, and Continue leaves a row as it is.
    expect(writesTo(Q2_ROW)).toEqual([]);
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

// ---------------------------------------------------------------------------
// 26 Sep 2026, found while building #605. syncInitiativeChanges wrote a status
// and the card's notes for every decision step 4.2 held, and checked neither
// write.
//
// - Continue on a not-started initiative wrote 'planned' and Carry Forward
//   wrote 'deferred'. strategic_initiatives_status_check allows neither, so the
//   database refused both — silently, the notes in the same write with them.
//   No row in production holds either status.
// - The writes that landed wrote the card's notes, which are not the row's
//   notes: 4.2 never loads those, it keeps its owner chip there as
//   "[Assigned: <owner>]". Seven rows over two businesses now hold the tag as
//   their notes. 52 rows of real notes survived only because they are not
//   started — fixing the status alone would have wiped every one.
// ---------------------------------------------------------------------------
const Q3_STARTED = '66666666-6666-4666-8666-666666666666';
const Q1_DROPPED = '77777777-7777-4777-8777-777777777777';
const Q1_DONE = '88888888-8888-4888-8888-888888888888';
const IDEA = '99999999-9999-4999-8999-999999999999';
const Q4_ROW = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** A Q3 initiative under way, with an owner and notes of its own. */
const startedRow = (): InitiativeRow => ({
  id: Q3_STARTED,
  title: 'Standardise Support Agreements',
  step_type: 'q3',
  status: 'in_progress',
  assigned_to: 'Darren Rogers',
  notes: 'Template agreed with the lawyer in August',
  description: 'One agreement for every support client',
});

/** An idea with notes the client wrote — the 52 rows at risk look like this. */
const ideaRow = (): InitiativeRow => ({
  id: IDEA,
  title: 'Supervision module',
  step_type: 'strategic_ideas',
  status: 'not_started',
  notes: 'Will move into Odoo supervision module post HR go-live.',
});

/** What step 4.2 holds for a row it loaded: Continue, and the owner tag where the notes go. */
const card = (row: InitiativeRow, over: Partial<InitiativeDecision> = {}): InitiativeDecision => ({
  initiativeId: row.id,
  title: row.title,
  category: 'operations',
  currentStatus: String(row.status ?? 'not_started'),
  progressPercentage: 0,
  decision: 'keep',
  notes: row.assigned_to ? assignmentTag(String(row.assigned_to)) : '',
  quarterAssigned: /^q[1-4]$/.test(String(row.step_type)) ? String(row.step_type) : 'unassigned',
  ...over,
});

describe('a decision saves what the coach decided, in a status the table allows', () => {
  it('the fake refuses what the table refuses, so every test here runs against the real CHECK', async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const client = createClient() as unknown as {
      from: (table: string) => {
        update: (payload: Record<string, unknown>) => {
          eq: (column: string, value: unknown) => PromiseLike<{ error: { message: string } | null }>;
        };
      };
    };
    db.existingInitiatives = [ideaRow()];

    const { error } = await client.from('strategic_initiatives').update({ status: 'planned' }).eq('id', IDEA);

    expect(error?.message).toContain('strategic_initiatives_status_check');
    expect(rowById(IDEA)?.status).toBe('not_started');
    expect([...INITIATIVE_STATUSES]).toEqual(STATUS_CHECK);
  });

  it('Continue on a not-started initiative writes nothing — it wrote "planned", which the table refuses', async () => {
    const q4: InitiativeRow = { id: Q4_ROW, title: 'Launch new website', step_type: 'q4', status: 'not_started', assigned_to: 'Peter' };
    db.existingInitiatives = [ideaRow(), { ...q4 }];

    const result = await strategicSyncService.syncInitiativeChanges('biz-1', 'user-1', [card(ideaRow()), card(q4)], 'q2');

    expect(result).toEqual({ success: true });
    expect(db.initiativeWrites).toEqual([]);
  });

  it('Carry Forward puts the initiative on hold — it wrote "deferred", which the table refuses', async () => {
    db.existingInitiatives = [startedRow()];

    const result = await strategicSyncService.syncInitiativeChanges(
      'biz-1',
      'user-1',
      [card(startedRow(), { decision: 'defer' })],
      'q2',
    );

    expect(result).toEqual({ success: true });
    expect(rowById(Q3_STARTED)).toMatchObject({ status: 'on_hold', notes: 'Template agreed with the lawyer in August' });
  });

  it('Drop cancels, and the row keeps its notes — the owner tag is never written over them', async () => {
    db.existingInitiatives = [startedRow()];

    await strategicSyncService.syncInitiativeChanges('biz-1', 'user-1', [card(startedRow(), { decision: 'kill' })], 'q2');

    expect(rowById(Q3_STARTED)).toMatchObject({ status: 'cancelled', notes: 'Template agreed with the lawyer in August' });
    expect(writesTo(Q3_STARTED)[0].payload).not.toHaveProperty('notes');
  });

  it('an empty note is not a cleared one — a card with no owner does not null the row\'s notes', async () => {
    db.existingInitiatives = [ideaRow()];

    await strategicSyncService.syncInitiativeChanges('biz-1', 'user-1', [card(ideaRow(), { decision: 'kill' })], 'q2');

    expect(rowById(IDEA)).toMatchObject({
      status: 'cancelled',
      notes: 'Will move into Odoo supervision module post HR go-live.',
    });
  });

  it('Continue on an initiative already under way writes nothing — it put the owner tag over its notes', async () => {
    // Just Digital Signage, 20 Mar 2026: four in-progress rows, notes now the tag.
    db.existingInitiatives = [startedRow()];

    await strategicSyncService.syncInitiativeChanges('biz-1', 'user-1', [card(startedRow())], 'q2');

    expect(db.initiativeWrites).toEqual([]);
    expect(rowById(Q3_STARTED)).toEqual(startedRow());
  });

  it('notes a coach wrote are saved, without the owner tag', async () => {
    db.existingInitiatives = [startedRow()];

    await strategicSyncService.syncInitiativeChanges(
      'biz-1',
      'user-1',
      [card(startedRow(), { decision: 'defer', notes: withAssignment('Waiting on the new hire', 'Darren Rogers') })],
      'q2',
    );

    expect(rowById(Q3_STARTED)).toMatchObject({ status: 'on_hold', notes: 'Waiting on the new hire' });
  });

  it('Continue never brings back a dropped rock or reopens a finished one — a past quarter\'s cards cannot be changed', async () => {
    // Efficient Living's Q1 drops were cancelled by its Q2 review (25 Sep 2026).
    // Its Q3 review will list them again, in a past quarter, as Continue — and
    // the old sync wrote 'in_progress' for Continue on any row not 'not_started'.
    const dropped: InitiativeRow = { id: Q1_DROPPED, title: 'Sales and Marketing', step_type: 'q1', status: 'cancelled' };
    const done: InitiativeRow = { id: Q1_DONE, title: 'Due Date Focus', step_type: 'q1', status: 'completed' };
    db.existingInitiatives = [{ ...dropped }, { ...done }];

    const result = await strategicSyncService.syncInitiativeChanges('biz-1', 'user-1', [card(dropped), card(done)], 'q3');

    expect(result).toEqual({ success: true });
    expect(db.initiativeWrites).toEqual([]);
    expect(rowById(Q1_DROPPED)?.status).toBe('cancelled');
    expect(rowById(Q1_DONE)?.status).toBe('completed');
  });

  it('a rock kept in the quarter being planned is live — its cancelled row comes back as not started', async () => {
    // Dropped at one completion, kept again after the review was re-opened:
    // step 4.3 plans it and its detail is filed on this row.
    const row: InitiativeRow = { id: Q2_ROW, title: 'Due Date Focus', step_type: 'q2', status: 'cancelled' };
    db.existingInitiatives = [{ ...row }];
    const decisions = [card(row, { assignedTo: 'Steve', why: 'Jobs slip past their due date' })];

    const result = await strategicSyncService.syncAll('biz-1', 'user-1', decisions, TARGETS, 'q2', rocksOf(decisions), []);

    expect(result).toEqual({ success: true, errors: [] });
    expect(rowsIn('q2')).toHaveLength(1);
    expect(rowById(Q2_ROW)).toMatchObject({
      status: 'not_started',
      assigned_to: 'Steve',
      why: 'Jobs slip past their due date',
    });
  });

  it('a rock carried forward to the quarter now being planned is taken off hold', async () => {
    // Carry Forward in the Q2 review put it on hold; the Q3 review lists it in
    // the planned quarter as Continue, and 4.3 plans it as a rock.
    const row: InitiativeRow = { id: Q3_STARTED, title: 'Standardise Support Agreements', step_type: 'q3', status: 'on_hold' };
    db.existingInitiatives = [{ ...row }];

    await strategicSyncService.syncInitiativeChanges('biz-1', 'user-1', [card(row)], 'q3');

    expect(rowById(Q3_STARTED)?.status).toBe('not_started');
  });

  it('a finished initiative is never reopened, even in the quarter being planned', async () => {
    const row: InitiativeRow = { id: Q2_ROW, title: 'Due Date Focus', step_type: 'q2', status: 'completed' };
    db.existingInitiatives = [{ ...row }];

    await strategicSyncService.syncInitiativeChanges('biz-1', 'user-1', [card(row)], 'q2');

    expect(db.initiativeWrites).toEqual([]);
    expect(rowById(Q2_ROW)?.status).toBe('completed');
  });

  it('Continue outside the quarter being planned leaves a row on hold', async () => {
    const row: InitiativeRow = { id: Q3_STARTED, title: 'Standardise Support Agreements', step_type: 'q3', status: 'on_hold' };
    db.existingInitiatives = [{ ...row }];

    await strategicSyncService.syncInitiativeChanges('biz-1', 'user-1', [card(row)], 'q2');

    expect(db.initiativeWrites).toEqual([]);
    expect(rowById(Q3_STARTED)?.status).toBe('on_hold');
  });

  it('a listing the review added is never written by its made-up id', async () => {
    // 'sprint-new-…' does not start with 'new-': the old guard let it through
    // to an update by an id no row has.
    const result = await strategicSyncService.syncInitiativeChanges(
      'biz-1',
      'user-1',
      [pick({ initiativeId: 'sprint-new-1790296002208', title: 'Complete the Payroll Automations', quarterAssigned: 'q3', decision: 'kill' })],
      'q2',
    );

    expect(result).toEqual({ success: true });
    expect(db.initiativeWrites).toEqual([]);
  });
});

describe('a decision the database refuses is reported, not skipped', () => {
  it('answers success:false, naming the initiative and the reason', async () => {
    db.existingInitiatives = [startedRow()];
    db.failInitiativeUpdate = true;

    const result = await strategicSyncService.syncInitiativeChanges(
      'biz-1',
      'user-1',
      [card(startedRow(), { decision: 'kill' })],
      'q2',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Initiative decisions not saved');
    expect(result.error).toContain('Standardise Support Agreements');
    expect(result.error).toContain('permission denied');
  });

  it('syncAll passes it on, so completion says the plan did not all save', async () => {
    db.existingInitiatives = [startedRow()];
    db.failInitiativeUpdate = true;

    const result = await strategicSyncService.syncAll(
      'biz-1',
      'user-1',
      [card(startedRow(), { decision: 'kill' })],
      TARGETS,
      'q2',
      [],
      [],
    );

    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toContain('Initiative decisions not saved');
  });

  it('a whole review as 4.2 hands it over saves cleanly — completion shows no false "didn\'t save"', async () => {
    // Every card 4.2 lists — the planned quarter's rocks (its own row, one picked
    // from the 12-month list, one added in 4.3), a past quarter's drop, a later
    // quarter, the Available pool — all Continue with the owner tag, but for
    // the coach's one Carry Forward and one Drop.
    const q2Rock: InitiativeRow = {
      id: Q2_ROW,
      title: 'Due Date Focus',
      step_type: 'q2',
      status: 'not_started',
      assigned_to: 'Steve',
      notes: 'Client asked for weekly updates',
    };
    const q4: InitiativeRow = { id: Q4_ROW, title: 'Launch new website', step_type: 'q4', status: 'not_started', assigned_to: 'Peter' };
    const dropped: InitiativeRow = { id: Q1_DROPPED, title: 'Sales and Marketing', step_type: 'q1', status: 'cancelled' };
    db.existingInitiatives = [{ ...q2Rock }, twelveMonthRow(), startedRow(), { ...q4 }, { ...dropped }, ideaRow()];
    const decisions = [
      card(q2Rock, { assignedTo: 'Steve', outcome: 'Every job quoted within 48h' }),
      pick({ notes: assignmentTag('Mel'), assignedTo: 'Sam' }),
      pick({ initiativeId: 'sprint-new-1790296002208', title: 'Complete the Payroll Automations', why: 'Hours lost every pay run' }),
      card(dropped),
      card(startedRow(), { decision: 'defer' }),
      card(q4, { decision: 'kill' }),
      card(ideaRow()),
    ];

    const result = await strategicSyncService.syncAll('biz-1', 'user-1', decisions, TARGETS, 'q2', rocksOf(decisions), []);

    expect(result).toEqual({ success: true, errors: [] });
    // Only the coach's two decisions changed a status...
    expect(rowById(Q3_STARTED)?.status).toBe('on_hold');
    expect(rowById(Q4_ROW)?.status).toBe('cancelled');
    expect(rowById(Q1_DROPPED)?.status).toBe('cancelled');
    expect(rowById(Q2_ROW)?.status).toBe('not_started');
    expect(rowById(IDEA)?.status).toBe('not_started');
    expect(rowById(TWELVE_MONTH)).toEqual(twelveMonthRow());
    // ...no row's notes changed, and none holds the owner tag.
    expect(rowById(Q2_ROW)?.notes).toBe('Client asked for weekly updates');
    expect(rowById(Q3_STARTED)?.notes).toBe('Template agreed with the lawyer in August');
    expect(rowById(IDEA)?.notes).toBe('Will move into Odoo supervision module post HR go-live.');
    const tagged = db.existingInitiatives.filter((r) =>
      [r.notes, r.description].some((text) => String(text ?? '').includes('[Assigned:')),
    );
    expect(tagged).toEqual([]);
  });
});

describe('step 4.2\'s owner tag never reaches a rock', () => {
  it('reads and rewrites the tag the way the step shows it', () => {
    const tagged = withAssignment('Waiting on the new hire [Assigned: Mel]', 'Sam');

    expect(tagged).toBe('Waiting on the new hire [Assigned: Sam]');
    expect(assignedIn(tagged)).toBe('Sam');
    expect(withoutAssignment(tagged)).toBe('Waiting on the new hire');
    // An owner the plan keeps as a team-role id — Just Digital Signage's rows.
    expect(withoutAssignment(assignmentTag('role-900aa935-ae8c-4913-baf7-169260fa19ef-2'))).toBe('');
  });

  it('a card\'s tag becomes neither the rock\'s notes nor, without a why, its description', () => {
    // JVJ's Q2 review stored "[Assigned: Chris Panic]" as Performance
    // Management System's description.
    const [rock] = rocksFromDecisions([pick({ title: 'Performance Management System', notes: assignmentTag('Chris Panic') })], 2);

    expect(rock.notes).toBeUndefined();
    expect(rock.description).toBeUndefined();
  });

  it('what the coach wrote still reaches the rock', () => {
    const [withWhy] = rocksFromDecisions([pick({ why: 'Nobody owns the numbers', notes: withAssignment('Budget approved', 'Mel') })], 2);

    expect(withWhy).toMatchObject({ description: 'Nobody owns the numbers', notes: 'Budget approved' });
  });

  it('a rock stored with the tag leaves the row\'s notes and description as they were', async () => {
    // Rocks built before rocksFromDecisions left the tag out are still stored;
    // re-completing JVJ's review would have written them.
    db.existingInitiatives = [
      {
        id: Q2_ROW,
        title: 'Performance Management System',
        step_type: 'q2',
        status: 'not_started',
        description: 'Quarterly one-on-ones for every crew lead',
        notes: 'Chris to draft the template',
      },
    ];

    const result = await strategicSyncService.syncRocks(
      'biz-1',
      'user-1',
      [
        {
          id: Q2_ROW,
          title: 'Performance Management System',
          owner: '',
          status: 'not_started',
          progressPercentage: 0,
          successCriteria: '',
          notes: '[Assigned: Chris Panic]',
          description: '[Assigned: Chris Panic]',
        } as never,
      ],
      'q2',
    );

    expect(result).toEqual({ success: true });
    expect(rowById(Q2_ROW)).toMatchObject({
      description: 'Quarterly one-on-ones for every crew lead',
      notes: 'Chris to draft the template',
    });
    expect(writesTo(Q2_ROW)[0].payload).not.toHaveProperty('notes');
    expect(writesTo(Q2_ROW)[0].payload).not.toHaveProperty('description');
  });

  it('a why the coach gave is written as the row\'s description', async () => {
    db.existingInitiatives = [{ id: Q2_ROW, title: 'Due Date Focus', step_type: 'q2', status: 'not_started', description: 'Old' }];
    const decisions = [card(rowById(Q2_ROW)!, { why: 'Jobs slip past their due date' })];

    await strategicSyncService.syncRocks('biz-1', 'user-1', rocksOf(decisions), 'q2');

    expect(rowById(Q2_ROW)?.description).toBe('Jobs slip past their due date');
  });

  it('a rock filed as a new row is saved without the tag', async () => {
    db.existingInitiatives = [twelveMonthRow()];

    await strategicSyncService.syncRocks('biz-1', 'user-1', rocksOf([pick({ notes: assignmentTag('Mel') })]), 'q2');

    expect(db.initiativeInsertRows).toHaveLength(1);
    expect(db.initiativeInsertRows[0]).toMatchObject({ notes: null, description: null });
  });
});
