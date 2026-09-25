'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resolveBusinessProfileId } from '@/lib/business/resolveBusinessProfileIds';
import { KPISection } from '@/app/goals/components/step1';
import KPIService from '@/app/goals/services/kpi-service';
import type { KPIData } from '@/app/goals/types';
import { StepHeader } from '../StepHeader';
import { MoneyInput, formatMoney } from '../MoneyInput';
import type { QuarterlyReview, QuarterlyTargets, YearType } from '../../types';
import {
  evenSplitAll,
  planningQuarterTargets,
  sumSplit,
  type FoundationNumbers,
  type FoundationSplit,
  type QuarterSplit,
} from '../../utils/foundation-plan';
import {
  saveFoundationQuarterlyTargets,
  addFoundationKpi,
  trackPlanWrite,
  planWritesSettled,
} from '../../services/foundation-plan-service';
import { captureReviewWriteFailure } from '../../utils/capture-write-failure';
import { planHasAnnualTarget } from '../../utils/review-readiness';
import { Check, Loader2, AlertTriangle } from 'lucide-react';

interface FoundationQuarterlyPlanStepProps {
  review: QuarterlyReview;
  onUpdateQuarterlyTargets: (targets: QuarterlyTargets) => void;
}

type Line = keyof FoundationNumbers;
type SaveState = 'idle' | 'saving' | 'saved' | 'failed';
type KpiField = 'currentValue' | 'year1Target' | 'year2Target' | 'year3Target';

/** How long after the last keystroke a KPI figure is saved. */
const KPI_SAVE_DELAY_MS = 800;

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
 * First session, step 10 — split the year across the quarters, and choose the
 * KPIs to watch.
 *
 * Starts from the client's EXISTING quarterly targets if they have them (a forced
 * first session must not overwrite real quarters with an even guess), otherwise
 * an even split of this year's numbers that adds up to the year exactly.
 *
 * It also writes the planning quarter's slice onto the review. Without that,
 * completing the review runs the strategic sync with the review's empty default
 * and overwrites the planning quarter with $0.
 *
 * KPIs use the Goals wizard's own KPI section — the full library, custom KPIs,
 * targets, remove — with no cap (Matt, 25 Sep 2026). The earlier picker offered
 * five essentials, up to three, added in ONE go, then hid itself for good once
 * any KPI existed: JVJ added one and could not add a second. Every KPI write
 * here names the one KPI it changes (see addFoundationKpi for why the wizard's
 * list save is not reused).
 */
