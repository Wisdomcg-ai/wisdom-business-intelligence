'use client';

import { useEffect, useRef, useState } from 'react';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import { captureReviewWriteFailure } from '../../utils/capture-write-failure';
import { getOpenLoops, createOpenLoop, type OpenLoop } from '@/lib/services/openLoopsService';
import { getActiveIssues, createIssue, type Issue } from '@/lib/services/issuesService';
import { Loader2, Plus, AlertTriangle, Check, Inbox } from 'lucide-react';

interface FoundationOpenItemsStepProps {
  /** Unused today — kept so the step matches every other step's signature. */
  review?: unknown;
}

type ListKey = 'loops' | 'issues';
type Row = { id: string; title: string };

const LISTS: Record<
  ListKey,
  { title: string; blurb: string; placeholder: string; landedIn: string; empty: string }
> = {
  loops: {
    title: 'Things you’re in the middle of',
    blurb: 'Started but not finished. The jobs that follow you home.',
    placeholder: 'e.g. The Henderson quote still isn’t out',
    landedIn: 'Open Loops',
    empty: 'Nothing here yet.',
  },
  issues: {
    title: 'Problems that need solving',
    blurb: 'The ones that keep coming back, not today’s fire.',
    placeholder: 'e.g. We keep running out of stock on the fast movers',
    landedIn: 'Issues',
    empty: 'Nothing here yet.',
  },
};

/**
 * First session, step 5 — Clear the Decks becomes capture, not triage.
 *
 * The standard screen triages the live Open Loops and Issues lists. A first-timer
 * has two empty lists, so triage has nothing to work on and the most valuable
 * screen in the session reads as "you have nothing". What they actually have is
 * a backlog carried in their head, and this is where it gets written down.
 *
 * Each line goes straight into the REAL list — /open-loops and /issues-list, the
 * same rows the rest of the app reads — not a copy inside the review. A copy
 * would look identical today and be invisible to every other screen tomorrow.
 */
export function FoundationOpenItemsStep(_props: FoundationOpenItemsStepProps) {
  const { activeBusiness } = useBusinessContext();
  const [rows, setRows] = useState<Record<ListKey, Row[]>>({ loops: [], issues: [] });
  const [drafts, setDrafts] = useState<Record<ListKey, string>>({ loops: '', issues: '' });
  const [adding, setAdding] = useState<ListKey | null>(null);
  const [failed, setFailed] = useState<ListKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const addedThisSession = useRef(0);

  // What is already on the two lists — so a coach who comes back to this step
  // sees what was captured rather than two empty boxes again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const businessId = activeBusiness?.id;
        const overrideUserId = activeBusiness?.ownerId;
        const [loops, issues] = await Promise.all([
          getOpenLoops(undefined, overrideUserId, businessId),
          getActiveIssues(overrideUserId, businessId),
        ]);
        if (cancelled) return;
        setRows({
          loops: ((loops as OpenLoop[]) ?? []).map(l => ({ id: l.id, title: l.title })),
          issues: ((issues as Issue[]) ?? []).map(i => ({ id: i.id, title: i.title })),
        });
      } catch (err) {
        captureReviewWriteFailure(err, 'foundation-open-items-load');
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBusiness?.id, activeBusiness?.ownerId]);

  const add = async (list: ListKey) => {
    const title = drafts[list].trim();
    if (!title || adding) return;
    setAdding(list);
    setFailed(null);
    try {
      const businessId = activeBusiness?.id;
      const created =
        list === 'loops'
          ? await createOpenLoop(
              {
                title,
                start_date: new Date().toISOString().split('T')[0],
                expected_completion_date: null,
                owner: 'Me',
                status: 'in-progress',
                blocker: null,
              },
              undefined,
              businessId
            )
          : await createIssue(
              { title, priority: null, status: 'new', owner: 'Me', stated_problem: null, root_cause: null, solution: null },
              undefined,
              businessId
            );

      setRows(r => ({ ...r, [list]: [{ id: (created as { id: string }).id, title }, ...r[list]] }));
      // Only cleared once it landed — a failed save must not eat what they typed.
      setDrafts(d => ({ ...d, [list]: '' }));
      addedThisSession.current += 1;
    } catch (err) {
      captureReviewWriteFailure(err, `foundation-open-items-add-${list}`, { title });
      setFailed(list);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div>
      <StepHeader step="2.2" subtitle="What’s on your mind?" estimatedTime={15} />

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
        <p className="text-sm text-gray-700">
          Everything you&apos;re carrying around in your head — get it down here. Don&apos;t sort it or
          solve it, just say it. One line each.
        </p>
        <p className="text-sm text-gray-600 mt-2">
          These go straight onto your Open Loops and Issues lists, so they&apos;re still there after
          today and you can work through them week by week.
        </p>
      </div>

      {loadFailed && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            We couldn&apos;t load what&apos;s already on these lists, so you may be looking at less than
            you have. Anything you add here still saves.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {(Object.keys(LISTS) as ListKey[]).map(list => {
            const meta = LISTS[list];
            return (
              <div key={list} className="border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900">{meta.title}</h3>
                <p className="text-xs text-gray-500 mt-1 mb-4">{meta.blurb}</p>

                <div className="flex gap-2">
                  <label htmlFor={`capture-${list}`} className="sr-only">
                    {meta.title}
                  </label>
                  <input
                    id={`capture-${list}`}
                    type="text"
                    value={drafts[list]}
                    onChange={e => setDrafts(d => ({ ...d, [list]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void add(list);
                      }
                    }}
                    placeholder={meta.placeholder}
                    className="flex-1 min-w-0 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                  />
                  <button
                    type="button"
                    onClick={() => void add(list)}
                    disabled={!drafts[list].trim() || adding === list}
                    aria-label={`Add to ${meta.landedIn}`}
                    className="px-3 py-2.5 rounded-lg bg-gray-900 text-white disabled:opacity-40"
                  >
                    {adding === list ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>

                {failed === list && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-700 mt-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    That one didn&apos;t save — it&apos;s still in the box, try again.
                  </p>
                )}

                <ul className="mt-4 space-y-2">
                  {rows[list].length === 0 && (
                    <li className="flex items-center gap-2 text-sm text-gray-400">
                      <Inbox className="w-4 h-4" />
                      {meta.empty}
                    </li>
                  )}
                  {rows[list].map(row => (
                    <li key={row.id} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <span>{row.title}</span>
                    </li>
                  ))}
                </ul>

                {rows[list].length > 0 && (
                  <p className="text-xs text-gray-500 mt-3">
                    {rows[list].length} on your {meta.landedIn} list
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-500 mt-6">
        You don&apos;t have to fix any of this today. Getting it out of your head is the job — next
        quarter this screen is where you work through it.
      </p>
    </div>
  );
}
