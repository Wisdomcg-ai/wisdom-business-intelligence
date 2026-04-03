'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, AnnualPlanSnapshot, RealignmentData, QuarterlyTargets } from '../../types';
import { getDefaultRealignmentData, getDefaultAnnualPlanSnapshot, getCurrentQuarter } from '../../types';
import {
  Target,
  DollarSign,
  AlertTriangle,
  Loader2,
  Info,
} from 'lucide-react';

interface ConfidenceRealignmentStepProps {
  review: QuarterlyReview;
  onUpdateAnnualPlanSnapshot: (snapshot: AnnualPlanSnapshot) => void;
  onUpdateConfidence: (data: {
    confidence: number;
    notes: string;
    adjusted: boolean;
    ytdRevenue: number | null;
    ytdGrossProfit: number | null;
    ytdNetProfit: number | null;
  }) => void;
  onUpdateRealignment: (decision: RealignmentData) => void;
}

interface FinancialGoals {
  year_type: 'FY' | 'CY';
  revenue_year1: number;
  gross_profit_year1: number;
  net_profit_year1: number;
}

interface StrategicInitiative {
  id: string;
  title: string;
  status: string;
  progress_percentage: number;
}

function formatCurrency(value: number): string {
  if (value === 0 || value === null || value === undefined) return '$0';
  const formatted = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
  return value < 0 ? `(${formatted})` : formatted;
}

