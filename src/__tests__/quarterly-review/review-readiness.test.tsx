/**
 * First-session detection.
 *
 * Two things have to hold or this feature is worse than not having it:
 *
 * 1. "We couldn't check" must never be read as "they have nothing". Walking a
 *    client who already has a plan through building a second one is destructive;
 *    showing a first-timer a slightly empty scorecard is not. Foundation mode
 *    requires a positive `no`.
 *
 * 2. Each signal must be read in the right id-space. A profile-keyed table
 *    queried by businesses.id returns ZERO ROWS, not an error — so getting this
 *    wrong doesn't throw, it silently reports "no KPIs, no plan" for every client
 *    and flips the whole fleet into Foundation mode. This is the same failure
 *    that emptied the KPI list for all 12 clients (#287).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  isFoundationMode,
  effectiveFoundationMode,
  isOverridden,
  toSessionModeOverride,
  couldNotCheck,
  historyStepMode,
  planStepMode,
  UNKNOWN_READINESS,
  type ReviewReadiness,
} from '@/app/quarterly-review/utils/review-readiness';

const BUSINESSES_ID = 'biz-0000-businesses-space';
const PROFILE_ID = 'prof-0000-profiles-space';

const r = (over: Partial<ReviewReadiness> = {}): ReviewReadiness => ({
  hasPriorReview: 'yes',
  hasPlan: 'yes',
  hasKpis: 'yes',
  hasPriorRocks: 'yes',
  ...over,
});

describe('unknown is not a synonym for no', () => {
  it('does not enter foundation mode when nothing could be read', () => {
    expect(isFoundationMode(UNKNOWN_READINESS)).toBe(false);
  });

  it('does not enter foundation mode on an unreadable plan signal', () => {
    expect(isFoundationMode(r({ hasPlan: 'unknown', hasPriorReview: 'unknown' }))).toBe(false);
  });

  it('enters foundation mode on a positive no', () => {
    expect(isFoundationMode(r({ hasPriorReview: 'no' }))).toBe(true);
    expect(isFoundationMode(r({ hasPlan: 'no' }))).toBe(true);
  });

  it('leaves an established client alone', () => {
    expect(isFoundationMode(r())).toBe(false);
  });

  it('reports when a signal could not be read', () => {
    expect(couldNotCheck(r())).toBe(false);
    expect(couldNotCheck(r({ hasKpis: 'unknown' }))).toBe(true);
  });
});

describe('steps ask the signal they actually depend on', () => {
  it('a client with a plan but no history gets baseline steps, not build steps', () => {
    // The coach built the plan in the Goals wizard before the first session.
    const coachPrepped = r({ hasPriorReview: 'no', hasPlan: 'yes' });
    expect(historyStepMode(coachPrepped)).toBe('baseline');
    expect(planStepMode(coachPrepped)).toBe('normal');
  });

  it('a long-standing client with no current plan gets build steps, not baseline', () => {
    const lapsed = r({ hasPriorReview: 'yes', hasPlan: 'no' });
    expect(historyStepMode(lapsed)).toBe('normal');
    expect(planStepMode(lapsed)).toBe('build');
  });

  it('a true first-timer gets both', () => {
    const firstTimer = r({ hasPriorReview: 'no', hasPlan: 'no', hasKpis: 'no', hasPriorRocks: 'no' });
    expect(historyStepMode(firstTimer)).toBe('baseline');
    expect(planStepMode(firstTimer)).toBe('build');
  });

  it('falls back to the normal flow when the signal is unreadable', () => {
    expect(historyStepMode(r({ hasPriorReview: 'unknown' }))).toBe('normal');
    expect(planStepMode(r({ hasPlan: 'unknown' }))).toBe('normal');
  });
});

// ---------------------------------------------------------------------------
// Which id goes to which table.
// ---------------------------------------------------------------------------
const spy = vi.hoisted(() => ({
  queries: [] as { table: string; eq: Record<string, unknown> }[],
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const eq: Record<string, unknown> = {};
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          eq[col] = val;
          return builder;
        },
        neq: () => builder,
        maybeSingle: async () => ({ data: { id: PROFILE_ID }, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          spy.queries.push({ table, eq: { ...eq } });
          return Promise.resolve({ count: 0, error: null }).then(resolve);
        },
      };
      return builder;
    },
  }),
}));

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileId: async () => PROFILE_ID,
}));

import { useReviewReadiness } from '@/app/quarterly-review/hooks/useReviewReadiness';

describe('each signal is read in its own id-space', () => {
  beforeEach(() => {
    spy.queries = [];
  });

  it('asks quarterly_reviews by businesses.id and the rest by the profile id', async () => {
    renderHook(() =>
      useReviewReadiness({
        id: 'review-1',
        business_id: BUSINESSES_ID,
        quarter: 2,
        year: 2027,
      })
    );

    await waitFor(() => {
      expect(spy.queries.map(q => q.table)).toContain('business_kpis');
    });

    const byTable = Object.fromEntries(spy.queries.map(q => [q.table, q.eq]));

    // businesses-space
    expect(byTable['quarterly_reviews']?.business_id).toBe(BUSINESSES_ID);

    // business_profiles-space — querying these by businesses.id returns zero
    // rows and would report "no plan, no KPIs" for every client alive.
    expect(byTable['business_financial_goals']?.business_id).toBe(PROFILE_ID);
    expect(byTable['business_kpis']?.business_id).toBe(PROFILE_ID);
    expect(byTable['strategic_initiatives']?.business_id).toBe(PROFILE_ID);
  });

  it('reflects on the PREVIOUS quarter when looking for prior rocks', async () => {
    renderHook(() =>
      useReviewReadiness({
        id: 'review-1',
        business_id: BUSINESSES_ID,
        quarter: 1,
        year: 2027,
      })
    );

    await waitFor(() => {
      expect(spy.queries.map(q => q.table)).toContain('strategic_initiatives');
    });

    // A review is named for the quarter being PLANNED, so "did they have rocks
    // last quarter" means Q4 of the prior year, not Q1 of this one.
    const rocks = spy.queries.find(q => q.table === 'strategic_initiatives');
    expect(rocks?.eq.step_type).toBe('q4');
  });
});

// ---------------------------------------------------------------------------
// What the room is told.
// ---------------------------------------------------------------------------
import { renderToStaticMarkup } from 'react-dom/server';
import { FirstSessionNotice } from '@/app/quarterly-review/components/FirstSessionNotice';

// renderToStaticMarkup pins the FIRST paint — what is on screen before any effect
// runs. That is what the room actually sees when the step opens.
const paint = (props: Parameters<typeof FirstSessionNotice>[0]) =>
  renderToStaticMarkup(<FirstSessionNotice {...props} />);

describe('the notice says which kind of session this is', () => {
  const base = {
    isLoading: false,
    couldNotCheck: false,
    detectedFoundationMode: false,
    sessionMode: 'auto' as const,
    overridden: false,
    canOverride: false,
    onSetSessionMode: async () => true,
  };

  it('says nothing while the signals are still loading', () => {
    expect(
      paint({ ...base, isLoading: true, readiness: UNKNOWN_READINESS, foundationMode: false })
    ).toBe('');
  });

  it('says nothing to an established client', () => {
    expect(paint({ ...base, readiness: r(), foundationMode: false })).toBe('');
  });

  it('tells a true first-timer both things will happen today', () => {
    const html = paint({
      ...base,
      readiness: r({ hasPriorReview: 'no', hasPlan: 'no' }),
      foundationMode: true,
    });
    expect(html).toContain('first session');
    expect(html).toMatch(/starting from/);
    expect(html).toMatch(/building the plan/);
  });

  it('tells a coach-prepped client it is only about the baseline', () => {
    const html = paint({
      ...base,
      readiness: r({ hasPriorReview: 'no', hasPlan: 'yes' }),
      foundationMode: true,
    });
    expect(html).toMatch(/already set up/);
  });

  it('admits when it could not check, rather than guessing either way', () => {
    const html = paint({
      ...base,
      couldNotCheck: true,
      readiness: UNKNOWN_READINESS,
      foundationMode: false,
    });
    expect(html).toMatch(/couldn&#x27;t check|couldn't check/);
    // Crucially it does NOT claim this is a first session.
    expect(html).not.toContain('first session');
  });
});

// ---------------------------------------------------------------------------
// The coach's override.
// ---------------------------------------------------------------------------
describe("the coach's choice beats detection", () => {
  it('forces a first session for a client who has data', () => {
    // The case that prompted this: a half-set-up client who should still start
    // fresh. Detection reads the data and would say "standard".
    const hasSomeData = r();
    expect(isFoundationMode(hasSomeData)).toBe(false);
    expect(effectiveFoundationMode('first_session', hasSomeData)).toBe(true);
  });

  it('forces a standard review for a client who looks empty', () => {
    const looksEmpty = r({ hasPriorReview: 'no', hasPlan: 'no' });
    expect(isFoundationMode(looksEmpty)).toBe(true);
    expect(effectiveFoundationMode('standard', looksEmpty)).toBe(false);
  });

  it('defers to detection on auto', () => {
    expect(effectiveFoundationMode('auto', r({ hasPlan: 'no' }))).toBe(true);
    expect(effectiveFoundationMode('auto', r())).toBe(false);
  });

  it('wins even when a signal could not be read', () => {
    // isFoundationMode is cautious because a GUESS could be costly. A coach who
    // ticked the box is not guessing, so an unknown signal must not veto them.
    expect(effectiveFoundationMode('first_session', UNKNOWN_READINESS)).toBe(true);
    expect(effectiveFoundationMode('standard', UNKNOWN_READINESS)).toBe(false);
  });

  it('reports when the choice, not the data, decided it', () => {
    expect(isOverridden('first_session', r())).toBe(true);
    // Choosing what detection already said is not an override.
    expect(isOverridden('first_session', r({ hasPlan: 'no' }))).toBe(false);
    expect(isOverridden('auto', r())).toBe(false);
  });

  it('reads an unrecognised stored value as auto', () => {
    // An older row, or a value written by a future build.
    expect(toSessionModeOverride(null)).toBe('auto');
    expect(toSessionModeOverride(undefined)).toBe('auto');
    expect(toSessionModeOverride('')).toBe('auto');
    expect(toSessionModeOverride('foundation')).toBe('auto');
    expect(toSessionModeOverride('first_session')).toBe('first_session');
    expect(toSessionModeOverride('standard')).toBe('standard');
  });
});

describe('one switch drives both halves of the flow', () => {
  it('forcing a first session switches the history AND plan steps', () => {
    const established = r();
    expect(historyStepMode(established, 'first_session')).toBe('baseline');
    expect(planStepMode(established, 'first_session')).toBe('build');
  });

  it('forcing standard leaves both alone even for an empty client', () => {
    const empty = r({ hasPriorReview: 'no', hasPlan: 'no' });
    expect(historyStepMode(empty, 'standard')).toBe('normal');
    expect(planStepMode(empty, 'standard')).toBe('normal');
  });

  it('build mode does NOT imply the client has no plan', () => {
    // The constraint F4 has to honour: a coach can force a first session for a
    // client who already has a plan, so a build-mode plan step must UPSERT the
    // existing business_financial_goals row, not insert a second one.
    const hasPlan = r({ hasPlan: 'yes' });
    expect(planStepMode(hasPlan, 'first_session')).toBe('build');
    expect(hasPlan.hasPlan).toBe('yes');
  });

  it('defaults to auto when no override is passed', () => {
    expect(historyStepMode(r({ hasPriorReview: 'no' }))).toBe('baseline');
    expect(planStepMode(r({ hasPlan: 'no' }))).toBe('build');
  });
});