export function FoundationQuarterlyPlanStep({ review, onUpdateQuarterlyTargets }: FoundationQuarterlyPlanStepProps) {
  const supabase = useMemo(() => createClient(), []);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [annual, setAnnual] = useState<FoundationNumbers | null>(null);
  const [split, setSplit] = useState<FoundationSplit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [save, setSave] = useState<SaveState>('idle');
  const [yearType, setYearType] = useState<YearType>('FY');
  // null = not read (or the read failed): never shown as "no KPIs".
  const [kpis, setKpis] = useState<KPIData[] | null>(null);
  const [kpiSave, setKpiSave] = useState<SaveState>('idle');
  const [showKPIModal, setShowKPIModal] = useState(false);
  const [kpisOpen, setKpisOpen] = useState(true);
  // Figures typed but not yet saved, per KPI. Saved on a short delay, and
  // finished off if the step closes first.
  const kpiEdits = useRef(new Map<string, Partial<Record<KpiField, number>>>());
  const kpiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fields the owner has typed into, per KPI — a slow add must not paint the
  // stored figures back over them.
  const kpiTouched = useRef(new Map<string, Set<KpiField>>());
  // Adds still on the wire. A target edit or removal for that KPI waits for its
  // add, or it would update a row that does not exist yet and change nothing.
  const kpiAdds = useRef(new Map<string, Promise<unknown>>());
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
            .select('revenue_year1, gross_profit_year1, net_profit_year1, quarterly_targets, year_type')
            .eq('business_id', pid)
            .maybeSingle(),
          // Reads both id-spaces and says whether the read worked — a failed
          // read must never look like "this client has no KPIs".
          KPIService.getUserKPIsResult(pid),
        ]);
        if (goalsRes.error) throw goalsRes.error;
        if (cancelled) return;

        setProfileId(pid);
        profileRef.current = pid;
        if (kpiRes.ok) setKpis(kpiRes.kpis);
        else captureReviewWriteFailure(new Error('KPI read failed'), 'foundation-kpis-load', { reviewId: review.id, profileId: pid });
        const g = goalsRes.data;
        if (g?.year_type) setYearType(g.year_type as YearType);
        // A plan whose year is $0 has nothing to split. Showing the quarters
        // against it read "$15.2M over $0" (JVJ, 25 Sep 2026); the owner is sent
        // back to set the year first, as when there is no plan at all.
        if (g && planHasAnnualTarget(g)) {
          const a = {
            revenue: Number(g.revenue_year1),
            grossProfit: Number(g.gross_profit_year1 ?? 0),
            netProfit: Number(g.net_profit_year1 ?? 0),
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

  // ── KPIs ────────────────────────────────────────────────────────────────
  // Uses refs only, so the unmount cleanup (which captures the first render's
  // copy) still sees everything typed since.
  const flushKpiEdits = async (quiet = false) => {
    if (kpiTimer.current) clearTimeout(kpiTimer.current);
    kpiTimer.current = null;
    const pid = profileRef.current;
    const edits = [...kpiEdits.current.entries()];
    kpiEdits.current.clear();
    if (!pid || edits.length === 0) return;
    if (!quiet) setKpiSave('saving');
    const results = await Promise.allSettled(
      edits.map(([kpiId, updates]) =>
        trackPlanWrite(
          (async () => {
            await kpiAdds.current.get(kpiId)?.catch(() => {});
            const res = await KPIService.updateKPIValue(pid, kpiId, updates);
            if (!res.success) throw new Error(res.error || 'KPI update failed');
          })()
        )
      )
    );
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    failed.forEach(f =>
      captureReviewWriteFailure(f.reason, 'foundation-kpi-update', {
        reviewId: latest.current.review.id,
        profileId: pid,
      })
    );
    if (!quiet) setKpiSave(failed.length > 0 ? 'failed' : 'saved');
  };

  // Leaving the step before the delay runs out still saves the KPI figures.
  useEffect(
    () => () => {
      if (kpiEdits.current.size > 0) void flushKpiEdits(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const kpiWriteFailed = (err: unknown, label: string, kpiId: string) => {
    captureReviewWriteFailure(err, label, { reviewId: review.id, profileId, kpiId });
    setKpiSave('failed');
  };

  const addKpi = (kpi: KPIData) => {
    if (!profileId || !kpis || kpis.some(k => k.id === kpi.id)) return;
    setKpis(list => (list ? [...list, kpi] : list));
    setKpiSave('saving');
    const write = trackPlanWrite(
      addFoundationKpi(supabase, {
        profileId,
        userId: review.user_id,
        kpi: {
          id: kpi.id,
          name: kpi.name,
          plainName: kpi.friendlyName,
          unit: kpi.unit,
          category: kpi.category,
          frequency: kpi.frequency,
          description: kpi.description,
        },
      })
    );
    kpiAdds.current.set(kpi.id, write);
    write
      .then(
        stored => {
          // A KPI switched back on keeps its old targets — show those, except
          // in any box the owner has already typed into.
          if (stored) {
            const touched = kpiTouched.current.get(kpi.id) ?? new Set<KpiField>();
            const shown = Object.fromEntries(
              (Object.keys(stored) as KpiField[]).filter(f => !touched.has(f)).map(f => [f, stored[f]])
            );
            setKpis(list => (list ? list.map(k => (k.id === kpi.id ? { ...k, ...shown } : k)) : list));
          }
          setKpiSave('saved');
        },
        err => {
          kpiEdits.current.delete(kpi.id);
          setKpis(list => (list ? list.filter(k => k.id !== kpi.id) : list));
          kpiWriteFailed(err, 'foundation-kpi-add', kpi.id);
        }
      )
      .finally(() => {
        if (kpiAdds.current.get(kpi.id) === write) kpiAdds.current.delete(kpi.id);
      });
  };

  const updateKpiValue = (kpiId: string, field: KpiField, value: number) => {
    setKpis(list => (list ? list.map(k => (k.id === kpiId ? { ...k, [field]: value } : k)) : list));
    const touched = kpiTouched.current.get(kpiId) ?? new Set<KpiField>();
    touched.add(field);
    kpiTouched.current.set(kpiId, touched);
    kpiEdits.current.set(kpiId, { ...kpiEdits.current.get(kpiId), [field]: value });
    setKpiSave('idle');
    if (kpiTimer.current) clearTimeout(kpiTimer.current);
    kpiTimer.current = setTimeout(() => void flushKpiEdits(), KPI_SAVE_DELAY_MS);
  };

  // Removing SWITCHES OFF the KPI (is_active = false), the way the Goals wizard
  // does — its targets survive if it is added back.
  const removeKpi = (kpiId: string) => {
    const removed = kpis?.find(k => k.id === kpiId);
    if (!profileId || !removed) return;
    const pid = profileId;
    kpiEdits.current.delete(kpiId);
    setKpis(list => (list ? list.filter(k => k.id !== kpiId) : list));
    setKpiSave('saving');
    trackPlanWrite(
      (async () => {
        await kpiAdds.current.get(kpiId)?.catch(() => {});
        const res = await KPIService.deleteKPI(pid, kpiId);
        if (!res.success) throw new Error(res.error || 'KPI remove failed');
      })()
    ).then(
      () => setKpiSave('saved'),
      err => {
        setKpis(list => (list && !list.some(k => k.id === kpiId) ? [...list, removed] : list));
        kpiWriteFailed(err, 'foundation-kpi-remove', kpiId);
      }
    );
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
        <p className="text-sm font-medium text-gray-900 mb-1">The numbers to watch</p>
        <p className="text-xs text-gray-500 mb-4">
          Add as many KPIs as you like and set their targets — it&apos;s the same list as the Goals section.
        </p>

        {kpis === null && !loadFailed && (
          <p className="text-sm text-amber-800">
            Couldn&apos;t check this business&apos;s KPIs. Reload the page before adding any.
          </p>
        )}

        {kpis !== null && profileId && (
          <KPISection
            kpis={kpis}
            updateKPIValue={updateKpiValue}
            addKPI={addKpi}
            deleteKPI={removeKpi}
            yearType={yearType}
            isCollapsed={!kpisOpen}
            onToggle={() => setKpisOpen(open => !open)}
            showKPIModal={showKPIModal}
            setShowKPIModal={setShowKPIModal}
            businessId={profileId}
          />
        )}

        <div className="h-6 mt-2 text-xs" aria-live="polite">
          {kpiSave === 'saving' && (
            <span className="flex items-center gap-1.5 text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving KPIs…
            </span>
          )}
          {kpiSave === 'saved' && (
            <span className="flex items-center gap-1.5 text-green-600">
              <Check className="w-3.5 h-3.5" /> KPIs saved
            </span>
          )}
          {kpiSave === 'failed' && (
            <span className="flex items-center gap-1.5 text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5" /> Couldn&apos;t save a KPI change — check the list and try
              again.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
