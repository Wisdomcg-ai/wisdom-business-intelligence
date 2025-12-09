'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuarterlyReview } from '../hooks/useQuarterlyReview';
import { WorkshopProgress } from '../components/WorkshopProgress';
import { WorkshopNav } from '../components/WorkshopNav';
import { QuarterNumber, WORKSHOP_STEPS } from '../types';

// Step Components
import { PreWorkStep } from '../components/steps/PreWorkStep';
import { PreWorkReviewStep } from '../components/steps/PreWorkReviewStep';
import { DashboardReviewStep } from '../components/steps/DashboardReviewStep';
// ActionReplayStep is now merged into DashboardReviewStep (1.2)
import { FeedbackLoopStep } from '../components/steps/FeedbackLoopStep';
import { OpenLoopsStep } from '../components/steps/OpenLoopsStep';
import { IssuesListStep } from '../components/steps/IssuesListStep';
import { AssessmentRoadmapStep } from '../components/steps/AssessmentRoadmapStep';
import { SwotUpdateStep } from '../components/steps/SwotUpdateStep';
import { ConfidenceCheckStep } from '../components/steps/ConfidenceCheckStep';
import { QuarterlyResetStep } from '../components/steps/QuarterlyResetStep';
import { SprintPlanningStep } from '../components/steps/SprintPlanningStep';
import { WorkshopCompleteStep } from '../components/steps/WorkshopCompleteStep';

import { ArrowLeft, Menu, X } from 'lucide-react';

function ReviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showSidebar, setShowSidebar] = useState(false);

  const reviewId = searchParams?.get('id') || undefined;
  const quarter = searchParams?.get('quarter') ? parseInt(searchParams?.get('quarter')!) as QuarterNumber : undefined;
  const year = searchParams?.get('year') ? parseInt(searchParams?.get('year')!) : undefined;

  const {
    review,
    isLoading,
    error,
    isSaving,
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
    // Pre-work
    updatePreWork,
    completePreWork,
    // Part 1
    updateDashboardSnapshot,
    updateActionReplay,
    // Part 2
    updateFeedbackLoop,
    updateOpenLoopsDecisions,
    updateIssuesResolved,
    // Part 3
    updateAssessmentSnapshot,
    updateRoadmapSnapshot,
    updateSwotAnalysisId,
    updateConfidence,
    // Part 4
    updateQuarterlyTargets,
    updateInitiativesChanges,
    updateQuarterlyRocks
  } = useQuarterlyReview({ reviewId, quarter, year });

  const handleBack = () => {
    const currentIndex = WORKSHOP_STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      goToStep(WORKSHOP_STEPS[currentIndex - 1]);
    }
  };

  const handleNext = async () => {
    if (currentStep === 'prework') {
      await completePreWork();
    } else if (currentStep === '4.2') {
      await completeWorkshop();
      goToStep('complete');
    } else {
      await completeCurrentStep();
    }
  };

  const canGoBack = WORKSHOP_STEPS.indexOf(currentStep) > 0 && currentStep !== 'complete';
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
            onClick={() => router.push('/quarterly-review')}
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
      case '1.1':
        return (
          <PreWorkReviewStep
            review={review}
            onEditPreWork={() => goToStep('prework')}
          />
        );
      case '1.2':
        // 1.2 includes both Dashboard Review and Action Replay (merged from 1.3)
        return (
          <DashboardReviewStep
            review={review}
            onUpdate={updateDashboardSnapshot}
            onUpdateActionReplay={updateActionReplay}
          />
        );
      case '2.1':
        return (
          <FeedbackLoopStep
            review={review}
            onUpdate={updateFeedbackLoop}
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
      case '3.3':
        return (
          <ConfidenceCheckStep
            review={review}
            onUpdate={updateConfidence}
          />
        );
      case '4.1':
        return (
          <QuarterlyResetStep
            review={review}
            onUpdateTargets={updateQuarterlyTargets}
            onUpdateInitiatives={updateInitiativesChanges}
            onUpdateRocks={updateQuarterlyRocks}
          />
        );
      case '4.2':
        return (
          <SprintPlanningStep
            review={review}
            onUpdateInitiatives={updateInitiativesChanges}
            onUpdateRocks={updateQuarterlyRocks}
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

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/quarterly-review')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="font-semibold text-gray-900">{quarterLabel} Quarterly Review</h1>
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

      <div className="max-w-[1800px] mx-auto px-6 py-6 flex gap-8">
        {/* Sidebar - Progress */}
        <aside className={`
          fixed lg:relative inset-y-0 left-0 z-30 w-80 bg-white lg:bg-transparent
          transform transition-transform duration-300 lg:transform-none
          ${showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          lg:block pt-20 lg:pt-0 px-4 lg:px-0 overflow-y-auto
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
          <div className="bg-white rounded-2xl border border-gray-200 p-6 lg:p-10">
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
        hasUnsavedChanges={hasUnsavedChanges}
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
