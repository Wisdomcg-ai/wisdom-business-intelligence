'use client';

import { useState } from 'react';
import { Target, TrendingUp, DollarSign, Percent, CheckCircle2, Edit2 } from 'lucide-react';
import type { UseForecastBuilderReturn } from '../hooks/useForecastBuilder';

interface GoalsStepProps {
  builder: UseForecastBuilderReturn;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function GoalsStep({ builder }: GoalsStepProps) {
  const { state, actions, calculations } = builder;
  const { targets } = state;

  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    revenue: targets.revenue,
    netProfit: targets.netProfit,
  });

  // Calculate expense budget
  const expenseBudget = targets.revenue - targets.netProfit;
  const profitMargin = targets.revenue > 0 ? (targets.netProfit / targets.revenue) * 100 : 0;

  const handleSaveEdit = () => {
    actions.setTargets({
      revenue: editValues.revenue,
      netProfit: editValues.netProfit,
    });
    setIsEditing(false);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Target className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Step 1: Confirm Your Targets</h2>
        </div>
        <p className="text-gray-600 text-sm">
          These are your goals for FY{state.fiscalYear}. Everything we build works backwards from these numbers.
        </p>
      </div>

      {/* The Formula - Visual Explanation */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3 text-center">
          The CFO Framework
        </div>
        <div className="flex items-center justify-center gap-3 text-center">
          <div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(targets.revenue)}</div>
            <div className="text-xs text-gray-500">Revenue</div>
          </div>
          <div className="text-gray-400 text-xl">−</div>
          <div>
            <div className="text-xl font-bold text-brand-navy">{formatCurrency(targets.netProfit)}</div>
            <div className="text-xs text-gray-500">Profit</div>
          </div>
          <div className="text-gray-400 text-xl">=</div>
          <div>
            <div className="text-xl font-bold text-gray-700">{formatCurrency(expenseBudget)}</div>
            <div className="text-xs text-gray-500">Expense Budget</div>
          </div>
        </div>
        <div className="text-center mt-3 text-xs text-gray-500">
          This is your constraint. Every expense must fit within this budget.
        </div>
      </div>

      {/* Target Cards */}
      {isEditing ? (
        <div className="space-y-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Revenue Target
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={editValues.revenue}
                onChange={(e) => setEditValues(prev => ({ ...prev, revenue: Number(e.target.value) }))}
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Net Profit Target
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={editValues.netProfit}
                onChange={(e) => setEditValues(prev => ({ ...prev, netProfit: Number(e.target.value) }))}
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div className="text-xs text-gray-500 mt-2">
              This gives you a {editValues.revenue > 0 ? ((editValues.netProfit / editValues.revenue) * 100).toFixed(1) : 0}% profit margin
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setIsEditing(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
            >
              Save Changes
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {/* Revenue Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Revenue Target</div>
                <div className="text-lg font-bold text-gray-900">{formatCurrency(targets.revenue)}</div>
              </div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-brand-navy" />
          </div>

          {/* Profit Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-navy-100 rounded-lg">
                <DollarSign className="w-4 h-4 text-brand-navy" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Net Profit Target</div>
                <div className="text-lg font-bold text-brand-navy">{formatCurrency(targets.netProfit)}</div>
              </div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-brand-navy" />
          </div>

          {/* Margin Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <Percent className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Profit Margin</div>
                <div className="text-lg font-bold text-gray-900">{profitMargin.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!isEditing && (
        <div className="space-y-3">
          <button
            onClick={() => setIsEditing(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Adjust Targets
          </button>
        </div>
      )}

      {/* Helpful context */}
      <div className="mt-6 p-4 bg-blue-50 rounded-xl">
        <div className="text-sm text-blue-800">
          <strong>Pro tip:</strong> A {profitMargin.toFixed(0)}% profit margin means you have{' '}
          {formatCurrency(expenseBudget)} to cover all your costs. We'll help you allocate this budget in the next steps.
        </div>
      </div>
    </div>
  );
}
