/**
 * "Did they ARRIVE with a plan?" — not "is there a plan now?".
 *
 * The first session creates the plan part-way through (step 9). A plain
 * existence check would then report "has a plan" on the next page load and flip
 * steps 9–10 back to the standard screens mid-session. So a plan created during
 * this review still counts as being built in it.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { planStepMode } from '@/app/quarterly-review/utils/review-readiness';

const goals = vi.hoisted(() => ({
  created_at: null as string | null,
  exists: true,
  revenue_year1: 1200000 as number | null,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const b: any = {
        select: () => b,
        eq: () => b,
        neq: () => b,
        maybeSingle: async () => {
          if (table === 'businesses') return { data: { review_session_mode: 'auto' }, error: null };
          if (table === 'business_financial_goals') {
            return {
              data: goals.exists ? { created_at: goals.created_at, revenue_year1: goals.revenue_year1 } : null,
              error: null,
            };
          }
          return { data: null, error: null };
        },
        then: (r: any) => Promise.resolve({ count: 0, error: null }).then(r),
      };
      return b;
    },
  }),
}));

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileId: async () => 'profile-1',
}));

import { useReviewReadiness } from '@/app/quarterly-review/hooks/useReviewReadiness';

const REVIEW_STARTED = '2026-09-22T00:00:00Z';
const review = { id: 'r1', business_id: 'b1', quarter: 2, year: 2027, created_at: REVIEW_STARTED };

async function planSignal() {
  const { result } = renderHook(() => useReviewReadiness(review));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result.current;
}

describe('the plan steps stay put for the whole first session', () => {
  it('a plan made DURING this review keeps the build screens', async () => {
    goals.exists = true;
    goals.revenue_year1 = 1200000;
    goals.created_at = '2026-09-22T00:30:00Z'; // after the review started
    const r = await planSignal();
    expect(r.hasPlan).toBe('no');
    expect(planStepMode(r, r.sessionMode)).toBe('build');
  });

  it('a plan that existed BEFORE the review gets the standard screens', async () => {
    goals.exists = true;
    goals.revenue_year1 = 1200000;
    goals.created_at = '2026-06-01T00:00:00Z';
    const r = await planSignal();
    expect(r.hasPlan).toBe('yes');
    expect(planStepMode(r, r.sessionMode)).toBe('normal');
  });

  it('a plan row from BEFORE the review with every target at $0 is not a plan', async () => {
    // JVJ Civil and Asphalt: a Goals wizard session opened on 28 Jan 2026 and
    // never filled in. Read as a plan, the standard screens spread
    // "$0 − YTD actuals" across the quarters as negative targets.
    goals.exists = true;
    goals.created_at = '2026-01-28T00:00:00Z';
    goals.revenue_year1 = 0;
    const r = await planSignal();
    expect(r.hasPlan).toBe('no');
    expect(planStepMode(r, r.sessionMode)).toBe('build');
  });

  it('a plan row with no revenue target at all (NULL) is not a plan either', async () => {
    goals.exists = true;
    goals.created_at = '2026-01-28T00:00:00Z';
    goals.revenue_year1 = null;
    const r = await planSignal();
    expect(r.hasPlan).toBe('no');
  });

  it('no plan at all is a first session', async () => {
    goals.exists = false;
    const r = await planSignal();
    expect(r.hasPlan).toBe('no');
    expect(planStepMode(r, r.sessionMode)).toBe('build');
  });
});
