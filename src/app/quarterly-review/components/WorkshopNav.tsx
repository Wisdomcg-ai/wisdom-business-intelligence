'use client';

import { WorkshopStep, WORKSHOP_STEPS, STEP_LABELS } from '../types';
import { ChevronLeft, ChevronRight, Save, Loader2 } from 'lucide-react';

interface WorkshopNavProps {
  currentStep: WorkshopStep;
  stepsCompleted: WorkshopStep[];
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onNext: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  nextLabel?: string;
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
  hasUnsavedChanges,
  nextLabel
}: WorkshopNavProps) {
  const currentIndex = WORKSHOP_STEPS.indexOf(currentStep);
  const isLastStep = currentStep === '4.2';
  const isComplete = currentStep === 'complete';

  // Get previous and next step labels
  const prevStep = currentIndex > 0 ? WORKSHOP_STEPS[currentIndex - 1] : null;
  const nextStep = currentIndex < WORKSHOP_STEPS.length - 1 ? WORKSHOP_STEPS[currentIndex + 1] : null;

  if (isComplete) {
    return null;
  }

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

        {/* Center - Save Status */}
        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <span className="text-xs text-gray-600 hidden sm:block">Unsaved changes</span>
          )}
          {onSave && (
            <button
              onClick={onSave}
              disabled={isSaving || !hasUnsavedChanges}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                hasUnsavedChanges
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
          )}
        </div>

        {/* Next Button */}
        <div>
          <button
            onClick={onNext}
            disabled={!canGoForward}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-colors ${
              canGoForward
                ? isLastStep
                  ? 'bg-brand-orange text-white hover:bg-brand-orange-600'
                  : 'bg-brand-orange text-white hover:bg-brand-orange-600'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <span>
              {nextLabel || (isLastStep ? 'Complete Review' : nextStep ? STEP_LABELS[nextStep] : 'Next')}
            </span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
