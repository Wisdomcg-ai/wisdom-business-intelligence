'use client';

import { CheckCircle2, AlertCircle, TrendingUp, TrendingDown, Users, Building2, Rocket } from 'lucide-react';
import type { UseForecastCFOReturn, CFOStep } from './hooks/useForecastCFO';

interface BudgetTrackerProps {
  cfo: UseForecastCFOReturn;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

const STEP_LABELS: Record<CFOStep, string> = {
  goals: 'Confirm Goals',
  baseline: 'Prior Year',
  team: 'Team Planning',
  investments: 'Investments',
  review: 'Review & Save',
};

const STEPS: CFOStep[] = ['goals', 'baseline', 'team', 'investments', 'review'];

export function BudgetTracker({ cfo }: BudgetTrackerProps) {
  const { state, calculations } = cfo;
  const { targets } = state;

  const expenseBudget = targets.revenue - targets.netProfit;

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      {/* Header - The Formula */}
      <div className="flex-shrink-0 bg-gray-900 text-white p-4">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 text-center">
          Your Budget Constraint
        </div>
        <div className="flex items-center justify-center gap-2 text-lg">
          <div className="text-center">
            <div className="font-semibold">{formatCurrency(targets.revenue)}</div>
            <div className="text-xs text-gray-400">Revenue</div>
          </div>
          <span className="text-gray-500">−</span>
          <div className="text-center">
            <div className="font-semibold text-brand-orange">{formatCurrency(targets.netProfit)}</div>
            <div className="text-xs text-gray-400">Profit</div>
          </div>
          <span className="text-gray-500">=</span>
          <div className="text-center">
            <div className="font-semibold">{formatCurrency(expenseBudget)}</div>
            <div className="text-xs text-gray-400">Budget</div>
          </div>
        </div>
      </div>

      {/* Budget Progress */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-600">Budget Used</span>
          <span className="font-semibold text-gray-900">
            {formatCurrency(calculations.budgetUsed)} of {formatCurrency(expenseBudget)}
          </span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
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
            {calculations.budgetRemaining >= 0 ? 'Remaining: ' : 'Over by: '}
            {formatCurrency(Math.abs(calculations.budgetRemaining))}
          </span>
          <span className="text-gray-500">
            {calculations.budgetUsedPercent.toFixed(0)}% used
          </span>
        </div>
      </div>

      {/* Expense Breakdown */}
      <div className="flex-1 overflow-auto p-4">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Where Your Budget Goes
        </div>

        <div className="space-y-3">
          {/* COGS */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700">Cost of Goods ({calculations.grossProfitPercent > 0 ? (100 - calculations.grossProfitPercent).toFixed(0) : state.baseline.cogsPercent}%)</span>
            </div>
            <span className="text-sm font-medium text-gray-900">{formatCurrency(calculations.forecastCOGS)}</span>
          </div>

          {/* Team */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <div>
                <span className="text-sm text-gray-700">Team Costs</span>
                <span className="text-xs text-gray-500 ml-1">
                  ({state.team.members.length + state.team.newHires.length} people)
                </span>
              </div>
            </div>
            <span className="text-sm font-medium text-gray-900">{formatCurrency(calculations.totalTeamCost)}</span>
          </div>

          {/* OpEx */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700">Operating Expenses (+{state.baseline.opExInflation}%)</span>
            </div>
            <span className="text-sm font-medium text-gray-900">{formatCurrency(calculations.opExCost)}</span>
          </div>

          {/* Investments */}
          {calculations.investmentCost > 0 && (
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Rocket className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">Investments ({state.investments.length})</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{formatCurrency(calculations.investmentCost)}</span>
            </div>
          )}
        </div>

        {/* Net Profit Result */}
        <div className={`mt-4 p-3 rounded-lg ${
          calculations.isOnTrack ? 'bg-brand-navy-100' : 'bg-red-100'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {calculations.isOnTrack ? (
                <CheckCircle2 className="w-5 h-5 text-brand-navy" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              <span className="text-sm font-semibold text-gray-900">Net Profit</span>
            </div>
            <div className="text-right">
              <span className={`text-lg font-bold ${calculations.isOnTrack ? 'text-brand-navy' : 'text-red-600'}`}>
                {formatCurrency(calculations.projectedProfit)}
              </span>
            </div>
          </div>
          <div className={`text-xs mt-1 ${calculations.isOnTrack ? 'text-brand-navy' : 'text-red-600'}`}>
            {calculations.isOnTrack
              ? `+${formatCurrency(calculations.profitVariance)} above target`
              : `${formatCurrency(Math.abs(calculations.profitVariance))} below target`
            }
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Progress
        </div>
        <div className="space-y-2">
          {STEPS.map((step, index) => {
            const isActive = state.step === step;
            const isCompleted = STEPS.indexOf(state.step) > index;

            return (
              <div key={step} className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                  isCompleted
                    ? 'bg-brand-navy text-white'
                    : isActive
                      ? 'bg-brand-orange text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}>
                  {isCompleted ? '✓' : index + 1}
                </div>
                <span className={`text-sm ${
                  isActive ? 'text-gray-900 font-medium' : 'text-gray-500'
                }`}>
                  {STEP_LABELS[step]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
