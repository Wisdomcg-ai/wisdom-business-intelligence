'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import PageHeader from '@/components/ui/PageHeader';
import { captureReviewWriteFailure } from '../utils/capture-write-failure';
import {
  isFoundationMode,
  effectiveFoundationMode,
  toSessionModeOverride,
  isInWorkshopProgramme,
  type ReviewReadiness,
  type SessionModeOverride,
  type Signal,
} from '../utils/review-readiness';
import { ArrowLeft, Loader2, Check, Minus, AlertTriangle } from 'lucide-react';

/**
 * Workshop readiness across every coached client, and the coach's choice of how
 * each one's next review runs.
 *
 * Two jobs in one table:
 *
 *   1. The pre-flight the 10/10 plan called for and never got past a CLI script —
 *      who is missing the plan, targets, KPIs or history the workshop needs, so
 *      gaps get fixed BEFORE a session rather than discovered in front of a client.
 *   2. Picking, per client, whether their next review runs as a first session.
 *      Detection reads the data; it cannot know that a half-set-up client should
 *      still start fresh. That is a coaching judgement.
 *
 * Read in ONE pass over four tables rather than per-client queries — thirty
 * clients would otherwise be a hundred and twenty round trips.
 */

interface Row {
  businessesId: string;
  profileId: string | null;
  name: string;
  readiness: ReviewReadiness;
  mode: SessionModeOverride;
  saving: boolean;
  failed: boolean;
}

const MODES: { value: SessionModeOverride; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'first_session', label: 'First session' },
  { value: 'standard', label: 'Standard' },
];

function Cell({ signal }: { signal: Signal }) {
  if (signal === 'yes') return <Check className="w-4 h-4 text-green-600" aria-label="yes" />;
  if (signal === 'no') return <Minus className="w-4 h-4 text-gray-300" aria-label="no" />;
  return <AlertTriangle className="w-4 h-4 text-amber-500" aria-label="couldn't check" />;
}

