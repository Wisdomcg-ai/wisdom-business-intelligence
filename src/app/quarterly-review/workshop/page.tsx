'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuarterlyReview } from '../hooks/useQuarterlyReview';
import { WorkshopProgress } from '../components/WorkshopProgress';
import { WorkshopNav } from '../components/WorkshopNav';
import { CoachNotesPanel } from '../components/CoachNotesPanel';
import { QuarterNumber, ReviewType, YearType, getWorkshopSteps, getPlanningQuarter, getPreviousQuarterOf } from '../types';
// Phase 73 v2 — year-end annual-reset gate (fires at the Part 3 → Part 4 transition).
import { shouldRouteToAnnualReset } from '../utils/annual-reset-gate';
import { resolveBusinessProfileId } from '@/lib/business/resolveBusinessProfileIds';
import { createClient } from '@/lib/supabase/client';

// Step Components
import { PreWorkStep } from '../components/steps/PreWorkStep';
import { PreWorkReviewStep } from '../components/steps/PreWorkReviewStep';
import { ScorecardReviewStep } from '../components/steps/ScorecardReviewStep';
import { RocksReviewStep } from '../components/steps/RocksReviewStep';import { FeedbackLoopStep } from '../components/steps/FeedbackLoopStep';import { IssuesListStep } from '../components/steps/IssuesListStep';
import { CustomerPulseStep } from '../components/steps/CustomerPulseStep';
import { PeopleReviewStep } from '../components/steps/PeopleReviewStep';import { ConfidenceRealignmentStep } from '../components/steps/ConfidenceRealignmentStep';
import { QuarterlyPlanStep } from '../components/steps/QuarterlyPlanStep';
import { QuarterlyRocksStep } from '../components/steps/QuarterlyRocksStep';
import { WorkshopCompleteStep } from '../components/steps/WorkshopCompleteStep';
// v2 merged (composite tab) steps
import { RetroStep } from '../components/steps/RetroStep';
import { OpenItemsStep } from '../components/steps/OpenItemsStep';
import { StrategicCheckStep } from '../components/steps/StrategicCheckStep';

// Phase 73: the annual-only step components (YearInReviewStep, VisionStrategyStep,
// NextYearTargetsStep, AnnualInitiativePlanStep) are no longer routed into — the
// goals-wizard reset replaced this path. The component files remain on disk for
// historical reviews; they are simply not imported/rendered here.

import { useCoachView } from '@/hooks/useCoachView';
import { ArrowLeft, Menu, X, PanelLeftClose, PanelLeftOpen, Loader2 } from 'lucide-react';

function ReviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { getPath } = useCoachView();
  const [showSidebar, setShowSidebar] = useState(false); // mobile
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // desktop

  const reviewId = searchParams?.get('id') || undefined;
  const quarter = searchParams?.get('quarter') ? parseInt(searchParams?.get('quarter')!) as QuarterNumber : undefined;
  const year = searchParams?.get('year') ? parseInt(searchParams?.get('year')!) : undefined;
  const typeParam = searchParams?.get('type') as ReviewType | null;
  const reviewType: ReviewType = typeParam === 'annual' ? 'annual' : 'quarterly';

  const {
    review,
    isLoading,
    error,
    isSaving,
    isCompleting,
    hasUnsavedChanges,
    quarterLabel,
    currentStep,
    stepsCompleted,
    progressPercentage,
    canNavigateToStep,
    goToStep,
    completeCurrentStep,
    saveReview,
    completeWorkshop,
    markReviewComplete,
    reviewType: activeReviewType,
    // Pre-work
    updatePreWork,
    completePreWork,
    // Part 1: Reflect
    updateDashboardSnapshot,
    updateScorecardCommentary,
    updateRocksReview,
    updateActionReplay,
    // Part 2: Analyse
    updateFeedbackLoop,
    updateFeedbackLoopMode,
    updateOpenLoopsDecisions,
    updateIssuesResolved,
    updateCustomerPulse,
    updatePeopleReview,
    // Part 3: Strategic Review
    updateAssessmentSnapshot,
    updateRoadmapSnapshot,
    updateSwotAnalysisId,
    // Part 4: Plan
    updateAnnualPlanSnapshot,
    updateConfidence,
    updateRealignmentDecision,
    updateInitiativeDecisions,
    updateQuarterlyTargets,
    updateInitiativesChanges,
    updateQuarterlyRocks,
    // Annual Review (Option C)
    updateYearInReview,
    updateVisionStrategy,
    updateNextYearTargets,
    updateAnnualInitiativePlan,
    updateCoachNotes,
  } = useQuarterlyReview({ reviewId, quarter, year, reviewType });

  // Use the review's actual type (may differ from URL param if resuming existing review)
  const effectiveReviewType = activeReviewType || reviewType;
  const workshopSteps = getWorkshopSteps(effectiveReviewType);

  // Phase 73 v2: surface the client's year1_end_date + fiscal year type so the
  // Part 3 → Part 4 transition can detect a finished plan year (system-decided reset).
  // goals are keyed by business_profiles.id; resolve it from the review's businesses.id.
  const [year1EndDate, setYear1EndDate] = useState<Date | null | undefined>(undefined);
  const [fyType, setFyType] = useState<YearType>('FY');

  useEffect(() => {
    const bizId = review?.business_id;
    if (!bizId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const profileId = await resolveBusinessProfileId(supabase, bizId);
      const { data } = await supabase
        .from('business_financial_goals')
        .select('year_type, year1_end_date')
        .eq('business_id', profileId ?? bizId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setFyType((data?.year_type as YearType) || 'FY');
      setYear1EndDate(data?.year1_end_date ? new Date(data.year1_end_date as string) : null);
    })();
    return () => { cancelled = true; };
  }, [review?.business_id]);

  const handleBack = () => {
    const currentIndex = workshopSteps.indexOf(currentStep);
    if (currentIndex > 0) {
      goToStep(workshopSteps[currentIndex - 1]);
    }
  };

  // Phase 73 v2 — year-end annual-reset gate. A client whose plan year has ended
  // is diverted to the goals wizard (which auto-rolls the plan) BEFORE entering
  // Part 4 (planning) — reflection (Parts 1–3) is already done. Data-driven +
  // TZ-safe (getPlanningQuarter matches the goals hook's own gate). Enforced on
  // BOTH the Continue button (handleNext) AND direct sidebar navigation
  // (onStepClick), so the reset can't be skipped by clicking ahead in the
  // sidebar. Returns true if it handled navigation (caller should stop).
  // year1EndDate === undefined → still loading, so an in-flight load never trips
  // an accidental reset.
  const divertToAnnualResetIfNeeded = async (targetStep: string): Promise<boolean> => {
    if (
      targetStep.startsWith('4.') &&
      shouldRouteToAnnualReset(fyType, year1EndDate, getPlanningQuarter(fyType))
    ) {
      await markReviewComplete();
      router.push(getPath('/goals?reset=annual'));
      return true;
    }
    return false;
  };

  const handleNext = async () => {
    if (currentStep === 'prework') {
      await completePreWork();
      return;
    }

    // Divert year-end clients to the annual reset before the next step lands in
    // Part 4 (planning). Same guard runs on sidebar clicks (onStepClick below).
    const nextStep = workshopSteps[workshopSteps.indexOf(currentStep) + 1];
    if (nextStep && (await divertToAnnualResetIfNeeded(nextStep))) return;

    if (currentStep === workshopSteps[workshopSteps.length - 2]) {
      // Last content step — complete the review (sync + snapshots + mark complete)
      await completeWorkshop();
      // completeWorkshop() sets review.current_step='complete' via setReview(updated)
      // This renders WorkshopCompleteStep (the summary) — no redirect needed
    } else {
      await completeCurrentStep();
    }
  };

  const canGoBack = workshopSteps.indexOf(currentStep) > 0 && currentStep !== 'complete';
  const canGoForward = currentStep !== 'complete';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading review...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push(getPath('/quarterly-review'))}
            className="text-brand-orange hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    if (!review) return null;

    switch (currentStep) {
      case 'prework':
        return (
          <PreWorkStep
            review={review}
            onUpdate={updatePreWork}
          />
        );

      // Part 1: Reflect
      case '1.1':
        return (
          <PreWorkReviewStep
            review={review}
            onEditPreWork={() => goToStep('prework')}
          />
        );
      case '1.2':
        return (
          <ScorecardReviewStep
            review={review}
            onUpdate={updateDashboardSnapshot}
            onUpdateCommentary={updateScorecardCommentary}
          />
        );
      case '1.3':
        return (
          <RocksReviewStep
            review={review}
            onUpdate={updateRocksReview}
          />
        );
      case '1.4': // v2: Retro (Action Replay + Feedback Loop)
        return (
          <RetroStep
            review={review}
            onUpdateActionReplay={updateActionReplay}
            onUpdateFeedbackLoop={updateFeedbackLoop}
            onUpdateFeedbackLoopMode={updateFeedbackLoopMode}
          />
        );

      // Part 2: Analyse
      case '2.1':
        return (
          <FeedbackLoopStep
            review={review}
            onUpdate={updateFeedbackLoop}
            onUpdateMode={updateFeedbackLoopMode}
          />
        );
      case '2.2': // v2: Open Items (Open Loops + Issues)
        return (
          <OpenItemsStep
            review={review}
            onUpdateOpenLoops={updateOpenLoopsDecisions}
            onUpdateIssues={updateIssuesResolved}
          />
        );
      case '2.3':
        return (
          <IssuesListStep
            review={review}
            onUpdate={updateIssuesResolved}
          />
        );
      case '2.4':
        return (
          <CustomerPulseStep
            review={review}
            onUpdate={updateCustomerPulse}
          />
        );
      case '2.5':
        return (
          <PeopleReviewStep
            review={review}
            onUpdate={updatePeopleReview}
          />
        );

      // Part 3: Strategic Review
      case '3.1': // v2: Strategic Check (Assessment & Roadmap + SWOT)
        return (
          <StrategicCheckStep
            review={review}
            onUpdateAssessment={updateAssessmentSnapshot}
            onUpdateRoadmap={updateRoadmapSnapshot}
            onUpdateSwot={updateSwotAnalysisId}
          />
        );

      // Part 4/5: Plan (quarterly) / Next Quarter Sprint (annual)
      case '4.1':
        return (
          <ConfidenceRealignmentStep
            review={review}
            onUpdateAnnualPlanSnapshot={updateAnnualPlanSnapshot}
            onUpdateConfidence={updateConfidence}
            onUpdateRealignment={updateRealignmentDecision}
          />
        );
      case '4.2':
        return (
          <QuarterlyPlanStep
            review={review}
            onUpdateInitiativeDecisions={updateInitiativeDecisions}
            onUpdateQuarterlyTargets={updateQuarterlyTargets}
            onUpdateInitiativesChanges={updateInitiativesChanges}
          />
        );
      case '4.3':
        return (
          <QuarterlyRocksStep
            review={review}
            onUpdateInitiativeDecisions={updateInitiativeDecisions}
          />
        );
      case 'complete':
        return (
          <WorkshopCompleteStep
            review={review}
          />
        );
      default:
        return <div>Unknown step</div>;
    }
  };

  // A quarterly review reflects on the quarter that just ENDED and plans the NEXT
  // one. The review is keyed by the PLANNING quarter (review.quarter/year), so the
  // reviewed quarter is key − 1. Surface BOTH so the header doesn't read as if the
  // planning quarter (e.g. "Q1 FY27") is what's being reviewed — matching what the
  // Scorecard/Rocks steps already show ("Reviewing Q4 …").
  const fmtQ = (q: number, y: number) => (fyType === 'FY' ? `Q${q} FY${y}` : `Q${q} ${y}`);
  const reviewedQ = review ? getPreviousQuarterOf(review.quarter as QuarterNumber, review.year) : null;
  const planningLabel = review ? fmtQ(review.quarter, review.year) : quarterLabel;
  const isYearEndReview =
    effectiveReviewType !== 'annual' &&
    shouldRouteToAnnualReset(fyType, year1EndDate, getPlanningQuarter(fyType));
  const headerTitle = effectiveReviewType === 'annual'
    ? `${quarterLabel} Annual Review`
    : reviewedQ
      ? `${isYearEndReview ? 'Year-End Review — ' : ''}Reviewing ${fmtQ(reviewedQ.quarter, reviewedQ.year)} → Planning ${planningLabel}`
      : `${quarterLabel} Quarterly Review`;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if (hasUnsavedChanges) {
                  await saveReview();
                }
                router.push(getPath('/quarterly-review'));
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            {/* Sidebar toggle */}
            <div className="relative group">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {sidebarCollapsed
                  ? <PanelLeftOpen className="w-5 h-5 text-gray-600" />
                  : <PanelLeftClose className="w-5 h-5 text-gray-600" />
                }
              </button>
              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {sidebarCollapsed ? 'Show progress' : 'Hide progress'}
              </span>
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">{headerTitle}</h1>
              <p className="text-sm text-gray-500">{progressPercentage}% complete</p>
            </div>
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
          >
            {showSidebar ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <div className="max-w-[1800px] mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar - Progress */}
        <aside className={`
          fixed lg:relative inset-y-0 left-0 z-30 bg-white lg:bg-transparent
          transform transition-all duration-300
          ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
          ${sidebarCollapsed ? 'lg:hidden' : 'lg:block lg:translate-x-0 lg:w-72 lg:shrink-0'}
          w-80 pt-20 lg:pt-0 px-4 lg:px-0 overflow-y-auto
        `}>
          <div className="sticky top-6">
            <WorkshopProgress
              currentStep={currentStep}
              stepsCompleted={stepsCompleted}
              onStepClick={async (step) => {
                // Year-end clients are diverted to the annual reset even when
                // they jump straight to a Part-4 step via the sidebar.
                if (await divertToAnnualResetIfNeeded(step)) return;
                goToStep(step);
                setShowSidebar(false);
              }}
              canNavigateToStep={canNavigateToStep}
              reviewType={effectiveReviewType}
            />
          </div>
        </aside>

        {/* Mobile overlay */}
        {showSidebar && (
          <div
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 lg:p-6">
            {renderStep()}
          </div>
          {/* Shared session notes — coach + client, autosaved. Hidden on the summary step. */}
          {review && currentStep !== 'complete' && (
            <CoachNotesPanel
              currentStep={currentStep}
              notes={review.coach_notes}
              onUpdate={updateCoachNotes}
            />
          )}
        </main>
      </div>

      {/* Bottom Navigation */}
      <WorkshopNav
        currentStep={currentStep}
        stepsCompleted={stepsCompleted}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={handleBack}
        onNext={handleNext}
        onSave={saveReview}
        isSaving={isSaving}
        isCompleting={isCompleting}
        hasUnsavedChanges={hasUnsavedChanges}
        reviewType={effectiveReviewType}
      />
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-brand-orange" />
      </div>
    }>
      <ReviewContent />
    </Suspense>
  );
}
