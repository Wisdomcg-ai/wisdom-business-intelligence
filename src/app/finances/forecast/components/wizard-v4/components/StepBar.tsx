'use client';

import { Check } from 'lucide-react';
import { WIZARD_STEPS, WizardStep, ForecastWizardState } from '../types';

// Phase 57 T13 (B5): clickable nav based on `state.maxVisitedStep`.
//
// Pre-T13 the StepBar made `step <= currentStep` clickable, which only
// allowed BACKWARDS jumps (and only to already-completed steps). After T13,
// once the operator has visited a step it stays clickable forever — both
// forward and backward — so they can re-edit Step 3 from Step 7 without
// clicking "Back" five times. The clickability rule is `step <= maxVisitedStep`.
//
// Per CONTEXT.md (lines 40-45):
//   • Visited steps stay clickable both directions
//   • Flush-save synchronously before goToStep mutates currentStep
//   • On save failure: toast + stay put (no confirm modal)
//   • Validation icons are informational, NOT gating

type StepValidationStatus = 'complete' | 'incomplete' | 'unvisited';

function getStepValidation(step: WizardStep, state: ForecastWizardState): StepValidationStatus {
  if (step > state.maxVisitedStep) return 'unvisited';
  switch (step) {
    case 1:
      return (state.goals?.year1?.revenue || 0) > 0 ? 'complete' : 'incomplete';
    case 2:
      return state.priorYear !== null ? 'complete' : 'incomplete';
    case 3:
      return (state.revenueLines.length > 0 && state.cogsLines.length > 0)
        ? 'complete'
        : 'incomplete';
    case 4:
      return (state.teamMembers.length > 0 || state.newHires.length > 0)
        ? 'complete'
        : 'incomplete';
    case 5:
      // Subscriptions — soft predicate; visiting counts as complete since
      // CONTEXT.md treats this informationally and zero subscriptions is a
      // valid (if unusual) configuration.
      return 'complete';
    case 6:
      return state.opexLines.length > 0 ? 'complete' : 'incomplete';
    case 7:
    case 8:
      return 'complete'; // CapEx + Growth Plan are optional
    case 9:
      return 'complete';
    default:
      return 'unvisited';
  }
}

interface StepBarProps {
  currentStep: WizardStep;
  /**
   * Phase 57 T13: any step at or before `maxVisitedStep` is clickable
   * (forward + back). When the parent does not pass this prop, falls
   * through to currentStep (legacy behaviour: only past + current
   * clickable). The fallback exists so the component remains drop-in
   * usable in any test or storybook harness that mounts it without the
   * full wizard state.
   */
  maxVisitedStep?: WizardStep;
  /**
   * Optional state — when provided, validation icons render. When absent,
   * the bar still works but no icons are shown (legacy harnesses).
   */
  state?: ForecastWizardState;
  /**
   * Sync click handler — kept for back-compat. When `onStepClickAsync`
   * is provided, it takes precedence.
   */
  onStepClick?: (step: WizardStep) => void;
  /**
   * Async click handler — invoked before currentStep mutates. The parent
   * is responsible for flushing pending saves and surfacing toasts on
   * failure. When this handler throws, the StepBar swallows the error
   * (the parent already toasted).
   */
  onStepClickAsync?: (step: WizardStep) => Promise<void>;
  steps?: typeof WIZARD_STEPS;
}

export function StepBar({
  currentStep,
  maxVisitedStep,
  state,
  onStepClick,
  onStepClickAsync,
  steps,
}: StepBarProps) {
  const displaySteps = steps || WIZARD_STEPS;
  // Fallback: if maxVisitedStep is undefined (legacy callers / tests),
  // gate clickability on currentStep — exactly the pre-T13 behaviour.
  const maxClickable = (maxVisitedStep ?? currentStep) as WizardStep;

  const handleClick = async (target: WizardStep) => {
    if (onStepClickAsync) {
      try {
        await onStepClickAsync(target);
      } catch {
        /* parent surfaces error UX */
      }
      return;
    }
    onStepClick?.(target);
  };

  return (
    <div className="px-6 py-3">
      <nav className="flex items-center justify-between" aria-label="Progress">
        <ol className="flex items-center w-full">
          {displaySteps.map((step, index) => {
            const isActive = step.step === currentStep;
            const isCompleted = step.step < currentStep;
            const isClickable = step.step <= maxClickable;

            // Phase 57 T13: validation icon — only renders when state is
            // available AND the step is past + visited + incomplete.
            const validation: StepValidationStatus = state
              ? getStepValidation(step.step as WizardStep, state)
              : 'unvisited';
            const showIncompleteDot =
              !!state &&
              !isActive &&
              validation === 'incomplete' &&
              step.step <= maxClickable;

            return (
              <li
                key={step.step}
                className={`relative flex-1 ${index !== displaySteps.length - 1 ? '' : ''}`}
              >
                <div className="flex items-center">
                  {/* Step circle/indicator */}
                  <div className="relative">
                    <button
                      onClick={() => isClickable && handleClick(step.step as WizardStep)}
                      disabled={!isClickable}
                      title={
                        !isClickable
                          ? 'Not visited yet'
                          : showIncompleteDot
                          ? `${step.label} — incomplete`
                          : step.label
                      }
                      className={`
                        relative z-10 flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold transition-all
                        ${isActive
                          ? 'bg-brand-navy text-white ring-4 ring-brand-navy/20'
                          : isCompleted
                          ? 'bg-green-500 text-white hover:bg-green-600 cursor-pointer'
                          : isClickable
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer ring-2 ring-blue-300'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }
                      `}
                    >
                      {isCompleted ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        step.step
                      )}
                    </button>
                    {/* Phase 57 T13: amber dot for incomplete past steps */}
                    {showIncompleteDot && (
                      <span
                        className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-white"
                        title="Incomplete"
                        aria-label="Incomplete"
                      />
                    )}
                  </div>

                  {/* Step label */}
                  <span
                    className={`
                      ml-3 text-sm font-medium hidden lg:block
                      ${isActive ? 'text-brand-navy' : isCompleted ? 'text-gray-900' : 'text-gray-500'}
                    `}
                  >
                    {step.label}
                  </span>

                  {/* Connector line */}
                  {index !== displaySteps.length - 1 && (
                    <div className="flex-1 mx-4">
                      <div
                        className={`h-0.5 ${
                          isCompleted ? 'bg-green-500' : 'bg-gray-200'
                        }`}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
