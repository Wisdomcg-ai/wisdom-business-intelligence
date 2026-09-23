'use client';

import { useMemo, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/client';
import { Download, Loader2, AlertTriangle } from 'lucide-react';
import type { QuarterlyReview } from '../types';
import { buildPlanPage, planPdfFilename } from '../utils/quarterly-plan-page';
import { loadPlanPdfData } from '../services/quarterly-plan-pdf-data';

interface ExportPlanPdfButtonProps {
  review: QuarterlyReview;
  /** The button's own look — the close screen and the summary header differ. */
  className?: string;
  /** Layout for the wrapper, so the button can sit in a flex row of equals. */
  wrapperClassName?: string;
  label?: string;
}

type State = 'idle' | 'working' | 'failed';

/**
 * "Export PDF" — the client's one-page plan, built in the browser.
 *
 * The same button in both places that offer it (the close screen and the
 * summary header), because two copies of "gather, build, download" is two
 * chances for the pages to print different plans.
 *
 * jsPDF is loaded only when the button is pressed: it is a large dependency and
 * most people who open a summary never export one.
 */
export function ExportPlanPdfButton({
  review,
  className,
  wrapperClassName,
  label = 'Export PDF',
}: ExportPlanPdfButtonProps) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<State>('idle');
  const [missing, setMissing] = useState<string[]>([]);

  const handleExport = async () => {
    setState('working');
    setMissing([]);
    try {
      const data = await loadPlanPdfData(supabase, review);
      const page = buildPlanPage({
        review,
        businessName: data.businessName,
        yearType: data.yearType,
        annual: data.annual,
        quarterFromPlan: data.quarterFromPlan,
        kpis: data.kpis,
        now: new Date(),
      });
      const { renderPlanPdf } = await import('../services/quarterly-plan-pdf');
      renderPlanPdf(page).save(planPdfFilename(page.businessName, page.title));
      setMissing(data.missing);
      setState('idle');
    } catch (err) {
      console.error('[QuarterlyReview] PDF export failed', err);
      try {
        Sentry.captureException(err, {
          tags: { invariant: 'quarterly_review_pdf_export_failed' },
          extra: { reviewId: review.id },
        } as any);
      } catch {
        /* Sentry must not break the export */
      }
      setState('failed');
    }
  };

  return (
    <div className={wrapperClassName ?? 'inline-block'}>
      <button
        type="button"
        onClick={handleExport}
        disabled={state === 'working'}
        className={
          className ??
          'flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-60'
        }
      >
        {state === 'working' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {state === 'working' ? 'Making your PDF…' : label}
      </button>

      {state === 'failed' && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 mt-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          We couldn&apos;t make the PDF. Try again in a moment.
        </p>
      )}

      {/* Downloaded, but short of something — say which part, rather than let a
          missing section read as "you have none of that". */}
      {state === 'idle' && missing.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 mt-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          Downloaded without {missing.join(' or ')} — we couldn&apos;t read {missing.length > 1 ? 'those' : 'that'} just now.
        </p>
      )}
    </div>
  );
}
