'use client';

import { StepHeader } from '../StepHeader';
import type { QuarterlyReview } from '../../types';
import { Lightbulb, AlertTriangle, BookOpen, Target, CheckCircle2, Edit3 } from 'lucide-react';

interface PreWorkReviewStepProps {
  review: QuarterlyReview;
  onEditPreWork?: () => void;
}

export function PreWorkReviewStep({ review, onEditPreWork }: PreWorkReviewStepProps) {
  const getRatingColor = (rating: number | null) => {
    if (!rating) return 'text-gray-400';
    if (rating >= 8) return 'text-gray-900';
    if (rating >= 5) return 'text-gray-700';
    return 'text-gray-600';
  };

  const getRatingLabel = (rating: number | null) => {
    if (!rating) return 'Not rated';
    if (rating >= 9) return 'Excellent';
    if (rating >= 7) return 'Good';
    if (rating >= 5) return 'Average';
    if (rating >= 3) return 'Below Average';
    return 'Needs Attention';
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <StepHeader
          step="1.1"
          subtitle="Review your pre-work responses before diving into the review"
          estimatedTime={10}
          tip="Discuss key insights with your coach"
        />
        {onEditPreWork && (
          <button
            onClick={onEditPreWork}
            className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange-600 transition-colors text-sm"
          >
            <Edit3 className="w-4 h-4" />
            Edit Pre-Work
          </button>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-gray-900">
            {review.last_quarter_rating || '-'}/10
          </div>
          <div className="text-sm text-gray-600 mt-1">Quarter Rating</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-gray-900">
            {review.hours_worked_avg || '-'}
          </div>
          <div className="text-sm text-gray-600 mt-1">Avg Hours/Week</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-gray-900">
            {review.days_off_taken || '-'}
          </div>
          <div className="text-sm text-gray-600 mt-1">Days Off Taken</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-gray-900">
            {review.energy_level || '-'}/10
          </div>
          <div className="text-sm text-gray-600 mt-1">Energy Level</div>
        </div>
      </div>

      {/* Detailed Responses */}
      <div className="space-y-6">
        {/* Biggest Win */}
        <div className="bg-gray-50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-gray-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Biggest Win</h3>
          </div>
          <p className="text-gray-700">
            {review.biggest_win || <span className="italic text-gray-500">Not provided</span>}
          </p>
        </div>

        {/* Biggest Challenge */}
        <div className="bg-gray-50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-gray-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Biggest Challenge</h3>
          </div>
          <p className="text-gray-700">
            {review.biggest_challenge || <span className="italic text-gray-500">Not provided</span>}
          </p>
        </div>

        {/* Key Learning */}
        <div className="bg-gray-50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-gray-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Key Learning</h3>
          </div>
          <p className="text-gray-700">
            {review.key_learning || <span className="italic text-gray-500">Not provided</span>}
          </p>
        </div>

        {/* Purpose Alignment */}
        <div className="bg-gray-50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
              <Target className="w-4 h-4 text-gray-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Purpose Alignment</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                <div
                  key={num}
                  className={`w-6 h-6 rounded text-xs flex items-center justify-center font-medium ${
                    num <= (review.purpose_alignment || 0)
                      ? 'bg-brand-orange text-white'
                      : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {num}
                </div>
              ))}
            </div>
            <span className={`font-medium ${getRatingColor(review.purpose_alignment)}`}>
              {getRatingLabel(review.purpose_alignment)}
            </span>
          </div>
        </div>

        {/* Looking Ahead */}
        <div className="bg-gray-50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
              <Target className="w-4 h-4 text-gray-600" />
            </div>
            <h3 className="font-semibold text-gray-900">One Thing for Next Quarter</h3>
          </div>
          <p className="text-gray-700">
            {review.one_thing_for_success || <span className="italic text-gray-500">Not provided</span>}
          </p>
        </div>

        {/* Coach Support */}
        {review.coach_support_needed && (
          <div className="bg-gray-50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
                <Lightbulb className="w-4 h-4 text-gray-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Coach Support Requested</h3>
            </div>
            <p className="text-gray-700">{review.coach_support_needed}</p>
          </div>
        )}
      </div>

      {/* Discussion Prompt */}
      <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-gray-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Discussion Points</h4>
            <ul className="mt-2 text-sm text-gray-700 space-y-1">
              <li>• What patterns do you notice in your responses?</li>
              <li>• How does your energy level relate to your achievements?</li>
              <li>• What would need to change to improve your quarter rating?</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
