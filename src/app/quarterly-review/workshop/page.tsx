'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuarterlyReview } from '../hooks/useQuarterlyReview';
import { WorkshopProgress } from '../components/WorkshopProgress';
import { WorkshopNav } from '../components/WorkshopNav';
import { QuarterNumber, ReviewType, getWorkshopSteps } from '../types';

// Step Components
import { PreWorkStep } from '../components/steps/PreWorkStep';
import { PreWorkReviewStep } from '../components/steps/PreWorkReviewStep';
import { ScorecardReviewStep } from '../components/steps/ScorecardReviewStep';
import { RocksReviewStep } from '../components/steps/RocksReviewStep';
import { ActionReplayStep } from '../components/steps/ActionReplayStep';
import { FeedbackLoopStep } from '../components/steps/FeedbackLoopStep';
import { OpenLoopsStep } from '../components/steps/OpenLoopsStep';
import { IssuesListStep } from '../components/steps/IssuesListStep';
import { CustomerPulseStep } from '../components/steps/CustomerPulseStep';
import { PeopleReviewStep } from '../components/steps/PeopleReviewStep';
import { AssessmentRoadmapStep } from '../components/steps/AssessmentRoadmapStep';
import { SwotUpdateStep } from '../components/steps/SwotUpdateStep';
import { ConfidenceRealignmentStep } from '../components/steps/ConfidenceRealignmentStep';
import { QuarterlyPlanStep } from '../components/steps/QuarterlyPlanStep';
import { QuarterlyRocksStep } from '../components/steps/QuarterlyRocksStep';
import { WorkshopCompleteStep } from '../components/steps/WorkshopCompleteStep';

// Annual-only step components
import { YearInReviewStep } from '../components/steps/YearInReviewStep';
import { VisionStrategyStep } from '../components/steps/VisionStrategyStep';
import { NextYearTargetsStep } from '../components/steps/NextYearTargetsStep';
import { AnnualInitiativePlanStep } from '../components/steps/AnnualInitiativePlanStep';

import { useCoachView } from '@/hooks/useCoachView';
import { ArrowLeft, Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

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
  } = useQuarterlyReview({ reviewId, quarter, year, reviewType });

  // Use the review's actual type (may differ from URL param if resuming existing review)
  const effectiveReviewType = activeReviewType || reviewType;
  const workshopSteps = getWorkshopSteps(effectiveReviewType);

  const handleBack = () => {
    const currentIndex = workshopSteps.indexOf(currentStep);
    if (currentIndex > 0) {
      goToStep(workshopSteps[currentIndex - 1]);
    }
  };

  const handleNext = async () => {
    if (currentStep === 'prework') {
      await completePreWork();
    } else if (currentStep === workshopSteps[workshopSteps.length - 2]) {
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto mb-4"></div>
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
      case '1.4':
        return (
          <ActionReplayStep
            review={review}
            onUpdate={updateActionReplay}
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
      case '2.2':
        return (
          <OpenLoopsStep
            review={review}
            onUpdate={updateOpenLoopsDecisions}
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
      case '3.1':
        return (
          <AssessmentRoadmapStep
            review={review}
            onUpdateAssessment={updateAssessmentSnapshot}
            onUpdateRoadmap={updateRoadmapSnapshot}
          />
        );
      case '3.2':
        return (
          <SwotUpdateStep
            review={review}
            onUpdate={updateSwotAnalysisId}
          />
        );

      // Annual-only steps (Part 4: Annual Planning)
      case 'A4.1':
        return (
          <YearInReviewStep
            review={review}
            onUpdate={updateYearInReview}
          />
        );
      case 'A4.2':
        return (
          <VisionStrategyStep
            review={review}
            onUpdate={updateVisionStrategy}
          />
        );
      case 'A4.3':
        return (
          <NextYearTargetsStep
            review={review}
            onUpdate={updateNextYearTargets}
          />
        );
      case 'A4.4':
        return (
          <AnnualInitiativePlanStep
            review={review}
            onUpdate={updateAnnualInitiativePlan}
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

  const headerTitle = effectiveReviewType === 'annual'
    ? `${quarterLabel} Annual Review`
    : `${quarterLabel} Quarterly Review`;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[2000px] mx-auto px-4 py-3 flex items-center justify-between">
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

      <div className="max-w-[2000px] mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar - Progress */}
        <aside className={`
          fixed lg:relative inset-y-0 left-0 z-30 bg-white lg:bg-transparent
          transform transition-all duration-300
          ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
          ${sidebarCollapsed ? 'lg:hidden' : 'lg:block lg:translate-x-0 lg:w-64 lg:shrink-0'}
          w-80 pt-20 lg:pt-0 px-4 lg:px-0 overflow-y-auto
        `}>
          <div className="sticky top-6">
            <WorkshopProgress
              currentStep={currentStep}
              stepsCompleted={stepsCompleted}
              onStepClick={(step) => {
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange"></div>
      </div>
    }>
      <ReviewContent />
    </Suspense>
  );
}
