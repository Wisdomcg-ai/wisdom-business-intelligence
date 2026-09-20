/**
 * What the two writers actually PUT in the database.
 *
 * The helper test next door proves the arithmetic; this proves the service uses
 * it. A fix that corrects a helper and leaves the call site alone passes the
 * first and fails the second.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const captured = vi.hoisted(() => ({ upserts: [] as { table: string; rows: any }[] }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      upsert: async (rows: any) => {
        captured.upserts.push({ table, rows });
        return { error: null };
      },
    }),
  }),
}));

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileId: async () => 'profile-1',
}));

vi.mock('@/lib/supabase/surfaceError', () => ({ surfaceSupabaseError: vi.fn() }));

import { quarterlyReviewService } from '@/app/quarterly-review/services/quarterly-review-service';

const baseReview: any = {
  id: 'r1',
  business_id: 'biz-1',
  user_id: 'user-1',
  dashboard_snapshot: {
    revenue: { target: 100, actual: 90, variance: -10 },
    grossProfit: { target: 50, actual: 45, variance: -5 },
    netProfit: { target: 20, actual: 18, variance: -2 },
    kpis: [{ id: 'kpi-1', actual: 42, target: 50 }],
  },
  rocks_review: [
    { rockId: 'rock-1', title: 'Hire a PM', owner: 'Sam', successCriteria: 'signed',
      progressPercentage: 100, decision: 'completed', outcomeNarrative: 'done', lessonsLearned: 'start earlier' },
    { rockId: 'rock-2', title: 'New CRM', owner: 'Alex', successCriteria: 'live',
      progressPercentage: 40, decision: 'carry_forward', outcomeNarrative: 'slipped', lessonsLearned: 'scope' },
  ],
  // The rocks just PLANNED. These must not end up in a record of the quarter
  // that was reviewed — they have not happened yet.
  quarterly_rocks: [
    { id: 'new-1', title: 'Next quarter thing', owner: 'Sam', status: 'not_started', progressPercentage: 0 },
  ],
};

const rowsFor = (table: string) => captured.upserts.find(u => u.table === table)?.rows;

describe('kpi_actuals is filed against the quarter the numbers are from', () => {
  beforeEach(() => { captured.upserts = []; });

  it('files a Q2 FY27 review’s actuals as Q1 2027', async () => {
    await quarterlyReviewService.saveKpiActuals({ ...baseReview, quarter: 2, year: 2027 });
    const rows = rowsFor('kpi_actuals');
    expect(rows[0].period_quarter).toBe('Q1');
    expect(rows[0].period_year).toBe(2027);
  });

  it('rolls the year back for a Q1 review', async () => {
    // A Q1 FY27 review reflects on Q4 FY26 — wrong by a quarter AND a year before.
    await quarterlyReviewService.saveKpiActuals({ ...baseReview, quarter: 1, year: 2027 });
    const rows = rowsFor('kpi_actuals');
    expect(rows[0].period_quarter).toBe('Q4');
    expect(rows[0].period_year).toBe(2026);
  });

  it('never files actuals under the quarter being planned', async () => {
    await quarterlyReviewService.saveKpiActuals({ ...baseReview, quarter: 3, year: 2027 });
    const rows = rowsFor('kpi_actuals');
    expect(rows[0].period_quarter).not.toBe('Q3');
  });
});

describe('quarterly_snapshots records the quarter that was reviewed', () => {
  beforeEach(() => { captured.upserts = []; });

  it('labels a Q2 FY27 review’s snapshot as Q1 2027', async () => {
    await quarterlyReviewService.createQuarterlySnapshot({ ...baseReview, quarter: 2, year: 2027 });
    const row = rowsFor('quarterly_snapshots');
    expect(row.snapshot_quarter).toBe('Q1');
    expect(row.snapshot_year).toBe(2027);
  });

  it('rolls the year back at the FY boundary', async () => {
    await quarterlyReviewService.createQuarterlySnapshot({ ...baseReview, quarter: 1, year: 2027 });
    const row = rowsFor('quarterly_snapshots');
    expect(row.snapshot_quarter).toBe('Q4');
    expect(row.snapshot_year).toBe(2026);
  });

  it('carries the financials the row claims to describe', async () => {
    await quarterlyReviewService.createQuarterlySnapshot({ ...baseReview, quarter: 2, year: 2027 });
    const row = rowsFor('quarterly_snapshots');
    // QuarterlyPlanStep reads financial_snapshot as that quarter's ACTUALS.
    expect(row.financial_snapshot.revenue.actual).toBe(90);
  });

  it('snapshots the rocks that were held to account, not the ones just planned', async () => {
    await quarterlyReviewService.createQuarterlySnapshot({ ...baseReview, quarter: 2, year: 2027 });
    const row = rowsFor('quarterly_snapshots');
    const titles = row.initiatives_snapshot.map((i: any) => i.title);
    expect(titles).toEqual(['Hire a PM', 'New CRM']);
    expect(titles).not.toContain('Next quarter thing');
  });

  it('reports a completion rate that means something', async () => {
    // Previously this counted quarterly_rocks, every one of them freshly created
    // and 'not_started', so completion_rate was ALWAYS 0.
    await quarterlyReviewService.createQuarterlySnapshot({ ...baseReview, quarter: 2, year: 2027 });
    const row = rowsFor('quarterly_snapshots');
    expect(row.total_initiatives).toBe(2);
    expect(row.completed_initiatives).toBe(1);
    expect(row.completion_rate).toBe(50);
    expect(row.in_progress_initiatives).toBe(1);
  });
});
