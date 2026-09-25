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

const db = vi.hoisted(() => ({
  /** Every business_financial_goals update, in order. */
  targetUpdates: [] as Array<Record<string, unknown>>,
  failTargetUpdate: false,
  /** strategic_initiatives rows already stored for the business + step_type. */
  existingInitiatives: [] as Array<{ id: string; title: string; status?: string }>,
  initiativeInserts: [] as Array<{ title: string; step_type: string }>,
  initiativeUpdates: [] as Array<{ id: string; title: string }>,
  failInitiativeRead: false,
  failInitiativeInsert: false,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => {
          // strategic_initiatives is read as a promise (no maybeSingle), so the
          // second .eq() resolves it.
          if (table === 'strategic_initiatives') {
            return {
              ...builder,
              then: (resolve: (v: unknown) => unknown) =>
                Promise.resolve(
                  db.failInitiativeRead
                    ? { data: null, error: { message: 'statement timeout' } }
                    : { data: db.existingInitiatives, error: null },
                ).then(resolve),
            };
          }
          return builder;
        },
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
          let id = '';
          const chain: Record<string, unknown> = {
            eq: (_column: string, value: unknown) => {
              if (!id) id = String(value);
              return chain;
            },
            then: (resolve: (v: unknown) => unknown) => {
              if (table === 'strategic_initiatives') {
                db.initiativeUpdates.push({ id, title: String(payload.title ?? '') });
              }
              return Promise.resolve(
                db.failTargetUpdate && table === 'business_financial_goals'
                  ? { error: { message: 'permission denied for business_financial_goals' } }
                  : { error: null },
              ).then(resolve);
            },
          };
          return chain;
        },
        insert: async (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
          if (table === 'strategic_initiatives') {
            if (db.failInitiativeInsert) return { error: { message: 'null value in column \"user_id\"' } };
            for (const row of Array.isArray(payload) ? payload : [payload]) {
              db.initiativeInserts.push({
                title: String(row.title ?? ''),
                step_type: String(row.step_type ?? ''),
              });
            }
          }
          return { error: null };
        },
      };
      return builder;
    },
  }),
}));

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
  db.failInitiativeRead = false;
  db.failInitiativeInsert = false;
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
