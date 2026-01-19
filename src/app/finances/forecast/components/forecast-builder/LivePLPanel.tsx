'use client';

import { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Users,
  Building2,
  Rocket,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import type { UseForecastBuilderReturn, BuilderStep } from './hooks/useForecastBuilder';

interface LivePLPanelProps {
  builder: UseForecastBuilderReturn;
}

// Format currency
function formatCurrency(amount: number, compact = false): string {
  if (compact && Math.abs(amount) >= 1000000) {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  }
  if (compact && Math.abs(amount) >= 1000) {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      notation: 'compact',
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Step indicator
function StepIndicator({ step, currentStep, completedSteps }: {
  step: BuilderStep;
  currentStep: BuilderStep;
  completedSteps: BuilderStep[];
}) {
  const isCompleted = completedSteps.includes(step);
  const isCurrent = step === currentStep;

  const stepLabels: Record<BuilderStep, string> = {
    goals: 'Goals',
    baseline: 'Baseline',
    team: 'Team',
    investments: 'Invest',
    review: 'Review',
  };

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
      isCompleted
        ? 'bg-brand-navy-100 text-brand-navy'
        : isCurrent
          ? 'bg-brand-orange-100 text-brand-orange'
          : 'bg-gray-100 text-gray-500'
    }`}>
      {isCompleted && <CheckCircle2 className="w-3 h-3" />}
      {stepLabels[step]}
    </div>
  );
}

// Collapsible section
function Section({
  title,
  icon: Icon,
  amount,
  isHighlighted,
  children,
  defaultExpanded = false,
}: {
  title: string;
  icon: React.ElementType;
  amount: number;
  isHighlighted?: boolean;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const hasChildren = !!children;

  return (
    <div className={`rounded-lg border transition-colors ${
      isHighlighted ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
    }`}>
      <button
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between p-3 ${hasChildren ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'}`}
        disabled={!hasChildren}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${isHighlighted ? 'text-amber-600' : 'text-gray-500'}`} />
          <span className="text-sm font-medium text-gray-700">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatCurrency(amount)}
          </span>
          {hasChildren && (
            isExpanded
              ? <ChevronDown className="w-4 h-4 text-gray-400" />
              : <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>
      {isExpanded && children && (
        <div className="px-3 pb-3 pt-0 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

export function LivePLPanel({ builder }: LivePLPanelProps) {
  const { state, calculations } = builder;
  const { targets } = state;

  // Calculate expense budget
  const expenseBudget = targets.revenue - targets.netProfit;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header - The Formula */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 p-4">
        <div className="text-center mb-3">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            The Formula
          </div>
          <div className="flex items-center justify-center gap-2 text-lg">
            <span className="font-semibold text-gray-900">{formatCurrency(targets.revenue, true)}</span>
            <span className="text-gray-400">−</span>
            <span className="font-semibold text-brand-navy">{formatCurrency(targets.netProfit, true)}</span>
            <span className="text-gray-400">=</span>
            <span className="font-semibold text-gray-700">{formatCurrency(expenseBudget, true)}</span>
          </div>
          <div className="flex items-center justify-center gap-6 text-xs text-gray-500 mt-1">
            <span>Revenue</span>
            <span>Profit</span>
            <span>Expense Budget</span>
          </div>
        </div>

        {/* Budget Progress */}
        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600">Expense Budget Used</span>
            <span className={`font-medium ${
              calculations.budgetUsedPercent > 100 ? 'text-red-600' : 'text-gray-700'
            }`}>
              {formatCurrency(calculations.totalExpenses)} of {formatCurrency(expenseBudget)}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                calculations.budgetUsedPercent > 100
                  ? 'bg-red-500'
                  : calculations.budgetUsedPercent > 85
                    ? 'bg-amber-500'
                    : 'bg-brand-navy'
              }`}
              style={{ width: `${Math.min(calculations.budgetUsedPercent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className={`font-medium ${calculations.budgetRemaining >= 0 ? 'text-brand-navy' : 'text-red-600'}`}>
              {calculations.budgetRemaining >= 0 ? 'Buffer: ' : 'Over budget: '}
              {formatCurrency(Math.abs(calculations.budgetRemaining))}
            </span>
            <span className="text-gray-500">
              {calculations.budgetUsedPercent.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Step Progress */}
      <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between gap-1">
          {(['goals', 'baseline', 'team', 'investments', 'review'] as BuilderStep[]).map(step => (
            <StepIndicator
              key={step}
              step={step}
              currentStep={state.currentStep}
              completedSteps={state.completedSteps}
            />
          ))}
        </div>
      </div>

      {/* P&L Breakdown */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Revenue */}
        <Section
          title="Revenue"
          icon={TrendingUp}
          amount={targets.revenue}
          isHighlighted={state.currentStep === 'goals'}
        />

        {/* COGS */}
        <Section
          title="Cost of Goods Sold"
          icon={TrendingDown}
          amount={-calculations.forecastCOGS}
          isHighlighted={state.currentStep === 'baseline'}
        >
          <div className="mt-2 text-xs text-gray-500">
            {calculations.cogsPercent.toFixed(0)}% of revenue (based on prior year)
          </div>
        </Section>

        {/* Gross Profit Line */}
        <div className="flex items-center justify-between py-2 px-3 bg-gray-100 rounded-lg">
          <span className="text-sm font-semibold text-gray-700">Gross Profit</span>
          <div className="text-right">
            <span className="text-sm font-bold text-gray-900">{formatCurrency(calculations.grossProfit)}</span>
            <span className="text-xs text-gray-500 ml-2">({calculations.grossProfitPercent.toFixed(0)}%)</span>
          </div>
        </div>

        {/* Team Costs */}
        <Section
          title="Team Costs"
          icon={Users}
          amount={-calculations.totalTeamCosts}
          isHighlighted={state.currentStep === 'team'}
          defaultExpanded={state.currentStep === 'team'}
        >
          <div className="mt-2 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Existing team ({state.team.existingMembers.length})</span>
              <span className="text-gray-700">
                {formatCurrency(
                  state.team.existingMembers.reduce((sum, m) => sum + m.annualSalary, 0) *
                  (1 + state.team.salaryIncreasePercent / 100)
                )}
              </span>
            </div>
            {state.team.plannedHires.length > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-brand-orange">+ New hires ({state.team.plannedHires.length})</span>
                <span className="text-brand-orange-700">
                  {formatCurrency(state.team.plannedHires.reduce((sum, h) => sum + h.annualSalary, 0))}
                </span>
              </div>
            )}
            <div className="text-xs text-gray-500 pt-1 border-t border-gray-100">
              {state.team.salaryIncreasePercent}% salary increase applied
            </div>
          </div>
        </Section>

        {/* Operating Expenses */}
        <Section
          title="Operating Expenses"
          icon={Building2}
          amount={-calculations.totalOpEx}
          isHighlighted={state.currentStep === 'baseline'}
          defaultExpanded={state.currentStep === 'baseline'}
        >
          <div className="mt-2 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Prior year baseline</span>
              <span className="text-gray-700">{formatCurrency(state.baseline.priorYearOpEx)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">+ Inflation adjustment ({state.baseline.opExInflationPercent}%)</span>
              <span className="text-gray-700">
                {formatCurrency(state.baseline.priorYearOpEx * (state.baseline.opExInflationPercent / 100))}
              </span>
            </div>
          </div>
        </Section>

        {/* Investments */}
        <Section
          title="Strategic Investments"
          icon={Rocket}
          amount={-calculations.totalInvestments}
          isHighlighted={state.currentStep === 'investments'}
          defaultExpanded={state.currentStep === 'investments'}
        >
          {state.investments.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {state.investments.map(inv => (
                <div key={inv.id} className="flex justify-between text-xs">
                  <span className="text-gray-600">{inv.name}</span>
                  <span className="text-gray-700">{formatCurrency(inv.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-gray-500">No investments added yet</div>
          )}
        </Section>

        {/* Net Profit Line */}
        <div className={`flex items-center justify-between py-3 px-4 rounded-lg ${
          calculations.isOnTrack ? 'bg-brand-navy-100' : 'bg-red-100'
        }`}>
          <div className="flex items-center gap-2">
            {calculations.isOnTrack ? (
              <CheckCircle2 className="w-5 h-5 text-brand-navy" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600" />
            )}
            <span className="text-sm font-semibold text-gray-900">Net Profit</span>
          </div>
          <div className="text-right">
            <span className={`text-lg font-bold ${calculations.isOnTrack ? 'text-brand-navy' : 'text-red-700'}`}>
              {formatCurrency(calculations.projectedProfit)}
            </span>
            <div className="text-xs mt-0.5">
              <span className={calculations.profitVariance >= 0 ? 'text-brand-navy' : 'text-red-600'}>
                {calculations.profitVariance >= 0 ? '+' : ''}
                {formatCurrency(calculations.profitVariance)} vs target
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Target Summary */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Profit Target</span>
          <span className="font-semibold text-gray-900">{formatCurrency(targets.netProfit)}</span>
        </div>
        <div className={`text-xs mt-1 ${calculations.isOnTrack ? 'text-brand-navy' : 'text-red-600'}`}>
          {calculations.isOnTrack
            ? `On track with ${formatCurrency(calculations.budgetRemaining)} buffer`
            : `Over budget by ${formatCurrency(Math.abs(calculations.budgetRemaining))}`
          }
        </div>
      </div>
    </div>
  );
}
