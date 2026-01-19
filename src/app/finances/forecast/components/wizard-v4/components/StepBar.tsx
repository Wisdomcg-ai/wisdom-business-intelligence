'use client';

import { Check } from 'lucide-react';
import { WIZARD_STEPS, WizardStep } from '../types';

interface StepBarProps {
  currentStep: WizardStep;
  onStepClick: (step: WizardStep) => void;
}

export function StepBar({ currentStep, onStepClick }: StepBarProps) {
  return (
    <div className="px-6 py-3">
      <nav className="flex items-center justify-between" aria-label="Progress">
        <ol className="flex items-center w-full">
          {WIZARD_STEPS.map((step, index) => {
            const isActive = step.step === currentStep;
            const isCompleted = step.step < currentStep;
            const isClickable = step.step <= currentStep;

            return (
              <li
                key={step.step}
                className={`relative flex-1 ${index !== WIZARD_STEPS.length - 1 ? '' : ''}`}
              >
                <div className="flex items-center">
                  {/* Step circle/indicator */}
                  <button
                    onClick={() => isClickable && onStepClick(step.step as WizardStep)}
                    disabled={!isClickable}
                    className={`
                      relative z-10 flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold transition-all
                      ${isActive
                        ? 'bg-brand-navy text-white ring-4 ring-brand-navy/20'
                        : isCompleted
                        ? 'bg-green-500 text-white hover:bg-green-600 cursor-pointer'
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
                  {index !== WIZARD_STEPS.length - 1 && (
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
