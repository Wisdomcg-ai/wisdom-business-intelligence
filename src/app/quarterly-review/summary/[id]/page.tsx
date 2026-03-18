'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { quarterlyReviewService } from '../../services/quarterly-review-service';
import type { QuarterlyReview } from '../../types';
import { getCurrentQuarter, type YearType } from '../../types';
import {
  STEP_LABELS,
  FEEDBACK_LOOP_AREA_LABELS,
  FEEDBACK_LOOP_COLUMN_LABELS,
  FEEDBACK_LOOP_AREAS,
  FEEDBACK_LOOP_COLUMNS
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
  ShieldCheck,
  Pencil,
  Eye,
  MapPin,
  Compass,
  RefreshCw,
  Gauge
} from 'lucide-react';
import Link from 'next/link';

export default function QuarterlySummaryPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [review, setReview] = useState<QuarterlyReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedYearType, setResolvedYearType] = useState<YearType>('CY');

  useEffect(() => {
    const fetchReview = async () => {
      try {
        const data = await quarterlyReviewService.getReviewById(params?.id as string);
        setReview(data);

        // Resolve yearType to display correct quarter labels
        if (data?.business_id) {
          const { data: { user } } = await supabase.auth.getUser();
          const ownerId = user?.id;
          const idsToTry: string[] = [data.business_id];
          if (ownerId && ownerId !== data.business_id) idsToTry.push(ownerId);

          // Also resolve business_profiles.id
          if (ownerId) {
            const { data: profile } = await supabase
              .from('business_profiles')
              .select('id')
              .eq('user_id', ownerId)
              .maybeSingle();
            if (profile?.id && !idsToTry.includes(profile.id)) idsToTry.push(profile.id);
          }

          for (const tryId of idsToTry) {
            const { data: goalsData } = await supabase
              .from('business_financial_goals')
              .select('year_type')
              .eq('business_id', tryId)
              .maybeSingle();
            if (goalsData?.year_type) {
              setResolvedYearType(goalsData.year_type as YearType);
              break;
            }
          }
        }
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

  // Use yearType-aware quarter calculation so we display the correct quarter
  // even if the review was created with a CY quarter for an FY business
  const currentQ = getCurrentQuarter(resolvedYearType);
  const getNextQuarter = () => {
    // Use the yearType-resolved current quarter, not the review's stored quarter
    // This corrects cases where the review was created with the wrong quarter
    const q = currentQ.quarter;
    const y = currentQ.year;
    if (q === 4) {
      return { quarter: 1, year: y + 1 };
    }
    return { quarter: q + 1, year: y };
  };

  const nextQ = getNextQuarter();
  const targets = review.quarterly_targets;
  const commitments = review.personal_commitments;
  const actionReplay = review.action_replay;
  const feedbackLoop = review.feedback_loop;
  const assessment = review.assessment_snapshot as any;
  const roadmap = review.roadmap_snapshot as any;
  const annualPlan = review.annual_plan_snapshot as any;
  const realignment = review.realignment_decision as any;
  const openLoops = review.open_loops_decisions as any[];
  const issuesResolved = review.issues_resolved as any[];

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
              Q{review.quarter} {review.year} {review.review_type === 'annual' ? 'Annual' : 'Quarterly'} Review
            </h1>
            <p className="text-gray-500">
              {review.completed_at
                ? `Completed ${new Date(review.completed_at).toLocaleDateString()}`
                : `Started ${new Date(review.created_at).toLocaleDateString()}`
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/quarterly-review/workshop?id=${params?.id}`)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-gray-700"
          >
            <Pencil className="w-4 h-4" />
            Edit Review
          </button>
          <button
            onClick={() => alert('PDF export coming soon!')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      {/* ═══════════════════════ PRE-WORK ═══════════════════════ */}
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

      {/* ═══════════════════════ PART 1: REFLECT ═══════════════════════ */}
      <div className="mb-6">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Part 1: Reflect</h2>
      </div>

      {/* 1.2 Scorecard Review */}
      {review.dashboard_snapshot && Object.keys(review.dashboard_snapshot as object).length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-600" />
            Scorecard Review
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            {(() => {
              const snap = review.dashboard_snapshot as any;
              const financials = [
                { label: 'Revenue', data: snap.revenue },
                { label: 'Gross Profit', data: snap.grossProfit },
                { label: 'Net Profit', data: snap.netProfit },
              ].filter(f => f.data?.target || f.data?.actual);

              return (
                <>
                  {financials.length > 0 && (
                    <div className={`grid gap-4 mb-4 ${financials.length === 1 ? 'grid-cols-1' : financials.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {financials.map(f => (
                        <div key={f.label} className="text-center p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-gray-500 mb-1">{f.label}</div>
                          <div className="text-lg font-bold text-gray-900">{formatCurrency(f.data?.actual || 0)}</div>
                          <div className="text-xs text-gray-500">Target: {formatCurrency(f.data?.target || 0)}</div>
                          {f.data?.variance != null && (
                            <div className={`text-xs font-medium mt-1 ${f.data.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {f.data.variance >= 0 ? '+' : ''}{formatCurrency(f.data.variance)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {snap.kpis?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-sm font-medium text-gray-700 mb-2">KPI Scorecard</p>
                      <div className="grid grid-cols-2 gap-2">
                        {snap.kpis.map((kpi: any) => (
                          <div key={kpi.id} className="flex justify-between text-sm p-2 bg-gray-50 rounded">
                            <span className="text-gray-600">{kpi.name}</span>
                            <span className="font-medium">
                              {kpi.actual ?? '—'} / {kpi.target} {kpi.unit || ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {review.scorecard_commentary && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-600 mb-1">Commentary</p>
                <p className="text-sm text-gray-700">{review.scorecard_commentary}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 1.3 Rocks Accountability (Last Quarter) */}
      {review.rocks_review && (review.rocks_review as any[]).length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-gray-600" />
            Rocks Accountability
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
                    {rock.outcomeNarrative && <p className="text-sm text-gray-600 mt-1">{rock.outcomeNarrative}</p>}
                    {rock.lessonsLearned && <p className="text-sm text-gray-500 mt-1 italic">{rock.lessonsLearned}</p>}
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${
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

      {/* 1.4 Action Replay */}
      {actionReplay && (actionReplay.worked?.length > 0 || actionReplay.didntWork?.length > 0 || actionReplay.plannedButDidnt?.length > 0 || actionReplay.newIdeas?.length > 0 || actionReplay.keyInsight) && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-gray-600" />
            Action Replay
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-gray-900">What Worked</span>
                </div>
                <ul className="space-y-1">
                  {actionReplay.worked?.length > 0
                    ? actionReplay.worked.map((item, i) => <li key={i} className="text-sm text-gray-700">&#8226; {item}</li>)
                    : <li className="text-sm text-gray-400 italic">None listed</li>
                  }
                </ul>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span className="font-medium text-gray-900">Didn&apos;t Work</span>
                </div>
                <ul className="space-y-1">
                  {actionReplay.didntWork?.length > 0
                    ? actionReplay.didntWork.map((item, i) => <li key={i} className="text-sm text-gray-700">&#8226; {item}</li>)
                    : <li className="text-sm text-gray-400 italic">None listed</li>
                  }
                </ul>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="font-medium text-gray-900">Planned But Didn&apos;t</span>
                </div>
                <ul className="space-y-1">
                  {actionReplay.plannedButDidnt?.length > 0
                    ? actionReplay.plannedButDidnt.map((item, i) => <li key={i} className="text-sm text-gray-700">&#8226; {item}</li>)
                    : <li className="text-sm text-gray-400 italic">None listed</li>
                  }
                </ul>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-blue-500" />
                  <span className="font-medium text-gray-900">New Ideas</span>
                </div>
                <ul className="space-y-1">
                  {actionReplay.newIdeas?.length > 0
                    ? actionReplay.newIdeas.map((item, i) => <li key={i} className="text-sm text-gray-700">&#8226; {item}</li>)
                    : <li className="text-sm text-gray-400 italic">None listed</li>
                  }
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

      {/* ═══════════════════════ PART 2: ANALYSE ═══════════════════════ */}
      <div className="mb-6">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Part 2: Analyse</h2>
      </div>

      {/* 2.1 Feedback Loop */}
      {feedbackLoop && Object.keys(feedbackLoop).length > 0 && (() => {
        const mode = review.feedback_loop_mode || 'by_area';
        const hasData = mode === 'business_wide'
          ? FEEDBACK_LOOP_COLUMNS.some(col => (feedbackLoop as any)?.business_wide?.[col]?.length > 0)
          : FEEDBACK_LOOP_AREAS.some(area => FEEDBACK_LOOP_COLUMNS.some(col => (feedbackLoop as any)?.[area]?.[col]?.length > 0));

        if (!hasData && !(feedbackLoop as any)?.topPriorities?.length) return null;

        return (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Eye className="w-5 h-5 text-gray-600" />
              Feedback Loop
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              {mode === 'by_area' ? (
                <div className="space-y-4">
                  {FEEDBACK_LOOP_AREAS.map(area => {
                    const areaData = (feedbackLoop as any)?.[area];
                    if (!areaData) return null;
                    const hasAreaData = FEEDBACK_LOOP_COLUMNS.some(col => areaData[col]?.length > 0);
                    if (!hasAreaData) return null;

                    return (
                      <div key={area} className="border border-gray-100 rounded-lg p-4">
                        <h3 className="font-medium text-gray-900 mb-3">{FEEDBACK_LOOP_AREA_LABELS[area]}</h3>
                        <div className="grid grid-cols-3 gap-3">
                          {FEEDBACK_LOOP_COLUMNS.map(col => {
                            const items = areaData[col] || [];
                            if (items.length === 0) return null;
                            const colColors: Record<string, string> = {
                              stop: 'bg-red-50 border-red-200',
                              continue: 'bg-green-50 border-green-200',
                              start: 'bg-blue-50 border-blue-200',
                            };
                            return (
                              <div key={col} className={`p-3 rounded-lg border ${colColors[col] || 'bg-gray-50 border-gray-200'}`}>
                                <p className="text-xs font-semibold text-gray-600 uppercase mb-1">{FEEDBACK_LOOP_COLUMN_LABELS[col]}</p>
                                <ul className="space-y-1">
                                  {items.map((item: string, i: number) => (
                                    <li key={i} className="text-sm text-gray-700">&#8226; {item}</li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {FEEDBACK_LOOP_COLUMNS.map(col => {
                    const items = (feedbackLoop as any)?.business_wide?.[col] || [];
                    if (items.length === 0) return null;
                    const colColors: Record<string, string> = {
                      stop: 'bg-red-50 border-red-200',
                      continue: 'bg-green-50 border-green-200',
                      start: 'bg-blue-50 border-blue-200',
                    };
                    return (
                      <div key={col} className={`p-3 rounded-lg border ${colColors[col] || 'bg-gray-50 border-gray-200'}`}>
                        <p className="text-xs font-semibold text-gray-600 uppercase mb-1">{FEEDBACK_LOOP_COLUMN_LABELS[col]}</p>
                        <ul className="space-y-1">
                          {items.map((item: string, i: number) => (
                            <li key={i} className="text-sm text-gray-700">&#8226; {item}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {(feedbackLoop as any)?.topPriorities?.length > 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-600 mb-2">Top Priorities</p>
                  <ul className="space-y-1">
                    {(feedbackLoop as any).topPriorities.map((p: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700 font-medium">{i + 1}. {p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* 2.2 Open Loops Audit */}
      {openLoops && openLoops.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-gray-600" />
            Open Loops Audit
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid grid-cols-4 gap-3 mb-4">
              {['complete', 'delegate', 'delete', 'defer'].map(decision => {
                const count = openLoops.filter((l: any) => l.decision === decision).length;
                if (count === 0) return null;
                const labels: Record<string, string> = { complete: 'Complete', delegate: 'Delegate', delete: 'Delete', defer: 'Defer' };
                const colors: Record<string, string> = { complete: 'text-green-600', delegate: 'text-blue-600', delete: 'text-red-600', defer: 'text-amber-600' };
                return (
                  <div key={decision} className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className={`text-2xl font-bold ${colors[decision]}`}>{count}</div>
                    <div className="text-xs text-gray-600">{labels[decision]}</div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              {openLoops.map((loop: any, index: number) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{loop.title}</p>
                    {loop.notes && <p className="text-sm text-gray-600 mt-1">{loop.notes}</p>}
                    {loop.delegateTo && <p className="text-xs text-gray-500 mt-1">Delegated to: {loop.delegateTo}</p>}
                    {loop.deferToQuarter && <p className="text-xs text-gray-500 mt-1">Deferred to: {loop.deferToQuarter}</p>}
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${
                    loop.decision === 'complete' ? 'bg-green-100 text-green-700' :
                    loop.decision === 'delegate' ? 'bg-blue-100 text-blue-700' :
                    loop.decision === 'delete' ? 'bg-red-100 text-red-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {loop.decision}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 2.3 Issues List (IDS) */}
      {issuesResolved && issuesResolved.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-gray-600" />
            Issues Resolved (IDS)
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-4">Issue</th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-4">Solution</th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-4">Owner</th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-4">Due</th>
                </tr>
              </thead>
              <tbody>
                {issuesResolved.map((issue: any, index: number) => (
                  <tr key={index} className="border-b border-gray-100 last:border-b-0">
                    <td className="py-2.5 px-4 text-sm font-medium text-gray-900">{issue.issue}</td>
                    <td className="py-2.5 px-4 text-sm text-gray-600">{issue.solution || '—'}</td>
                    <td className="py-2.5 px-4 text-sm text-gray-600">{issue.owner || '—'}</td>
                    <td className="py-2.5 px-4 text-sm text-gray-600">{issue.dueDate || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 2.4 Customer Pulse */}
      {review.customer_pulse && Object.keys(review.customer_pulse as object).length > 0 && (
        (() => {
          const pulse = review.customer_pulse as any;
          const hasData = pulse.compliments?.length > 0 || pulse.complaints?.length > 0 || pulse.trends?.length > 0 || pulse.notes;
          if (!hasData) return null;
          return (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-600" />
                Customer Pulse
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                {pulse.compliments?.length > 0 && (
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-xs font-medium text-green-700 mb-2">Compliments</p>
                    <ul className="space-y-1">
                      {pulse.compliments.map((item: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700">&#8226; {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {pulse.complaints?.length > 0 && (
                  <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs font-medium text-red-700 mb-2">Complaints</p>
                    <ul className="space-y-1">
                      {pulse.complaints.map((item: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700">&#8226; {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {pulse.trends?.length > 0 && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs font-medium text-blue-700 mb-2">Trends</p>
                    <ul className="space-y-1">
                      {pulse.trends.map((item: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700">&#8226; {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {pulse.notes && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-xs font-medium text-gray-600 mb-1">Notes</p>
                    <p className="text-sm text-gray-700">{pulse.notes}</p>
                  </div>
                )}
              </div>
            </section>
          );
        })()
      )}

      {/* 2.5 People Review */}
      {review.people_review && Object.keys(review.people_review as object).length > 0 && (() => {
        const pr = review.people_review as any;
        const hasAssessments = pr.assessments?.length > 0;
        const hasHiring = pr.hiringNeeds?.length > 0;
        const hasCapacity = pr.capacityNotes;
        const hasTraining = pr.trainingNeeds;
        if (!hasAssessments && !hasHiring && !hasCapacity && !hasTraining) return null;

        return (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-600" />
              People Review
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              {hasAssessments && (
                <div className="overflow-hidden rounded-lg border border-gray-200">
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
                      {pr.assessments.map((person: any, index: number) => (
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
              )}

              {hasHiring && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-600 mb-2">Hiring Needs</p>
                  <div className="space-y-2">
                    {pr.hiringNeeds.map((need: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-900 font-medium">{need.role}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          need.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                          need.priority === 'next_quarter' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{need.priority?.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasCapacity && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-600 mb-1">Capacity Notes</p>
                  <p className="text-sm text-gray-700">{pr.capacityNotes}</p>
                </div>
              )}

              {hasTraining && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-600 mb-1">Training Needs</p>
                  <p className="text-sm text-gray-700">{pr.trainingNeeds}</p>
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* ═══════════════════════ PART 3: STRATEGIC REVIEW ═══════════════════════ */}
      <div className="mb-6">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Part 3: Strategic Review</h2>
      </div>

      {/* 3.1 Assessment & Roadmap */}
      {(assessment && Object.keys(assessment).length > 0) || (roadmap && Object.keys(roadmap).length > 0) ? (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Compass className="w-5 h-5 text-gray-600" />
            Assessment &amp; Roadmap
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Assessment */}
              {assessment && assessment.totalScore != null && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-3">Business Assessment</p>
                  <div className="text-center mb-3">
                    <div className="text-3xl font-bold text-gray-900">{assessment.percentage ?? Math.round((assessment.totalScore / (assessment.maxScore || 1)) * 100)}%</div>
                    <div className="text-sm text-gray-500">{assessment.totalScore} / {assessment.maxScore}</div>
                  </div>
                  {assessment.engines && Object.keys(assessment.engines).length > 0 && (
                    <div className="space-y-2">
                      {Object.entries(assessment.engines).map(([key, val]: [string, any]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}</span>
                          <span className="font-medium">{val.score}/{val.max}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Roadmap */}
              {roadmap && roadmap.currentStage && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-3">Business Roadmap</p>
                  <div className="text-center mb-3">
                    <div className="text-lg font-bold text-gray-900">{roadmap.stageName || `Stage ${roadmap.currentStage}`}</div>
                    {roadmap.revenue != null && (
                      <div className="text-sm text-gray-500">Revenue: {formatCurrency(roadmap.revenue)}</div>
                    )}
                  </div>
                  {roadmap.buildItemsTotal != null && (
                    <div className="text-sm text-gray-600 text-center">
                      Build Items: {roadmap.buildItemsComplete || 0} / {roadmap.buildItemsTotal}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* 3.2 SWOT Update */}
      {review.swot_analysis_id && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-gray-600" />
            SWOT Analysis
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm text-gray-600">SWOT analysis was reviewed and updated during this session.</p>
          </div>
        </section>
      )}

      {/* ═══════════════════════ PART 4: PLAN ═══════════════════════ */}
      <div className="mb-6">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Part 4: Plan</h2>
      </div>

      {/* 4.1 Annual Plan & Confidence */}
      {(review.annual_target_confidence != null || (annualPlan && Object.keys(annualPlan).length > 0 && annualPlan.annualTargets)) && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-gray-600" />
            Annual Plan &amp; Confidence
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            {/* Confidence Score */}
            {review.annual_target_confidence != null && (
              <div className="mb-4">
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-sm font-medium text-gray-700">Confidence in Annual Targets:</span>
                  <span className={`text-2xl font-bold ${
                    review.annual_target_confidence >= 7 ? 'text-green-600' :
                    review.annual_target_confidence >= 4 ? 'text-amber-600' :
                    'text-red-600'
                  }`}>{review.annual_target_confidence}/10</span>
                </div>
                {review.confidence_notes && (
                  <p className="text-sm text-gray-600">{review.confidence_notes}</p>
                )}
              </div>
            )}

            {/* Annual vs YTD */}
            {annualPlan?.annualTargets && (
              <div className="grid grid-cols-3 gap-4 mb-4">
                {['revenue', 'grossProfit', 'netProfit'].map(metric => {
                  const label = metric === 'grossProfit' ? 'Gross Profit' : metric === 'netProfit' ? 'Net Profit' : 'Revenue';
                  const annual = annualPlan.annualTargets?.[metric] || 0;
                  const ytd = annualPlan.ytdActuals?.[metric] || 0;
                  const remaining = annualPlan.remaining?.[metric] || 0;
                  return (
                    <div key={metric} className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">{label}</div>
                      <div className="text-lg font-bold text-gray-900">{formatCurrency(annual)}</div>
                      <div className="text-xs text-gray-500">YTD: {formatCurrency(ytd)}</div>
                      <div className="text-xs text-gray-500">Remaining: {formatCurrency(remaining)}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Realignment Decision */}
            {realignment && realignment.choice && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-600 mb-1">Realignment Decision</p>
                <p className="text-sm font-medium text-gray-900">
                  {realignment.choice === 'keep_targets' ? 'Keep current targets' : 'Adjust targets'}
                </p>
                {realignment.rationale && (
                  <p className="text-sm text-gray-600 mt-1">{realignment.rationale}</p>
                )}
                {realignment.executionChanges?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Execution Changes:</p>
                    <ul className="space-y-1">
                      {realignment.executionChanges.map((change: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700">&#8226; {change}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4.2 Initiative Decisions */}
      {review.initiative_decisions && (review.initiative_decisions as any[]).length > 0 && (() => {
        const allDecisions = review.initiative_decisions as any[];
        const meaningfulDecisions = allDecisions.filter((d: any) =>
          d.decision === 'accelerate' || d.decision === 'defer' || d.decision === 'kill' ||
          (d.decision === 'keep' && d.notes)
        );
        if (meaningfulDecisions.length === 0 && allDecisions.length === 0) return null;

        const counts = {
          keep: allDecisions.filter((d: any) => d.decision === 'keep').length,
          accelerate: allDecisions.filter((d: any) => d.decision === 'accelerate').length,
          defer: allDecisions.filter((d: any) => d.decision === 'defer').length,
          kill: allDecisions.filter((d: any) => d.decision === 'kill').length,
        };

        return (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-gray-600" />
              Initiative Decisions
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="grid grid-cols-4 gap-3 mb-4">
                {counts.keep > 0 && (
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{counts.keep}</div>
                    <div className="text-xs text-gray-600">Keep</div>
                  </div>
                )}
                {counts.accelerate > 0 && (
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{counts.accelerate}</div>
                    <div className="text-xs text-gray-600">Accelerate</div>
                  </div>
                )}
                {counts.defer > 0 && (
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-amber-600">{counts.defer}</div>
                    <div className="text-xs text-gray-600">Defer</div>
                  </div>
                )}
                {counts.kill > 0 && (
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">{counts.kill}</div>
                    <div className="text-xs text-gray-600">Kill</div>
                  </div>
                )}
              </div>

              {meaningfulDecisions.length > 0 && (
                <div className="space-y-3">
                  {meaningfulDecisions.map((decision: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{decision.title}</p>
                        {decision.notes && <p className="text-sm text-gray-500">{decision.notes}</p>}
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${
                        decision.decision === 'keep' ? 'bg-blue-100 text-blue-700' :
                        decision.decision === 'accelerate' ? 'bg-green-100 text-green-700' :
                        decision.decision === 'defer' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {decision.decision}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* 4.2 Quarterly Targets */}
      {targets && (targets.revenue > 0 || targets.grossProfit > 0 || targets.netProfit > 0) && (
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

      {/* 4.3 Quarterly Rocks (Sprint Planning) */}
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
                    {(rock.successCriteria || rock.doneDefinition) && (
                      <p className="text-sm text-gray-600 mt-1">{rock.successCriteria || rock.doneDefinition}</p>
                    )}
                    <div className="flex gap-4 mt-2">
                      {rock.owner && <p className="text-xs text-gray-500">Owner: {rock.owner}</p>}
                      {rock.targetDate && <p className="text-xs text-gray-500">Due: {rock.targetDate}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 4.4 Session Close */}

      {/* Personal Commitments */}
      {commitments && (commitments.hoursPerWeekTarget || commitments.daysOffPlanned || commitments.personalGoal) && (
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
                    <p className="text-sm font-medium text-gray-900">{item.description || item.text || item.title}</p>
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
                  <p className="text-xs font-medium text-gray-600 mb-1">{STEP_LABELS[step as keyof typeof STEP_LABELS] || `Step ${step}`}</p>
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
