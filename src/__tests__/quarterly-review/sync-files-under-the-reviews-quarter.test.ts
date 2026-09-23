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
  /** Every saveInitiatives call: [stepType, titles]. */
  initiativeSaves: [] as Array<{ stepType: string; titles: string[] }>,
  failTargetUpdate: false,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
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
          return {
            eq: async () =>
              db.failTargetUpdate && table === 'business_financial_goals'
                ? { error: { message: 'permission denied for business_financial_goals' } }
                : { error: null },
          };
        },
        insert: async () => ({ error: null }),
      };
      return builder;
    },
  }),
}));

vi.mock('@/app/goals/services/strategic-planning-service', () => ({
  StrategicPlanningService: {
    loadInitiatives: vi.fn(async () => []),
    saveInitiatives: vi.fn(async (_biz: string, _user: string, initiatives: Array<{ title: string }>, stepType: string) => {
      db.initiativeSaves.push({ stepType, titles: initiatives.map((i) => i.title) });
      return { success: true };
    }),
  },
}));

import { strategicSyncService } from '@/app/quarterly-review/services/strategic-sync-service';

/** 24 Sep 2026 — inside FY27 Q1 (Jul–Sep), six days from its end. */
const INSIDE_Q1 = new Date('2026-09-24T02:00:00Z');

const TARGETS = { revenue: 750000, grossProfit: 450000, netProfit: 135000, kpis: [] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(INSIDE_Q1);
  db.targetUpdates = [];
  db.initiativeSaves = [];
  db.failTargetUpdate = false;
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

    expect(db.initiativeSaves).toEqual([{ stepType: 'q3', titles: ['Hire a second estimator'] }]);
  });

  it('an initiative keeps the quarter the coach dropped it into', async () => {
    await strategicSyncService.syncAll('biz-1', 'user-1', [], TARGETS, 'q3', [], [
      { title: 'Rebuild the website', category: 'marketing', quarterAssigned: 'q4' },
    ]);

    expect(db.initiativeSaves).toEqual([{ stepType: 'q4', titles: ['Rebuild the website'] }]);
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