export function ConfidenceRealignmentStep({
  review,
  onUpdateAnnualPlanSnapshot,
  onUpdateConfidence,
  onUpdateRealignment,
}: ConfidenceRealignmentStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();

  // Annual plan data
  const [isLoading, setIsLoading] = useState(true);
  const [goals, setGoals] = useState<FinancialGoals | null>(null);
  const [initiatives, setInitiatives] = useState<StrategicInitiative[]>([]);
  const [ytdActuals, setYtdActuals] = useState({ revenue: 0, grossProfit: 0, netProfit: 0 });
  // Raw string overrides for YTD inputs — when a key exists, the input shows the raw string.
  // On blur the raw string is parsed, the override is removed, and the formatted value shows.
  const [ytdRaw, setYtdRaw] = useState<Record<string, string | undefined>>({});
  const [yearType, setYearType] = useState<'FY' | 'CY'>('CY');

  // Confidence data (from review)
  const confidence = review.annual_target_confidence || 5;
  const notes = review.confidence_notes || '';
  const adjusted = review.targets_adjusted || false;

  const realignment = { ...getDefaultRealignmentData(), ...(review.realignment_decision || {}) };

  // Use actual current quarter based on today's date + year type (not review.quarter)
  const { quarter: currentQuarter, year: currentYear } = getCurrentQuarter(yearType);
  const remainingQuarters = 4 - currentQuarter;

  // ═══════════════════════════════════════════════════════════════
  // Data Fetching
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    fetchAnnualPlanData();
  }, []);

  const fetchAnnualPlanData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const targetUserId = activeBusiness?.ownerId || user.id;

      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', targetUserId)
        .maybeSingle();

      const businessId = profile?.id || review.business_id;

      // Fetch annual targets
      const { data: goalsData } = await supabase
        .from('business_financial_goals')
        .select('year_type, revenue_year1, gross_profit_year1, net_profit_year1')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (goalsData) {
        setGoals(goalsData);
        setYearType(goalsData.year_type || 'CY');
      }

      // Fetch completed quarterly reviews for YTD
      // Use actual current quarter based on year type so we get all prior quarters
      const resolvedYearType = goalsData?.year_type || 'CY';
      const actualQ = getCurrentQuarter(resolvedYearType);

      const { data: completedReviews } = await supabase
        .from('quarterly_reviews')
        .select('id, quarter, year, quarterly_targets')
        .eq('business_id', review.business_id)
        .eq('year', actualQ.year)
        .eq('status', 'completed')
        .lt('quarter', actualQ.quarter)
        .order('quarter', { ascending: true });

      // Priority 1: Use previously saved YTD values from this review
      if (review.ytd_revenue_annual || review.ytd_gross_profit_annual || review.ytd_net_profit_annual) {
        setYtdActuals({
          revenue: review.ytd_revenue_annual || 0,
          grossProfit: review.ytd_gross_profit_annual || 0,
          netProfit: review.ytd_net_profit_annual || 0,
        });
      }
      // Priority 2: Auto-calculate from completed prior-quarter reviews
      else if (completedReviews && completedReviews.length > 0) {
        const ytd = { revenue: 0, grossProfit: 0, netProfit: 0 };
        for (const qr of completedReviews as Array<{ id: string; quarter: number; year: number; quarterly_targets: QuarterlyTargets | null }>) {
          if (qr.quarterly_targets) {
            ytd.revenue += qr.quarterly_targets.revenue || 0;
            ytd.grossProfit += qr.quarterly_targets.grossProfit || 0;
            ytd.netProfit += qr.quarterly_targets.netProfit || 0;
          }
        }
        setYtdActuals(ytd);
      }

      // Fetch strategic initiatives
      const { data: initiativesData } = await supabase
        .from('strategic_initiatives')
        .select('id, title, status, progress_percentage')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (initiativesData) {
        setInitiatives(initiativesData);
      }
    } catch (error) {
      console.error('Error fetching annual plan data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-populate snapshot when data loads
  useEffect(() => {
    if (isLoading || !goals) return;

    const annualTargets = {
      revenue: goals.revenue_year1 || 0,
      grossProfit: goals.gross_profit_year1 || 0,
      netProfit: goals.net_profit_year1 || 0,
    };

    const remaining = {
      revenue: annualTargets.revenue - ytdActuals.revenue,
      grossProfit: annualTargets.grossProfit - ytdActuals.grossProfit,
      netProfit: annualTargets.netProfit - ytdActuals.netProfit,
    };

    const divisor = remainingQuarters > 0 ? remainingQuarters : 1;
    const runRateNeeded = {
      revenue: Math.round(remaining.revenue / divisor),
      grossProfit: Math.round(remaining.grossProfit / divisor),
      netProfit: Math.round(remaining.netProfit / divisor),
    };

    const snapshot: AnnualPlanSnapshot = {
      yearType,
      planYear: currentYear,
      currentQuarter,
      remainingQuarters,
      annualTargets,
      ytdActuals,
      remaining,
      runRateNeeded,
      strategicInitiatives: initiatives.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status || 'active',
        progressPercentage: i.progress_percentage || 0,
      })),
    };

    onUpdateAnnualPlanSnapshot(snapshot);
  }, [isLoading, goals, ytdActuals, initiatives, yearType, currentYear]);

  // ═══════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════

  const getRunRateProjection = (metric: 'revenue' | 'grossProfit' | 'netProfit') => {
    if (!goals || currentQuarter <= 1) return null;
    const ytd = ytdActuals[metric];
    const avgPerQuarter = ytd / (currentQuarter - 1);
    return avgPerQuarter * 4;
  };

  const handleConfidenceUpdate = (updates: Partial<{
    confidence: number;
    notes: string;
    adjusted: boolean;
  }>) => {
    const newAdjusted = updates.adjusted ?? adjusted;

    // If un-adjusting, clear adjusted targets
    if (!newAdjusted && adjusted) {
      onUpdateRealignment({ ...realignment, choice: 'keep_targets', adjustedTargets: undefined });
    }

    onUpdateConfidence({
      confidence: updates.confidence ?? confidence,
      notes: updates.notes ?? notes,
      adjusted: newAdjusted,
      ytdRevenue: ytdActuals.revenue || null,
      ytdGrossProfit: ytdActuals.grossProfit || null,
      ytdNetProfit: ytdActuals.netProfit || null,
    });
  };

  const handleAdjustedTargetChange = (field: 'revenue' | 'grossProfit' | 'netProfit', value: string) => {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
    const current = realignment.adjustedTargets || {
      revenue: goals?.revenue_year1 || 0,
      grossProfit: goals?.gross_profit_year1 || 0,
      netProfit: goals?.net_profit_year1 || 0,
    };
    onUpdateRealignment({
      ...realignment,
      choice: 'adjust_targets',
      adjustedTargets: { ...current, [field]: parsed },
    });
  };

  const handleYtdFocus = useCallback((field: 'revenue' | 'grossProfit' | 'netProfit') => {
    const val = ytdActuals[field];
    setYtdRaw(prev => ({ ...prev, [field]: val !== 0 ? String(val) : '' }));
  }, [ytdActuals]);

  const handleYtdRawChange = useCallback((field: 'revenue' | 'grossProfit' | 'netProfit', value: string) => {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    setYtdRaw(prev => ({ ...prev, [field]: cleaned }));
  }, []);

  const handleYtdBlur = useCallback((field: 'revenue' | 'grossProfit' | 'netProfit') => {
    const raw = ytdRaw[field] || '';
    const parsed = raw === '' || raw === '-' ? 0 : parseFloat(raw) || 0;
    // Remove the raw override so the formatted value shows
    setYtdRaw(prev => ({ ...prev, [field]: undefined }));
    const updated = { ...ytdActuals, [field]: parsed };
    setYtdActuals(updated);
    onUpdateConfidence({
      confidence,
      notes,
      adjusted,
      ytdRevenue: updated.revenue || null,
      ytdGrossProfit: updated.grossProfit || null,
      ytdNetProfit: updated.netProfit || null,
    });
  }, [ytdRaw, ytdActuals, confidence, notes, adjusted, onUpdateConfidence]);

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

  const getButtonColor = (num: number, selected: number) => {
    if (num !== selected) return 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200';
    if (num >= 8) return 'bg-green-500 text-white shadow-lg scale-105';
    if (num >= 5) return 'bg-amber-500 text-white shadow-lg scale-105';
    return 'bg-red-500 text-white shadow-lg scale-105';
  };

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="4.1"
          subtitle="Review your annual plan and assess confidence in hitting targets"
          estimatedTime={15}
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        step="4.1"
        subtitle="Review your annual plan progress and assess confidence in hitting targets"
        estimatedTime={15}
        tip="Be honest — it's better to adjust now than miss later"
      />

      {/* ═══════════════════ ANNUAL PLAN ═══════════════════ */}

      {/* Context Banner */}
      <div className="bg-gradient-to-r from-brand-orange-50 to-brand-orange-100 rounded-xl border border-brand-orange-200 p-4 mb-6">
        <div className="flex items-center gap-3">
          <Info className="w-5 h-5 text-brand-orange flex-shrink-0" />
          <p className="font-semibold text-brand-orange-800">
            You are in Q{currentQuarter} of {yearType}{currentYear} &mdash;{' '}
            {remainingQuarters > 0
              ? `${remainingQuarters} quarter${remainingQuarters !== 1 ? 's' : ''} remaining`
              : 'Final quarter'}
          </p>
        </div>
      </div>

      {goals ? (
        <>
          {/* Financial Targets Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Target className="w-5 h-5 text-brand-orange" />
                Annual Financial Targets
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-5 w-[25%]">Metric</th>
                    <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4">Annual Target</th>
                    <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4">YTD Actual</th>
                    <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4">Remaining</th>
                    <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4">Run Rate / Qtr</th>
                    <th className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4 w-[15%]">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    { key: 'revenue' as const, label: 'Revenue', targetKey: 'revenue_year1' as const, color: 'text-brand-orange', bg: 'bg-brand-orange' },
                    { key: 'grossProfit' as const, label: 'Gross Profit', targetKey: 'gross_profit_year1' as const, color: 'text-green-600', bg: 'bg-green-500' },
                    { key: 'netProfit' as const, label: 'Net Profit', targetKey: 'net_profit_year1' as const, color: 'text-blue-600', bg: 'bg-blue-500' },
                  ]).map(({ key, label, targetKey, color, bg }) => {
                    const target = goals[targetKey];
                    const ytd = ytdActuals[key];
                    const remaining = target - ytd;
                    const runRate = remainingQuarters > 0 ? Math.round(remaining / remainingQuarters) : remaining;
                    const pct = target > 0 ? Math.round((ytd / target) * 100) : 0;
                    const projection = getRunRateProjection(key);

                    return (
                      <tr key={key} className="border-b border-gray-100 last:border-b-0">
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2">
                            <DollarSign className={`w-4 h-4 ${color}`} />
                            <span className="text-sm font-medium text-gray-900">{label}</span>
                          </div>
                          {projection !== null && currentQuarter > 1 && (
                            <div className="text-xs text-gray-500 mt-0.5 ml-6">
                              Projected: <span className={projection >= target ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                {formatCurrency(Math.round(projection))}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-semibold text-gray-900">{formatCurrency(target)}</td>
                        <td className="py-2 px-3">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                            <input
                              type="text"
                              value={ytdRaw[key] !== undefined ? ytdRaw[key] : (ytd !== 0 ? Math.round(ytd).toLocaleString('en-AU') : '')}
                              onFocus={() => handleYtdFocus(key)}
                              onChange={(e) => handleYtdRawChange(key, e.target.value)}
                              onBlur={() => handleYtdBlur(key)}
                              placeholder="Enter YTD"
                              className="w-full pl-5 pr-2 py-1.5 text-sm text-right border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
                            />
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right text-sm text-gray-700">{formatCurrency(remaining)}</td>
                        <td className={`py-3 px-4 text-right text-sm font-bold ${color}`}>{formatCurrency(runRate)}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${bg}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-medium text-gray-600 w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Run Rate Projection */}
          {currentQuarter > 1 && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6">
              <p className="text-sm text-gray-700">
                <strong>At current pace:</strong>{' '}
                {(() => {
                  const proj = getRunRateProjection('revenue');
                  if (proj === null) return 'Not enough data for projection.';
                  const target = goals.revenue_year1;
                  if (proj >= target) {
                    return `You'll finish at ${formatCurrency(Math.round(proj))}, which is on track to hit your ${formatCurrency(target)} revenue target.`;
                  }
                  return `You'll finish at ${formatCurrency(Math.round(proj))}, which is ${formatCurrency(Math.round(target - proj))} short of your ${formatCurrency(target)} revenue target.`;
                })()}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-900">No Annual Targets Set</h4>
              <p className="text-sm text-amber-800 mt-1">
                You haven&apos;t set annual targets in your Strategic Plan yet. The confidence check below
                will still work, but consider setting targets for better tracking.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ CONFIDENCE ═══════════════════ */}

      {/* Confidence Slider */}
      <div className={`rounded-xl border-2 p-6 mb-6 ${getConfidenceBgColor(confidence)}`}>
        <h3 className="font-semibold text-gray-900 mb-4">
          How confident are you in hitting your annual targets?
        </h3>

        <div className="mb-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-gray-600">Not confident</span>
            <span className="text-sm text-gray-600">Very confident</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <button
                key={num}
                onClick={() => handleConfidenceUpdate({ confidence: num })}
                className={`flex-1 h-12 rounded-lg text-sm font-bold transition-all ${getButtonColor(num, confidence)}`}
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
          <span className="text-gray-400">&mdash;</span>
          <span className={`font-medium ${getConfidenceColor(confidence)}`}>
            {getConfidenceLabel(confidence)}
          </span>
        </div>
      </div>

      {/* Single Notes Field */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <label className="block font-medium text-gray-900 mb-2">
          What&apos;s driving this score? What needs to change?
        </label>
        <textarea
          value={notes}
          onChange={(e) => handleConfidenceUpdate({ notes: e.target.value })}
          placeholder="What's going well, what's off track, and what would you change to improve your confidence?"
          rows={4}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none text-sm"
        />
      </div>

      {/* Adjust Targets (appears when confidence is low) */}
      {confidence <= 7 && goals && (
        <div className={`rounded-xl border-2 p-6 ${adjusted ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'}`}>
          <label className="flex items-start gap-4 cursor-pointer mb-4">
            <div className="flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={adjusted}
                onChange={(e) => handleConfidenceUpdate({ adjusted: e.target.checked })}
                className="w-5 h-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
            </div>
            <div>
              <span className="font-medium text-gray-900">I want to adjust my annual targets</span>
              <p className="text-sm text-gray-600 mt-0.5">
                Your revised targets will flow into the Quarterly Targets step.
              </p>
            </div>
          </label>

          {adjusted && (
            <div className="grid md:grid-cols-3 gap-4 pt-4 border-t border-amber-200">
              {([
                { key: 'revenue' as const, label: 'Revenue', current: goals.revenue_year1 },
                { key: 'grossProfit' as const, label: 'Gross Profit', current: goals.gross_profit_year1 },
                { key: 'netProfit' as const, label: 'Net Profit', current: goals.net_profit_year1 },
              ]).map(({ key, label, current }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{label}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="text"
                      value={realignment.adjustedTargets?.[key] ? realignment.adjustedTargets[key].toLocaleString('en-AU') : ''}
                      onChange={(e) => handleAdjustedTargetChange(key, e.target.value)}
                      placeholder={formatCurrency(current)}
                      className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Current: {formatCurrency(current)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
