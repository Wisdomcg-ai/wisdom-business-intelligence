/**
 * A review that recorded nothing must not report success.
 *
 * Found in production 21 Sep 2026: completing a review wrote no `kpi_actuals`
 * and no `quarterly_snapshots` row, and said "Review Complete" anyway. Both
 * inserts were failing a foreign key (`user_id → public.profiles`, a table
 * holding 2 rows against 41 users), and both writers caught their own error
 * under the comment "Don't throw - this is supplementary, shouldn't block
 * completion". They ran inside service.completeWorkshop, AFTER the row had
 * already been flipped to 'completed'.
 *
 * Two things are pinned here:
 *   1. the writers report failure to their caller instead of swallowing it, and
 *   2. the close screen tells the owner which part did not land.
 *
 * The unit tests for #567 all passed while this was broken, because they pinned
 * the payload being SENT. Nothing pinned that it ARRIVED.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const db = vi.hoisted(() => ({ failUpsert: false, upserts: [] as string[] }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      upsert: async () => {
        db.upserts.push(table);
        return db.failUpsert
          ? { error: { code: '23503', message: 'violates foreign key constraint' } }
          : { error: null };
      },
    }),
  }),
}));

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileId: vi.fn(async () => 'profile-1'),
}));
vi.mock('@/lib/supabase/surfaceError', () => ({ surfaceSupabaseError: vi.fn() }));

import { quarterlyReviewService } from '@/app/quarterly-review/services/quarterly-review-service';

const review: any = {
  id: 'r1',
  business_id: 'biz-1',
  user_id: 'user-1',
  quarter: 2,
  year: 2027,
  dashboard_snapshot: {
    revenue: { target: 1, actual: 1, variance: 0 },
    kpis: [{ id: 'k1', actual: 77, target: 100 }],
  },
  rocks_review: [],
  quarterly_rocks: [],
};

describe('a failed history write is reported, not swallowed', () => {
  beforeEach(() => {
    db.failUpsert = false;
    db.upserts = [];
  });

  it('saveKpiActuals throws when the insert is rejected', async () => {
    db.failUpsert = true;
    await expect(quarterlyReviewService.saveKpiActuals(review)).rejects.toBeTruthy();
  });

  it('createQuarterlySnapshot throws when the insert is rejected', async () => {
    db.failUpsert = true;
    await expect(quarterlyReviewService.createQuarterlySnapshot(review)).rejects.toBeTruthy();
  });

  it('resolves quietly when the writes succeed', async () => {
    await expect(quarterlyReviewService.saveKpiActuals(review)).resolves.toBeUndefined();
    await expect(quarterlyReviewService.createQuarterlySnapshot(review)).resolves.toBeUndefined();
    expect(db.upserts).toContain('kpi_actuals');
    expect(db.upserts).toContain('quarterly_snapshots');
  });

  it('throws rather than returning when the business profile cannot be resolved', async () => {
    // This branch used to log and return, which is indistinguishable from success.
    const { resolveBusinessProfileId } = await import('@/lib/business/resolveBusinessProfileIds');
    vi.mocked(resolveBusinessProfileId).mockResolvedValueOnce(null as any);
    await expect(quarterlyReviewService.saveKpiActuals(review)).rejects.toThrow(/business_profiles/);
  });
});

describe('completeWorkshop no longer performs the history writes itself', () => {
  beforeEach(() => {
    db.failUpsert = false;
    db.upserts = [];
  });

  it('does not write actuals or snapshots as a side effect', async () => {
    // They are driven by the caller now, which is the only place that can report
    // the outcome. If they crept back in here, a failure would be invisible again.
    const src = await import('fs').then(fs =>
      fs.readFileSync('src/app/quarterly-review/services/quarterly-review-service.ts', 'utf8')
    );
    const body = src.slice(
      src.indexOf('async completeWorkshop('),
      src.indexOf('async saveKpiActuals(')
    );
    expect(body).not.toContain('this.createQuarterlySnapshot(');
    expect(body).not.toContain('this.saveKpiActuals(');
  });
});

// ---------------------------------------------------------------------------
import { WorkshopCompleteStep } from '@/app/quarterly-review/components/steps/WorkshopCompleteStep';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useCoachView', () => ({ useCoachView: () => ({ getPath: (p: string) => p }) }));

const paint = (props: any) =>
  renderToStaticMarkup(<WorkshopCompleteStep review={{ ...review, quarterly_rocks: [] }} {...props} />);

describe('the close screen says which part did not save', () => {
  it('says nothing when everything landed', () => {
    const html = paint({});
    expect(html).not.toMatch(/didn&#x27;t save|didn't save/);
  });

  it('names the history write when only that failed', () => {
    const html = paint({ historyWriteFailed: true });
    expect(html).toMatch(/didn&#x27;t save|didn't save/);
    expect(html).toMatch(/next quarter/);
    // and does not blame the plan sync, which was fine
    expect(html).not.toMatch(/90-day sprint/);
  });

  it('names the plan sync when only that failed', () => {
    const html = paint({ planSyncFailed: true });
    expect(html).toMatch(/90-day sprint/);
    expect(html).not.toMatch(/next quarter won/);
  });

  it('names both when both failed', () => {
    const html = paint({ planSyncFailed: true, historyWriteFailed: true });
    expect(html).toMatch(/90-day sprint/);
    expect(html).toMatch(/next quarter/);
  });
});
