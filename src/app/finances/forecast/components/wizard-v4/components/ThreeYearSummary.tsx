'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ForecastSummary, Goals, ForecastDuration, formatCurrency, formatPercent, YearlySummary, YearlyGoals } from '../types';

interface ThreeYearSummaryProps {
  summary: ForecastSummary;
  goals: Goals;
  fiscalYear: number;
  forecastDuration?: ForecastDuration;
}

export function ThreeYearSummary({ summary, goals, fiscalYear, forecastDuration = 3 }: ThreeYearSummaryProps) {
  const getTrendIcon = (current: number, target: number) => {
    const diff = current - target;
    if (Math.abs(diff) < 0.5) return <Minus className="w-3 h-3 text-gray-400" />;
    if (diff > 0) return <TrendingUp className="w-3 h-3 text-green-500" />;
    return <TrendingDown className="w-3 h-3 text-red-500" />;
  };

  const getVarianceColor = (current: number, target: number) => {
    const diff = current - target;
    if (Math.abs(diff) < 0.5) return 'text-gray-600';
    if (diff > 0) return 'text-green-600';
    return 'text-red-600';
  };

  const renderYearColumn = (
    yearNum: 1 | 2 | 3,
    yearSummary: YearlySummary | undefined,
    yearGoals: YearlyGoals | undefined
  ) => {
    if (!yearSummary || !yearGoals) return null;

    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-gray-400">FY{fiscalYear + yearNum - 1}</div>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-xs text-gray-500">Revenue</div>
            <div className="text-sm font-semibold text-gray-900">
              {formatCurrency(yearSummary.revenue || yearGoals.revenue)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">GP%</div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-gray-900">
                {formatPercent(yearSummary.grossProfitPct || yearGoals.grossProfitPct)}
              </span>
              {getTrendIcon(yearSummary.grossProfitPct, yearGoals.grossProfitPct)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Net Profit</div>
            <div className="flex items-center gap-1">
              <span
                className={`text-sm font-semibold ${getVarianceColor(
                  yearSummary.netProfitPct,
                  yearGoals.netProfitPct
                )}`}
              >
                {formatCurrency(yearSummary.netProfit)}
              </span>
              <span className="text-xs text-gray-400">
                ({formatPercent(yearSummary.netProfitPct)})
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const durationLabel = forecastDuration === 1 ? '1-Year' : forecastDuration === 2 ? '2-Year' : '3-Year';
  const gridCols = forecastDuration === 1 ? 'grid-cols-1' : forecastDuration === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className="px-6 py-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500">{durationLabel} Forecast Summary</h3>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-green-500" /> On track
          <span className="w-2 h-2 rounded-full bg-red-500 ml-2" /> Below target
        </div>
      </div>

      <div className={`mt-2 grid ${gridCols} gap-6`}>
        {/* Year 1 - Always shown */}
        {renderYearColumn(1, summary.year1, goals.year1)}

        {/* Year 2 - Only if duration >= 2 */}
        {forecastDuration >= 2 && renderYearColumn(2, summary.year2, goals.year2)}

        {/* Year 3 - Only if duration >= 3 */}
        {forecastDuration >= 3 && renderYearColumn(3, summary.year3, goals.year3)}
      </div>
    </div>
  );
}
