'use client';

import { useState } from 'react';
import { Sparkles, AlertTriangle, Loader2 } from 'lucide-react';
import type { ReviewReadiness, SessionModeOverride } from '../utils/review-readiness';

interface FirstSessionNoticeProps {
  readiness: ReviewReadiness;
  foundationMode: boolean;
  detectedFoundationMode: boolean;
  sessionMode: SessionModeOverride;
  overridden: boolean;
  couldNotCheck: boolean;
  isLoading: boolean;
  /** Only a coach or admin gets the control; the client just sees the notice. */
  canOverride: boolean;
  onSetSessionMode: (mode: SessionModeOverride) => Promise<boolean>;
}

const OPTIONS: { value: SessionModeOverride; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'first_session', label: 'First session' },
  { value: 'standard', label: 'Standard' },
];

/**
 * Tells the room what kind of session this is, and lets the coach change it.
 *
 * A first-timer's review works differently — the backward-looking steps capture a
 * starting position instead of comparing against one, and the planning steps build
 * the plan instead of adjusting it. Saying so up front is the difference between
 * "this tool is empty and broken" and "this is where we start".
 *
 * Detection reads the data, which is not always the judgement. A half-set-up
 * client, or one whose plan is a year stale, may still be a first session. So the
 * coach can override it here, in the room, and the choice sticks for that client.
 *
 * The notice is written for someone who is not a numbers person: what this session
 * will do, in one sentence, with no jargon and no list of missing database rows.
 * The control is written for the coach and sits visually apart from it.
 */
export function FirstSessionNotice({
  readiness,
  foundationMode,
  detectedFoundationMode,
  sessionMode,
  overridden,
  couldNotCheck,
  isLoading,
  canOverride,
  onSetSessionMode,
}: FirstSessionNoticeProps) {
  const [saving, setSaving] = useState<SessionModeOverride | null>(null);
  const [failed, setFailed] = useState(false);

  if (isLoading) return null;

  const choose = async (mode: SessionModeOverride) => {
    if (mode === sessionMode) return;
    setSaving(mode);
    setFailed(!(await onSetSessionMode(mode)));
    setSaving(null);
  };

  const control = canOverride ? (
    <div className="mt-4 pt-3 border-t border-black/5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs font-medium text-gray-600">Run this client&apos;s review as</span>
        <div className="inline-flex rounded-lg border border-gray-300 bg-white overflow-hidden">
          {OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(o.value)}
              disabled={saving !== null}
              aria-pressed={sessionMode === o.value}
              className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                sessionMode === o.value
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {saving === o.value ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                o.label
              )}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">
          {sessionMode === 'auto'
            ? detectedFoundationMode
              ? 'Detected: first session'
              : 'Detected: standard review'
            : overridden
              ? `Your choice — detection said ${detectedFoundationMode ? 'first session' : 'standard review'}`
              : 'Your choice — matches what was detected'}
        </span>
      </div>
      {failed && (
        <p className="text-xs text-amber-700 mt-2">
          Couldn&apos;t save that — you may not have permission to change this client. The
          session is running as it was.
        </p>
      )}
      <p className="text-xs text-gray-400 mt-2">
        This sticks for this client until you change it. It doesn&apos;t affect reviews
        they&apos;ve already completed.
      </p>
    </div>
  ) : null;

  // We could not read one or more signals. Say that plainly rather than guessing
  // in either direction — a wrong guess here either hides the plan they have or
  // walks them through building one they already own.
  if (!foundationMode) {
    if (!couldNotCheck && !canOverride) return null;
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
        {couldNotCheck && (
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600">
              We couldn&apos;t check what&apos;s already set up for this business, so the review
              is running as normal. If a screen looks emptier than you expect, that&apos;s why.
            </p>
          </div>
        )}
        {control}
      </div>
    );
  }

  const noHistory = readiness.hasPriorReview === 'no';
  const noPlan = readiness.hasPlan === 'no';
  const forced = sessionMode === 'first_session';

  return (
    <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-xl p-5 mb-6">
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-brand-orange-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 mb-1">
            {forced ? 'Starting fresh' : 'This is your first session'}
          </h2>
          <p className="text-sm text-gray-700">
            {forced
              ? 'Today is about two things: capturing where the business is starting from, and building the plan for the quarter ahead.'
              : noHistory && noPlan
                ? 'There’s nothing to look back on yet, so today is about two things: capturing where the business is starting from, and building the plan for the quarter ahead.'
                : noHistory
                  ? 'Your plan is already set up, so today is about capturing where the business is starting from — next quarter these screens will compare against it.'
                  : 'Today we’ll build your plan for the year and the quarter ahead. The screens that normally show targets are blank because there aren’t any yet.'}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Some screens will look emptier than usual. That&apos;s expected — what you enter
            today is what they&apos;ll fill up with.
          </p>
          {couldNotCheck && !forced && (
            <p className="text-xs text-gray-500 mt-3">
              Note: we couldn&apos;t check everything, so some screens may already have data.
            </p>
          )}
        </div>
      </div>
      {control}
    </div>
  );
}
