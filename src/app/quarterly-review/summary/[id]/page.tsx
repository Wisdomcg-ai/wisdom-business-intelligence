'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { quarterlyReviewService } from '../../services/quarterly-review-service';
import type { QuarterlyReview } from '../../types';
import {
  STEP_LABELS,
  FEEDBACK_LOOP_AREA_LABELS,
  FEEDBACK_LOOP_COLUMN_LABELS,
  FEEDBACK_LOOP_AREAS
} from '../../types';
import {
  ArrowLeft,
  Calendar,
  Target,
  Mountain,
  DollarSign,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
  Clock,
  Download,
  Loader2
} from 'lucide-react';
import Link from 'next/link';

export default function QuarterlySummaryPage() {
  const params = useParams();
  const router = useRouter();
  const [review, setReview] = useState<QuarterlyReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReview = async () => {
      try {
        const data = await quarterlyReviewService.getReviewById(params?.id as string);
        setReview(data);
      } catch (error) {
        console.error('Error fetching review:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (params?.id) {
      fetchReview();
    }
  }, [params?.id]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">Review not found</p>
          <Link href="/quarterly-review" className="text-teal-600 hover:underline">
            Go back
          </Link>
        </div>
      </div>
    );
  }

  const getNextQuarter = () => {
    if (review.quarter === 4) {
      return { quarter: 1, year: review.year + 1 };
    }
    return { quarter: review.quarter + 1, year: review.year };
  };

  const nextQ = getNextQuarter();
  const targets = review.quarterly_targets;
  const commitments = review.personal_commitments;
  const actionReplay = review.action_replay;
  const feedbackLoop = review.feedback_loop;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/quarterly-review')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Q{review.quarter} {review.year} Quarterly Review
            </h1>
            <p className="text-gray-500">
              {review.completed_at
                ? `Completed ${new Date(review.completed_at).toLocaleDateString()}`
                : `Started ${new Date(review.created_at).toLocaleDateString()}`
              }
            </p>
          </div>
        </div>
        <button
          onClick={() => alert('PDF export coming soon!')}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700"
        >
          <Download className="w-4 h-4" />
          Export PDF
        </button>
      </div>

      {/* Pre-Work Summary */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-slate-600" />
          Pre-Work Reflection
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{review.last_quarter_rating || '—'}/10</div>
              <div className="text-xs text-gray-600">Quarter Rating</div>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{review.energy_level || '—'}/10</div>
              <div className="text-xs text-gray-600">Energy Level</div>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{review.hours_worked_avg || '—'}</div>
              <div className="text-xs text-gray-600">Avg Hours/Week</div>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{review.days_off_taken || '—'}</div>
              <div className="text-xs text-gray-600">Days Off</div>
            </div>
          </div>

          {review.biggest_win && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg">
              <p className="text-xs font-medium text-gray-600 mb-1">Biggest Win</p>
              <p className="text-gray-700">{review.biggest_win}</p>
            </div>
          )}

          {review.biggest_challenge && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg">
              <p className="text-xs font-medium text-gray-600 mb-1">Biggest Challenge</p>
              <p className="text-gray-700">{review.biggest_challenge}</p>
            </div>
          )}

          {review.key_learning && (
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-xs font-medium text-gray-600 mb-1">Key Learning</p>
              <p className="text-gray-700">{review.key_learning}</p>
            </div>
          )}
        </div>
      </section>

      {/* Action Replay */}
      {actionReplay && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-slate-600" />
            Action Replay
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Worked */}
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-slate-600" />
                  <span className="font-medium text-gray-900">What Worked</span>
                </div>
                <ul className="space-y-1">
                  {actionReplay.worked?.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700">• {item}</li>
                  )) || <li className="text-sm text-gray-400 italic">None listed</li>}
                </ul>
              </div>

              {/* Didn't Work */}
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-slate-600" />
                  <span className="font-medium text-gray-900">Didn't Work</span>
                </div>
                <ul className="space-y-1">
                  {actionReplay.didntWork?.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700">• {item}</li>
                  )) || <li className="text-sm text-gray-400 italic">None listed</li>}
                </ul>
              </div>

              {/* Planned But Didn't */}
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-slate-600" />
                  <span className="font-medium text-gray-900">Planned But Didn't</span>
                </div>
                <ul className="space-y-1">
                  {actionReplay.plannedButDidnt?.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700">• {item}</li>
                  )) || <li className="text-sm text-gray-400 italic">None listed</li>}
                </ul>
              </div>

              {/* New Ideas */}
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-slate-600" />
                  <span className="font-medium text-gray-900">New Ideas</span>
                </div>
                <ul className="space-y-1">
                  {actionReplay.newIdeas?.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700">• {item}</li>
                  )) || <li className="text-sm text-gray-400 italic">None listed</li>}
                </ul>
              </div>
            </div>

            {actionReplay.keyInsight && (
              <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                <p className="text-xs font-medium text-gray-600 mb-1">Key Insight</p>
                <p className="text-gray-800 font-medium">{actionReplay.keyInsight}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Q+1 Targets */}
      {targets && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-slate-600" />
            Q{nextQ.quarter} {nextQ.year} Targets
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(targets.revenue)}</div>
                <div className="text-sm text-gray-600">Revenue</div>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(targets.grossProfit)}</div>
                <div className="text-sm text-gray-600">Gross Profit</div>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(targets.netProfit)}</div>
                <div className="text-sm text-gray-600">Net Profit</div>
              </div>
            </div>

            {targets.kpis && targets.kpis.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">KPI Targets</p>
                <div className="grid grid-cols-2 gap-2">
                  {targets.kpis.map(kpi => (
                    <div key={kpi.id} className="flex justify-between text-sm p-2 bg-gray-50 rounded">
                      <span className="text-gray-600">{kpi.name}</span>
                      <span className="font-medium">{kpi.target} {kpi.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Rocks */}
      {review.quarterly_rocks && review.quarterly_rocks.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Mountain className="w-5 h-5 text-slate-600" />
            Q{nextQ.quarter} Rocks (90-Day Sprint)
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="space-y-4">
              {review.quarterly_rocks.map((rock, index) => (
                <div key={rock.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 bg-teal-600">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{rock.title}</h4>
                    {rock.doneDefinition && (
                      <p className="text-sm text-gray-600 mt-1">{rock.doneDefinition}</p>
                    )}
                    {rock.owner && (
                      <p className="text-xs text-gray-500 mt-2">Owner: {rock.owner}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Personal Commitments */}
      {commitments && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-600" />
            Personal Commitments
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{commitments.hoursPerWeekTarget || '—'}</div>
                <div className="text-sm text-gray-600">Hours/Week</div>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{commitments.daysOffPlanned || '—'}</div>
                <div className="text-sm text-gray-600">Days Off Planned</div>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{commitments.daysOffScheduled?.length || 0}</div>
                <div className="text-sm text-gray-600">Days Scheduled</div>
              </div>
            </div>

            {commitments.personalGoal && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-xs font-medium text-gray-600 mb-1">Personal Goal</p>
                <p className="text-gray-800 font-medium">{commitments.personalGoal}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Back Button */}
      <div className="text-center pt-8 border-t border-gray-200">
        <Link
          href="/quarterly-review"
          className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Quarterly Reviews
        </Link>
      </div>
    </div>
  );
}
