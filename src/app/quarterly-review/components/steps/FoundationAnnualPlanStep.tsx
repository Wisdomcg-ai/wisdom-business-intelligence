'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resolveBusinessProfileId } from '@/lib/business/resolveBusinessProfileIds';
import { StepHeader } from '../StepHeader';
import { MoneyInput } from '../MoneyInput';
import type { QuarterlyReview, YearType } from '../../types';
import {
  seedAnnualNumbers,
  isComplete,
  year1EndDateFor,
  type FoundationNumbers,
  type SeededNumbers,
} from '../../utils/foundation-plan';
import { saveFoundationAnnualPlan, trackPlanWrite } from '../../services/foundation-plan-service';
import { planHasAnnualTarget } from '../../utils/review-readiness';
import { captureReviewWriteFailure } from '../../utils/capture-write-failure';
import { Check, Loader2, AlertTriangle } from 'lucide-react';

interface FoundationAnnualPlanStepProps {
  review: QuarterlyReview;
  onUpdateConfidence: (data: {
    confidence: number;
    notes: string;
    adjusted: boolean;
    ytdRevenue: number | null;
    ytdGrossProfit: number | null;
    ytdNetProfit: number | null;
  }) => void;
}

type Numbers = SeededNumbers;
type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

const complete = isComplete;

const margin = (part: number | null, whole: number | null) =>
  part !== null && whole ? `${Math.round((part / whole) * 100)}%` : null;

/**
 * First session, step 9 — set this year's numbers.
 *
 * Matt, 22 Sep 2026: a first session sets just the numbers — revenue, gross
 * profit, net profit and the year type. "How confident are you in the plan?"
 * means nothing before there is a plan, so this step creates it, then asks.
 *
 * Starts from, in order: the client's EXISTING plan (a coach can force a first
 * session for someone who has one — never overwrite it with a guess), then last
 * quarter's baseline × 4, then blank. Saves only when all three are filled, so a
 * half-typed form can never write $0 as a target.
 *
 * A suggestion the owner accepts as it stands IS their plan, so it saves as soon
 * as the step opens — they must not have to edit a number to keep it. (Live test,
 * 22 Sep 2026: accepting ×4 and clicking Continue saved nothing, and the next
 * step said "set this year's numbers first".) A plan already on file is never
 * re-saved just by opening the step.
 */
