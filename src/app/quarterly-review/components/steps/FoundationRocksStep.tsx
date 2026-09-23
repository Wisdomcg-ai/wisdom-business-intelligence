'use client';

import { useMemo, useState } from 'react';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, QuarterNumber, RockReviewItem, YearType } from '../../types';
import { reviewedQuarterOf } from '../../types';
import { describeQuarter } from '../../utils/foundation-plan';
import {
  toRocksReview,
  fromRocksReview,
  summarise,
  OUTCOME_LABELS,
  FOUNDATION_PRIORITY_LIMIT,
  type FoundationOutcome,
  type FoundationPriority,
} from '../../utils/foundation-rocks';
import { Mountain, Plus, Trash2 } from 'lucide-react';

interface FoundationRocksStepProps {
  review: QuarterlyReview;
  onUpdate: (items: RockReviewItem[]) => void;
  yearType?: YearType;
}

const OUTCOMES: FoundationOutcome[] = ['landed', 'partly', 'didnt'];

const blankRow = (n: number): FoundationPriority => ({
  id: `self-${n}-${Math.random().toString(36).slice(2, 8)}`,
  title: '',
  outcome: null,
  note: '',
});

/**
 * First session, step 3 — Rocks Accountability becomes "what were you trying to
 * get done?".
 *
 * A first-timer has no rocks to be held to, so the standard screen shows them
 * "No Previous Rocks Found" and nothing to do — a dead end in the middle of a
 * live session. Instead they name up to three things they were working on last
 * quarter and say whether each landed.
 *
 * Two reasons it is worth the five minutes: it starts the accountability habit
 * on their own words rather than on an empty table, and anything that did not
 * land is written down where the coach can turn it into a rock later in the
 * session. Nothing here is auto-loaded, because nothing exists to load.
 */
export function FoundationRocksStep({ review, onUpdate, yearType = 'FY' }: FoundationRocksStepProps) {
  const reviewed = reviewedQuarterOf({ quarter: review.quarter as QuarterNumber, year: review.year });
  const [rows, setRows] = useState<FoundationPriority[]>(() => {
    const stored = fromRocksReview(review.rocks_review);
    return stored.length > 0 ? stored : [blankRow(1)];
  });

  const counts = useMemo(() => summarise(rows), [rows]);

  const commit = (next: FoundationPriority[]) => {
    setRows(next);
    onUpdate(toRocksReview(next));
  };

  const edit = (id: string, patch: Partial<FoundationPriority>) =>
    commit(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const remove = (id: string) => {
    const next = rows.filter(r => r.id !== id);
    commit(next.length > 0 ? next : [blankRow(1)]);
  };

  return (
    <div>
      <StepHeader step="1.3" subtitle="What were you trying to get done?" estimatedTime={10} />

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
        <p className="text-sm text-gray-700">
          Name up to {FOUNDATION_PRIORITY_LIMIT} things you were working on{' '}
          <strong>last quarter</strong> — {describeQuarter(reviewed.quarter, reviewed.year, yearType)} — and
          say how each one went. They don&apos;t have to have been written down anywhere.
        </p>
        <p className="text-sm text-gray-600 mt-2">
          Anything that didn&apos;t land stays on the list, and you can make it a priority for this
          quarter later in the session.
        </p>
      </div>

      <div className="space-y-4 mb-4">
        {rows.map((row, index) => (
          <div key={row.id} className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-brand-orange-50 text-brand-orange-700 text-sm font-semibold flex items-center justify-center shrink-0 mt-1">
                {index + 1}
              </div>
              <div className="flex-1">
                <label htmlFor={`priority-${row.id}`} className="sr-only">
                  Priority {index + 1}
                </label>
                <input
                  id={`priority-${row.id}`}
                  type="text"
                  value={row.title}
                  onChange={e => edit(row.id, { title: e.target.value })}
                  placeholder="e.g. Hire a second technician"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                />

                <div className="flex flex-wrap gap-2 mt-3">
                  {OUTCOMES.map(outcome => (
                    <button
                      key={outcome}
                      type="button"
                      aria-pressed={row.outcome === outcome}
                      onClick={() => edit(row.id, { outcome: row.outcome === outcome ? null : outcome })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 ${
                        row.outcome === outcome
                          ? 'border-brand-orange bg-brand-orange-50 text-brand-orange-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {OUTCOME_LABELS[outcome]}
                    </button>
                  ))}
                </div>

                {row.outcome && (
                  <input
                    type="text"
                    value={row.note}
                    onChange={e => edit(row.id, { note: e.target.value })}
                    placeholder={
                      row.outcome === 'landed' ? 'What made it work? (optional)' : 'What got in the way? (optional)'
                    }
                    aria-label={`What happened with priority ${index + 1}`}
                    className="w-full mt-3 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                  />
                )}
              </div>

              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(row.id)}
                  aria-label={`Remove priority ${index + 1}`}
                  className="p-2 text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {rows.length < FOUNDATION_PRIORITY_LIMIT && (
        <button
          type="button"
          onClick={() => commit([...rows, blankRow(rows.length + 1)])}
          className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-gray-400"
        >
          <Plus className="w-4 h-4" />
          Add another
        </button>
      )}

      {counts.answered > 0 && (
        <div className="flex items-start gap-3 text-sm text-gray-700 bg-brand-orange-50 border border-brand-orange-100 rounded-xl p-4 mt-6">
          <Mountain className="w-4 h-4 text-brand-orange-600 shrink-0 mt-0.5" />
          <p>
            {counts.landed} of {counts.answered} got done.
            {counts.carried > 0 && ` ${counts.carried} still open — worth considering for this quarter.`}
          </p>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-6">
        Nothing to put here? Leave it blank and carry on — next quarter this screen will hold you to
        the priorities you set today.
      </p>
    </div>
  );
}
