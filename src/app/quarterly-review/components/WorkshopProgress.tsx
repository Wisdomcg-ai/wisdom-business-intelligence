'use client';

import { WorkshopStep, STEP_LABELS, PART_LABELS, ANNUAL_PART_LABELS, ReviewType, getWorkshopSteps, getStepPart } from '../types';
import { CheckCircle2, Circle, PlayCircle } from 'lucide-react';

interface PartDefinition {
  number: string;
  label: string;
  steps: WorkshopStep[];
}

interface ReviewProgressProps {
  currentStep: WorkshopStep;
  stepsCompleted: WorkshopStep[];
  onStepClick?: (step: WorkshopStep) => void;
  canNavigateToStep?: (step: WorkshopStep) => boolean;
  compact?: boolean;
  reviewType?: ReviewType;
}

function getPartsForReviewType(reviewType: ReviewType): PartDefinition[] {
  if (reviewType === 'annual') {
    return [
      { number: '1', label: ANNUAL_PART_LABELS['1'], steps: ['1.1', '1.2', '1.3', '1.4'] as WorkshopStep[] },
      { number: '2', label: ANNUAL_PART_LABELS['2'], steps: ['2.1', '2.2', '2.3', '2.4', '2.5'] as WorkshopStep[] },
      { number: '3', label: ANNUAL_PART_LABELS['3'], steps: ['3.1', '3.2'] as WorkshopStep[] },
      { number: '4', label: ANNUAL_PART_LABELS['A4'], steps: ['A4.1', 'A4.2', 'A4.3', 'A4.4'] as WorkshopStep[] },
      { number: '5', label: ANNUAL_PART_LABELS['5'], steps: ['4.1', '4.2', '4.3'] as WorkshopStep[] },
    ];
  }
  return [
    { number: '1', label: PART_LABELS['1'], steps: ['1.1', '1.2', '1.3', '1.4'] as WorkshopStep[] },
    { number: '2', label: PART_LABELS['2'], steps: ['2.1', '2.2', '2.3', '2.4', '2.5'] as WorkshopStep[] },
    { number: '3', label: PART_LABELS['3'], steps: ['3.1', '3.2'] as WorkshopStep[] },
    { number: '4', label: PART_LABELS['4'], steps: ['4.1', '4.2', '4.3'] as WorkshopStep[] },
  ];
}

export function WorkshopProgress({
  currentStep,
  stepsCompleted,
  onStepClick,
  canNavigateToStep,
  compact = false,
  reviewType = 'quarterly'
}: ReviewProgressProps) {
  const parts = getPartsForReviewType(reviewType);
  const workshopSteps = getWorkshopSteps(reviewType);

  const getStepStatus = (step: WorkshopStep): 'completed' | 'current' | 'upcoming' => {
    if (stepsCompleted.includes(step)) return 'completed';
    if (step === currentStep) return 'current';
    return 'upcoming';
  };

  const handleStepClick = (step: WorkshopStep) => {
    if (onStepClick && canNavigateToStep && canNavigateToStep(step)) {
      onStepClick(step);
    }
  };

  // Calculate overall progress
  const totalSteps = workshopSteps.length - 2; // Exclude prework and complete
  const completedCount = stepsCompleted.filter(s => s !== 'prework' && s !== 'complete').length;
  const progressPercentage = Math.min(100, Math.round((completedCount / totalSteps) * 100));

  if (compact) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">Progress</span>
          <span className="text-sm font-bold text-brand-orange">{progressPercentage}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-orange rounded-full transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Currently: {STEP_LABELS[currentStep]}
        </div>
      </div>
    );
  }

  // Get display step number for annual steps
  const getStepDisplayNumber = (step: WorkshopStep): string => {
    if (step.startsWith('A4.')) {
      // Annual steps: A4.1 → 4.1, A4.2 → 4.2, etc.
      return step.replace('A', '');
    }
    if (reviewType === 'annual' && step.startsWith('4.')) {
      // In annual mode, regular 4.x steps display as 5.x
      return step.replace('4.', '5.');
    }
    return step;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Overall Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Progress</span>
          <span className="text-sm font-bold text-brand-orange">{progressPercentage}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-orange rounded-full transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Pre-work */}
      <div className="mb-4">
        <button
          onClick={() => handleStepClick('prework')}
          disabled={!canNavigateToStep?.('prework')}
          className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
            currentStep === 'prework'
              ? 'bg-slate-100 border border-slate-200'
              : stepsCompleted.includes('prework')
              ? 'bg-gray-50 border border-slate-200'
              : 'bg-gray-50 border border-gray-200'
          } ${canNavigateToStep?.('prework') ? 'cursor-pointer hover:bg-opacity-80' : 'cursor-default'}`}
        >
          {stepsCompleted.includes('prework') ? (
            <CheckCircle2 className="w-5 h-5 text-gray-600 flex-shrink-0" />
          ) : currentStep === 'prework' ? (
            <PlayCircle className="w-5 h-5 text-brand-orange flex-shrink-0" />
          ) : (
            <Circle className="w-5 h-5 text-gray-400 flex-shrink-0" />
          )}
          <div>
            <p className="font-medium text-gray-900">Pre-Work</p>
            <p className="text-xs text-gray-500">Complete before your review</p>
          </div>
        </button>
      </div>

      {/* Review Parts */}
      <div className="space-y-4">
        {parts.map(part => {
          const partStepsCompleted = part.steps.filter(s => stepsCompleted.includes(s)).length;
          const isPartComplete = partStepsCompleted === part.steps.length;
          const isPartActive = part.steps.includes(currentStep);

          return (
            <div key={part.number} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Part Header */}
              <div className={`px-4 py-3 flex items-center justify-between ${
                isPartComplete ? 'bg-slate-100' : isPartActive ? 'bg-gray-50' : 'bg-gray-50'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isPartComplete
                      ? 'bg-brand-orange text-white'
                      : isPartActive
                      ? 'bg-brand-orange-500 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}>
                    {part.number}
                  </span>
                  <span className="font-semibold text-gray-900">
                    {part.label}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {partStepsCompleted}/{part.steps.length}
                </span>
              </div>

              {/* Part Steps */}
              <div className="divide-y divide-gray-100">
                {part.steps.map(step => {
                  const status = getStepStatus(step);
                  const canNavigate = canNavigateToStep?.(step);
                  const displayNumber = getStepDisplayNumber(step);

                  return (
                    <button
                      key={step}
                      onClick={() => handleStepClick(step)}
                      disabled={!canNavigate}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        status === 'current'
                          ? 'bg-brand-orange-50'
                          : status === 'completed'
                          ? 'bg-white'
                          : 'bg-white'
                      } ${canNavigate ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default opacity-60'}`}
                    >
                      {status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      ) : status === 'current' ? (
                        <PlayCircle className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${
                          status === 'current' ? 'font-medium text-brand-navy' : 'text-gray-700'
                        }`}>
                          {displayNumber}. {STEP_LABELS[step].replace(/^\d+\.\d+\s*/, '')}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
