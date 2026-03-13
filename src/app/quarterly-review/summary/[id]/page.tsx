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
  Loader2,
  Users,
  TrendingUp,
  ClipboardList,
  MessageSquare,
  Zap,
  ShieldCheck
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
        <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">Review not found</p>
          <Link href="/quarterly-review" className="text-brand-orange hover:underline">
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
          <Calendar className="w-5 h-5 text-gray-600" />
          Pre-Work Reflection
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{review.last_quarter_rating || '—'}/10</div>
              <div className="text-xs text-gray-600">Quarter Rating</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{review.energy_level || '—'}/10</div>
              <div className="text-xs text-gray-600">Energy Level</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{review.hours_worked_avg || '—'}</div>
              <div className="text-xs text-gray-600">Avg Hours/Week</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{review.days_off_taken || '—'}</div>
              <div className="text-xs text-gray-600">Days Off</div>
            </div>
          </div>

          {review.biggest_win && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-600 mb-1">Biggest Win</p>
              <p className="text-gray-700">{review.biggest_win}</p>
            </div>
          )}

          {review.biggest_challenge && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-600 mb-1">Biggest Challenge</p>
              <p className="text-gray-700">{review.biggest_challenge}</p>
            </div>
          )}

          {review.key_learning && (
            <div className="p-4 bg-gray-50 rounded-lg">
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
            <BarChart3 className="w-5 h-5 text-gray-600" />
            Action Replay
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Worked */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-gray-600" />
                  <span className="font-medium text-gray-900">What Worked</span>
                </div>
                <ul className="space-y-1">
                  {actionReplay.worked?.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700">• {item}</li>
                  )) || <li className="text-sm text-gray-400 italic">None listed</li>}
                </ul>
              </div>

              {/* Didn't Work */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-gray-600" />
                  <span className="font-medium text-gray-900">Didn't Work</span>
                </div>
                <ul className="space-y-1">
                  {actionReplay.didntWork?.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700">• {item}</li>
                  )) || <li className="text-sm text-gray-400 italic">None listed</li>}
                </ul>
              </div>

              {/* Planned But Didn't */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-gray-600" />
                  <span className="font-medium text-gray-900">Planned But Didn't</span>
                </div>
                <ul className="space-y-1">
                  {actionReplay.plannedButDidnt?.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700">• {item}</li>
                  )) || <li className="text-sm text-gray-400 italic">None listed</li>}
                </ul>
              </div>

              {/* New Ideas */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-gray-600" />
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
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
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
            <DollarSign className="w-5 h-5 text-gray-600" />
            Q{nextQ.quarter} {nextQ.year} Targets
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(targets.revenue)}</div>
                <div className="text-sm text-gray-600">Revenue</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(targets.grossProfit)}</div>
                <div className="text-sm text-gray-600">Gross Profit</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
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
            <Mountain className="w-5 h-5 text-gray-600" />
            Q{nextQ.quarter} Rocks (90-Day Sprint)
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="space-y-4">
              {review.quarterly_rocks.map((rock, index) => (
                <div key={rock.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 bg-brand-orange">
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
            <Clock className="w-5 h-5 text-gray-600" />
            Personal Commitments
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{commitments.hoursPerWeekTarget || '—'}</div>
                <div className="text-sm text-gray-600">Hours/Week</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{commitments.daysOffPlanned || '—'}</div>
                <div className="text-sm text-gray-600">Days Off Planned</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{commitments.daysOffScheduled?.length || 0}</div>
                <div className="text-sm text-gray-600">Days Scheduled</div>
              </div>
            </div>

            {commitments.personalGoal && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-600 mb-1">Personal Goal</p>
                <p className="text-gray-800 font-medium">{commitments.personalGoal}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Rocks Review (Last Quarter) */}
      {review.rocks_review && (review.rocks_review as any[]).length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-gray-600" />
            Last Quarter Rocks Review
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid grid-cols-4 gap-3 mb-4">
              {['completed', 'carry_forward', 'modified', 'dropped'].map(status => {
                const count = (review.rocks_review as any[]).filter((r: any) => r.decision === status).length;
                const labels: Record<string, string> = { completed: 'Completed', carry_forward: 'Carry Forward', modified: 'Modified', dropped: 'Dropped' };
                const colors: Record<string, string> = { completed: 'text-green-600', carry_forward: 'text-blue-600', modified: 'text-amber-600', dropped: 'text-red-600' };
                return (
                  <div key={status} className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className={`text-2xl font-bold ${colors[status]}`}>{count}</div>
                    <div className="text-xs text-gray-600">{labels[status]}</div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              {(review.rocks_review as any[]).map((rock: any, index: number) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{rock.title}</p>
                    {rock.outcome && <p className="text-sm text-gray-600 mt-1">{rock.outcome}</p>}
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    rock.decision === 'completed' ? 'bg-green-100 text-green-700' :
                    rock.decision === 'carry_forward' ? 'bg-blue-100 text-blue-700' :
                    rock.decision === 'modified' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {rock.decision?.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Customer Pulse */}
      {review.customer_pulse && Object.keys(review.customer_pulse as object).length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-600" />
            Customer Pulse
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            {(review.customer_pulse as any).compliments?.length > 0 && (
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-xs font-medium text-green-700 mb-2">Compliments</p>
                <ul className="space-y-1">
                  {(review.customer_pulse as any).compliments.map((item: string, i: number) => (
                    <li key={i} className="text-sm text-gray-700">• {item}</li>
                  ))}
                </ul>
              </div>
            )}
            {(review.customer_pulse as any).complaints?.length > 0 && (
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-xs font-medium text-red-700 mb-2">Complaints</p>
                <ul className="space-y-1">
                  {(review.customer_pulse as any).complaints.map((item: string, i: number) => (
                    <li key={i} className="text-sm text-gray-700">• {item}</li>
                  ))}
                </ul>
              </div>
            )}
            {(review.customer_pulse as any).trends?.length > 0 && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs font-medium text-blue-700 mb-2">Trends</p>
                <ul className="space-y-1">
                  {(review.customer_pulse as any).trends.map((item: string, i: number) => (
                    <li key={i} className="text-sm text-gray-700">• {item}</li>
                  ))}
                </ul>
              </div>
            )}
            {(review.customer_pulse as any).notes && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-600 mb-1">Notes</p>
                <p className="text-sm text-gray-700">{(review.customer_pulse as any).notes}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* People Review */}
      {review.people_review && Object.keys(review.people_review as object).length > 0 && (review.people_review as any).assessments?.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-600" />
            People Review
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-4">Name</th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-4">Role</th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-4">Action</th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-4">Comments</th>
                </tr>
              </thead>
              <tbody>
                {(review.people_review as any).assessments.map((person: any, index: number) => (
                  <tr key={index} className="border-b border-gray-100 last:border-b-0">
                    <td className="py-2.5 px-4 text-sm font-medium text-gray-900">{person.name}</td>
                    <td className="py-2.5 px-4 text-sm text-gray-600">{person.role}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        person.action === 'retain' ? 'bg-green-100 text-green-700' :
                        person.action === 'develop' ? 'bg-blue-100 text-blue-700' :
                        person.action === 'performance_manage' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {person.action?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-sm text-gray-600">{person.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Initiative Decisions */}
      {review.initiative_decisions && (review.initiative_decisions as any[]).length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-gray-600" />
            Initiative Decisions
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="space-y-3">
              {(review.initiative_decisions as any[]).map((decision: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{decision.title}</p>
                    {decision.notes && <p className="text-sm text-gray-500">{decision.notes}</p>}
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    decision.action === 'keep' ? 'bg-blue-100 text-blue-700' :
                    decision.action === 'accelerate' ? 'bg-green-100 text-green-700' :
                    decision.action === 'defer' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {decision.action}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* The One Thing */}
      {review.one_thing_answer && (
        <section className="mb-8">
          <div className="bg-gradient-to-r from-brand-orange-50 to-orange-50 rounded-xl border-2 border-brand-orange-200 p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-brand-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-brand-orange" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">The One Thing</h3>
                <p className="text-gray-700 text-lg">{review.one_thing_answer}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Action Items */}
      {review.action_items && (review.action_items as any[]).length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-gray-600" />
            Action Items
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="space-y-2">
              {(review.action_items as any[]).map((item: any, index: number) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.text || item.title}</p>
                    <div className="flex gap-4 mt-1">
                      {item.owner && <p className="text-xs text-gray-500">Owner: {item.owner}</p>}
                      {item.dueDate && <p className="text-xs text-gray-500">Due: {item.dueDate}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Coach Notes */}
      {review.coach_notes && Object.values(review.coach_notes as object).some(v => v) && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-gray-600" />
            Coach Notes
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="space-y-3">
              {Object.entries(review.coach_notes as Record<string, string>).filter(([, v]) => v).map(([step, note]) => (
                <div key={step} className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-600 mb-1">Step {step}</p>
                  <p className="text-sm text-gray-700">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Back Button */}
      <div className="text-center pt-8 border-t border-gray-200">
        <Link
          href="/quarterly-review"
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-orange text-white rounded-xl font-medium hover:bg-brand-orange-600"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Quarterly Reviews
        </Link>
      </div>
    </div>
  );
}
