'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, NextYearTargets, YearType } from '../../types';
import { getDefaultNextYearTargets, getCurrentQuarter } from '../../types';
import { formatDollar, parseDollarInput } from '@/app/goals/utils/formatting';
import {
  DollarSign,
  TrendingUp,
  Target,
  Loader2,
  Zap,
  Calculator,
} from 'lucide-react';

interface NextYearTargetsStepProps {
  review: QuarterlyReview;
  onUpdate: (data: NextYearTargets) => void;
}

export function NextYearTargetsStep({ review, onUpdate }: NextYearTargetsStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();
  const [isLoading, setIsLoading] = useState(true);
  const [thisYearActuals, setThisYearActuals] = useState({ revenue: 0, grossProfit: 0, netProfit: 0 });

  const data: NextYearTargets = {
    ...getDefaultNextYearTargets(),
    ...(review.next_year_targets || {}),
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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

      // Load year type
      const { data: goalsData } = await supabase
        .from('business_financial_goals')
        .select('year_type, revenue_year1, gross_profit_year1, net_profit_year1')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const yearType = (goalsData?.year_type || 'CY') as YearType;
      const nextYear = review.year + 1;

      // Load this year's actuals from quarterly snapshots
      const { data: snapshots } = await supabase
        .from('quarterly_snapshots')
        .select('financial_snapshot')
        .eq('business_id', businessId)
        .eq('snapshot_year', review.year);

      let totalRev = 0, totalGP = 0, totalNP = 0;
      if (snapshots) {
        for (const snap of snapshots) {
          const fin = snap.financial_snapshot as any;
          if (fin) {
            totalRev += fin.revenue?.actual || 0;
            totalGP += fin.grossProfit?.actual || 0;
            totalNP += fin.netProfit?.actual || 0;
          }
        }
      }
      setThisYearActuals({ revenue: totalRev, grossProfit: totalGP, netProfit: totalNP });

      // Pre-populate if empty
      if (data.revenue === 0 && data.grossProfit === 0) {
        onUpdate({
          ...data,
          nextYear,
          yearType,
        });
      }
    } catch (err) {
      console.error('Error loading next year targets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof NextYearTargets, value: any) => {
    const updated = { ...data, [field]: value };

    // Auto-calculate growth rates
    if (field === 'revenue' || field === 'grossProfit' || field === 'netProfit') {
      if (thisYearActuals.revenue > 0 && field === 'revenue') {
        updated.growthRateRevenue = Math.round(((value as number) / thisYearActuals.revenue - 1) * 100);
      }
      if (thisYearActuals.grossProfit > 0 && field === 'grossProfit') {
        updated.growthRateGrossProfit = Math.round(((value as number) / thisYearActuals.grossProfit - 1) * 100);
      }
      if (thisYearActuals.netProfit > 0 && field === 'netProfit') {
        updated.growthRateNetProfit = Math.round(((value as number) / thisYearActuals.netProfit - 1) * 100);
      }
    }

    onUpdate(updated);
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader step="A4.3" subtitle="Set financial targets for next year" estimatedTime={15} />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  const nextYearLabel = `${data.yearType}${data.nextYear}`;

  const metricRows = [
    {
      key: 'revenue' as const,
      label: 'Revenue',
      stretchKey: 'stretchRevenue' as const,
      growthKey: 'growthRateRevenue' as const,
      thisYear: thisYearActuals.revenue,
      color: 'brand-orange',
      bg: 'bg-brand-orange-50',
      border: 'border-brand-orange-200',
    },
    {
      key: 'grossProfit' as const,
      label: 'Gross Profit',
      stretchKey: 'stretchGrossProfit' as const,
      growthKey: 'growthRateGrossProfit' as const,
      thisYear: thisYearActuals.grossProfit,
      color: 'green',
      bg: 'bg-green-50',
      border: 'border-green-200',
    },
    {
      key: 'netProfit' as const,
      label: 'Net Profit',
      stretchKey: 'stretchNetProfit' as const,
      growthKey: 'growthRateNetProfit' as const,
      thisYear: thisYearActuals.netProfit,
      color: 'blue',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
    },
  ];

  return (
    <div>
      <StepHeader
        step="A4.3"
        subtitle={`What does success look like for ${nextYearLabel}?`}
        estimatedTime={15}
        tip="Set ambitious but achievable targets based on this year's performance"
      />

      {/* This Year Context */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6">
        <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
          <Calculator className="w-4 h-4" />
          This Year&apos;s Actuals ({data.yearType}{review.year})
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-gray-500">Revenue</div>
            <div className="font-semibold text-gray-900">{formatDollar(thisYearActuals.revenue)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Gross Profit</div>
            <div className="font-semibold text-gray-900">{formatDollar(thisYearActuals.grossProfit)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Net Profit</div>
            <div className="font-semibold text-gray-900">{formatDollar(thisYearActuals.netProfit)}</div>
          </div>
        </div>
      </div>

      {/* Target Setting */}
      <div className="space-y-4 mb-6">
        {metricRows.map(({ key, label, stretchKey, growthKey, thisYear, bg, border }) => (
          <div key={key} className={`${bg} rounded-xl ${border} border p-5`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-brand-orange" />
                {label} Target
              </h4>
              {data[growthKey] !== undefined && data[growthKey] !== 0 && (
                <span className={`text-sm font-medium flex items-center gap-1 ${
                  (data[growthKey] || 0) > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  <TrendingUp className="w-4 h-4" />
                  {(data[growthKey] || 0) > 0 ? '+' : ''}{data[growthKey]}% vs this year
                </span>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  <Target className="w-3 h-3 inline mr-1" />
                  Annual Target
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={data[key] ? data[key].toLocaleString('en-AU') : ''}
                    onChange={(e) => updateField(key, parseDollarInput(e.target.value))}
                    placeholder="0"
                    className="w-full pl-7 pr-3 py-2.5 text-lg font-semibold border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
                  />
                </div>
                {thisYear > 0 && (
                  <p className="text-xs text-gray-500 mt-1">This year actual: {formatDollar(thisYear)}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  <Zap className="w-3 h-3 inline mr-1" />
                  Stretch Target (optional)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={data[stretchKey] ? (data[stretchKey] as number).toLocaleString('en-AU') : ''}
                    onChange={(e) => updateField(stretchKey, parseDollarInput(e.target.value))}
                    placeholder="0"
                    className="w-full pl-7 pr-3 py-2.5 text-lg font-semibold border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h4 className="font-medium text-gray-900 mb-2">Notes & Assumptions</h4>
        <p className="text-sm text-gray-500 mb-2">What assumptions underpin these targets?</p>
        <textarea
          value={data.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="e.g., Assuming 2 new hires in Q1, price increase in Q2, new product launch in Q3..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
        />
      </div>
    </div>
  );
}
