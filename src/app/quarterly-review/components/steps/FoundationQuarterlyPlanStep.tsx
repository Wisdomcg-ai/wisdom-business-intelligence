'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resolveBusinessProfileId } from '@/lib/business/resolveBusinessProfileIds';
import { ESSENTIAL_KPIS } from '@/lib/kpi-definitions';
import { StepHeader } from '../StepHeader';
import { MoneyInput, formatMoney } from '../MoneyInput';
import type { QuarterlyReview, QuarterlyTargets } from '../../types';
import {
  evenSplitAll,
  planningQuarterTargets,
  sumSplit,
  FOUNDATION_KPI_LIMIT,
  type FoundationNumbers,
  type FoundationSplit,
  type QuarterSplit,
} from '../../utils/foundation-plan';
import {
  saveFoundationQuarterlyTargets,
  addFoundationKpis,
  trackPlanWrite,
  planWritesSettled,
} from '../../services/foundation-plan-service';
import { captureReviewWriteFailure } from '../../utils/capture-write-failure';
import { Check, Loader2, AlertTriangle } from 'lucide-react';

interface FoundationQuarterlyPlanStepProps {
  review: QuarterlyReview;
  onUpdateQuarterlyTargets: (targets: QuarterlyTargets) => void;
}

type Line = keyof FoundationNumbers;
type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

const LINES: { key: Line; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'grossProfit', label: 'Gross profit' },
  { key: 'netProfit', label: 'Net profit' },
];

/** Read quarterly_targets as a split, or null if any quarter is missing. */
function splitFromStored(stored: any): FoundationSplit | null {
  if (!stored) return null;
  const q = typeof stored === 'string' ? JSON.parse(stored) : stored;
  const row = (r: any): QuarterSplit | null => {
    if (!r) return null;
    const vals = [r.q1, r.q2, r.q3, r.q4].map(v => (v === undefined || v === null || v === '' ? NaN : Number(v)));
    return vals.every(Number.isFinite) ? (vals as QuarterSplit) : null;
  };
  const revenue = row(q.revenue);
  const grossProfit = row(q.grossProfit);
  const netProfit = row(q.netProfit);
  return revenue && grossProfit && netProfit ? { revenue, grossProfit, netProfit } : null;
}

/**
 * First session, step 10 — split the year across the quarters, and pick up to
 * three KPIs.
 *
 * Starts from the client's EXISTING quarterly targets if they have them (a forced
 * first session must not overwrite real quarters with an even guess), otherwise
 * an even split of this year's numbers that adds up to the year exactly.
 *
 * It also writes the planning quarter's slice onto the review. Without that,
 * completing the review runs the strategic sync with the review's empty default
 * and overwrites the planning quarter with $0.
 *
 * KPIs are offered only to a client who has none, from the five essentials, up to
 * three, added in one go — first-time setup, never KPI management.
 */
