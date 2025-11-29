'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview } from '../../types';
import { Target, DollarSign, AlertTriangle, Loader2 } from 'lucide-react';

interface ConfidenceCheckStepProps {
  review: QuarterlyReview;
  onUpdate: (data: {
    confidence: number;
    notes: string;
    adjusted: boolean;
    ytdRevenue: number | null;
    ytdGrossProfit: number | null;
    ytdNetProfit: number | null;
  }) => void;
}

interface FinancialGoals {
  year_type: 'FY' | 'CY';
  revenue_year1: number;
  gross_profit_year1: number;
  gross_margin_year1: number;
  net_profit_year1: number;
  net_margin_year1: number;
  leads_per_month_year1?: number;
  conversion_rate_year1?: number;
  avg_transaction_value_year1?: number;
  team_headcount_year1?: number;
}

// Circular Progress Component
function CircularProgress({
  progress,
  size = 80,
  strokeWidth = 8,
  color = 'text-teal-500'
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-gray-200"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-gray-900">{progress}%</span>
      </div>
    </div>
  );
}

export function ConfidenceCheckStep({ review, onUpdate }: ConfidenceCheckStepProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [goals, setGoals] = useState<FinancialGoals | null>(null);
  const supabase = createClient();

  const confidence = review.annual_target_confidence || 5;
  const notes = review.confidence_notes || '';
  const adjusted = review.targets_adjusted || false;

  // Manual YTD entries from review
  const ytdRevenue = review.ytd_revenue_annual || null;
  const ytdGrossProfit = review.ytd_gross_profit_annual || null;
  const ytdNetProfit = review.ytd_net_profit_annual || null;

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      const businessId = profile?.id || user.id;

      const { data, error } = await supabase
        .from('business_financial_goals')
        .select('year_type, revenue_year1, gross_profit_year1, gross_margin_year1, net_profit_year1, net_margin_year1, leads_per_month_year1, conversion_rate_year1, avg_transaction_value_year1, team_headcount_year1')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setGoals(data);
      }
    } catch (error) {
      console.error('Error fetching goals:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = (updates: Partial<{
    confidence: number;
    notes: string;
    adjusted: boolean;
    ytdRevenue: number | null;
    ytdGrossProfit: number | null;
    ytdNetProfit: number | null;
  }>) => {
    onUpdate({
      confidence: updates.confidence ?? confidence,
      notes: updates.notes ?? notes,
      adjusted: updates.adjusted ?? adjusted,
      ytdRevenue: updates.ytdRevenue !== undefined ? updates.ytdRevenue : ytdRevenue,
      ytdGrossProfit: updates.ytdGrossProfit !== undefined ? updates.ytdGrossProfit : ytdGrossProfit,
      ytdNetProfit: updates.ytdNetProfit !== undefined ? updates.ytdNetProfit : ytdNetProfit,
    });
  };

  const parseNumber = (value: string): number | null => {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '$0';
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatCurrencyInput = (value: number | null) => {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('en-AU');
  };

  const formatPercent = (value: number) => {
    if (!value && value !== 0) return '0%';
    return `${value.toFixed(1)}%`;
  };

  const calculateProgress = (actual: number | null, target: number) => {
    if (!actual || !target || target === 0) return 0;
    return Math.min(Math.round((actual / target) * 100), 100);
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 75) return 'text-green-500';
    if (progress >= 50) return 'text-teal-500';
    if (progress >= 25) return 'text-amber-500';
    return 'text-red-500';
  };

  const getConfidenceColor = (value: number) => {
    if (value >= 8) return 'text-green-600';
    if (value >= 5) return 'text-amber-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (value: number) => {
    if (value >= 9) return 'Very Confident';
    if (value >= 7) return 'Confident';
    if (value >= 5) return 'Neutral';
    if (value >= 3) return 'Concerned';
    return 'Very Concerned';
  };

  const getConfidenceBgColor = (value: number) => {
    if (value >= 8) return 'bg-green-50 border-green-200';
    if (value >= 5) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  const getQuarterContext = () => {
    const q = review.quarter;
    if (q === 1) return 'Q1 - 25% through year';
    if (q === 2) return 'Q2 - 50% through year';
    if (q === 3) return 'Q3 - 75% through year';
    return 'Q4 - Final quarter';
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="3.3"
          subtitle="Assess your confidence in hitting annual targets"
          estimatedTime={10}
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      </div>
    );
  }

  const revenueProgress = goals ? calculateProgress(ytdRevenue, goals.revenue_year1) : 0;
  const grossProfitProgress = goals ? calculateProgress(ytdGrossProfit, goals.gross_profit_year1) : 0;
  const netProfitProgress = goals ? calculateProgress(ytdNetProfit, goals.net_profit_year1) : 0;

  return (
    <div>
      <StepHeader
        step="3.3"
        subtitle="How confident are you in achieving your annual targets?"
        estimatedTime={10}
        tip="Be honest - it's better to adjust now than miss later"
      />

      {/* Annual Targets with Progress Cards */}
      {goals ? (
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-teal-600" />
              Annual Target Progress
            </h3>
            <span className="text-sm text-gray-500">{getQuarterContext()}</span>
          </div>

          {/* Financial Targets - Card Grid */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {/* Revenue Card */}
            <div className="bg-teal-50 rounded-xl p-5 border border-teal-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="w-4 h-4 text-teal-600" />
                    <span className="text-sm font-medium text-teal-700">Revenue</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {formatCurrency(goals.revenue_year1)}
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    Annual Target
                  </div>
                  <div className="pt-3 border-t border-teal-200">
                    <label className="text-xs text-gray-500 mb-1 block">YTD Actual</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <input
                        type="text"
                        value={formatCurrencyInput(ytdRevenue)}
                        onChange={(e) => handleUpdate({ ytdRevenue: parseNumber(e.target.value) })}
                        placeholder="Enter YTD revenue"
                        className="w-full pl-7 pr-3 py-2 text-sm border border-teal-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <CircularProgress
                    progress={revenueProgress}
                    color={getProgressColor(revenueProgress)}
                  />
                </div>
              </div>
            </div>

            {/* Gross Profit Card */}
            <div className="bg-green-50 rounded-xl p-5 border border-green-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">Gross Profit</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {formatCurrency(goals.gross_profit_year1)}
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    Annual Target
                    {goals.gross_margin_year1 > 0 && (
                      <span className="text-green-600 ml-1">
                        @ {formatPercent(goals.gross_margin_year1)}
                      </span>
                    )}
                  </div>
                  <div className="pt-3 border-t border-green-200">
                    <label className="text-xs text-gray-500 mb-1 block">YTD Actual</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <input
                        type="text"
                        value={formatCurrencyInput(ytdGrossProfit)}
                        onChange={(e) => handleUpdate({ ytdGrossProfit: parseNumber(e.target.value) })}
                        placeholder="Enter YTD gross profit"
                        className="w-full pl-7 pr-3 py-2 text-sm border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <CircularProgress
                    progress={grossProfitProgress}
                    color={getProgressColor(grossProfitProgress)}
                  />
                </div>
              </div>
            </div>

            {/* Net Profit Card */}
            <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">Net Profit</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {formatCurrency(goals.net_profit_year1)}
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    Annual Target
                    {goals.net_margin_year1 > 0 && (
                      <span className="text-blue-600 ml-1">
                        @ {formatPercent(goals.net_margin_year1)}
                      </span>
                    )}
                  </div>
                  <div className="pt-3 border-t border-blue-200">
                    <label className="text-xs text-gray-500 mb-1 block">YTD Actual</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <input
                        type="text"
                        value={formatCurrencyInput(ytdNetProfit)}
                        onChange={(e) => handleUpdate({ ytdNetProfit: parseNumber(e.target.value) })}
                        placeholder="Enter YTD net profit"
                        className="w-full pl-7 pr-3 py-2 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <CircularProgress
                    progress={netProfitProgress}
                    color={getProgressColor(netProfitProgress)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Core Business Metrics */}
          {(goals.leads_per_month_year1 || goals.conversion_rate_year1 || goals.avg_transaction_value_year1 || goals.team_headcount_year1) && (
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Core Business Metric Targets</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(goals.leads_per_month_year1 ?? 0) > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Leads/Month</div>
                    <div className="text-lg font-semibold text-gray-900">{goals.leads_per_month_year1}</div>
                  </div>
                )}
                {(goals.conversion_rate_year1 ?? 0) > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Conversion Rate</div>
                    <div className="text-lg font-semibold text-gray-900">{formatPercent(goals.conversion_rate_year1 ?? 0)}</div>
                  </div>
                )}
                {(goals.avg_transaction_value_year1 ?? 0) > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Avg Transaction</div>
                    <div className="text-lg font-semibold text-gray-900">{formatCurrency(goals.avg_transaction_value_year1 ?? 0)}</div>
                  </div>
                )}
                {(goals.team_headcount_year1 ?? 0) > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Team Size</div>
                    <div className="text-lg font-semibold text-gray-900">{goals.team_headcount_year1}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-amber-50 rounded-xl border-2 border-amber-200 p-6 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-900">No Annual Targets Set</h4>
              <p className="text-sm text-amber-800 mt-1">
                You haven't set annual targets in your Strategic Plan yet. Consider completing your goals
                to have clear targets to measure confidence against.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Confidence Rating */}
      <div className={`rounded-xl border-2 p-6 mb-6 ${getConfidenceBgColor(confidence)}`}>
        <h3 className="font-semibold text-gray-900 mb-4">
          Based on your progress, how confident are you in hitting these annual targets?
        </h3>

        <div className="mb-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-gray-600">Not confident</span>
            <span className="text-sm text-gray-600">Very confident</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
              <button
                key={num}
                onClick={() => handleUpdate({ confidence: num })}
                className={`flex-1 h-12 rounded-lg text-sm font-bold transition-all ${
                  confidence === num
                    ? 'bg-teal-600 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-lg">
          <span className={`font-bold ${getConfidenceColor(confidence)}`}>
            {confidence}/10
          </span>
          <span className="text-gray-400">—</span>
          <span className={`font-medium ${getConfidenceColor(confidence)}`}>
            {getConfidenceLabel(confidence)}
          </span>
        </div>
      </div>

      {/* Confidence Notes */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-6 mb-6">
        <label className="block font-medium text-gray-900 mb-2">
          What's driving your confidence level?
        </label>
        <textarea
          value={notes}
          onChange={(e) => handleUpdate({ notes: e.target.value })}
          placeholder="What factors are influencing your confidence? What would need to change to increase it?"
          rows={4}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Adjustment Toggle */}
      <div className={`rounded-xl border-2 p-6 ${adjusted ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
        <label className="flex items-start gap-4 cursor-pointer">
          <div className="flex-shrink-0 mt-0.5">
            <input
              type="checkbox"
              checked={adjusted}
              onChange={(e) => handleUpdate({ adjusted: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
          </div>
          <div>
            <span className="font-medium text-gray-900">
              I need to adjust my annual targets
            </span>
            <p className="text-sm text-gray-600 mt-1">
              Check this if you believe the current annual targets are no longer achievable or appropriate.
              We'll review the targets in the planning phase.
            </p>
          </div>
        </label>

        {adjusted && (
          <div className="mt-4 p-4 bg-amber-100 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Target Adjustment Flagged</p>
                <p className="text-sm text-amber-700">
                  We'll review and potentially adjust targets in Part 4: Planning.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
