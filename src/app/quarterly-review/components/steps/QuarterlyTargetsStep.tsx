'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, QuarterlyTargets } from '../../types';
import { getDefaultQuarterlyTargets } from '../../types';
import {
  Target,
  DollarSign,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';

interface QuarterlyTargetsStepProps {
  review: QuarterlyReview;
  onUpdateTargets: (targets: QuarterlyTargets) => void;
}

interface BusinessKpi {
  id: string;
  kpi_id: string;
  name: string;
  friendly_name: string;
  category: string;
  unit: string;
  year1_target: number;
  current_value: number;
  is_active: boolean;
}

function formatCurrency(value: number): string {
  if (value === 0 || value === null || value === undefined) return '$0';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function parseCurrencyInput(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, '');
  if (cleaned === '' || cleaned === '-') return 0;
  return parseInt(cleaned) || 0;
}

export function QuarterlyTargetsStep({ review, onUpdateTargets }: QuarterlyTargetsStepProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [businessKpis, setBusinessKpis] = useState<BusinessKpi[]>([]);
  // Raw string overrides: when a key exists, the input shows the raw string.
  // On blur the raw string is parsed, the override is removed, and the formatted value shows.
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});

  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();

  const targets = { ...getDefaultQuarterlyTargets(), ...(review.quarterly_targets || {}) };
  const snapshot = review.annual_plan_snapshot;
  const realignment = review.realignment_decision;

  const nextQuarter = review.quarter < 4 ? review.quarter + 1 : 1;
  const nextYear = review.quarter < 4 ? review.year : review.year + 1;

  useEffect(() => {
    fetchKpis();
  }, []);

  // Pre-populate targets from annual plan math or realignment
  useEffect(() => {
    if (isLoading) return;

    // Only pre-populate if targets are all zero (not yet set)
    if (targets.revenue > 0 || targets.grossProfit > 0 || targets.netProfit > 0) return;

    let suggestedRevenue = 0;
    let suggestedGrossProfit = 0;
    let suggestedNetProfit = 0;

    // If realignment happened with adjusted targets, use those
    if (realignment?.choice === 'adjust_targets' && realignment.adjustedTargets) {
      suggestedRevenue = Math.round(realignment.adjustedTargets.revenue / 4);
      suggestedGrossProfit = Math.round(realignment.adjustedTargets.grossProfit / 4);
      suggestedNetProfit = Math.round(realignment.adjustedTargets.netProfit / 4);
    } else if (snapshot && snapshot.remainingQuarters > 0) {
      // Use run rate from annual plan: (annual - YTD) / remaining quarters
      suggestedRevenue = snapshot.runRateNeeded.revenue;
      suggestedGrossProfit = snapshot.runRateNeeded.grossProfit;
      suggestedNetProfit = snapshot.runRateNeeded.netProfit;
    }

    if (suggestedRevenue > 0 || suggestedGrossProfit > 0 || suggestedNetProfit > 0) {
      onUpdateTargets({
        ...targets,
        revenue: suggestedRevenue,
        grossProfit: suggestedGrossProfit,
        netProfit: suggestedNetProfit,
        kpis: targets.kpis.length > 0 ? targets.kpis : businessKpis.map((kpi) => ({
          id: kpi.kpi_id,
          name: kpi.friendly_name || kpi.name,
          target: Math.round(kpi.year1_target / 4),
          unit: kpi.unit,
        })),
      });
    }
  }, [isLoading, businessKpis]);

  const fetchKpis = async () => {
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

      const { data: kpisData } = await supabase
        .from('business_kpis')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('category', { ascending: true });

      if (kpisData) {
        setBusinessKpis(kpisData);

        // Initialize KPI targets if not yet set
        if (targets.kpis.length === 0 && kpisData.length > 0) {
          onUpdateTargets({
            ...targets,
            kpis: kpisData.map((kpi) => ({
              id: kpi.kpi_id,
              name: kpi.friendly_name || kpi.name,
              target: Math.round(kpi.year1_target / 4),
              unit: kpi.unit,
            })),
          });
        }
      }
    } catch (error) {
      console.error('Error fetching KPIs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateTarget = (field: 'revenue' | 'grossProfit' | 'netProfit', value: number) => {
    onUpdateTargets({ ...targets, [field]: value });
  };

  const updateKpiTarget = (kpiId: string, value: number) => {
    onUpdateTargets({
      ...targets,
      kpis: targets.kpis.map((kpi) =>
        kpi.id === kpiId ? { ...kpi, target: value } : kpi
      ),
    });
  };

  // Calculate projected year-end based on current targets
  const getProjectedYearEnd = (metric: 'revenue' | 'grossProfit' | 'netProfit') => {
    if (!snapshot) return null;
    const ytd = snapshot.ytdActuals[metric];
    const projected = ytd + targets[metric] * (snapshot.remainingQuarters || 1);
    return projected;
  };

  const getReconciliationStatus = () => {
    if (!snapshot || snapshot.annualTargets.revenue === 0) return null;

    const annualTarget = realignment?.choice === 'adjust_targets' && realignment.adjustedTargets
      ? realignment.adjustedTargets.revenue
      : snapshot.annualTargets.revenue;

    const projected = (snapshot.ytdActuals.revenue || 0) + targets.revenue * (snapshot.remainingQuarters || 1);

    if (projected >= annualTarget) {
      return { onTrack: true, projected, annual: annualTarget };
    }
    return { onTrack: false, projected, annual: annualTarget };
  };

  const reconciliation = getReconciliationStatus();

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="4.3"
          subtitle="Set your quarterly financial and KPI targets"
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
        step="4.3"
        subtitle={`Set your targets for Q${nextQuarter} ${nextYear}`}
        estimatedTime={15}
        tip="These targets flow from your annual plan and any realignment decisions"
      />

      {/* Context: Where these numbers come from */}
      <div className="bg-brand-orange-50 rounded-xl border border-brand-orange-200 p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-brand-orange mt-0.5 flex-shrink-0" />
          <div className="text-sm text-brand-orange-800">
            {realignment?.choice === 'adjust_targets' && realignment.adjustedTargets ? (
              <p>
                <strong>Targets pre-populated from your realigned annual plan.</strong> You adjusted
                your annual targets in the previous step. These quarterly targets reflect the new plan.
              </p>
            ) : snapshot && snapshot.runRateNeeded.revenue > 0 ? (
              <p>
                <strong>Targets pre-populated from annual plan math:</strong> (Annual target &minus; YTD actual)
                &divide; {snapshot.remainingQuarters} remaining quarter{snapshot.remainingQuarters !== 1 ? 's' : ''} = run rate needed.
                Adjust as needed.
              </p>
            ) : (
              <p>
                Enter your quarterly targets below. If you have an annual plan set up, targets will be
                calculated automatically.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Reconciliation Banner */}
      {reconciliation && (
        <div
          className={`rounded-xl border-2 p-4 mb-6 ${
            reconciliation.onTrack
              ? 'bg-green-50 border-green-200'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {reconciliation.onTrack ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            )}
            <p className={`text-sm font-medium ${reconciliation.onTrack ? 'text-green-800' : 'text-amber-800'}`}>
              These targets put you on track for{' '}
              <strong>{formatCurrency(reconciliation.projected)}</strong> by year end
              {reconciliation.onTrack
                ? ` - on track to hit your ${formatCurrency(reconciliation.annual)} target.`
                : ` - ${formatCurrency(reconciliation.annual - reconciliation.projected)} short of your ${formatCurrency(reconciliation.annual)} target.`}
            </p>
          </div>
        </div>
      )}

      {/* Financial Targets */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-6 mb-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-6">
          <DollarSign className="w-5 h-5 text-brand-orange" />
          Q{nextQuarter} {nextYear} Financial Targets
        </h3>

        <div className="space-y-6">
          {/* Revenue */}
          <div className="bg-brand-orange-50 rounded-xl p-5 border border-brand-orange-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-brand-orange" />
                <span className="font-medium text-brand-orange-700">Revenue Target</span>
              </div>
              {snapshot && (
                <span className="text-xs text-gray-500">
                  Annual: {formatCurrency(
                    realignment?.choice === 'adjust_targets' && realignment.adjustedTargets
                      ? realignment.adjustedTargets.revenue
                      : snapshot.annualTargets.revenue
                  )}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
              <input
                type="text"
                value={'revenue' in rawInputs ? rawInputs['revenue'] : (targets.revenue ? targets.revenue.toLocaleString('en-AU') : '')}
                onFocus={() => { setRawInputs(prev => ({ ...prev, revenue: targets.revenue ? String(targets.revenue) : '' })); }}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9.-]/g, ''); setRawInputs(prev => ({ ...prev, revenue: v })); }}
                onBlur={() => { const raw = rawInputs['revenue'] || ''; const parsed = raw === '' || raw === '-' ? 0 : parseInt(raw) || 0; updateTarget('revenue', parsed); setRawInputs(prev => { const next = { ...prev }; delete next['revenue']; return next; }); }}
                placeholder="0"
                className="w-full pl-8 pr-4 py-3 text-lg font-semibold border border-brand-orange-300 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
              />
            </div>
            {targets.revenue > 0 && targets.grossProfit > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                GP Margin: {((targets.grossProfit / targets.revenue) * 100).toFixed(1)}%
              </div>
            )}
            {(() => {
              const proj = getProjectedYearEnd('revenue');
              if (!proj || !snapshot) return null;
              return (
                <div className="mt-1 text-xs text-gray-500">
                  Projected year-end: {formatCurrency(proj)}
                </div>
              );
            })()}
          </div>

          {/* Gross Profit */}
          <div className="bg-green-50 rounded-xl p-5 border border-green-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="font-medium text-green-700">Gross Profit Target</span>
              </div>
              {snapshot && (
                <span className="text-xs text-gray-500">
                  Annual: {formatCurrency(
                    realignment?.choice === 'adjust_targets' && realignment.adjustedTargets
                      ? realignment.adjustedTargets.grossProfit
                      : snapshot.annualTargets.grossProfit
                  )}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
              <input
                type="text"
                value={'grossProfit' in rawInputs ? rawInputs['grossProfit'] : (targets.grossProfit ? targets.grossProfit.toLocaleString('en-AU') : '')}
                onFocus={() => { setRawInputs(prev => ({ ...prev, grossProfit: targets.grossProfit ? String(targets.grossProfit) : '' })); }}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9.-]/g, ''); setRawInputs(prev => ({ ...prev, grossProfit: v })); }}
                onBlur={() => { const raw = rawInputs['grossProfit'] || ''; const parsed = raw === '' || raw === '-' ? 0 : parseInt(raw) || 0; updateTarget('grossProfit', parsed); setRawInputs(prev => { const next = { ...prev }; delete next['grossProfit']; return next; }); }}
                placeholder="0"
                className="w-full pl-8 pr-4 py-3 text-lg font-semibold border border-green-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
              />
            </div>
            {(() => {
              const proj = getProjectedYearEnd('grossProfit');
              if (!proj || !snapshot) return null;
              return (
                <div className="mt-2 text-xs text-gray-500">
                  Projected year-end: {formatCurrency(proj)}
                </div>
              );
            })()}
          </div>

          {/* Net Profit */}
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-700">Net Profit Target</span>
              </div>
              {snapshot && (
                <span className="text-xs text-gray-500">
                  Annual: {formatCurrency(
                    realignment?.choice === 'adjust_targets' && realignment.adjustedTargets
                      ? realignment.adjustedTargets.netProfit
                      : snapshot.annualTargets.netProfit
                  )}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
              <input
                type="text"
                value={'netProfit' in rawInputs ? rawInputs['netProfit'] : (targets.netProfit ? targets.netProfit.toLocaleString('en-AU') : '')}
                onFocus={() => { setRawInputs(prev => ({ ...prev, netProfit: targets.netProfit ? String(targets.netProfit) : '' })); }}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9.-]/g, ''); setRawInputs(prev => ({ ...prev, netProfit: v })); }}
                onBlur={() => { const raw = rawInputs['netProfit'] || ''; const parsed = raw === '' || raw === '-' ? 0 : parseInt(raw) || 0; updateTarget('netProfit', parsed); setRawInputs(prev => { const next = { ...prev }; delete next['netProfit']; return next; }); }}
                placeholder="0"
                className="w-full pl-8 pr-4 py-3 text-lg font-semibold border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              />
            </div>
            {targets.revenue > 0 && targets.netProfit > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                Net Margin: {((targets.netProfit / targets.revenue) * 100).toFixed(1)}%
              </div>
            )}
            {(() => {
              const proj = getProjectedYearEnd('netProfit');
              if (!proj || !snapshot) return null;
              return (
                <div className="mt-1 text-xs text-gray-500">
                  Projected year-end: {formatCurrency(proj)}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* KPI Targets */}
      {targets.kpis.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-brand-orange" />
            KPI Targets for Q{nextQuarter}
          </h3>

          <div className="space-y-3">
            {targets.kpis.map((kpi) => {
              const dbKpi = businessKpis.find((k) => k.kpi_id === kpi.id);
              return (
                <div
                  key={kpi.id}
                  className="flex items-center gap-4 bg-gray-50 rounded-lg p-4 border border-gray-200"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 text-sm">{kpi.name}</div>
                    {dbKpi && (
                      <div className="text-xs text-gray-500">
                        Annual target: {dbKpi.year1_target} {dbKpi.unit}
                      </div>
                    )}
                  </div>
                  <div className="w-40">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={`kpi-${kpi.id}` in rawInputs ? rawInputs[`kpi-${kpi.id}`] : (kpi.target ? String(kpi.target) : '')}
                        onFocus={() => { setRawInputs(prev => ({ ...prev, [`kpi-${kpi.id}`]: kpi.target ? String(kpi.target) : '' })); }}
                        onChange={(e) => { const v = e.target.value.replace(/[^0-9.-]/g, ''); setRawInputs(prev => ({ ...prev, [`kpi-${kpi.id}`]: v })); }}
                        onBlur={() => { const raw = rawInputs[`kpi-${kpi.id}`] || ''; const parsed = raw === '' || raw === '-' ? 0 : parseFloat(raw) || 0; updateKpiTarget(kpi.id, parsed); setRawInputs(prev => { const next = { ...prev }; delete next[`kpi-${kpi.id}`]; return next; }); }}
                        placeholder="0"
                        inputMode="decimal"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-center focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                      />
                      {kpi.unit && (
                        <span className="text-xs text-gray-500 whitespace-nowrap">{kpi.unit}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {businessKpis.length > targets.kpis.length && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                {businessKpis.length - targets.kpis.length} additional KPIs available. They will be
                added when you save.
              </p>
            </div>
          )}
        </div>
      )}

      {/* No KPIs state */}
      {targets.kpis.length === 0 && businessKpis.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center">
          <Target className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">No KPIs configured.</p>
          <p className="text-sm text-gray-500 mt-1">
            Set up KPIs in your Goals wizard to track them each quarter.
          </p>
        </div>
      )}

      {/* Summary */}
      <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 p-4">
        <h4 className="font-medium text-gray-900 mb-2">Q{nextQuarter} {nextYear} Target Summary</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(targets.revenue)}</div>
            <div className="text-xs text-gray-600">Revenue</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(targets.grossProfit)}</div>
            <div className="text-xs text-gray-600">Gross Profit</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(targets.netProfit)}</div>
            <div className="text-xs text-gray-600">Net Profit</div>
          </div>
        </div>
      </div>
    </div>
  );
}
