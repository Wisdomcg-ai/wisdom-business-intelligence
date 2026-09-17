'use client';

import { Sparkles, AlertTriangle } from 'lucide-react';
import type { ReviewReadiness } from '../utils/review-readiness';

interface FirstSessionNoticeProps {
  readiness: ReviewReadiness;
  foundationMode: boolean;
  couldNotCheck: boolean;
  isLoading: boolean;
}

/**
 * Tells the room, once, what kind of session this is.
 *
 * A first-timer's review works differently — the backward-looking steps capture a
 * starting position instead of comparing against one, and the planning steps build
 * the plan instead of adjusting it. Saying so up front is the difference between
 * "this tool is empty and broken" and "this is where we start".
 *
 * Written for someone who is not a numbers person: what this session will do, in
 * one sentence, with no jargon and no list of missing database rows.
 */
export function FirstSessionNotice({
  readiness,
  foundationMode,
  couldNotCheck,
  isLoading,
}: FirstSessionNoticeProps) {
  if (isLoading) return null;

  // We could not read one or more signals. Say that plainly rather than guessing
  // in either direction — a wrong guess here either hides the plan they have or
  // walks them through building one they already own.
  if (couldNotCheck && !foundationMode) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-600">
          We couldn&apos;t check what&apos;s already set up for this business, so the review is
          running as normal. If a screen looks emptier than you expect, that&apos;s why.
        </p>
      </div>
    );
  }

  if (!foundationMode) return null;

  const noHistory = readiness.hasPriorReview === 'no';
  const noPlan = readiness.hasPlan === 'no';

  return (
    <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-xl p-5 mb-6">
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-brand-orange-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-gray-900 mb-1">This is your first session</h2>
          <p className="text-sm text-gray-700">
            {noHistory && noPlan
              ? 'There’s nothing to look back on yet, so today is about two things: capturing where the business is starting from, and building the plan for the quarter ahead.'
              : noHistory
                ? 'Your plan is already set up, so today is about capturing where the business is starting from — next quarter these screens will compare against it.'
                : 'Today we’ll build your plan for the year and the quarter ahead. The screens that normally show targets are blank because there aren’t any yet.'}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Some screens will look emptier than usual. That&apos;s expected — what you enter today
            is what they&apos;ll fill up with.
          </p>
          {couldNotCheck && (
            <p className="text-xs text-gray-500 mt-3">
              Note: we couldn&apos;t check everything, so some screens may already have data.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
