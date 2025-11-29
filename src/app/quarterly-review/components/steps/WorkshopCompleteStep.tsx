'use client';

import { useRouter } from 'next/navigation';
import type { QuarterlyReview } from '../../types';
import {
  CheckCircle2,
  Trophy,
  Target,
  Mountain,
  Calendar,
  DollarSign,
  Sparkles,
  FileText,
  ArrowRight,
  Download
} from 'lucide-react';
import Link from 'next/link';

interface WorkshopCompleteStepProps {
  review: QuarterlyReview;
}

export function WorkshopCompleteStep({ review }: WorkshopCompleteStepProps) {
  const router = useRouter();

  const getNextQuarter = () => {
    if (review.quarter === 4) {
      return { quarter: 1, year: review.year + 1 };
    }
    return { quarter: review.quarter + 1, year: review.year };
  };

  const nextQ = getNextQuarter();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const rocks = review.quarterly_rocks || [];
  const targets = review.quarterly_targets;
  const commitments = review.personal_commitments;

  return (
    <div>
      {/* Celebration Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-teal-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trophy className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Review Complete!
        </h1>
        <p className="text-gray-600">
          Congratulations! You've completed your Q{review.quarter} {review.year} Quarterly Review.
        </p>
      </div>

      {/* Key Outcomes */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Financial Targets */}
        {targets && (
          <div className="bg-slate-50 rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-slate-600" />
              <h3 className="font-semibold text-gray-900">
                Q{nextQ.quarter} {nextQ.year} Targets
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Revenue</span>
                <span className="font-bold text-gray-900">{formatCurrency(targets.revenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Gross Profit</span>
                <span className="font-bold text-gray-900">{formatCurrency(targets.grossProfit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Net Profit</span>
                <span className="font-bold text-gray-900">{formatCurrency(targets.netProfit)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Personal Commitments */}
        {commitments && (
          <div className="bg-slate-50 rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-slate-600" />
              <h3 className="font-semibold text-gray-900">Personal Commitments</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Hours/Week</span>
                <span className="font-bold text-gray-900">{commitments.hoursPerWeekTarget || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Days Off</span>
                <span className="font-bold text-gray-900">{commitments.daysOffPlanned || '—'}</span>
              </div>
              {commitments.personalGoal && (
                <div className="pt-2 border-t border-gray-200">
                  <span className="text-xs text-gray-500">Personal Goal:</span>
                  <p className="text-sm text-gray-700 font-medium">{commitments.personalGoal}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rocks Summary */}
      {rocks.length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-gray-200 p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Mountain className="w-5 h-5 text-slate-600" />
            <h3 className="font-semibold text-gray-900">Q{nextQ.quarter} Rocks</h3>
          </div>
          <div className="space-y-3">
            {rocks.map((rock, index) => (
              <div key={rock.id} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-gray-100">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold bg-teal-600">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{rock.title || 'Untitled Rock'}</p>
                  {rock.owner && (
                    <p className="text-sm text-gray-500">Owner: {rock.owner}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Insights from Review */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-slate-600" />
          <h3 className="font-semibold text-gray-900">Key Insights</h3>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {review.action_replay?.keyInsight && (
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Action Replay Key Insight</p>
              <p className="text-sm text-gray-700">{review.action_replay.keyInsight}</p>
            </div>
          )}

          {review.biggest_win && (
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Biggest Win Last Quarter</p>
              <p className="text-sm text-gray-700">{review.biggest_win}</p>
            </div>
          )}

          {review.confidence_notes && (
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Confidence Notes</p>
              <p className="text-sm text-gray-700">{review.confidence_notes}</p>
            </div>
          )}

          {review.one_thing_for_success && (
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">One Thing for Success</p>
              <p className="text-sm text-gray-700">{review.one_thing_for_success}</p>
            </div>
          )}
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h3 className="font-semibold text-gray-900 mb-4">Next Steps</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-gray-700">
            <CheckCircle2 className="w-5 h-5 text-slate-600" />
            <span>Update your One Page Business Plan</span>
            <Link href="/business-plan" className="text-slate-600 hover:text-slate-700 text-sm ml-auto">
              Go to Plan →
            </Link>
          </div>
          <div className="flex items-center gap-3 text-gray-700">
            <CheckCircle2 className="w-5 h-5 text-slate-600" />
            <span>Schedule your Rocks in your calendar</span>
          </div>
          <div className="flex items-center gap-3 text-gray-700">
            <CheckCircle2 className="w-5 h-5 text-slate-600" />
            <span>Book your days off in advance</span>
          </div>
          <div className="flex items-center gap-3 text-gray-700">
            <CheckCircle2 className="w-5 h-5 text-slate-600" />
            <span>Share your quarterly plan with your team</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href={`/quarterly-review/summary/${review.id}`}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700 transition-colors"
        >
          <FileText className="w-5 h-5" />
          View Full Summary
        </Link>

        <button
          onClick={() => {
            // Future: Generate PDF
            alert('PDF export coming soon!');
          }}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
        >
          <Download className="w-5 h-5" />
          Export PDF
        </button>

        <Link
          href="/quarterly-review"
          className="flex-1 flex items-center justify-center gap-2 px-6 py-4 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
        >
          Back to Reviews
          <ArrowRight className="w-5 h-5" />
        </Link>
      </div>

      {/* Completion Timestamp */}
      <div className="mt-8 text-center text-sm text-gray-500">
        Completed on {new Date(review.completed_at || new Date()).toLocaleDateString('en-AU', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </div>
    </div>
  );
}
