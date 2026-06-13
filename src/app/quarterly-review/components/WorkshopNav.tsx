'use client';

import { WorkshopStep, WORKSHOP_STEPS, STEP_LABELS, ReviewType, getWorkshopSteps } from '../types';
import { ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react';

interface WorkshopNavProps {
  currentStep: WorkshopStep;
  stepsCompleted: WorkshopStep[];
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onNext: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  isCompleting?: boolean;
  hasUnsavedChanges?: boolean;
  nextLabel?: string;
  reviewType?: ReviewType;
}

export function WorkshopNav({
  currentStep,
  stepsCompleted,
  canGoBack,
  canGoForward,
  onBack,
  onNext,
  onSave,
  isSaving,
  isCompleting,
  hasUnsavedChanges,
  nextLabel,
  reviewType = 'quarterly'
}: WorkshopNavProps) {
  const steps = getWorkshopSteps(reviewType);
  const currentIndex = steps.indexOf(currentStep);
  // Last step before 'complete' is the session close
  const lastContentStep = steps[steps.length - 2]; // step before 'complete'
  const isLastStep = currentStep === lastContentStep;
  const isComplete = currentStep === 'complete';

  // Previous step label (for the Back button). The forward button is a single
  // consistent "Continue" — it no longer names the next step (that competed with
  // each step's own internal section nav and read as a second "Next" button).
  const prevStep = currentIndex > 0 ? steps[currentIndex - 1] : null;

  if (isComplete) {
    return null;
  }

  const nextDisabled = !canGoForward || isCompleting;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-4 px-6 z-50">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* Back Button */}
        <div>
          {canGoBack && prevStep && (
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="hidden sm:inline text-sm">
                {prevStep === 'prework' ? 'Pre-Work' : STEP_LABELS[prevStep]}
              </span>
              <span className="sm:hidden text-sm">Back</span>
            </button>
          )}
        </div>

        {/* Center — passive auto-save status. No manual Save button; everything
            auto-saves. The owner can see at a glance their work is safe. */}
        <div className="flex items-center gap-2 text-xs" aria-live="polite">
          {isSaving || hasUnsavedChanges ? (
            <span className="flex items-center gap-1.5 text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">Saving…</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-green-600">
              <Check className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Saved</span>
            </span>
          )}
        </div>

        {/* Next Button */}
        <div>
          <button
            onClick={onNext}
            disabled={nextDisabled}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-colors ${
              nextDisabled
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : isLastStep
                  ? 'bg-brand-orange text-white hover:bg-brand-orange-600'
                  : 'bg-brand-orange text-white hover:bg-brand-orange-600'
            }`}
          >
            {isCompleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Completing...</span>
              </>
            ) : (
              <>
                <span>
                  {nextLabel || (isLastStep ? 'Complete Review' : 'Continue')}
                </span>
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
