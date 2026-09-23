'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resolveBusinessProfileId } from '@/lib/business/resolveBusinessProfileIds';
import { captureReviewWriteFailure } from '../utils/capture-write-failure';
import {
  UNKNOWN_READINESS,
  DEFAULT_SESSION_MODE,
  effectiveFoundationMode,
  isFoundationMode,
  isOverridden,
  couldNotCheck,
  toSessionModeOverride,
  type ReviewReadiness,
  type SessionModeOverride,
  type Signal,
} from '../utils/review-readiness';
import { getPreviousQuarterOf, planQuarterKey, type QuarterNumber } from '../types';

interface UseReviewReadinessResult extends ReviewReadiness {
  isLoading: boolean;
  /** What actually runs — the coach's choice, or detection when they made none. */
  foundationMode: boolean;
  /** What detection alone would have said. Shown next to the control. */
  detectedFoundationMode: boolean;
  /** The coach's standing choice for this client. */
  sessionMode: SessionModeOverride;
  /** True when the coach's choice, not the data, decided it. */
  overridden: boolean;
  /** At least one signal could not be read. */
  couldNotCheck: boolean;
  /** Set the coach's choice. Resolves false if the write was rejected. */
  setSessionMode: (mode: SessionModeOverride) => Promise<boolean>;
}

/**
 * Resolve, ONCE, what data this client already has.
 *
 * The id-spaces are the whole reason this is a single hook rather than four
 * lookups scattered through the steps. `quarterly_reviews.business_id` is
 * businesses-space; goals, KPIs and initiatives are all business_profiles-space.
 * Re-deriving that per step is exactly how the KPI list came to be empty for
 * every client (#287) — so it is resolved here and handed out under names that
 * say which space they came from.
 */
export function useReviewReadiness(
  review: { id: string; business_id: string; quarter: number; year: number; created_at?: string } | null
): UseReviewReadinessResult {
  const [readiness, setReadiness] = useState<ReviewReadiness>(UNKNOWN_READINESS);
  const [sessionMode, setSessionModeState] = useState<SessionModeOverride>(DEFAULT_SESSION_MODE);
  const [isLoading, setIsLoading] = useState(true);

  const businessesId = review?.business_id;
  const reviewId = review?.id;
  const quarter = review?.quarter;
  const year = review?.year;
  const reviewCreatedAt = review?.created_at;

  useEffect(() => {
    if (!businessesId || !reviewId || !quarter || !year) return;

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      const supabase = createClient();

      // Each probe answers 'yes' | 'no' on its own. One failing lookup leaves
      // THAT signal unknown rather than poisoning the other three.
      const probe = async (label: string, run: () => Promise<number | null>): Promise<Signal> => {
        try {
          const n = await run();
          if (n === null) return 'unknown';
          return n > 0 ? 'yes' : 'no';
        } catch (err) {
          captureReviewWriteFailure(err, `readiness-probe:${label}`, { reviewId, businessesId });
          return 'unknown';
        }
      };

      const count = async (
        table: string,
        build: (q: any) => any
      ): Promise<number | null> => {
        const { count: n, error } = await build(
          supabase.from(table).select('id', { count: 'exact', head: true })
        );
        if (error) throw error;
        return n ?? null;
      };

      // The coach's standing choice, on businesses (same id-space as the review).
      // A failed read leaves it at 'auto' so detection decides — never silently
      // forces a mode the coach did not pick.
      try {
        const { data, error } = await supabase
          .from('businesses')
          .select('review_session_mode')
          .eq('id', businessesId)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setSessionModeState(toSessionModeOverride(data?.review_session_mode));
      } catch (err) {
        captureReviewWriteFailure(err, 'readiness-session-mode', { reviewId, businessesId });
      }

      // quarterly_reviews is keyed by businesses.id — NOT the profile id.
      const hasPriorReview = await probe('prior-review', () =>
        count('quarterly_reviews', q =>
          q.eq('business_id', businessesId).eq('status', 'completed').neq('id', reviewId)
        )
      );

      // Everything below is business_profiles-space.
      let profileId: string | null = null;
      let profileResolved = true;
      try {
        profileId = await resolveBusinessProfileId(supabase, businessesId);
      } catch (err) {
        captureReviewWriteFailure(err, 'readiness-resolve-profile', { reviewId, businessesId });
        profileResolved = false;
      }

      // No profile id means we cannot ask the profile-keyed questions at all.
      // That is 'unknown', not 'no' — answering 'no' here would tell a client
      // with a full plan that they have none.
      const profileSignals: Pick<ReviewReadiness, 'hasPlan' | 'hasKpis' | 'hasPriorRocks'> =
        !profileResolved || !profileId
          ? { hasPlan: 'unknown', hasKpis: 'unknown', hasPriorRocks: 'unknown' }
          : {
              // "Did they ARRIVE with a plan?" — not "is there a plan now". The
              // first session creates the plan part-way through (step 9), so a
              // plain existence check would flip steps 9–10 back to the standard
              // screens on the next page load, mid-session. A plan created during
              // this review still counts as being built in it.
              hasPlan: await probe('plan', async () => {
                const { data, error } = await supabase
                  .from('business_financial_goals')
                  .select('created_at')
                  .eq('business_id', profileId)
                  .maybeSingle();
                if (error) throw error;
                if (!data) return 0;
                if (!reviewCreatedAt || !data.created_at) return 1;
                return new Date(data.created_at).getTime() < new Date(reviewCreatedAt).getTime() ? 1 : 0;
              }),
              hasKpis: await probe('kpis', () =>
                count('business_kpis', q => q.eq('business_id', profileId))
              ),
              hasPriorRocks: await probe('prior-rocks', () => {
                const prev = getPreviousQuarterOf(quarter as QuarterNumber, year);
                return count('strategic_initiatives', q =>
                  q.eq('business_id', profileId).eq('step_type', planQuarterKey(prev))
                );
              }),
            };

      if (cancelled) return;
      setReadiness({ hasPriorReview, ...profileSignals });
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [businessesId, reviewId, quarter, year, reviewCreatedAt]);

  const setSessionMode = useCallback(
    async (mode: SessionModeOverride): Promise<boolean> => {
      if (!businessesId) return false;
      const previous = sessionMode;
      setSessionModeState(mode); // optimistic — the control must feel instant in a live session
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from('businesses')
          .update({ review_session_mode: mode })
          .eq('id', businessesId);
        if (error) throw error;
        return true;
      } catch (err) {
        // Roll back rather than leave the screen claiming a mode the database
        // never accepted — the RLS policy admits super_admin, the owner and the
        // assigned coach, and Matt is frequently not the assigned coach.
        setSessionModeState(previous);
        captureReviewWriteFailure(err, 'set-session-mode', { reviewId, businessesId, mode });
        return false;
      }
    },
    [businessesId, reviewId, sessionMode]
  );

  return {
    ...readiness,
    isLoading,
    foundationMode: effectiveFoundationMode(sessionMode, readiness),
    detectedFoundationMode: isFoundationMode(readiness),
    sessionMode,
    overridden: isOverridden(sessionMode, readiness),
    couldNotCheck: couldNotCheck(readiness),
    setSessionMode,
  };
}