export function FoundationQuarterlyPlanStep({ review, onUpdateQuarterlyTargets }: FoundationQuarterlyPlanStepProps) {
  const supabase = useMemo(() => createClient(), []);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [annual, setAnnual] = useState<FoundationNumbers | null>(null);
  const [split, setSplit] = useState<FoundationSplit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [save, setSave] = useState<SaveState>('idle');
  const [existingKpis, setExistingKpis] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [kpiSave, setKpiSave] = useState<SaveState>('idle');
  // Whether the quarters on screen came from the plan (someone set them) or are
  // the even split — so the screen only claims "we've split your year evenly"
  // when it did.
  const [fromStored, setFromStored] = useState(false);
  const dirty = useRef(false);
  // The split on screen that isn't saved yet — finished off if the step closes
  // before the save delay runs out. Skipping it would leave the review with no
  // planning-quarter targets, and completing it would write $0 for the quarter.
  const pending = useRef<FoundationSplit | null>(null);
  const profileRef = useRef<string | null>(null);
  const latest = useRef({ review, onUpdateQuarterlyTargets });
  latest.current = { review, onUpdateQuarterlyTargets };
  const planningIdx = Math.min(Math.max(review.quarter, 1), 4) - 1;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pid = await resolveBusinessProfileId(supabase, review.business_id);
        if (!pid) throw new Error('No business profile for this review');
        // The previous step may still be saving this year's numbers (it
        // finishes its save as it closes). Read after it lands, not before.
        await planWritesSettled();
        const [goalsRes, kpiRes] = await Promise.all([
          supabase
            .from('business_financial_goals')
            .select('revenue_year1, gross_profit_year1, net_profit_year1, quarterly_targets')
            .eq('business_id', pid)
            .maybeSingle(),
          supabase
            .from('business_kpis')
            .select('id', { count: 'exact', head: true })
            .eq('business_id', pid)
            .eq('is_active', true),
        ]);
        if (goalsRes.error) throw goalsRes.error;
        if (kpiRes.error) throw kpiRes.error;
        if (cancelled) return;

        setProfileId(pid);
        profileRef.current = pid;
        setExistingKpis(kpiRes.count ?? 0);
        const g = goalsRes.data;
        if (g && g.revenue_year1 !== null && g.gross_profit_year1 !== null && g.net_profit_year1 !== null) {
          const a = {
            revenue: Number(g.revenue_year1),
            grossProfit: Number(g.gross_profit_year1),
            netProfit: Number(g.net_profit_year1),
          };
          setAnnual(a);
          const stored = splitFromStored(g.quarterly_targets);
          setSplit(stored ?? evenSplitAll(a));
          setFromStored(!!stored);
          if (stored) setSave('saved');
          else dirty.current = true; // an even split nobody has saved yet
        }
      } catch (err) {
        captureReviewWriteFailure(err, 'foundation-quarterly-load', { reviewId: review.id });
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, review.business_id, review.id]);

  const persist = async (pid: string, s: FoundationSplit) => {
    await trackPlanWrite(saveFoundationQuarterlyTargets(supabase, { profileId: pid, split: s }));
    const { review: r, onUpdateQuarterlyTargets: onUpdate } = latest.current;
    onUpdate({ ...planningQuarterTargets(s, r.quarter), kpis: r.quarterly_targets?.kpis ?? [] });
  };

  const doSave = async () => {
    if (!profileId || !split) return;
    pending.current = null;
    setSave('saving');
    try {
      await persist(profileId, split);
      setSave('saved');
    } catch (err) {
      captureReviewWriteFailure(err, 'foundation-quarterly-save', { reviewId: review.id, profileId });
      setSave('failed');
    }
  };

  useEffect(() => {
    if (!loaded || !split || !dirty.current) return;
    pending.current = split;
    const t = setTimeout(doSave, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split, loaded]);

  // Leaving the step before the delay runs out still saves what was on screen.
  useEffect(
    () => () => {
      const s = pending.current;
      const pid = profileRef.current;
      if (!s || !pid) return;
      persist(pid, s).catch(err =>
        captureReviewWriteFailure(err, 'foundation-quarterly-save-on-leave', {
          reviewId: latest.current.review.id,
          profileId: pid,
        })
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const setCell = (line: Line, qi: number, v: number | null) => {
    if (!split || v === null) return;
    dirty.current = true;
    setSave('idle');
    const next = [...split[line]] as QuarterSplit;
    next[qi] = v;
    setSplit({ ...split, [line]: next });
  };

  const saveKpis = async () => {
    if (!profileId || picked.length === 0) return;
    setKpiSave('saving');
    try {
      const chosen = ESSENTIAL_KPIS.filter(k => picked.includes(k.id)).map(k => ({
        id: k.id,
        name: k.name,
        plainName: k.plainName,
        unit: k.unit,
        category: k.category,
        frequency: k.frequency,
        description: k.description,
      }));
      await addFoundationKpis(supabase, { profileId, userId: review.user_id, kpis: chosen });
      setExistingKpis(chosen.length);
      setKpiSave('saved');
    } catch (err) {
      captureReviewWriteFailure(err, 'foundation-kpis-save', { reviewId: review.id, profileId });
      setKpiSave('failed');
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
      </div>
    );
  }

  return (
    <div>
      <StepHeader step="4.2" subtitle="Spread this year across the quarters" estimatedTime={15} />

      {loadFailed && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            We couldn&apos;t load this business&apos;s plan, so nothing here will be saved. Reload the
            page before carrying on.
          </p>
        </div>
      )}

      {!loadFailed && !annual && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
          <p className="text-sm text-gray-700">
            Set this year&apos;s revenue, gross profit and net profit on the previous step first — then
            come back here to spread them across the quarters.
          </p>
        </div>
      )}

      {annual && split && (
        <>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
            <p className="text-sm text-gray-700">
              {fromStored ? (
                <>
                  These are this year&apos;s quarters. Change any that have moved — the quarter you&apos;re
                  planning now is highlighted.
                </>
              ) : (
                <>
                  We&apos;ve split your year evenly. If some quarters are busier than others, change them —
                  the quarter you&apos;re planning now is highlighted.
                </>
              )}
            </p>
          </div>

          <div className="overflow-x-auto mb-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500">
                  <th className="text-left py-2 pr-3 font-medium" />
                  {[0, 1, 2, 3].map(i => (
                    <th
                      key={i}
                      className={`py-2 px-2 font-medium text-center ${
                        i === planningIdx ? 'text-brand-orange-700' : ''
                      }`}
                    >
                      Q{i + 1}
                      {i === planningIdx && <div className="text-[10px] normal-case">planning now</div>}
                    </th>
                  ))}
                  <th className="py-2 pl-3 font-medium text-right">Year</th>
                </tr>
              </thead>
              <tbody>
                {LINES.map(l => {
                  const total = sumSplit(split[l.key]);
                  const gap = annual[l.key] - total;
                  return (
                    <tr key={l.key} className="border-t border-gray-100 align-top">
                      <td className="py-3 pr-3 font-medium text-gray-900 whitespace-nowrap">{l.label}</td>
                      {[0, 1, 2, 3].map(i => (
                        <td key={i} className={`py-2 px-1 ${i === planningIdx ? 'bg-brand-orange-50' : ''}`}>
                          <MoneyInput
                            id={`q-${l.key}-${i}`}
                            label={`${l.label} Q${i + 1}`}
                            hideLabel
                            value={split[l.key][i]}
                            onChange={v => setCell(l.key, i, v)}
                          />
                        </td>
                      ))}
                      <td className="py-3 pl-3 text-right">
                        <div className="font-semibold text-gray-900">{formatMoney(total)}</div>
                        {gap !== 0 && (
                          <div className="text-xs text-amber-700 mt-1">
                            {formatMoney(Math.abs(gap))} {gap > 0 ? 'short of' : 'over'} {formatMoney(annual[l.key])}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="h-6 mb-8 text-xs" aria-live="polite">
            {save === 'saving' && (
              <span className="flex items-center gap-1.5 text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
              </span>
            )}
            {save === 'saved' && (
              <span className="flex items-center gap-1.5 text-green-600">
                <Check className="w-3.5 h-3.5" /> Quarters saved
              </span>
            )}
            {save === 'failed' && (
              <span className="flex items-center gap-1.5 text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5" /> Couldn&apos;t save the quarters
                <button type="button" onClick={doSave} className="underline font-medium ml-1">
                  Retry
                </button>
              </span>
            )}
          </div>
        </>
      )}

      <div className="border-t border-gray-100 pt-6">
        <p className="text-sm font-medium text-gray-900 mb-1">
          Pick up to {FOUNDATION_KPI_LIMIT} numbers to watch
        </p>

        {existingKpis !== null && existingKpis > 0 && kpiSave !== 'saved' && (
          <p className="text-sm text-gray-600">
            This business already tracks {existingKpis} KPI{existingKpis === 1 ? '' : 's'}. Change them in
            the Goals section when you need to.
          </p>
        )}

        {kpiSave === 'saved' && (
          <p className="flex items-center gap-1.5 text-sm text-green-700">
            <Check className="w-4 h-4" /> Added — you&apos;ll see these on your scorecard next quarter.
          </p>
        )}

        {existingKpis === 0 && kpiSave !== 'saved' && (
          <>
            <p className="text-xs text-gray-500 mb-3">
              These are the few that matter most for almost every business. You can add more later.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              {ESSENTIAL_KPIS.map(k => {
                const on = picked.includes(k.id);
                const full = !on && picked.length >= FOUNDATION_KPI_LIMIT;
                return (
                  <button
                    key={k.id}
                    type="button"
                    disabled={full}
                    aria-pressed={on}
                    onClick={() => setPicked(p => (on ? p.filter(x => x !== k.id) : [...p, k.id]))}
                    className={`text-left p-3 rounded-xl border-2 transition-colors disabled:opacity-40 ${
                      on ? 'border-brand-orange bg-brand-orange-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-900">{k.plainName || k.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{k.whyItMatters}</div>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveKpis}
                disabled={picked.length === 0 || kpiSave === 'saving'}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-40"
              >
                {kpiSave === 'saving' ? 'Adding…' : `Add ${picked.length || ''} KPI${picked.length === 1 ? '' : 's'}`}
              </button>
              {kpiSave === 'failed' && (
                <span className="text-xs text-amber-700">Couldn&apos;t add them — try again.</span>
              )}
            </div>
          </>
        )}

        {existingKpis === null && !loadFailed && (
          <p className="text-sm text-gray-500">Couldn&apos;t check this business&apos;s KPIs.</p>
        )}
      </div>
    </div>
  );
}
