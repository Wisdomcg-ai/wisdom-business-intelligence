'use client';

import { TrendingUp, Target, DollarSign, Calendar, Check, Building2, AlertTriangle, ExternalLink } from 'lucide-react';
import { ForecastWizardState, WizardActions, ForecastDuration, formatCurrency, YearlyGoals } from '../types';
import Link from 'next/link';

interface Step1GoalsProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
}

const DURATION_OPTIONS: { value: ForecastDuration; label: string; description: string; recommended?: boolean }[] = [
  { value: 1, label: '1 Year', description: 'Monthly operational forecast' },
  { value: 2, label: '2 Years', description: 'Medium-term planning' },
  { value: 3, label: '3 Years', description: 'Full strategic planning', recommended: true },
];

export function Step1Goals({ state, actions, fiscalYear }: Step1GoalsProps) {
  const { goals, forecastDuration, durationLocked, businessProfile } = state;

  const handleChange = (
    year: 'year1' | 'year2' | 'year3',
    field: 'revenue' | 'grossProfitPct' | 'netProfitPct',
    value: string
  ) => {
    const numValue = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
    const currentYearGoals = goals[year] || { revenue: 0, grossProfitPct: 50, netProfitPct: 15 };
    actions.updateGoals({
      ...goals,
      [year]: {
        ...currentYearGoals,
        [field]: numValue,
      },
    });
  };

  const calculateNetProfit = (revenue: number, netProfitPct: number) => {
    return Math.round(revenue * (netProfitPct / 100));
  };

  const calculateGrowthRate = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const getYearGoals = (year: 'year1' | 'year2' | 'year3'): YearlyGoals => {
    return goals[year] || { revenue: 0, grossProfitPct: 50, netProfitPct: 15 };
  };

  const renderYearCard = (
    yearNum: 1 | 2 | 3,
    yearKey: 'year1' | 'year2' | 'year3',
    opacity: number
  ) => {
    const yearGoals = getYearGoals(yearKey);

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3" style={{ backgroundColor: `rgba(39, 62, 101, ${opacity})` }}>
          <h3 className="text-white font-semibold">Year {yearNum} - FY{fiscalYear + yearNum - 1}</h3>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Revenue Target
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={yearGoals.revenue ? yearGoals.revenue.toLocaleString() : ''}
                onChange={(e) => handleChange(yearKey, 'revenue', e.target.value)}
                placeholder={yearNum === 1 ? '2,500,000' : yearNum === 2 ? '3,000,000' : '3,500,000'}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gross Profit %
            </label>
            <div className="relative">
              <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={yearGoals.grossProfitPct || ''}
                onChange={(e) => handleChange(yearKey, 'grossProfitPct', e.target.value)}
                placeholder={yearNum === 1 ? '55' : yearNum === 2 ? '58' : '60'}
                min="0"
                max="100"
                className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Net Profit %
            </label>
            <div className="relative">
              <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={yearGoals.netProfitPct || ''}
                onChange={(e) => handleChange(yearKey, 'netProfitPct', e.target.value)}
                placeholder={yearNum === 1 ? '15' : yearNum === 2 ? '18' : '20'}
                min="0"
                max="100"
                className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Net Profit $</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(calculateNetProfit(yearGoals.revenue, yearGoals.netProfitPct))}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Calculate growth rates only for displayed years
  const year1Revenue = getYearGoals('year1').revenue;
  const year2Revenue = getYearGoals('year2').revenue;
  const year3Revenue = getYearGoals('year3').revenue;
  const growthY1toY2 = forecastDuration >= 2 ? calculateGrowthRate(year2Revenue, year1Revenue) : 0;
  const growthY2toY3 = forecastDuration >= 3 ? calculateGrowthRate(year3Revenue, year2Revenue) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Business Profile Industry Card */}
      <div className={`rounded-xl border p-4 ${
        businessProfile?.industry
          ? 'bg-white border-gray-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            businessProfile?.industry ? 'bg-brand-navy/10' : 'bg-amber-100'
          }`}>
            {businessProfile?.industry ? (
              <Building2 className="w-5 h-5 text-brand-navy" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {businessProfile?.industry ? 'Business Profile' : 'Industry Not Set'}
              </h3>
              {businessProfile?.employeeCount && (
                <span className="text-sm text-gray-500">
                  {businessProfile.employeeCount} employees
                </span>
              )}
            </div>
            {businessProfile?.industry ? (
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-medium">Industry:</span> {businessProfile.industry}
                {businessProfile.businessModel && (
                  <> &middot; <span className="font-medium">Model:</span> {businessProfile.businessModel}</>
                )}
              </p>
            ) : (
              <div className="mt-1">
                <p className="text-sm text-amber-800">
                  Setting your industry helps us provide better benchmarks and expense classifications.
                </p>
                <Link
                  href="/business-profile"
                  target="_blank"
                  className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800 mt-2"
                >
                  Complete your business profile
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Duration Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-brand-navy" />
          <h3 className="font-semibold text-gray-900">Forecast Duration</h3>
          {durationLocked && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Locked</span>
          )}
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Choose how far ahead you want to plan. We recommend 3 years for comprehensive strategic planning.
        </p>

        <div className="grid grid-cols-3 gap-4">
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => !durationLocked && actions.setForecastDuration(option.value)}
              disabled={durationLocked}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                forecastDuration === option.value
                  ? 'border-brand-navy bg-brand-navy/5'
                  : durationLocked
                    ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                    : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {option.recommended && (
                <span className="absolute -top-2.5 left-4 bg-brand-navy text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              )}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{option.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                </div>
                {forecastDuration === option.value && (
                  <Check className="w-5 h-5 text-brand-navy" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Year Cards - Dynamic based on duration */}
      <div
        className={`grid gap-6 ${
          forecastDuration === 1
            ? 'grid-cols-1 max-w-md mx-auto'
            : forecastDuration === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-3'
        }`}
      >
        {/* Year 1 - Always shown */}
        {renderYearCard(1, 'year1', 1)}

        {/* Year 2 - Only if duration >= 2 */}
        {forecastDuration >= 2 && renderYearCard(2, 'year2', 0.8)}

        {/* Year 3 - Only if duration >= 3 */}
        {forecastDuration >= 3 && renderYearCard(3, 'year3', 0.6)}
      </div>

      {/* Growth Summary - Only show for multi-year forecasts */}
      {forecastDuration >= 2 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Growth Analysis</h4>
          <div className={`grid gap-6 ${forecastDuration === 2 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Year 1 → Year 2</p>
                <p className="text-lg font-semibold text-gray-900">
                  {growthY1toY2 > 0 ? '+' : ''}
                  {growthY1toY2.toFixed(1)}%
                </p>
              </div>
            </div>
            {forecastDuration >= 3 && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Year 2 → Year 3</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {growthY2toY3 > 0 ? '+' : ''}
                    {growthY2toY3.toFixed(1)}%
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              <strong>Tip:</strong> Most businesses target 15-25% annual revenue growth.
              Gross profit margin varies by industry (40-60% is common for services).
              Net profit of 10-20% is considered healthy.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