export function FoundationAnnualPlanStep({ review, onUpdateConfidence }: FoundationAnnualPlanStepProps) {
  const supabase = useMemo(() => createClient(), []);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [yearType, setYearType] = useState<YearType>('FY');
  const [numbers, setNumbers] = useState<Numbers>({ revenue: null, grossProfit: null, netProfit: null });
  const [save, setSave] = useState<SaveState>('idle');
  // Where the starting numbers came from — so the screen only says "last quarter
  // × 4" when that's true, not when they came from a plan already on file.
  const [seededFrom, setSeededFrom] = useState<'plan' | 'baseline' | 'blank'>('blank');
  const [confidence, setConfidence] = useState<number | null>(review.annual_target_confidence ?? null);
  const [notes, setNotes] = useState<string>(review.confidence_notes ?? '');
  const dirty = useRef(false);
  // What the screen shows but the database doesn't have yet — finished off if
  // the step closes before the save delay runs out.
  const pending = useRef<{ numbers: FoundationNumbers; yearType: YearType } | null>(null);
  const profileRef = useRef<string | null>(null);

  const baselineSeed = useMemo(
    () =>
      seedAnnualNumbers({
        revenue: review.dashboard_snapshot?.revenue?.actual,
        grossProfit: review.dashboard_snapshot?.grossProfit?.actual,
        netProfit: review.dashboard_snapshot?.netProfit?.actual,
      }),
    [review.dashboard_snapshot]
  );
  const hasBaseline =
    review.dashboard_snapshot?.revenue !== undefined ||
    review.dashboard_snapshot?.grossProfit !== undefined ||
    review.dashboard_snapshot?.netProfit !== undefined;

  // Load the plan THROUGH THE BUSINESS, never through the logged-in person — a
  // coach or team member has no plan of their own.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pid = await resolveBusinessProfileId(supabase, review.business_id);
        if (!pid) throw new Error('No business profile for this review');
        const { data, error } = await supabase
          .from('business_financial_goals')
          .select('revenue_year1, gross_profit_year1, net_profit_year1, year_type')
          .eq('business_id', pid)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        setProfileId(pid);
        profileRef.current = pid;
        // A row whose targets are all $0 is an empty plan, not one on file —
        // seeding from it showed $0 × 3 as "saved" and nobody entered the year
        // (JVJ, 25 Sep 2026). It falls through to the baseline, or blank.
        const fromPlan = planHasAnnualTarget(data);
        if (data) setYearType((data.year_type as YearType) || 'FY');
        if (fromPlan && data) {
          setSeededFrom('plan');
          setNumbers({
            revenue: data.revenue_year1 ?? null,
            grossProfit: data.gross_profit_year1 ?? null,
            netProfit: data.net_profit_year1 ?? null,
          });
          setSave('saved');
        } else if (hasBaseline) {
          // No plan yet: start from last quarter × 4. A line the baseline
          // skipped stays blank. If all three are there, the suggestion is saved
          // straight away (the auto-save below), so accepting it as it stands
          // keeps it.
          setSeededFrom('baseline');
          setNumbers({ ...baselineSeed });
          if (complete(baselineSeed)) dirty.current = true;
        }
      } catch (err) {
        captureReviewWriteFailure(err, 'foundation-annual-load', { reviewId: review.id });
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Seed once, on entry. Re-seeding while typing would fight the owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, review.business_id, review.id]);

  const persist = (pid: string, values: FoundationNumbers, yt: YearType) =>
    trackPlanWrite(
      saveFoundationAnnualPlan(supabase, {
        profileId: pid,
        userId: review.user_id,
        numbers: values,
        yearType: yt,
        year1EndDate: year1EndDateFor(yt, review.year),
      })
    );

  const doSave = async () => {
    if (!profileId || !complete(numbers)) return;
    pending.current = null;
    setSave('saving');
    try {
      await persist(profileId, numbers, yearType);
      setSave('saved');
    } catch (err) {
      captureReviewWriteFailure(err, 'foundation-annual-save', { reviewId: review.id, profileId });
      setSave('failed');
    }
  };

  // Debounced auto-save, like the rest of the workshop — only once all three
  // numbers are in, and only after something needs saving (an edit, or a
  // suggestion that isn't on file yet).
  useEffect(() => {
    if (!loaded || !dirty.current || !complete(numbers)) return;
    pending.current = { numbers, yearType };
    const t = setTimeout(doSave, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numbers, yearType, loaded]);

  // Leaving the step before the delay runs out still saves what was on screen.
  useEffect(
    () => () => {
      const p = pending.current;
      const pid = profileRef.current;
      if (!p || !pid) return;
      persist(pid, p.numbers, p.yearType).catch(err =>
        captureReviewWriteFailure(err, 'foundation-annual-save-on-leave', { reviewId: review.id, profileId: pid })
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const edit = (patch: Partial<Numbers>) => {
    dirty.current = true;
    setSave('idle');
    setNumbers(n => ({ ...n, ...patch }));
  };

  const setConf = (value: number | null, text: string) => {
    setConfidence(value);
    setNotes(text);
    if (value !== null) {
      onUpdateConfidence({
        confidence: value,
        notes: text,
        adjusted: false,
        ytdRevenue: null,
        ytdGrossProfit: null,
        ytdNetProfit: null,
      });
    }
  };

  const gm = margin(numbers.grossProfit, numbers.revenue);
  const nm = margin(numbers.netProfit, numbers.revenue);

  return (
    <div>
      <StepHeader step="4.1" subtitle="Set this year's numbers" estimatedTime={15} />

      {loadFailed && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            We couldn&apos;t load this business&apos;s plan, so nothing here will be saved. Reload
            the page before carrying on.
          </p>
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
        <p className="text-sm text-gray-700">
          What does the business want to achieve <strong>this year</strong>? Just three numbers —
          we&apos;ll keep the bigger picture for a later session.
        </p>
        {seededFrom === 'baseline' && (
          <p className="text-sm text-gray-600 mt-2">
            We&apos;ve started you at last quarter × 4. Change them to whatever you&apos;re aiming for.
          </p>
        )}
        {seededFrom === 'plan' && (
          <p className="text-sm text-gray-600 mt-2">
            These are the numbers already in this business&apos;s plan. Change them if they&apos;ve moved.
          </p>
        )}
      </div>

      <div className="mb-6">
        <span className="block text-sm font-medium text-gray-700 mb-2">Your financial year runs</span>
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {(['FY', 'CY'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => {
                dirty.current = true;
                setSave('idle');
                setYearType(t);
              }}
              aria-pressed={yearType === t}
              className={`px-4 py-2 text-sm font-medium ${
                yearType === t ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t === 'FY' ? 'July – June' : 'January – December'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-2">
        <MoneyInput id="annual-revenue" label="Revenue this year" value={numbers.revenue} onChange={v => edit({ revenue: v })} />
        <MoneyInput
          id="annual-gp"
          label="Gross profit this year"
          hint={gm ? `That's a ${gm} gross margin` : undefined}
          value={numbers.grossProfit}
          onChange={v => edit({ grossProfit: v })}
        />
        <MoneyInput
          id="annual-np"
          label="Net profit this year"
          hint={nm ? `That's a ${nm} net margin` : undefined}
          value={numbers.netProfit}
          onChange={v => edit({ netProfit: v })}
        />
      </div>

      <div className="h-6 mb-6 text-xs" aria-live="polite">
        {!complete(numbers) && loaded && <span className="text-gray-500">Fill in all three to save your plan.</span>}
        {save === 'saving' && (
          <span className="flex items-center gap-1.5 text-gray-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving your plan…
          </span>
        )}
        {save === 'saved' && complete(numbers) && (
          <span className="flex items-center gap-1.5 text-green-600">
            <Check className="w-3.5 h-3.5" /> Plan saved
          </span>
        )}
        {save === 'failed' && (
          <span className="flex items-center gap-1.5 text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" /> Couldn&apos;t save your plan
            <button type="button" onClick={doSave} className="underline font-medium ml-1">
              Retry
            </button>
          </span>
        )}
      </div>

      <div className="border-t border-gray-100 pt-6">
        <p className="text-sm font-medium text-gray-900 mb-1">
          How confident are you that you&apos;ll hit these numbers?
        </p>
        <p className="text-xs text-gray-500 mb-3">1 is a long shot, 10 is in the bag.</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setConf(n, notes)}
              aria-pressed={confidence === n}
              className={`w-10 h-10 rounded-lg text-sm font-semibold ${
                confidence === n
                  ? 'bg-brand-orange text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-brand-orange-50'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={e => setConf(confidence, e.target.value)}
          placeholder="What would make you more confident?"
          rows={3}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange resize-none"
        />
        {confidence === null && notes.trim() !== '' && (
          <p className="text-xs text-gray-500 mt-1">Pick a number above to save your note.</p>
        )}
      </div>
    </div>
  );
}
