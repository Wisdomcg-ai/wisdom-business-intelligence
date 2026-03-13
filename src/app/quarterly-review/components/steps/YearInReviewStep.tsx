'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, YearInReview } from '../../types';
import { getDefaultYearInReview } from '../../types';
import { formatDollar } from '@/app/goals/utils/formatting';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Star,
  MessageSquare,
} from 'lucide-react';

interface YearInReviewStepProps {
  review: QuarterlyReview;
  onUpdate: (data: YearInReview) => void;
}

export function YearInReviewStep({ review, onUpdate }: YearInReviewStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();
  const [isLoading, setIsLoading] = useState(true);

  const data: YearInReview = {
    ...getDefaultYearInReview(),
    ...(review.year_in_review || {}),
  };

  useEffect(() => {
    loadAnnualData();
  }, []);

  const loadAnnualData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const targetUserId = activeBusiness?.ownerId || user.id;
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', targetUserId)
        .maybeSingle();

      const businessId = profile?.id || review.business_id;

      // Load all quarterly snapshots for this year
      const { data: snapshots } = await supabase
        .from('quarterly_snapshots')
        .select('*')
        .eq('business_id', businessId)
        .eq('snapshot_year', review.year)
        .order('snapshot_quarter', { ascending: true });

      // Load annual targets from business_financial_goals
      const { data: goals } = await supabase
        .from('business_financial_goals')
        .select('revenue_year1, gross_profit_year1, net_profit_year1')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (snapshots && snapshots.length > 0) {
        let totalRevActual = 0, totalGPActual = 0, totalNPActual = 0;
        let totalRocks = 0, completedRocks = 0;

        for (const snap of snapshots) {
          const fin = snap.financial_snapshot as any;
          if (fin) {
            totalRevActual += fin.revenue?.actual || 0;
            totalGPActual += fin.grossProfit?.actual || 0;
            totalNPActual += fin.netProfit?.actual || 0;
          }
          totalRocks += snap.total_initiatives || 0;
          completedRocks += snap.completed_initiatives || 0;
        }

        const updatedData: YearInReview = {
          ...data,
          annualFinancials: {
            revenue: { target: goals?.revenue_year1 || 0, actual: totalRevActual },
            grossProfit: { target: goals?.gross_profit_year1 || 0, actual: totalGPActual },
            netProfit: { target: goals?.net_profit_year1 || 0, actual: totalNPActual },
          },
          totalRocksAllYear: totalRocks,
          completedRocksAllYear: completedRocks,
          rocksCompletionRate: totalRocks > 0 ? Math.round((completedRocks / totalRocks) * 100) : 0,
        };
        onUpdate(updatedData);
      }
    } catch (err) {
      console.error('Error loading annual data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof YearInReview, value: any) => {
    onUpdate({ ...data, [field]: value });
  };

  const getVarianceColor = (target: number, actual: number) => {
    if (target === 0) return 'text-gray-500';
    const pct = (actual / target) * 100;
    if (pct >= 100) return 'text-green-600';
    if (pct >= 80) return 'text-amber-600';
    return 'text-red-600';
  };

  const getVarianceIcon = (target: number, actual: number) => {
    if (actual >= target) return <TrendingUp className="w-4 h-4 text-green-600" />;
    return <TrendingDown className="w-4 h-4 text-red-600" />;
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader step="A4.1" subtitle="Full year financial scorecard and state of the business" estimatedTime={20} />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  const metrics = [
    { key: 'revenue' as const, label: 'Revenue', color: 'brand-orange' },
    { key: 'grossProfit' as const, label: 'Gross Profit', color: 'green' },
    { key: 'netProfit' as const, label: 'Net Profit', color: 'blue' },
  ];

  return (
    <div>
      <StepHeader
        step="A4.1"
        subtitle="Review the full year's performance before planning next year"
        estimatedTime={20}
        tip="Look at the numbers honestly. What story do they tell?"
      />

      {/* Annual Financial Scorecard */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-6 mb-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-brand-orange" />
          {review.year} Annual Financial Scorecard
        </h3>

        <div className="grid md:grid-cols-3 gap-4">
          {metrics.map(({ key, label, color }) => {
            const target = data.annualFinancials[key].target;
            const actual = data.annualFinancials[key].actual;
            const variance = target > 0 ? ((actual / target) * 100).toFixed(0) : '—';

            return (
              <div key={key} className={`bg-${color === 'brand-orange' ? 'brand-orange' : color}-50 rounded-xl p-4 border border-gray-200`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  {target > 0 && getVarianceIcon(target, actual)}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Target</span>
                    <span className="font-medium">{formatDollar(target)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Actual</span>
                    <span className="font-semibold">{formatDollar(actual)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Achievement</span>
                    <span className={`font-bold ${getVarianceColor(target, actual)}`}>
                      {variance}%
                    </span>
                  </div>
                </div>
                {target > 0 && (
                  <div className="mt-2 h-2 bg-gray-200 rounded-full">
                    <div
                      className={`h-full rounded-full ${actual >= target ? 'bg-green-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, (actual / target) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Rocks Completion */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-brand-orange" />
          Annual Rocks Completion
        </h3>
        <div className="flex items-center gap-6">
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">
                {data.completedRocksAllYear} of {data.totalRocksAllYear} rocks completed
              </span>
              <span className="font-bold text-brand-orange">{data.rocksCompletionRate}%</span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full">
              <div
                className="h-full bg-brand-orange rounded-full transition-all"
                style={{ width: `${data.rocksCompletionRate}%` }}
              />
            </div>
          </div>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            data.rocksCompletionRate >= 80 ? 'bg-green-100' : data.rocksCompletionRate >= 50 ? 'bg-amber-100' : 'bg-red-100'
          }`}>
            {data.rocksCompletionRate >= 80 ? (
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            ) : (
              <AlertCircle className="w-8 h-8 text-amber-600" />
            )}
          </div>
        </div>
      </div>

      {/* Biggest Win & Challenge */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-green-50 rounded-xl border border-green-200 p-5">
          <h4 className="font-medium text-green-800 flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4" />
            Biggest Annual Win
          </h4>
          <textarea
            value={data.biggestAnnualWin}
            onChange={(e) => updateField('biggestAnnualWin', e.target.value)}
            placeholder="What was the highlight of the year?"
            rows={3}
            className="w-full px-3 py-2 border border-green-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none bg-white"
          />
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
          <h4 className="font-medium text-amber-800 flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4" />
            Biggest Annual Challenge
          </h4>
          <textarea
            value={data.biggestAnnualChallenge}
            onChange={(e) => updateField('biggestAnnualChallenge', e.target.value)}
            placeholder="What was the toughest part of the year?"
            rows={3}
            className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none bg-white"
          />
        </div>
      </div>

      {/* State of the Business */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-brand-orange" />
          State of the Business
        </h4>
        <p className="text-sm text-gray-500 mb-2">Summarize where the business stands at end of year.</p>
        <textarea
          value={data.stateOfBusiness}
          onChange={(e) => updateField('stateOfBusiness', e.target.value)}
          placeholder="The business is in a strong/challenging position because..."
          rows={4}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
        />
      </div>

      {/* Coach Commentary */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h4 className="font-medium text-slate-700 flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4" />
          Coach Commentary
        </h4>
        <textarea
          value={data.coachCommentary}
          onChange={(e) => updateField('coachCommentary', e.target.value)}
          placeholder="Coach observations and feedback on the year..."
          rows={3}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none bg-white"
        />
      </div>
    </div>
  );
}
