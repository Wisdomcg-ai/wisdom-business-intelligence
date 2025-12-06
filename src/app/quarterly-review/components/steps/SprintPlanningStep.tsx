'use client';

import { useState, useEffect } from 'react';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, InitiativesChanges, Rock } from '../../types';
import { getDefaultInitiativesChanges } from '../../types';
import { Lightbulb, Calendar } from 'lucide-react';

// Import from Goals Wizard
import { useStrategicPlanning } from '@/app/goals/hooks/useStrategicPlanning';
import { determinePlanYear } from '@/app/goals/utils/quarters';

// Import the actual Step5 component from Goals Wizard
import Step5SprintPlanning from '@/app/goals/components/Step5SprintPlanning';

interface SprintPlanningStepProps {
  review: QuarterlyReview;
  onUpdateInitiatives: (changes: InitiativesChanges) => void;
  onUpdateRocks: (rocks: Rock[]) => void;
}

export function SprintPlanningStep({
  review,
  onUpdateInitiatives,
  onUpdateRocks
}: SprintPlanningStepProps) {
  const {
    isLoading,
    financialData,
    coreMetrics,
    kpis,
    yearType,
    quarterlyTargets,
    annualPlanByQuarter,
    setAnnualPlanByQuarter,
    businessId,
    operationalActivities,
    setOperationalActivities
  } = useStrategicPlanning();

  const [localChanges] = useState<InitiativesChanges>(
    review.initiatives_changes || getDefaultInitiativesChanges()
  );
  const [localRocks] = useState<Rock[]>(review.quarterly_rocks || []);

  const planYear = determinePlanYear(yearType);

  useEffect(() => {
    onUpdateInitiatives(localChanges);
  }, [localChanges, onUpdateInitiatives]);

  useEffect(() => {
    onUpdateRocks(localRocks);
  }, [localRocks, onUpdateRocks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-orange"></div>
        <span className="ml-3 text-gray-600">Loading strategic planning data...</span>
      </div>
    );
  }

  if (!financialData) {
    return (
      <div>
        <StepHeader
          step="4.2"
          subtitle="Monthly goals, initiatives & operational planning"
          estimatedTime={30}
          tip="Break down quarterly targets into actionable monthly and weekly plans"
        />
        <div className="text-center py-12 text-gray-500">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No financial data available</p>
          <p className="text-sm mt-2">Please complete Step 1 of the Goals Wizard first.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        step="4.2"
        subtitle="Monthly goals, initiatives & operational planning"
        estimatedTime={30}
        tip="Break down quarterly targets into actionable monthly and weekly plans"
      />

      {/* Planning Context */}
      <div className="bg-gradient-to-r from-brand-orange-50 to-brand-orange-100 rounded-lg border border-brand-orange-200 p-4 mb-6">
        <div className="flex items-center gap-3">
          <Lightbulb className="w-5 h-5 text-brand-orange" />
          <span className="text-sm text-gray-700">
            <span className="font-semibold text-brand-orange-700">{yearType} {planYear}</span>
            <span className="mx-2">•</span>
            Data synced with Goals Wizard
          </span>
        </div>
      </div>

      {/* Step 5 Sprint Planning Component */}
      <Step5SprintPlanning
        annualPlanByQuarter={annualPlanByQuarter}
        setAnnualPlanByQuarter={setAnnualPlanByQuarter}
        quarterlyTargets={quarterlyTargets}
        financialData={financialData}
        coreMetrics={coreMetrics}
        kpis={kpis}
        yearType={yearType}
        businessId={businessId || ''}
        operationalActivities={operationalActivities}
        setOperationalActivities={setOperationalActivities}
      />
    </div>
  );
}
