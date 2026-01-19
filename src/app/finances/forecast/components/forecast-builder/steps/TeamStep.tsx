'use client';

import { Users, TrendingUp, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import type { UseForecastBuilderReturn } from '../hooks/useForecastBuilder';

interface TeamStepProps {
  builder: UseForecastBuilderReturn;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function TeamStep({ builder }: TeamStepProps) {
  const { state, calculations, actions } = builder;
  const { team } = state;

  // Calculate team stats
  const existingTeamCost = team.existingMembers.reduce(
    (sum, m) => sum + m.annualSalary * (1 + team.salaryIncreasePercent / 100),
    0
  );
  const newHiresCost = team.plannedHires.reduce((sum, h) => sum + h.annualSalary, 0);
  const totalTeamCost = existingTeamCost + newHiresCost;

  const teamCountCOGS = team.existingMembers.filter(m => m.classification === 'cogs').length +
    team.plannedHires.filter(h => h.classification === 'cogs').length;
  const teamCountOpEx = team.existingMembers.filter(m => m.classification === 'opex').length +
    team.plannedHires.filter(h => h.classification === 'opex').length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Users className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Step 3: Team Planning</h2>
        </div>
        <p className="text-gray-600 text-sm">
          Review your team costs and plan any new hires for FY{state.fiscalYear}.
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-brand-navy-100 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <ArrowRight className="w-5 h-5 text-brand-navy flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-brand-navy mb-1">Use the table on the right</div>
            <p className="text-sm text-brand-navy-700">
              Add and edit your team members in the table. You can:
            </p>
            <ul className="text-sm text-brand-navy-700 mt-2 space-y-1 list-disc list-inside">
              <li>Add current team members (or they'll import from Xero)</li>
              <li>Set start and end dates for each person</li>
              <li>Plan new hires with future start dates</li>
              <li>Classify each role as OpEx or COGS</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="space-y-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Current Team</span>
            <span className="text-lg font-semibold text-gray-900">
              {team.existingMembers.length} people
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Total Cost (with {team.salaryIncreasePercent}% increase)</span>
            <span className="font-medium text-gray-900">{formatCurrency(existingTeamCost)}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Planned Hires</span>
            <span className="text-lg font-semibold text-brand-orange">
              {team.plannedHires.length} new
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Additional Cost</span>
            <span className="font-medium text-brand-orange">{formatCurrency(newHiresCost)}</span>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-900">Total Team Cost</span>
            <span className="text-xl font-bold text-gray-900">{formatCurrency(totalTeamCost)}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>{teamCountOpEx} OpEx roles</span>
            <span>{teamCountCOGS} COGS roles</span>
          </div>
        </div>
      </div>

      {/* Salary Increase Slider */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-medium text-gray-700">Annual Salary Increase</div>
            <div className="text-xs text-gray-500">Applied to all current team members</div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-brand-navy">{team.salaryIncreasePercent}%</span>
          </div>
        </div>
        <input
          type="range"
          min="0"
          max="15"
          value={team.salaryIncreasePercent}
          onChange={(e) => actions.setSalaryIncrease(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0%</span>
          <span>5%</span>
          <span>10%</span>
          <span>15%</span>
        </div>
      </div>

      {/* Budget Status */}
      <div className={`rounded-xl p-4 ${
        calculations.isOnTrack
          ? 'bg-brand-navy-100 border border-brand-navy-200'
          : 'bg-red-50 border border-red-200'
      }`}>
        <div className="flex items-start gap-3">
          {calculations.isOnTrack ? (
            <CheckCircle2 className="w-5 h-5 text-brand-navy flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          )}
          <div>
            <div className={`font-medium ${calculations.isOnTrack ? 'text-brand-navy' : 'text-red-800'}`}>
              {calculations.isOnTrack ? 'On Track' : 'Over Budget'}
            </div>
            <p className={`text-sm ${calculations.isOnTrack ? 'text-brand-navy-700' : 'text-red-700'}`}>
              {calculations.isOnTrack
                ? `You have ${formatCurrency(calculations.budgetRemaining)} remaining in your expense budget.`
                : `You're ${formatCurrency(Math.abs(calculations.budgetRemaining))} over budget. Consider reducing team costs or planned hires.`
              }
            </p>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="mt-6 p-4 bg-blue-50 rounded-xl">
        <div className="text-sm text-blue-800">
          <strong>Tip:</strong> The salary increase applies to your current team's base salaries.
          New hires are entered at their full starting salary without the increase.
        </div>
      </div>
    </div>
  );
}
