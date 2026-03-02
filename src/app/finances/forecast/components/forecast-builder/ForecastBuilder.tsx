'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Check, Loader2, ArrowRight, ArrowLeft } from 'lucide-react';
import { useForecastBuilder, BuilderStep } from './hooks/useForecastBuilder';
import { LivePLPanel } from './LivePLPanel';
import { TeamPanel } from './TeamPanel';

// Step components
import { GoalsStep } from './steps/GoalsStep';
import { BaselineStep } from './steps/BaselineStep';
import { TeamStep } from './steps/TeamStep';
import { InvestmentsStep } from './steps/InvestmentsStep';
import { ReviewStep } from './steps/ReviewStep';

interface ForecastBuilderProps {
  businessId: string;
  businessName?: string;
  fiscalYear: number;
  onComplete?: (forecastId: string) => void;
  onClose?: () => void;
}

const STEP_ORDER: BuilderStep[] = ['goals', 'baseline', 'team', 'investments', 'review'];

const STEP_LABELS: Record<BuilderStep, string> = {
  goals: 'Goals',
  baseline: 'Prior Year',
  team: 'Team',
  investments: 'Investments',
  review: 'Review',
};

export function ForecastBuilder({
  businessId,
  businessName,
  fiscalYear,
  onComplete,
  onClose,
}: ForecastBuilderProps) {
  const builder = useForecastBuilder(fiscalYear);
  const { state, actions, calculations } = builder;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch all data in parallel
        const [goalsRes, plRes, teamRes] = await Promise.all([
          fetch(`/api/goals?business_id=${businessId}&fiscal_year=${fiscalYear}`),
          fetch(`/api/Xero/pl-summary?business_id=${businessId}&fiscal_year=${fiscalYear}`),
          fetch(`/api/Xero/employees?business_id=${businessId}`),
        ]);

        const [goalsData, plData, teamData] = await Promise.all([
          goalsRes.json(),
          plRes.json(),
          teamRes.json(),
        ]);

        // Initialize builder with loaded data
        actions.initializeFromData({
          goals: goalsData.goals || {},
          priorYearPL: plData.summary || {},
          team: (teamData.employees || []).map((emp: {
            EmployeeID?: string;
            FirstName?: string;
            LastName?: string;
            JobTitle?: string;
            StartDate?: string;
            TerminationDate?: string;
            OrdinaryEarningsRateID?: string;
            PayrollCalendarID?: string;
            Status?: string;
            annualSalary?: number;
            hourlyRate?: number;
            hoursPerWeek?: number;
          }) => {
            // Calculate annual salary if available
            let annualSalary = emp.annualSalary || 0;
            if (!annualSalary && emp.hourlyRate && emp.hoursPerWeek) {
              annualSalary = emp.hourlyRate * emp.hoursPerWeek * 52;
            }
            if (!annualSalary) {
              annualSalary = 80000; // Default fallback
            }

            // Format dates if available
            let startDate: string | undefined;
            if (emp.StartDate) {
              const date = new Date(emp.StartDate);
              startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }

            let endDate: string | undefined;
            if (emp.TerminationDate) {
              const date = new Date(emp.TerminationDate);
              endDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }

            return {
              id: emp.EmployeeID || `emp-${Date.now()}-${Math.random()}`,
              name: `${emp.FirstName || ''} ${emp.LastName || ''}`.trim() || 'Unknown',
              position: emp.JobTitle || 'Team Member',
              annualSalary,
              startDate,
              endDate,
              classification: 'opex' as const, // Default to OpEx, user can change
              isFromXero: true,
              xeroEmployeeId: emp.EmployeeID,
            };
          }),
        });
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('Failed to load business data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [businessId, fiscalYear, actions]);

  // Handle save forecast
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/forecast-wizard/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          fiscalYear,
          state: state,
          calculations,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        onComplete?.(result.forecastId);
      } else {
        throw new Error('Failed to save forecast');
      }
    } catch (err) {
      console.error('Failed to save:', err);
      setError('Failed to save forecast. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [businessId, fiscalYear, state, calculations, onComplete]);

  // Navigation
  const currentIndex = STEP_ORDER.indexOf(state.currentStep);
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < STEP_ORDER.length - 1;
  const isLastStep = currentIndex === STEP_ORDER.length - 1;

  const goBack = () => {
    if (canGoBack) {
      actions.goToStep(STEP_ORDER[currentIndex - 1]);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-600">Loading your business data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0 bg-white">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-semibold text-gray-900">Build Your Forecast</h1>
            <p className="text-xs text-gray-500">
              {businessName || 'Your Business'} - FY{fiscalYear}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Step indicator */}
          <div className="hidden sm:flex items-center gap-1 text-sm">
            {STEP_ORDER.map((step, idx) => (
              <div key={step} className="flex items-center">
                <button
                  onClick={() => actions.goToStep(step)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    step === state.currentStep
                      ? 'bg-brand-navy text-white'
                      : state.completedSteps.includes(step)
                        ? 'bg-brand-navy-100 text-brand-navy hover:bg-brand-navy-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {STEP_LABELS[step]}
                </button>
                {idx < STEP_ORDER.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-gray-300 mx-1" />
                )}
              </div>
            ))}
          </div>

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main content - 2 panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Step Content (40%) */}
        <div className="w-[40%] min-w-[380px] max-w-[500px] border-r border-gray-200 flex flex-col bg-white">
          {/* Step content */}
          <div className="flex-1 overflow-y-auto">
            {state.currentStep === 'goals' && (
              <GoalsStep builder={builder} />
            )}
            {state.currentStep === 'baseline' && (
              <BaselineStep builder={builder} />
            )}
            {state.currentStep === 'team' && (
              <TeamStep builder={builder} />
            )}
            {state.currentStep === 'investments' && (
              <InvestmentsStep builder={builder} />
            )}
            {state.currentStep === 'review' && (
              <ReviewStep builder={builder} />
            )}
          </div>

          {/* Navigation footer */}
          <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <button
                onClick={goBack}
                disabled={!canGoBack}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              {isLastStep ? (
                <button
                  onClick={handleSave}
                  disabled={isSaving || !calculations.isOnTrack}
                  className="flex items-center gap-2 px-6 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save Forecast
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={actions.nextStep}
                  className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Contextual (60%) */}
        <div className="flex-1 min-w-0">
          {state.currentStep === 'team' ? (
            <TeamPanel builder={builder} fiscalYear={fiscalYear} />
          ) : (
            <LivePLPanel builder={builder} />
          )}
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          {error}
          <button
            onClick={() => setError(null)}
            className="text-white/80 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