export default function ReviewReadinessPage() {
  const supabase = useMemo(() => createClient(), []);
  const { currentUser, isLoading: contextLoading } = useBusinessContext();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [excludedCfoOnly, setExcludedCfoOnly] = useState(0);

  const canOverride = currentUser?.role === 'coach' || currentUser?.role === 'admin';

  useEffect(() => {
    if (contextLoading) return;
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        // RLS already limits `businesses` to what this user may see — the assigned
        // coach's clients, or everything for a super admin. No coach filter is
        // applied here on purpose: Matt is the assigned coach of only a fraction of
        // the businesses he runs reviews for, so filtering on assigned_coach_id
        // would hide most of the fleet from him.
        const [bizRes, profRes] = await Promise.all([
          supabase.from('businesses').select('id, name, owner_id, review_session_mode, program_type'),
          supabase.from('business_profiles').select('id, business_id, business_name'),
        ]);
        if (bizRes.error) throw bizRes.error;
        if (profRes.error) throw profRes.error;

        // CFO-only clients don't take part in workshops, so they aren't workshop
        // candidates. Counted rather than silently dropped, so the list never
        // looks shorter than it is without saying why.
        const allBusinesses = bizRes.data ?? [];
        const businesses = allBusinesses.filter(b => isInWorkshopProgramme(b.program_type));
        if (!cancelled) setExcludedCfoOnly(allBusinesses.length - businesses.length);

        const profiles = profRes.data ?? [];
        // Match each business to ITS profile through the real link
        // (business_profiles.business_id → businesses.id), not through the owner.
        // Keying on owner put one profile on every business a person owns, and
        // ignored the column that actually says which business a profile is for.
        const profileByBusiness = new Map(profiles.map(p => [String(p.business_id), p]));
        const profileIds = profiles.map(p => String(p.id));

        // One pass per table. A failed read leaves that column 'unknown' for every
        // row rather than reporting a fleet-wide "nobody has KPIs".
        const gather = async (
          table: string,
          select: string
        ): Promise<Map<string, number> | null> => {
          try {
            const { data, error } = await supabase
              .from(table)
              .select(select)
              .in('business_id', profileIds);
            if (error) throw error;
            const counts = new Map<string, number>();
            for (const r of (data ?? []) as any[]) {
              const k = String(r.business_id);
              counts.set(k, (counts.get(k) ?? 0) + 1);
            }
            return counts;
          } catch (err) {
            captureReviewWriteFailure(err, `readiness-page:${table}`);
            return null;
          }
        };

        const [goals, kpis, rocks, reviews] = await Promise.all([
          gather('business_financial_goals', 'business_id'),
          gather('business_kpis', 'business_id'),
          gather('strategic_initiatives', 'business_id'),
          (async () => {
            try {
              const { data, error } = await supabase
                .from('quarterly_reviews')
                .select('business_id')
                .eq('status', 'completed');
              if (error) throw error;
              const counts = new Map<string, number>();
              for (const r of (data ?? []) as any[]) {
                const k = String(r.business_id);
                counts.set(k, (counts.get(k) ?? 0) + 1);
              }
              return counts;
            } catch (err) {
              captureReviewWriteFailure(err, 'readiness-page:quarterly_reviews');
              return null;
            }
          })(),
        ]);

        // A null map means the read failed — 'unknown', never 'no'.
        const sig = (m: Map<string, number> | null, key: string | null): Signal => {
          if (!m) return 'unknown';
          if (!key) return 'unknown';
          return (m.get(key) ?? 0) > 0 ? 'yes' : 'no';
        };

        const built: Row[] = businesses
          .map(b => {
            const profile = profileByBusiness.get(String(b.id));
            const profileId = profile ? String(profile.id) : null;
            return {
              businessesId: String(b.id),
              profileId,
              name: String(profile?.business_name || b.name || 'Unnamed'),
              readiness: {
                // quarterly_reviews is businesses-space; the rest are profile-space.
                hasPriorReview: sig(reviews, String(b.id)),
                hasPlan: sig(goals, profileId),
                hasKpis: sig(kpis, profileId),
                hasPriorRocks: sig(rocks, profileId),
              },
              mode: toSessionModeOverride(b.review_session_mode),
              saving: false,
              failed: false,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!cancelled) setRows(built);
      } catch (err) {
        captureReviewWriteFailure(err, 'readiness-page:load');
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, contextLoading]);

  const setMode = async (businessesId: string, mode: SessionModeOverride) => {
    const previous = rows.find(r => r.businessesId === businessesId)?.mode ?? 'auto';
    setRows(rs =>
      rs.map(r => (r.businessesId === businessesId ? { ...r, mode, saving: true, failed: false } : r))
    );
    try {
      const { error } = await supabase
        .from('businesses')
        .update({ review_session_mode: mode })
        .eq('id', businessesId);
      if (error) throw error;
      setRows(rs => rs.map(r => (r.businessesId === businessesId ? { ...r, saving: false } : r)));
    } catch (err) {
      captureReviewWriteFailure(err, 'readiness-page:set-mode', { businessesId, mode });
      // Roll back — never leave the table claiming a mode the database refused.
      setRows(rs =>
        rs.map(r =>
          r.businessesId === businessesId
            ? { ...r, mode: previous, saving: false, failed: true }
            : r
        )
      );
    }
  };

  if (isLoading || contextLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-brand-orange" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <Link
        href="/quarterly-review"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to reviews
      </Link>

      <PageHeader
        title="Workshop readiness"
        subtitle="What each client already has, and how their next review should run."
      />

      {loadFailed && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            We couldn&apos;t load the client list. Nothing below is reliable — reload before
            using this to plan a round of sessions.
          </p>
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-3 py-3 font-medium text-center">Plan</th>
              <th className="px-3 py-3 font-medium text-center">KPIs</th>
              <th className="px-3 py-3 font-medium text-center">Rocks</th>
              <th className="px-3 py-3 font-medium text-center">History</th>
              <th className="px-4 py-3 font-medium">Next review runs as</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const detected = isFoundationMode(row.readiness);
              const effective = effectiveFoundationMode(row.mode, row.readiness);
              return (
                <tr key={row.businessesId} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.name}</div>
                    <div className="text-xs text-gray-500">
                      {effective ? 'First session' : 'Standard review'}
                      {row.mode === 'auto' ? ' (detected)' : ' (your choice)'}
                      {row.mode !== 'auto' && effective !== detected && (
                        <span className="text-gray-400">
                          {' '}
                          · detection said {detected ? 'first session' : 'standard'}
                        </span>
                      )}
                    </div>
                    {row.failed && (
                      <div className="text-xs text-amber-700 mt-1">
                        Couldn&apos;t save — you may not have permission for this client.
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-center">
                      <Cell signal={row.readiness.hasPlan} />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-center">
                      <Cell signal={row.readiness.hasKpis} />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-center">
                      <Cell signal={row.readiness.hasPriorRocks} />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-center">
                      <Cell signal={row.readiness.hasPriorReview} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {canOverride ? (
                      <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                        {MODES.map(m => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => setMode(row.businessesId, m.value)}
                            disabled={row.saving}
                            aria-pressed={row.mode === m.value}
                            className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                              row.mode === m.value
                                ? 'bg-gray-900 text-white'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {effective ? 'First session' : 'Standard review'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-4">
        <Check className="w-3 h-3 inline text-green-600" /> has it ·{' '}
        <Minus className="w-3 h-3 inline text-gray-300" /> doesn&apos;t ·{' '}
        <AlertTriangle className="w-3 h-3 inline text-amber-500" /> couldn&apos;t check.
        {excludedCfoOnly > 0 && (
          <>
            {' '}{excludedCfoOnly} CFO-only {excludedCfoOnly === 1 ? 'client isn’t' : 'clients aren’t'} listed —
            they don&apos;t take part in workshops. Change a client&apos;s program type on their Profile tab.
          </>
        )}
        A client with no plan or no history is detected as a first session. Your choice
        sticks until you change it, and never changes a review they&apos;ve already completed.
      </p>
    </div>
  );
}
