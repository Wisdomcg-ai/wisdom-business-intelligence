'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, DashboardSnapshot, CoreMetricsSnapshot } from '../../types';
import { calculateQuarters, determinePlanYear, QuarterInfo } from '@/app/goals/utils/quarters';
import { YearType } from '@/app/goals/types';
import {
  DollarSign, TrendingUp, TrendingDown, Minus,
  Target, MessageSquare, Lightbulb, Loader2, ExternalLink, AlertCircle, Calendar,
  Users, Clock, BarChart3
} from 'lucide-react';
import Link from 'next/link';

interface ScorecardReviewStepProps {
  review: QuarterlyReview;
  onUpdate: (snapshot: DashboardSnapshot) => void;
  onUpdateCommentary?: (commentary: string) => void;
}

interface FinancialMetric {
  id: string;
  label: string;
  target: number;
  actual: number;
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
}

interface QuarterlyTargetsData {
  revenue?: { q1?: string; q2?: string; q3?: string; q4?: string };
  grossProfit?: { q1?: string; q2?: string; q3?: string; q4?: string };
  netProfit?: { q1?: string; q2?: string; q3?: string; q4?: string };
}

interface CoreMetric {
  id: string;
  label: string;
  target: number;
  actual: number;
  unit: string;
  format: 'number' | 'percentage' | 'currency' | 'hours';
}

