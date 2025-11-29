'use client';

import { useState, useEffect } from 'react';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, QuarterlyTargets, InitiativesChanges, Rock } from '../../types';
import { getDefaultInitiativesChanges } from '../../types';
import { Target, Lightbulb } from 'lucide-react';

// Import from Goals Wizard
import { useStrategicPlanning } from '@/app/goals/hooks/useStrategicPlanning';
import { determinePlanYear } from '@/app/goals/utils/quarters';

// Import the actual Step4 component from Goals Wizard
import Step4AnnualPlan from '@/app/goals/components/Step4AnnualPlan';

interface QuarterlyResetStepProps {
  review: QuarterlyReview;
  onUpdateTargets: (targets: QuarterlyTargets) => void;
  onUpdateInitiatives: (changes: InitiativesChanges) => void;
  onUpdateRocks: (rocks: Rock[]) => void;
}

export function QuarterlyResetStep({
  review,
  onUpdateInitiatives,
  onUpdateRocks
}: QuarterlyResetStepProps) {
  const {
    isLoading,
    financialData,
    coreMetrics,
    kpis,
    yearType,
    quarterlyTargets,
    setQuarterlyTargets,
    twelveMonthInitiatives,
    annualPlanByQuarter,
    setAnnualPlanByQuarter,
    businessId
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        <span className="ml-3 text-gray-600">Loading strategic planning data...</span>
      </div>
    );
  }

  if (!financialData) {
    return (
      <div>
        <StepHeader
          step="4.1"
          subtitle="Set quarterly targets and assign initiatives"
          estimatedTime={30}
          tip="Changes sync automatically with your Goals Wizard"
        />
        <div className="text-center py-12 text-gray-500">
          <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No financial data available</p>
          <p className="text-sm mt-2">Please complete Step 1 of the Goals Wizard first.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        step="4.1"
        subtitle="Set quarterly targets and assign initiatives"
        estimatedTime={30}
        tip="Changes sync automatically with your Goals Wizard"
      />

      {/* Planning Context */}
      <div className="bg-gradient-to-r from-teal-50 to-teal-100 rounded-lg border border-teal-200 p-4 mb-6">
        <div className="flex items-center gap-3">
          <Lightbulb className="w-5 h-5 text-teal-600" />
          <span className="text-sm text-gray-700">
            <span className="font-semibold text-teal-700">{yearType} {planYear}</span>
            <span className="mx-2">•</span>
            Data synced with Goals Wizard
          </span>
        </div>
      </div>

      {/* Step4 Annual Plan - Quarterly Targets & Execution */}
      <Step4AnnualPlan
        twelveMonthInitiatives={twelveMonthInitiatives}
        annualPlanByQuarter={annualPlanByQuarter}
        setAnnualPlanByQuarter={setAnnualPlanByQuarter}
        quarterlyTargets={quarterlyTargets}
        setQuarterlyTargets={setQuarterlyTargets}
        financialData={financialData}
        coreMetrics={coreMetrics}
        kpis={kpis}
        yearType={yearType}
        businessId={businessId || ''}
      />
    </div>
  );
}
