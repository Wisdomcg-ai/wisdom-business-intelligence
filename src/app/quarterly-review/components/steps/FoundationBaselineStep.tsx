'use client';

import { StepHeader } from '../StepHeader';
import { MoneyInput } from '../MoneyInput';
import type { QuarterlyReview, DashboardSnapshot, MetricSnapshot, QuarterNumber, YearType } from '../../types';
import { reviewedQuarterOf } from '../../types';
import { describeQuarter } from '../../utils/foundation-plan';
import { Flag } from 'lucide-react';

interface FoundationBaselineStepProps {
  review: QuarterlyReview;
  onUpdate: (snapshot: DashboardSnapshot) => void;
  /** How this business names its quarters — matches the workshop header. */
  yearType?: YearType;
}

type Line = 'revenue' | 'grossProfit' | 'netProfit';

const LINES: { key: Line; label: string; hint?: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'grossProfit', label: 'Gross profit', hint: 'Revenue less the direct cost of what you sold' },
  { key: 'netProfit', label: 'Net profit', hint: 'What was left after every cost. A loss is fine — type it as -15,000' },
];

/**
 * First session, step 2 — the Scorecard becomes "where are you starting from?".
 *
 * A first-timer has no targets, so there is nothing to score against. Instead
 * this records last quarter's actual revenue, gross profit and net profit as the
 * opening position. That baseline does two jobs:
 *   - it seeds this year's targets two steps later (last quarter × 4, editable),
 *     so the owner adjusts a number rather than inventing one; and
 *   - on completion it is filed against the reviewed quarter, so next quarter's
 *     Scorecard and plan grid finally have something real to compare against.
 *
 * No target column, no variance, no colour, and no annual ÷ 4 figure dressed up
 * as a target. A line left blank is not recorded — it is never saved as $0.
 */
export function FoundationBaselineStep({ review, onUpdate, yearType = 'FY' }: FoundationBaselineStepProps) {
  const snapshot: DashboardSnapshot = review.dashboard_snapshot || {};
  const reviewed = reviewedQuarterOf({ quarter: review.quarter as QuarterNumber, year: review.year });

  const valueOf = (key: Line): number | null => {
    const line = snapshot[key];
    return line && Number.isFinite(line.actual) ? line.actual : null;
  };

  const setLine = (key: Line, actual: number | null) => {
    const next: DashboardSnapshot = { ...snapshot };
    if (actual === null) {
      delete next[key];
    } else {
      // A baseline has no target to measure against: target and variance are 0
      // by construction, never computed (target 0 would divide by zero).
      const line: MetricSnapshot = { target: 0, actual, variance: 0 };
      next[key] = line;
    }
    onUpdate(next);
  };

  return (
    <div>
      <StepHeader
        step="1.2"
        subtitle="Where is the business starting from?"
        estimatedTime={10}
      />

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
        <p className="text-sm text-gray-700">
          Enter what the business actually did <strong>last quarter</strong> —{' '}
          {describeQuarter(reviewed.quarter, reviewed.year, yearType)}. It doesn&apos;t need to be
          exact; your best figure from your accounts is fine.
        </p>
        <p className="text-sm text-gray-600 mt-2">
          We&apos;ll use it to suggest this year&apos;s targets in a couple of steps, and next
          quarter this screen will compare against it.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {LINES.map(l => (
          <MoneyInput
            key={l.key}
            id={`baseline-${l.key}`}
            label={`${l.label} last quarter`}
            hint={l.hint}
            value={valueOf(l.key)}
            onChange={v => setLine(l.key, v)}
          />
        ))}
      </div>

      <div className="flex items-start gap-3 text-sm text-gray-600 bg-brand-orange-50 border border-brand-orange-100 rounded-xl p-4">
        <Flag className="w-4 h-4 text-brand-orange-600 shrink-0 mt-0.5" />
        <p>
          Not sure of a figure? Leave it blank — nothing is saved for a line you skip, and you can
          set your targets from scratch instead.
        </p>
      </div>
    </div>
  );
}
