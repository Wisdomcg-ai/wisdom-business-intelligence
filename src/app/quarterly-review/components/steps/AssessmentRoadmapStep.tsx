'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, AssessmentSnapshot, RoadmapSnapshot } from '../../types';
import { BarChart3, Map, CheckCircle2, AlertCircle, TrendingUp, Loader2, ExternalLink, Clock, AlertTriangle, Target, ChevronRight } from 'lucide-react';
import Link from 'next/link';

// Stage definitions for roadmap
const STAGE_DEFINITIONS = [
  { id: 'foundation', name: 'Foundation', range: '$0 - $500K', minRevenue: 0, maxRevenue: 500000 },
  { id: 'growth', name: 'Growth', range: '$500K - $2M', minRevenue: 500000, maxRevenue: 2000000 },
  { id: 'scale', name: 'Scale', range: '$2M - $5M', minRevenue: 2000000, maxRevenue: 5000000 },
  { id: 'expansion', name: 'Expansion', range: '$5M - $10M', minRevenue: 5000000, maxRevenue: 10000000 },
  { id: 'mastery', name: 'Mastery', range: '$10M+', minRevenue: 10000000, maxRevenue: Infinity }
];

// Get stage from revenue
const getStageFromRevenue = (revenue: number | null): typeof STAGE_DEFINITIONS[0] => {
  if (!revenue) return STAGE_DEFINITIONS[0];
  for (const stage of STAGE_DEFINITIONS) {
    if (revenue >= stage.minRevenue && revenue < stage.maxRevenue) {
      return stage;
    }
  }
  return STAGE_DEFINITIONS[STAGE_DEFINITIONS.length - 1];
};

// Helper to check if assessment is stale (older than 6 months)
const isAssessmentStale = (assessmentDate: string | null): boolean => {
  if (!assessmentDate) return true;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return new Date(assessmentDate) < sixMonthsAgo;
};

