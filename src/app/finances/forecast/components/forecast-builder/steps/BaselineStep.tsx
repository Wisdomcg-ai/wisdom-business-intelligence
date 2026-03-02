'use client';

import { useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Building2, Percent } from 'lucide-react';
import type { UseForecastBuilderReturn } from '../hooks/useForecastBuilder';

interface BaselineStepProps {
  builder: UseForecastBuilderReturn;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function BaselineStep({ builder }: BaselineStepProps) {
  const { state, actions } = builder;
  const { baseline, targets } = state;

  const [inflationPercent, setInflationPercent] = useState(baseline.opExInflationPercent);

  // Calculate forecasted values
  const forecastOpEx = baseline.priorYearOpEx * (1 + inflationPercent / 100);
  const cogsAmount = targets.revenue * (baseline.priorYearCOGSPercent / 100);

  const handleInflationChange = (value: number) => {
    setInflationPercent(value);
    actions.setOpExInflation(value);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gray-100 rounded-lg">
            <BarChart3 className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Step 2: Prior Year Baseline</h2>
        </div>
        <p className="text-gray-600 text-sm">
          Here's what your business looked like last year. This forms the baseline for your forecast.
        </p>
      </div>

      {/* Prior Year Summary */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          FY{state.fiscalYear - 1} Summary
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600">Revenue</div>
            <div className="text-lg font-bold text-gray-900">{formatCurrency(baseline.priorYearRevenue)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Operating Expenses</div>
            <div className="text-lg font-bold text-gray-900">{formatCurrency(baseline.priorYearOpEx)}</div>
          </div>
        </div>
      </div>

      {/* COGS Section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <TrendingDown className="w-4 h-4" />
          Cost of Goods Sold
        </h3>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Prior Year COGS %</span>
            <span className="font-semibold text-gray-900">{baseline.priorYearCOGSPercent.toFixed(0)}%</span>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Applied to {formatCurrency(targets.revenue)} revenue</span>
            <span className="font-medium text-gray-700">= {formatCurrency(cogsAmount)}</span>
          </div>
        </div>
      </div>

      {/* OpEx Section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          Operating Expenses
        </h3>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          {/* Prior year baseline */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Prior Year OpEx</span>
            <span className="font-semibold text-gray-900">{formatCurrency(baseline.priorYearOpEx)}</span>
          </div>

          {/* Monthly average */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Monthly average</span>
            <span>{formatCurrency(baseline.priorYearOpEx / 12)}/mo</span>
          </div>

          {/* Inflation adjustment */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Inflation Adjustment</span>
              <span className="text-sm font-semibold text-gray-900">{inflationPercent}%</span>
            </div>

            <input
              type="range"
              min="0"
              max="15"
              step="1"
              value={inflationPercent}
              onChange={(e) => handleInflationChange(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
            />

            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span>5%</span>
              <span>10%</span>
              <span>15%</span>
            </div>
          </div>

          {/* Forecasted OpEx */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">FY{state.fiscalYear} OpEx Forecast</span>
              <span className="text-lg font-bold text-gray-900">{formatCurrency(forecastOpEx)}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {formatCurrency(baseline.priorYearOpEx)} + {inflationPercent}% = {formatCurrency(forecastOpEx)}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <button
          onClick={() => handleInflationChange(0)}
          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
            inflationPercent === 0
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          No change
        </button>
        <button
          onClick={() => handleInflationChange(5)}
          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
            inflationPercent === 5
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          +5% inflation
        </button>
        <button
          onClick={() => handleInflationChange(10)}
          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
            inflationPercent === 10
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          +10% growth
        </button>
      </div>

      {/* Helpful context */}
      <div className="p-4 bg-amber-50 rounded-xl">
        <div className="text-sm text-amber-800">
          <strong>Note:</strong> This baseline includes all recurring expenses from last year.
          One-off expenses (like insurance paid annually) are spread across 12 months.
        </div>
      </div>
    </div>
  );
}
