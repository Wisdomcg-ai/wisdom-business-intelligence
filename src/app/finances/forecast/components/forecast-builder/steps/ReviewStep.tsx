'use client';

import {
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Users,
  Building2,
  Rocket,
  Target,
} from 'lucide-react';
import type { UseForecastBuilderReturn } from '../hooks/useForecastBuilder';

interface ReviewStepProps {
  builder: UseForecastBuilderReturn;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ReviewStep({ builder }: ReviewStepProps) {
  const { state, calculations } = builder;
  const { targets, team, investments, baseline } = state;

  const expenseBudget = targets.revenue - targets.netProfit;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Target className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Step 5: Review & Save</h2>
        </div>
        <p className="text-gray-600 text-sm">
          Here's your complete forecast. Let's make sure everything looks right.
        </p>
      </div>

      {/* Status Banner */}
      <div className={`rounded-xl p-4 mb-6 ${
        calculations.isOnTrack ? 'bg-brand-navy-100 border border-brand-navy-200' : 'bg-red-50 border border-red-200'
      }`}>
        <div className="flex items-start gap-3">
          {calculations.isOnTrack ? (
            <CheckCircle2 className="w-6 h-6 text-brand-navy flex-shrink-0" />
          ) : (
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
          )}
          <div>
            <div className={`font-semibold ${calculations.isOnTrack ? 'text-brand-navy' : 'text-red-800'}`}>
              {calculations.isOnTrack
                ? 'Your forecast is on track!'
                : 'Your forecast exceeds your expense budget'}
            </div>
            <div className={`text-sm mt-1 ${calculations.isOnTrack ? 'text-brand-navy-700' : 'text-red-700'}`}>
              {calculations.isOnTrack
                ? `You have ${formatCurrency(calculations.budgetRemaining)} buffer within your expense budget.`
                : `You're ${formatCurrency(Math.abs(calculations.budgetRemaining))} over your expense budget.`}
            </div>
          </div>
        </div>
      </div>

      {/* The Formula Recap */}
      <div className="bg-gray-900 text-white rounded-xl p-4 mb-6">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 text-center">
          Revenue − Profit = Expense Budget
        </div>
        <div className="flex items-center justify-center gap-3 text-center">
          <div>
            <div className="text-xl font-bold">{formatCurrency(targets.revenue)}</div>
            <div className="text-xs text-gray-400">Revenue</div>
          </div>
          <div className="text-gray-500 text-xl">−</div>
          <div>
            <div className="text-xl font-bold text-brand-orange">{formatCurrency(targets.netProfit)}</div>
            <div className="text-xs text-gray-400">Profit</div>
          </div>
          <div className="text-gray-500 text-xl">=</div>
          <div>
            <div className="text-xl font-bold">{formatCurrency(expenseBudget)}</div>
            <div className="text-xs text-gray-400">Budget</div>
          </div>
        </div>
      </div>

      {/* P&L Summary */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 mb-6">
        {/* Revenue */}
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-700">Revenue</span>
          </div>
          <span className="font-semibold text-gray-900">{formatCurrency(targets.revenue)}</span>
        </div>

        {/* COGS */}
        <div className="flex items-center justify-between p-3 bg-gray-50">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-700">Cost of Goods Sold ({calculations.cogsPercent.toFixed(0)}%)</span>
          </div>
          <span className="text-gray-700">({formatCurrency(calculations.forecastCOGS)})</span>
        </div>

        {/* Gross Profit */}
        <div className="flex items-center justify-between p-3">
          <span className="text-sm font-semibold text-gray-900">Gross Profit</span>
          <div className="text-right">
            <span className="font-semibold text-gray-900">{formatCurrency(calculations.grossProfit)}</span>
            <span className="text-xs text-gray-500 ml-2">({calculations.grossProfitPercent.toFixed(0)}%)</span>
          </div>
        </div>

        {/* Team Costs */}
        <div className="flex items-center justify-between p-3 bg-gray-50">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-700">
              Team ({team.existingMembers.length} existing + {team.plannedHires.length} new)
            </span>
          </div>
          <span className="text-gray-700">({formatCurrency(calculations.totalTeamCosts)})</span>
        </div>

        {/* Operating Expenses */}
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-700">Operating Expenses (+{baseline.opExInflationPercent}% inflation)</span>
          </div>
          <span className="text-gray-700">({formatCurrency(calculations.totalOpEx)})</span>
        </div>

        {/* Investments */}
        {calculations.totalInvestments > 0 && (
          <div className="flex items-center justify-between p-3 bg-gray-50">
            <div className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">Strategic Investments ({investments.length})</span>
            </div>
            <span className="text-gray-700">({formatCurrency(calculations.totalInvestments)})</span>
          </div>
        )}

        {/* Net Profit */}
        <div className={`flex items-center justify-between p-4 ${
          calculations.isOnTrack ? 'bg-brand-navy-100' : 'bg-red-50'
        }`}>
          <span className="font-semibold text-gray-900">Net Profit</span>
          <div className="text-right">
            <span className={`text-xl font-bold ${
              calculations.isOnTrack ? 'text-brand-navy' : 'text-red-600'
            }`}>
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

      {/* Budget Summary */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Expense Budget</span>
          <span className="font-semibold text-gray-900">{formatCurrency(expenseBudget)}</span>
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-gray-600">Total Expenses</span>
          <span className="font-semibold text-gray-900">{formatCurrency(calculations.totalExpenses)}</span>
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
        <div className="flex justify-between items-center mt-2 text-sm">
          <span className={calculations.budgetRemaining >= 0 ? 'text-brand-navy' : 'text-red-600'}>
            {calculations.budgetRemaining >= 0 ? 'Buffer: ' : 'Over: '}
            <strong>{formatCurrency(Math.abs(calculations.budgetRemaining))}</strong>
          </span>
          <span className="text-gray-500">
            {calculations.budgetUsedPercent.toFixed(0)}% used
          </span>
        </div>
      </div>

      {/* Actions if over budget */}
      {!calculations.isOnTrack && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="text-sm text-amber-800">
            <strong>To hit your profit target, you could:</strong>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Reduce team costs by adjusting salary increases or deferring hires</li>
              <li>Lower operating expense inflation assumption</li>
              <li>Remove or defer some investments</li>
              <li>Increase your revenue target</li>
            </ul>
          </div>
        </div>
      )}

      {/* Ready to save */}
      {calculations.isOnTrack && (
        <div className="p-4 bg-brand-navy-100 border border-brand-navy-200 rounded-xl">
          <div className="text-sm text-brand-navy">
            <strong>Your forecast is ready to save.</strong>
            <p className="mt-1">
              Click "Save Forecast" to save this as your FY{state.fiscalYear} financial plan.
              You can always come back and adjust it later.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
