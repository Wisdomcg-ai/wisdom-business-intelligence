'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { quarterlyReviewService } from './services/quarterly-review-service';
import { getCurrentQuarter, getQuarterLabel, isLastQuarterOfYear, type YearType, type QuarterNumber } from './types';
import {
  Calendar,
  Clock,
  CheckCircle2,
  PlayCircle,
  ChevronRight,
  FileText,
  BarChart3,
  Target,
  History,
  Star,
  Pencil
} from 'lucide-react';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { useCoachView } from '@/hooks/useCoachView';
import PageHeader from '@/components/ui/PageHeader';
import Link from 'next/link';

export default function QuarterlyReviewPage() {
  const router = useRouter();
  const supabase = createClient();
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();
  const { getPath } = useCoachView();
  const [reviews, setReviews] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [quarter, setQuarter] = useState<QuarterNumber>(() => getCurrentQuarter().quarter);
  const [year, setYear] = useState<number>(() => getCurrentQuarter().year);
  const isQ4 = isLastQuarterOfYear(quarter);

  useEffect(() => {
    const fetchData = async () => {
      if (contextLoading) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        // Use activeBusiness from context if available (coach view)
        let bizId: string | null = null;
        if (activeBusiness?.id) {
          bizId = activeBusiness.id;
        } else {
          const { data: business, error: bizError } = await supabase
            .from('businesses')
            .select('id')
            .eq('owner_id', user.id)
            .maybeSingle();

          if (bizError) {
            console.error('Error fetching business:', bizError);
            setIsLoading(false);
            return;
          }
          bizId = business?.id || null;
        }

        if (bizId) {
          setBusinessId(bizId);

          // Resolve yearType from business_financial_goals to get correct quarter
          try {
            const { data: goals } = await supabase
              .from('business_financial_goals')
              .select('year_type')
              .eq('business_id', bizId)
              .maybeSingle();
            const yearType: YearType = (goals?.year_type as YearType) || 'FY';
            const resolved = getCurrentQuarter(yearType);
            setQuarter(resolved.quarter);
            setYear(resolved.year);
          } catch (ytError) {
            console.error('Error fetching yearType:', ytError);
          }

          try {
            const allReviews = await quarterlyReviewService.getAllReviews(bizId);
            setReviews(allReviews);
          } catch (reviewError) {
            console.error('Error fetching reviews:', reviewError);
          }
        }
      } catch (error) {
        console.error('Error in fetchData:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [supabase, router, contextLoading, activeBusiness?.id]);

  const startNewReview = (type: 'quarterly' | 'annual' = 'quarterly') => {
    const params = new URLSearchParams({ quarter: String(quarter), year: String(year) });
    if (type === 'annual') params.set('type', 'annual');
    router.push(getPath(`/quarterly-review/workshop?${params.toString()}`));
  };

  const continueReview = (reviewId: string) => {
    router.push(getPath(`/quarterly-review/workshop?id=${reviewId}`));
  };

  const viewReview = (reviewId: string) => {
    router.push(getPath(`/quarterly-review/summary/${reviewId}`));
  };

  const currentQuarterReview = reviews.find(r => r.quarter === quarter && r.year === year);
  const pastReviews = reviews.filter(r => !(r.quarter === quarter && r.year === year));

  if (isLoading || contextLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PageHeader
        variant="banner"
        title="Quarterly Review"
        subtitle="A guided 4-hour process to reflect, analyze, and plan for the next quarter"
        icon={Calendar}
        actions={
          (pastReviews.length > 0 || currentQuarterReview?.status === 'completed') && (
            <Link
              href={getPath('/quarterly-review/history')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <History className="w-4 h-4" />
              View Timeline
            </Link>
          )
        }
      />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Current Quarter Card */}
      <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-brand-orange mb-2">
              <Calendar className="w-5 h-5" />
              <span className="font-semibold">{getQuarterLabel(quarter, year)}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              {currentQuarterReview
                ? (currentQuarterReview.status === 'completed'
                    ? 'Review Complete'
                    : 'Continue Your Review')
                : 'Start Your Quarterly Review'}
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-6 max-w-lg">
              {currentQuarterReview
                ? (currentQuarterReview.status === 'completed'
                    ? `Completed on ${new Date(currentQuarterReview.completed_at).toLocaleDateString()}. View your summary or start planning for next quarter.`
                    : `You're ${Math.min(100, Math.round(((currentQuarterReview.steps_completed || []).filter((s: string) => s !== 'complete').length) / 11 * 100))}% complete. Pick up where you left off.`)
                : 'Reflect on last quarter, analyze what worked, and set clear targets for the next 90 days.'
              }
            </p>

            {/* Review Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
              <div className="flex items-center gap-3 text-gray-600">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Duration</p>
                  <p className="font-medium text-gray-900">4 Hours</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Steps</p>
                  <p className="font-medium text-gray-900">14 Guided Steps</p>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            {currentQuarterReview ? (
              currentQuarterReview.status === 'completed' ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => viewReview(currentQuarterReview.id)}
                    className="inline-flex items-center gap-2 bg-brand-orange text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-orange-600 transition-colors"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    View Summary
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => continueReview(currentQuarterReview.id)}
                    className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                  >
                    <Pencil className="w-5 h-5" />
                    Edit Review
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => continueReview(currentQuarterReview.id)}
                  className="inline-flex items-center gap-2 bg-brand-orange text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-orange-600 transition-colors"
                >
                  <PlayCircle className="w-5 h-5" />
                  Continue Review
                  <ChevronRight className="w-4 h-4" />
                </button>
              )
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => startNewReview('quarterly')}
                  className="inline-flex items-center gap-2 bg-brand-orange text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-orange-600 transition-colors"
                >
                  <PlayCircle className="w-5 h-5" />
                  Start {getQuarterLabel(quarter, year)} Review
                  <ChevronRight className="w-4 h-4" />
                </button>

                {/* Annual Review CTA - only shown in Q4 */}
                {isQ4 && (
                  <button
                    onClick={() => startNewReview('annual')}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-brand-orange to-amber-500 text-white px-6 py-3 rounded-xl font-semibold hover:from-brand-orange-600 hover:to-amber-600 transition-all shadow-sm"
                  >
                    <Star className="w-5 h-5" />
                    Start Annual Review
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Annual review explanation */}
            {isQ4 && !currentQuarterReview && (
              <p className="text-xs text-gray-500 mt-3 max-w-md">
                The Annual Review includes all quarterly steps plus next-year planning: Year in Review, Vision &amp; Strategy Check, Next Year Targets, and Annual Initiative Plan.
              </p>
            )}
          </div>

          {/* Progress Ring (if in progress) */}
          {currentQuarterReview && currentQuarterReview.status !== 'completed' && (
            <div className="flex justify-center lg:block">
              <div className="relative w-32 h-32">
                {/* 11 actual steps (excludes 'complete' which is the final state) */}
                {(() => {
                  const stepsCompleted = (currentQuarterReview.steps_completed || []).filter((s: string) => s !== 'complete').length;
                  const totalSteps = currentQuarterReview.review_type === 'annual' ? 19 : 11;
                  const progressPercent = Math.min(100, Math.round((stepsCompleted / totalSteps) * 100));
                  return (
                    <>
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          stroke="#e5e7eb"
                          strokeWidth="8"
                          fill="none"
                        />
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          stroke="#0d9488"
                          strokeWidth="8"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={`${(stepsCompleted / totalSteps) * 352} 352`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-bold text-gray-900">
                          {progressPercent}%
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Review Parts Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
        {[
          { part: 1, title: 'Reflection', icon: FileText, desc: 'Review last quarter' },
          { part: 2, title: 'Analysis', icon: BarChart3, desc: 'What worked & what didn\'t' },
          { part: 3, title: 'Strategic Review', icon: Target, desc: 'Validate your path' },
          { part: 4, title: 'Planning', icon: Calendar, desc: 'Set next 90 days' }
        ].map(({ part, title, icon: Icon, desc }) => (
          <div
            key={part}
            className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-5 hover:shadow-md transition-shadow"
          >
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mb-3">
              <Icon className="w-5 h-5 text-gray-600" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1">Part {part}: {title}</h3>
            <p className="text-xs sm:text-sm text-gray-500">{desc}</p>
          </div>
        ))}
      </div>

      {/* Past Reviews */}
      {pastReviews.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Past Reviews</h2>
          <div className="space-y-3">
            {pastReviews.map(review => (
              <div
                key={review.id}
                className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    review.status === 'completed' ? 'bg-slate-100' : 'bg-gray-50'
                  }`}>
                    {review.status === 'completed' ? (
                      <CheckCircle2 className="w-6 h-6 text-gray-600" />
                    ) : (
                      <Clock className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900">
                      {getQuarterLabel(review.quarter, review.year)}
                      {review.review_type === 'annual' && (
                        <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Annual</span>
                      )}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {review.status === 'completed'
                        ? `Completed ${new Date(review.completed_at).toLocaleDateString()}`
                        : `${Math.min(100, Math.round(((review.steps_completed || []).filter((s: string) => s !== 'complete').length) / (review.review_type === 'annual' ? 19 : 11) * 100))}% complete`
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {review.status === 'completed' && (
                    <button
                      onClick={() => continueReview(review.id)}
                      className="text-gray-500 hover:text-gray-700 font-medium text-sm flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => review.status === 'completed' ? viewReview(review.id) : continueReview(review.id)}
                    className="text-brand-orange hover:text-brand-orange-700 font-medium text-sm flex items-center gap-1"
                  >
                    {review.status === 'completed' ? 'View Summary' : 'Continue'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