export function ScorecardReviewStep({ review, onUpdate, onUpdateCommentary }: ScorecardReviewStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();
  const [isLoading, setIsLoading] = useState(true);

  const [businessKpis, setBusinessKpis] = useState<BusinessKpi[]>([]);
  const [hasTargetsFromPlan, setHasTargetsFromPlan] = useState(false);
  const [targetsSource, setTargetsSource] = useState<'quarterly' | 'annual' | null>(null);
  const [yearType, setYearType] = useState<YearType>('FY');
  const [quarterInfo, setQuarterInfo] = useState<QuarterInfo | null>(null);

  const existingSnapshot = review.dashboard_snapshot || {};

  const [financials, setFinancials] = useState<FinancialMetric[]>([
    { id: 'revenue', label: 'Revenue', target: existingSnapshot.revenue?.target || 0, actual: existingSnapshot.revenue?.actual || 0 },
    { id: 'grossProfit', label: 'Gross Profit', target: existingSnapshot.grossProfit?.target || 0, actual: existingSnapshot.grossProfit?.actual || 0 },
    { id: 'netProfit', label: 'Net Profit', target: existingSnapshot.netProfit?.target || 0, actual: existingSnapshot.netProfit?.actual || 0 }
  ]);

  const [kpiActuals, setKpiActuals] = useState<Record<string, number>>(
    existingSnapshot.kpis?.reduce((acc, kpi) => ({ ...acc, [kpi.id]: kpi.actual }), {}) || {}
  );

  const [commentary, setCommentary] = useState(review.scorecard_commentary || '');

  // Raw string overrides: when a key exists, the input shows the raw string.
  // On blur the raw string is parsed to a number, the override is removed,
  // and the formatted number is shown instead.  No focus tracking needed.
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});

  const [coreMetrics, setCoreMetrics] = useState<CoreMetric[]>([
    { id: 'leadsPerMonth', label: 'Leads per Month', target: existingSnapshot.coreMetrics?.leadsPerMonth?.target || 0, actual: existingSnapshot.coreMetrics?.leadsPerMonth?.actual || 0, unit: '', format: 'number' },
    { id: 'conversionRate', label: 'Conversion Rate', target: existingSnapshot.coreMetrics?.conversionRate?.target || 0, actual: existingSnapshot.coreMetrics?.conversionRate?.actual || 0, unit: '%', format: 'percentage' },
    { id: 'avgTransactionValue', label: 'Avg Transaction Value', target: existingSnapshot.coreMetrics?.avgTransactionValue?.target || 0, actual: existingSnapshot.coreMetrics?.avgTransactionValue?.actual || 0, unit: '$', format: 'currency' },
    { id: 'teamHeadcount', label: 'Team Headcount (FTE)', target: existingSnapshot.coreMetrics?.teamHeadcount?.target || 0, actual: existingSnapshot.coreMetrics?.teamHeadcount?.actual || 0, unit: '', format: 'number' },
    { id: 'ownerHoursPerWeek', label: 'Owner Hours per Week', target: existingSnapshot.coreMetrics?.ownerHoursPerWeek?.target || 0, actual: existingSnapshot.coreMetrics?.ownerHoursPerWeek?.actual || 0, unit: 'hrs', format: 'hours' }
  ]);
  const [hasCoreMetricsFromPlan, setHasCoreMetricsFromPlan] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const targetUserId = activeBusiness?.ownerId || user.id;
      const { data: profile } = await supabase.from('business_profiles').select('id').eq('user_id', targetUserId).maybeSingle();
      const businessId = profile?.id || review.business_id;

      const { data: goalsData, error: goalsError } = await supabase
        .from('business_financial_goals')
        .select('*, quarterly_targets, year_type')
        .eq('business_id', businessId)
        .maybeSingle();

      if (goalsError && goalsError.code !== 'PGRST116') {
        console.error('[Scorecard] Error fetching goals:', goalsError);
      }

      const loadedYearType = (goalsData?.year_type as YearType) || 'FY';
      setYearType(loadedYearType);

      const planYear = determinePlanYear(loadedYearType);
      const quarters = calculateQuarters(loadedYearType, planYear);
      const quarterKey = `q${review.quarter}` as 'q1' | 'q2' | 'q3' | 'q4';
      const currentQuarterInfo = quarters.find(q => q.id === quarterKey) || quarters[0];
      setQuarterInfo(currentQuarterInfo);

      if (goalsData) {
        let qRevenue = 0, qGrossProfit = 0, qNetProfit = 0;
        let source: 'quarterly' | 'annual' = 'quarterly';

        const quarterlyTargets = goalsData.quarterly_targets as QuarterlyTargetsData | null;
        if (quarterlyTargets) {
          qRevenue = parseFloat(quarterlyTargets.revenue?.[quarterKey] || '0') || 0;
          qGrossProfit = parseFloat(quarterlyTargets.grossProfit?.[quarterKey] || '0') || 0;
          qNetProfit = parseFloat(quarterlyTargets.netProfit?.[quarterKey] || '0') || 0;
          if (qRevenue > 0 || qGrossProfit > 0 || qNetProfit > 0) source = 'quarterly';
        }

        if (qRevenue === 0 && qGrossProfit === 0 && qNetProfit === 0) {
          const annualRevenue = goalsData.revenue_year1 || 0;
          const annualGrossProfit = goalsData.gross_profit_year1 || 0;
          const annualNetProfit = goalsData.net_profit_year1 || 0;
          if (annualRevenue > 0 || annualGrossProfit > 0 || annualNetProfit > 0) {
            qRevenue = Math.round(annualRevenue / 4);
            qGrossProfit = Math.round(annualGrossProfit / 4);
            qNetProfit = Math.round(annualNetProfit / 4);
            source = 'annual';
          }
        }

        if (qRevenue > 0 || qGrossProfit > 0 || qNetProfit > 0) {
          setHasTargetsFromPlan(true);
          setTargetsSource(source);
          setFinancials(prev => [
            { ...prev[0], target: existingSnapshot.revenue?.target || qRevenue, actual: existingSnapshot.revenue?.actual || prev[0].actual },
            { ...prev[1], target: existingSnapshot.grossProfit?.target || qGrossProfit, actual: existingSnapshot.grossProfit?.actual || prev[1].actual },
            { ...prev[2], target: existingSnapshot.netProfit?.target || qNetProfit, actual: existingSnapshot.netProfit?.actual || prev[2].actual }
          ]);
        }

        const coreMetricsFromGoals = {
          leadsPerMonth: goalsData.leads_per_month_year1 || 0,
          conversionRate: goalsData.conversion_rate_year1 || 0,
          avgTransactionValue: goalsData.avg_transaction_value_year1 || 0,
          teamHeadcount: goalsData.team_headcount_year1 || 0,
          ownerHoursPerWeek: goalsData.owner_hours_per_week_year1 || 0
        };

        if (Object.values(coreMetricsFromGoals).some(v => v > 0)) {
          setHasCoreMetricsFromPlan(true);
          setCoreMetrics(prev => prev.map(metric => {
            const goalValue = coreMetricsFromGoals[metric.id as keyof typeof coreMetricsFromGoals] || 0;
            return {
              ...metric,
              target: existingSnapshot.coreMetrics?.[metric.id as keyof CoreMetricsSnapshot]?.target || goalValue,
              actual: existingSnapshot.coreMetrics?.[metric.id as keyof CoreMetricsSnapshot]?.actual || metric.actual
            };
          }));
        }
      }

      const { data: kpisData, error: kpisError } = await supabase
        .from('business_kpis')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('category', { ascending: true });

      if (!kpisError && kpisData && kpisData.length > 0) {
        setBusinessKpis(kpisData);
        const existingActuals: Record<string, number> = {};
        existingSnapshot.kpis?.forEach(kpi => { existingActuals[kpi.id] = kpi.actual; });
        setKpiActuals(existingActuals);
      }
    } catch (err) {
      console.error('[Scorecard] Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const snapshot: DashboardSnapshot = {
      revenue: { target: financials[0].target, actual: financials[0].actual, variance: calculateVariance(financials[0].target, financials[0].actual), percentageAchieved: calculatePercentage(financials[0].target, financials[0].actual) },
      grossProfit: { target: financials[1].target, actual: financials[1].actual, variance: calculateVariance(financials[1].target, financials[1].actual), percentageAchieved: calculatePercentage(financials[1].target, financials[1].actual) },
      netProfit: { target: financials[2].target, actual: financials[2].actual, variance: calculateVariance(financials[2].target, financials[2].actual), percentageAchieved: calculatePercentage(financials[2].target, financials[2].actual) },
      kpis: businessKpis.map(kpi => ({ id: kpi.kpi_id, name: kpi.friendly_name || kpi.name, target: kpi.year1_target || 0, actual: kpiActuals[kpi.kpi_id] || 0, unit: kpi.unit })),
      coreMetrics: {
        leadsPerMonth: buildCoreMetricSnapshot('leadsPerMonth'),
        conversionRate: buildCoreMetricSnapshot('conversionRate'),
        avgTransactionValue: buildCoreMetricSnapshot('avgTransactionValue'),
        teamHeadcount: buildCoreMetricSnapshot('teamHeadcount'),
        ownerHoursPerWeek: buildCoreMetricSnapshot('ownerHoursPerWeek')
      }
    };
    onUpdate(snapshot);
  }, [financials, kpiActuals, businessKpis, coreMetrics]);

  useEffect(() => {
    if (onUpdateCommentary) onUpdateCommentary(commentary);
  }, [commentary]);

  const buildCoreMetricSnapshot = (id: string) => {
    const metric = coreMetrics.find(m => m.id === id);
    if (!metric) return { target: 0, actual: 0, variance: 0 };
    return { target: metric.target, actual: metric.actual, variance: calculateVariance(metric.target, metric.actual) };
  };

  const calculateVariance = (target: number, actual: number): number => {
    if (!target) return 0;
    return ((actual - target) / target) * 100;
  };

  const calculatePercentage = (target: number, actual: number): number => {
    if (!target) return 0;
    return (actual / target) * 100;
  };

  const formatCurrency = (value: number): string => {
    if (value === 0 || value === null || value === undefined) return '$0';
    const formatted = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(value));
    return value < 0 ? `(${formatted})` : formatted;
  };

  const parseCurrencyInput = (value: string): number => {
    const cleaned = value.replace(/[$,\s]/g, '');
    if (cleaned === '' || cleaned === '-') return 0;
    return parseInt(cleaned) || 0;
  };

  const updateFinancialActual = (id: string, value: number) => {
    setFinancials(prev => prev.map(f => f.id === id ? { ...f, actual: value } : f));
  };

  const updateFinancialTarget = (id: string, value: number) => {
    setFinancials(prev => prev.map(f => f.id === id ? { ...f, target: value } : f));
  };

  const updateKpiActual = (kpiId: string, value: number) => {
    setKpiActuals(prev => ({ ...prev, [kpiId]: value }));
  };

  const updateCoreMetricActual = (id: string, value: number) => {
    setCoreMetrics(prev => prev.map(m => m.id === id ? { ...m, actual: value } : m));
  };

  const formatCoreMetricValue = (metric: CoreMetric, value: number): string => {
    if (value === 0 || value === null || value === undefined) return '';
    switch (metric.format) {
      case 'currency': return formatCurrency(value);
      case 'percentage': return `${value}%`;
      default: return `${value}`;
    }
  };

  const parseCoreMetricInput = (metric: CoreMetric, value: string): number => {
    switch (metric.format) {
      case 'currency': return parseCurrencyInput(value);
      case 'percentage': return parseFloat(value.replace('%', '')) || 0;
      default: return parseFloat(value) || 0;
    }
  };

  const formatKpiValue = (value: number, unit: string): string => {
    if (value === 0 || value === null || value === undefined) return '-';
    if (unit === 'currency' || unit === '$') return formatCurrency(value);
    if (unit === '%' || unit === 'percentage') return `${value}%`;
    return `${value}${unit ? ` ${unit}` : ''}`;
  };

  const getKpiDisplayUnit = (unit: string): string => {
    if (unit === 'currency' || unit === '$') return '';
    if (unit === 'percentage') return '';
    return unit;
  };

  const getVarianceIcon = (variance: number) => {
    if (variance > 5) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (variance < -5) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getVarianceColor = (variance: number) => {
    if (variance > 5) return 'text-green-600 bg-green-50';
    if (variance < -5) return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  const planYear = useMemo(() => determinePlanYear(yearType), [yearType]);

  if (isLoading) {
    return (
      <div>
        <StepHeader step="1.2" subtitle="How did you perform against your quarterly goals?" estimatedTime={15} />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  const kpisByCategory = businessKpis.reduce((acc, kpi) => {
    const cat = kpi.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(kpi);
    return acc;
  }, {} as Record<string, BusinessKpi[]>);

  return (
    <div>
      <StepHeader step="1.2" subtitle="Review your performance against your quarterly targets" estimatedTime={15} />

      {/* Quarter Header */}
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border border-[#8E9AAF] p-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#3E3F57] mb-1">Quarter Performance Review</h2>
            <p className="text-gray-600 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {quarterInfo ? <span>{quarterInfo.label} • {quarterInfo.months} • {yearType} {planYear}</span> : <span>Q{review.quarter} {review.year}</span>}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600 mb-1">Reviewing</div>
            <div className="text-3xl font-bold text-[#4C5D75]">{quarterInfo?.label || `Q${review.quarter}`}</div>
          </div>
        </div>
      </div>

      {/* Financial Performance */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-brand-orange-50 to-slate-50 px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-brand-orange" />
                <h3 className="font-semibold text-gray-900">Financial Performance</h3>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {hasTargetsFromPlan && targetsSource === 'quarterly'
                  ? `Your ${quarterInfo?.label || `Q${review.quarter}`} targets from your 90-day sprint`
                  : hasTargetsFromPlan && targetsSource === 'annual'
                  ? 'Using annual targets ÷ 4 (set specific quarterly targets in Goals)'
                  : 'Enter your quarterly targets and actuals'}
              </p>
            </div>
            {hasTargetsFromPlan && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${targetsSource === 'quarterly' ? 'bg-brand-orange-100 text-brand-orange-700' : 'bg-amber-100 text-amber-700'}`}>
                {targetsSource === 'quarterly' ? 'From Sprint Plan' : 'From Annual Goals'}
              </span>
            )}
          </div>
        </div>

        <div className="p-5">
          {hasTargetsFromPlan && (
            <div className={`rounded-lg p-3 mb-4 border ${targetsSource === 'quarterly' ? 'bg-brand-orange-50 border-brand-orange-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-start gap-2">
                <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${targetsSource === 'quarterly' ? 'text-brand-orange' : 'text-amber-600'}`} />
                <p className={`text-sm ${targetsSource === 'quarterly' ? 'text-brand-orange-700' : 'text-amber-700'}`}>
                  {targetsSource === 'quarterly' ? 'Targets loaded from your 90-day sprint plan. Enter your actual results for the quarter.' : 'Using your annual targets divided by 4. For precise quarterly targets, set them in the Goals wizard.'}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-12 gap-4 mb-3 px-2">
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Metric</div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">{quarterInfo?.label || `Q${review.quarter}`} Target</div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">{quarterInfo?.label || `Q${review.quarter}`} Actual</div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Variance</div>
          </div>

          <div className="space-y-3">
            {financials.map((metric) => {
              const variance = calculateVariance(metric.target, metric.actual);
              return (
                <div key={metric.id} className="grid grid-cols-12 gap-4 items-center bg-gray-50 rounded-lg p-3">
                  <div className="col-span-3"><span className="font-medium text-gray-900">{metric.label}</span></div>
                  <div className="col-span-3">
                    {hasTargetsFromPlan && metric.target > 0 ? (
                      <div className="px-3 py-2 bg-gray-100 rounded-lg text-center text-sm font-medium text-gray-700">{formatCurrency(metric.target)}</div>
                    ) : (
                      <input type="text"
                        value={`fin-target-${metric.id}` in rawInputs ? rawInputs[`fin-target-${metric.id}`] : (metric.target !== 0 ? formatCurrency(metric.target) : '')}
                        onFocus={() => { setRawInputs(prev => ({ ...prev, [`fin-target-${metric.id}`]: metric.target !== 0 ? String(metric.target) : '' })); }}
                        onChange={(e) => { const v = e.target.value.replace(/[^0-9.-]/g, ''); setRawInputs(prev => ({ ...prev, [`fin-target-${metric.id}`]: v })); }}
                        onBlur={() => { const raw = rawInputs[`fin-target-${metric.id}`] || ''; const parsed = raw === '' || raw === '-' ? 0 : parseInt(raw) || 0; updateFinancialTarget(metric.id, parsed); setRawInputs(prev => { const next = { ...prev }; delete next[`fin-target-${metric.id}`]; return next; }); }}
                        placeholder="$0" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500" />
                    )}
                  </div>
                  <div className="col-span-3">
                    <input type="text"
                      value={`fin-actual-${metric.id}` in rawInputs ? rawInputs[`fin-actual-${metric.id}`] : (metric.actual !== 0 ? formatCurrency(metric.actual) : '')}
                      onFocus={() => { setRawInputs(prev => ({ ...prev, [`fin-actual-${metric.id}`]: metric.actual !== 0 ? String(metric.actual) : '' })); }}
                      onChange={(e) => { const v = e.target.value.replace(/[^0-9.-]/g, ''); setRawInputs(prev => ({ ...prev, [`fin-actual-${metric.id}`]: v })); }}
                      onBlur={() => { const raw = rawInputs[`fin-actual-${metric.id}`] || ''; const parsed = raw === '' || raw === '-' ? 0 : parseInt(raw) || 0; updateFinancialActual(metric.id, parsed); setRawInputs(prev => { const next = { ...prev }; delete next[`fin-actual-${metric.id}`]; return next; }); }}
                      placeholder="$0" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 bg-white" />
                  </div>
                  <div className="col-span-3">
                    <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg ${getVarianceColor(variance)}`}>
                      {getVarianceIcon(variance)}
                      <span className="font-semibold text-sm">{metric.target > 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}%` : '-'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!hasTargetsFromPlan && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                No targets found from your 90-day sprint plan.{' '}
                <Link href="/goals" className="text-brand-orange hover:text-brand-orange-700 font-medium">Set up your targets →</Link>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Core Business Metrics */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Core Business Metrics</h3>
              </div>
              <p className="text-sm text-gray-600 mt-1">{hasCoreMetricsFromPlan ? 'Track your key operational metrics from your strategic plan' : 'Essential metrics that drive your business growth'}</p>
            </div>
            {hasCoreMetricsFromPlan && <span className="text-xs px-2 py-1 rounded-full font-medium bg-brand-orange-100 text-brand-orange-700">From Goals</span>}
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-12 gap-4 mb-3 px-2">
            <div className="col-span-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Metric</div>
            <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Target</div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Actual</div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Variance</div>
          </div>
          <div className="space-y-3">
            {coreMetrics.map((metric) => {
              const variance = calculateVariance(metric.target, metric.actual);
              const isInverseMetric = metric.id === 'ownerHoursPerWeek';
              const displayVariance = isInverseMetric ? -variance : variance;
              return (
                <div key={metric.id} className="grid grid-cols-12 gap-4 items-center bg-gray-50 rounded-lg p-3">
                  <div className="col-span-4 flex items-center gap-2">
                    {metric.id === 'leadsPerMonth' && <TrendingUp className="w-4 h-4 text-brand-orange" />}
                    {metric.id === 'conversionRate' && <Target className="w-4 h-4 text-green-500" />}
                    {metric.id === 'avgTransactionValue' && <DollarSign className="w-4 h-4 text-amber-500" />}
                    {metric.id === 'teamHeadcount' && <Users className="w-4 h-4 text-brand-navy" />}
                    {metric.id === 'ownerHoursPerWeek' && <Clock className="w-4 h-4 text-red-500" />}
                    <span className="font-medium text-gray-900 text-sm">{metric.label}</span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="text-sm text-gray-600 font-medium">
                      {metric.format === 'currency' && metric.target > 0 ? formatCurrency(metric.target) : metric.format === 'percentage' && metric.target > 0 ? `${metric.target}%` : metric.target > 0 ? `${metric.target}${metric.unit ? ` ${metric.unit}` : ''}` : '-'}
                    </span>
                  </div>
                  <div className="col-span-3">
                    <input type="text"
                      value={`core-${metric.id}` in rawInputs ? rawInputs[`core-${metric.id}`] : formatCoreMetricValue(metric, metric.actual)}
                      onFocus={() => { setRawInputs(prev => ({ ...prev, [`core-${metric.id}`]: metric.actual !== 0 ? String(metric.actual) : '' })); }}
                      onChange={(e) => { const v = e.target.value.replace(/[^0-9.%-]/g, ''); setRawInputs(prev => ({ ...prev, [`core-${metric.id}`]: v })); }}
                      onBlur={() => { const raw = rawInputs[`core-${metric.id}`] || ''; const parsed = raw === '' || raw === '-' ? 0 : parseCoreMetricInput(metric, raw); updateCoreMetricActual(metric.id, parsed); setRawInputs(prev => { const next = { ...prev }; delete next[`core-${metric.id}`]; return next; }); }}
                      placeholder={metric.format === 'currency' ? '$0' : '0'} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 bg-white" />
                  </div>
                  <div className="col-span-3">
                    <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg ${getVarianceColor(displayVariance)}`}>
                      {getVarianceIcon(displayVariance)}
                      <span className="font-semibold text-sm">{metric.target > 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}%` : '-'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="bg-gray-50 px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Key Performance Indicators</h3>
              </div>
              <p className="text-sm text-gray-600 mt-1">Review your KPIs from your strategic plan</p>
            </div>
            <Link href="/goals" className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-orange hover:text-brand-orange-700">
              Edit KPIs <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
        <div className="p-5">
          {businessKpis.length === 0 ? (
            <div className="text-center py-8">
              <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h4 className="font-semibold text-gray-900 mb-2">No KPIs Configured</h4>
              <p className="text-sm text-gray-500 mb-4">Set up your KPIs in the Goals wizard to track them here.</p>
              <Link href="/goals" className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange-600">
                Set Up KPIs <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-12 gap-4 px-2">
                <div className="col-span-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">KPI</div>
                <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Target</div>
                <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Actual</div>
                <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Variance</div>
              </div>
              {Object.entries(kpisByCategory).map(([category, kpis]) => (
                <div key={category}>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-2">{category}</h4>
                  <div className="space-y-2">
                    {kpis.map((kpi) => {
                      const actual = kpiActuals[kpi.kpi_id] || 0;
                      const target = kpi.year1_target || 0;
                      const variance = calculateVariance(target, actual);
                      return (
                        <div key={kpi.kpi_id} className="grid grid-cols-12 gap-4 items-center bg-gray-50 rounded-lg p-3">
                          <div className="col-span-4"><span className="font-medium text-gray-900 text-sm">{kpi.friendly_name || kpi.name}</span></div>
                          <div className="col-span-2 text-center"><span className="text-sm text-gray-600 font-medium">{formatKpiValue(target, kpi.unit)}</span></div>
                          <div className="col-span-3">
                            <div className="flex items-center gap-1">
                              <input type="text"
                                value={`kpi-${kpi.kpi_id}` in rawInputs ? rawInputs[`kpi-${kpi.kpi_id}`] : (kpi.unit === 'currency' || kpi.unit === '$' ? (actual !== 0 ? formatCurrency(actual) : '') : (actual !== 0 ? String(actual) : ''))}
                                onFocus={() => { setRawInputs(prev => ({ ...prev, [`kpi-${kpi.kpi_id}`]: actual !== 0 ? String(actual) : '' })); }}
                                onChange={(e) => { const v = e.target.value.replace(/[^0-9.-]/g, ''); setRawInputs(prev => ({ ...prev, [`kpi-${kpi.kpi_id}`]: v })); }}
                                onBlur={() => { const raw = rawInputs[`kpi-${kpi.kpi_id}`] || ''; const parsed = raw === '' || raw === '-' ? 0 : (kpi.unit === 'currency' || kpi.unit === '$' ? parseCurrencyInput(raw) : parseFloat(raw) || 0); updateKpiActual(kpi.kpi_id, parsed); setRawInputs(prev => { const next = { ...prev }; delete next[`kpi-${kpi.kpi_id}`]; return next; }); }}
                                placeholder={kpi.unit === 'currency' || kpi.unit === '$' ? '$0' : '0'} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500" />
                              {getKpiDisplayUnit(kpi.unit) && <span className="text-xs text-gray-500 whitespace-nowrap">{getKpiDisplayUnit(kpi.unit)}</span>}
                            </div>
                          </div>
                          <div className="col-span-3">
                            <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg ${getVarianceColor(variance)}`}>
                              {getVarianceIcon(variance)}
                              <span className="font-semibold text-sm">{target > 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}%` : '-'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Commentary */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">Performance Commentary</h3>
          </div>
          <p className="text-sm text-gray-600 mt-1">What drove these results?</p>
        </div>
        <div className="p-5">
          <div className="bg-brand-orange-50 rounded-lg p-4 mb-4 border border-brand-orange-200">
            <div className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-brand-orange mt-0.5 flex-shrink-0" />
              <div className="text-sm text-brand-orange-800">
                <p className="font-medium mb-1">Consider discussing:</p>
                <ul className="space-y-0.5 text-brand-orange-700">
                  <li>• What contributed to hitting or missing targets?</li>
                  <li>• Any external factors that impacted performance?</li>
                  <li>• What surprised you about the results?</li>
                </ul>
              </div>
            </div>
          </div>
          <textarea value={commentary} onChange={(e) => setCommentary(e.target.value)} placeholder="Add your observations and insights about this quarter's performance..." rows={4} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 resize-none" />
        </div>
      </div>
    </div>
  );
}