// Helper to get days since assessment
const getDaysSinceAssessment = (assessmentDate: string | null): number => {
  if (!assessmentDate) return 999;
  const diff = Date.now() - new Date(assessmentDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

// Helper to format relative date
const getRelativeDateString = (assessmentDate: string): string => {
  const days = getDaysSinceAssessment(assessmentDate);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? 's' : ''} ago`;
};

interface AssessmentRoadmapStepProps {
  review: QuarterlyReview;
  onUpdateAssessment: (snapshot: AssessmentSnapshot) => void;
  onUpdateRoadmap: (snapshot: RoadmapSnapshot) => void;
}

// Total builds in roadmap (from STAGES data - 52 builds total across all stages)
const TOTAL_ROADMAP_BUILDS = 52;

export function AssessmentRoadmapStep({ review, onUpdateAssessment, onUpdateRoadmap }: AssessmentRoadmapStepProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [assessmentData, setAssessmentData] = useState<any>(null);
  const [roadmapData, setRoadmapData] = useState<{
    currentStage: typeof STAGE_DEFINITIONS[0];
    revenue: number | null;
    completedBuilds: string[];
    totalBuilds: number;
  } | null>(null);
  const [staleAcknowledged, setStaleAcknowledged] = useState(false);
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();

  // Check if assessment is stale
  const assessmentIsStale = assessmentData ? isAssessmentStale(assessmentData.created_at) : true;
  const noAssessment = !assessmentData;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Get current user for assessment query (assessments use user_id, not business_id)
      const { data: { user } } = await supabase.auth.getUser();

      // Use activeBusiness owner ID if coach is viewing, otherwise use current user ID
      const targetUserId = activeBusiness?.ownerId || user?.id;

      // Fetch latest assessment from 'assessments' table using user_id
      let assessment = null;
      if (targetUserId) {
        try {
          const { data, error } = await supabase
            .from('assessments')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error) assessment = data;
        } catch (e) {
          console.log('Assessments table not available');
        }
      }

      // Fetch business profile for revenue (to determine stage)
      let businessProfile = null;
      if (targetUserId) {
        try {
          const { data, error } = await supabase
            .from('business_profiles')
            .select('id, annual_revenue')
            .eq('user_id', targetUserId)
            .maybeSingle();
          if (!error) businessProfile = data;
        } catch (e) {
          console.log('Business profile query error');
        }
      }

      // Fetch roadmap progress (completed builds)
      let completedBuilds: string[] = [];
      if (targetUserId) {
        try {
          const { data, error } = await supabase
            .from('roadmap_progress')
            .select('completed_builds')
            .eq('user_id', targetUserId)
            .maybeSingle();
          if (!error && data) {
            completedBuilds = (data.completed_builds as string[]) || [];
          }
        } catch (e) {
          console.log('Roadmap progress table not available');
        }
      }

      setAssessmentData(assessment);

      // Set roadmap data with stage calculation
      const currentStage = getStageFromRevenue(businessProfile?.annual_revenue);
      setRoadmapData({
        currentStage,
        revenue: businessProfile?.annual_revenue || null,
        completedBuilds,
        totalBuilds: TOTAL_ROADMAP_BUILDS
      });

      // Create snapshots
      if (assessment) {
        // Build engine scores from the 8 business engines
        const engineScores: Record<string, { score: number; max: number }> = {};
        const maxPerEngine = 12.5; // 100 / 8 engines

        if (assessment.attract_score !== undefined) {
          engineScores['attract'] = { score: assessment.attract_score, max: maxPerEngine };
        }
        if (assessment.convert_score !== undefined) {
          engineScores['convert'] = { score: assessment.convert_score, max: maxPerEngine };
        }
        if (assessment.deliver_score !== undefined) {
          engineScores['deliver'] = { score: assessment.deliver_score, max: maxPerEngine };
        }
        if (assessment.people_score !== undefined) {
          engineScores['people'] = { score: assessment.people_score, max: maxPerEngine };
        }
        if (assessment.systems_score !== undefined) {
          engineScores['systems'] = { score: assessment.systems_score, max: maxPerEngine };
        }
        if (assessment.finance_score !== undefined) {
          engineScores['finance'] = { score: assessment.finance_score, max: maxPerEngine };
        }
        if (assessment.leadership_score !== undefined) {
          engineScores['leadership'] = { score: assessment.leadership_score, max: maxPerEngine };
        }
        if (assessment.time_score !== undefined) {
          engineScores['time'] = { score: assessment.time_score, max: maxPerEngine };
        }

        const assessmentSnapshot: AssessmentSnapshot = {
          totalScore: assessment.total_score || 0,
          maxScore: 100,
          percentage: assessment.percentage || 0,
          engines: Object.keys(engineScores).length > 0 ? engineScores : undefined,
          assessmentDate: assessment.created_at,
          retakeRequested: false
        };
        onUpdateAssessment(assessmentSnapshot);
      }

      // Create roadmap snapshot
      const roadmapSnapshot: RoadmapSnapshot = {
        currentStage: currentStage.id,
        stageName: currentStage.name,
        revenue: businessProfile?.annual_revenue || null,
        buildItemsComplete: completedBuilds.length,
        buildItemsTotal: TOTAL_ROADMAP_BUILDS,
        stageConfirmed: true
      };
      onUpdateRoadmap(roadmapSnapshot);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-gray-900';
    if (percentage >= 60) return 'text-gray-700';
    return 'text-gray-600';
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="3.1"
          subtitle="Review your business assessment and roadmap position"
          estimatedTime={15}
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        step="3.1"
        subtitle="Review your business assessment score and roadmap progress"
        estimatedTime={15}
        tip="Consider retaking the assessment if significant changes occurred"
      />

      {/* Stale Assessment Warning Banner */}
      {!isLoading && (noAssessment || assessmentIsStale) && !staleAcknowledged && (
        <div className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 rounded-full">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 text-lg mb-2">
                {noAssessment ? 'Assessment Required' : 'Assessment Out of Date'}
              </h3>
              <p className="text-amber-800 mb-4">
                {noAssessment
                  ? 'You haven\'t completed a business assessment yet. The assessment helps identify your strengths and areas for improvement across the 8 business engines.'
                  : `Your last assessment was ${getRelativeDateString(assessmentData.created_at)} (${new Date(assessmentData.created_at).toLocaleDateString()}). We recommend retaking the assessment every 6 months to track your progress accurately.`
                }
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/assessment"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
                >
                  {noAssessment ? 'Take Assessment' : 'Retake Assessment'}
                  <ExternalLink className="w-4 h-4" />
                </Link>
                {!noAssessment && (
                  <button
                    onClick={() => setStaleAcknowledged(true)}
                    className="px-4 py-2 bg-white text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 font-medium"
                  >
                    Continue with Current Score
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Assessment Card */}
        <div className={`bg-white rounded-xl border overflow-hidden ${assessmentIsStale && !staleAcknowledged ? 'border-amber-300 border-2' : 'border-gray-200'}`}>
          <div className={`p-6 text-white ${assessmentIsStale && !staleAcknowledged ? 'bg-amber-600' : 'bg-brand-orange'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                <h3 className="font-semibold">Business Assessment</h3>
              </div>
              {assessmentData && (
                <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${assessmentIsStale ? 'bg-amber-700' : 'bg-brand-orange-700'}`}>
                  <Clock className="w-3 h-3" />
                  {getRelativeDateString(assessmentData.created_at)}
                </div>
              )}
            </div>

            {assessmentData ? (
              <div className="text-center">
                <div className="text-5xl font-bold mb-2">
                  {assessmentData.percentage || 0}%
                </div>
                <p className={assessmentIsStale ? 'text-amber-200' : 'text-slate-300'}>Overall Score</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-400" />
                <p className="text-slate-300">No assessment found</p>
              </div>
            )}
          </div>

          <div className="p-4">
            {assessmentData ? (
              <>
                <div className={`flex items-center gap-2 text-sm mb-4 ${assessmentIsStale ? 'text-amber-600' : 'text-gray-500'}`}>
                  <Clock className="w-4 h-4" />
                  <span>
                    Last taken: {new Date(assessmentData.created_at).toLocaleDateString()}
                    {assessmentIsStale && <span className="font-medium"> (Over 6 months ago)</span>}
                  </span>
                </div>

                {/* 8 Business Engine Scores */}
                <div className="space-y-2">
                  {[
                    { key: 'attract', label: 'Attract', score: assessmentData.attract_score },
                    { key: 'convert', label: 'Convert', score: assessmentData.convert_score },
                    { key: 'deliver', label: 'Deliver', score: assessmentData.deliver_score },
                    { key: 'people', label: 'People', score: assessmentData.people_score },
                    { key: 'systems', label: 'Systems', score: assessmentData.systems_score },
                    { key: 'finance', label: 'Finance', score: assessmentData.finance_score },
                    { key: 'leadership', label: 'Leadership', score: assessmentData.leadership_score },
                    { key: 'time', label: 'Time', score: assessmentData.time_score },
                  ].filter(item => item.score !== undefined && item.score !== null).map((item) => (
                    <div key={item.key}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{item.label}</span>
                        <span className={`font-medium ${getScoreColor(item.score)}`}>
                          {Math.round(item.score)}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-orange rounded-full"
                          style={{ width: `${Math.min(100, item.score)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <Link
                  href="/assessment"
                  className={`mt-4 inline-flex items-center gap-2 text-sm font-medium ${
                    assessmentIsStale
                      ? 'px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700'
                      : 'text-brand-orange hover:text-brand-orange-700'
                  }`}
                >
                  {assessmentIsStale ? 'Retake Assessment Now' : 'Retake Assessment'}
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </>
            ) : (
              <Link
                href="/assessment"
                className="inline-flex items-center gap-2 text-brand-orange hover:text-brand-orange-700 text-sm font-medium"
              >
                Take Assessment
                <ExternalLink className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>

        {/* Roadmap Card */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-brand-orange p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Map className="w-5 h-5" />
                <h3 className="font-semibold">Business Roadmap</h3>
              </div>
              {roadmapData && (
                <span className="text-xs px-2 py-1 bg-brand-orange-700 rounded-full">
                  {roadmapData.currentStage.range}
                </span>
              )}
            </div>

            {roadmapData ? (
              <div className="text-center">
                <div className="text-3xl font-bold mb-1">
                  {roadmapData.currentStage.name}
                </div>
                <p className="text-brand-orange-200">Current Stage</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 text-brand-orange-300" />
                <p className="text-brand-orange-200">Set up your roadmap</p>
              </div>
            )}
          </div>

          <div className="p-4">
            {roadmapData ? (
              <>
                {/* Overall Progress */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-700">Builds Complete</span>
                    <span className="font-medium text-gray-900">
                      {roadmapData.completedBuilds.length} / {roadmapData.totalBuilds}
                    </span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-orange rounded-full transition-all"
                      style={{
                        width: `${(roadmapData.completedBuilds.length / roadmapData.totalBuilds) * 100}%`
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1 text-right">
                    {Math.round((roadmapData.completedBuilds.length / roadmapData.totalBuilds) * 100)}% complete
                  </div>
                </div>

                {/* Stage Progress Indicators */}
                <div className="space-y-2 mb-4">
                  {STAGE_DEFINITIONS.map((stage, idx) => {
                    const isCurrentStage = stage.id === roadmapData.currentStage.id;
                    const isPastStage = idx < STAGE_DEFINITIONS.findIndex(s => s.id === roadmapData.currentStage.id);

                    return (
                      <div
                        key={stage.id}
                        className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                          isCurrentStage
                            ? 'bg-brand-orange-50 border border-brand-orange-200'
                            : isPastStage
                            ? 'bg-gray-50'
                            : 'opacity-50'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${
                          isCurrentStage ? 'bg-brand-orange-500' : isPastStage ? 'bg-gray-400' : 'bg-gray-200'
                        }`} />
                        <span className={`flex-1 ${isCurrentStage ? 'font-medium text-brand-orange-700' : 'text-gray-600'}`}>
                          {stage.name}
                        </span>
                        <span className="text-xs text-gray-500">{stage.range}</span>
                        {isCurrentStage && (
                          <Target className="w-4 h-4 text-brand-orange-500" />
                        )}
                        {isPastStage && (
                          <CheckCircle2 className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {roadmapData.revenue && roadmapData.revenue > 0 && (
                  <div className="text-sm text-gray-600 mb-4 p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-500">Annual Revenue:</span>{' '}
                    <span className="font-semibold text-gray-900">
                      ${roadmapData.revenue >= 1000000
                        ? `${(roadmapData.revenue / 1000000).toFixed(1)}M`
                        : `${(roadmapData.revenue / 1000).toFixed(0)}K`
                      }
                    </span>
                  </div>
                )}

                <Link
                  href="/business-roadmap"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 text-sm font-medium"
                >
                  View Full Roadmap
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-600 mb-4">
                  Track your progress through the 5 stages of business growth
                </p>
                <Link
                  href="/business-roadmap"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 text-sm font-medium"
                >
                  Set Up Roadmap
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Discussion Points */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-gray-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Key Questions to Discuss</h4>
            <ul className="mt-2 text-sm text-gray-700 space-y-1">
              <li>• Has your assessment score improved since last quarter?</li>
              <li>• Are you progressing on your roadmap build items?</li>
              <li>• Do you need to adjust your stage based on current revenue?</li>
              <li>• Which engine needs the most attention next quarter?</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
