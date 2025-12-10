'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, DashboardSnapshot, CoreMetricsSnapshot, ActionReplay } from '../../types';
import { getDefaultActionReplay } from '../../types';
import { calculateQuarters, determinePlanYear, QuarterInfo } from '@/app/goals/utils/quarters';
import { YearType } from '@/app/goals/types';
import {
  DollarSign, TrendingUp, TrendingDown, Minus,
  Target, MessageSquare, Lightbulb, Loader2, ExternalLink, AlertCircle, Calendar,
  Users, Clock, BarChart3, CheckCircle2, XCircle, AlertTriangle, Plus, X, Sparkles
} from 'lucide-react';
import Link from 'next/link';

interface DashboardReviewStepProps {
  review: QuarterlyReview;
  onUpdate: (snapshot: DashboardSnapshot) => void;
  onUpdateActionReplay: (actionReplay: ActionReplay) => void;
}

type ActionColumn = 'worked' | 'didntWork' | 'plannedButDidnt' | 'newIdeas';

const ACTION_COLUMN_CONFIG: Record<ActionColumn, {
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  placeholder: string;
}> = {
  worked: {
    title: 'What Worked',
    description: 'Actions that delivered results',
    icon: CheckCircle2,
    iconColor: 'text-green-600',
    placeholder: 'e.g., Weekly team meetings improved communication'
  },
  didntWork: {
    title: "What Didn't Work",
    description: 'Actions that fell short',
    icon: XCircle,
    iconColor: 'text-red-500',
    placeholder: 'e.g., Cold email campaign had low response rate'
  },
  plannedButDidnt: {
    title: "Planned But Didn't Do",
    description: 'Intentions that got deferred',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    placeholder: 'e.g., Website redesign kept getting pushed back'
  },
  newIdeas: {
    title: 'New Ideas',
    description: 'Insights for next quarter',
    icon: Lightbulb,
    iconColor: 'text-brand-orange',
    placeholder: 'e.g., Partner with complementary businesses'
  }
};

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

export function DashboardReviewStep({ review, onUpdate, onUpdateActionReplay }: DashboardReviewStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();
  const [isLoading, setIsLoading] = useState(true);

  // Action Replay state
  const actionReplay = review.action_replay || getDefaultActionReplay();
  const [newItems, setNewItems] = useState<Record<ActionColumn, string>>({
    worked: '',
    didntWork: '',
    plannedButDidnt: '',
    newIdeas: ''
  });
  const [businessKpis, setBusinessKpis] = useState<BusinessKpi[]>([]);
  const [hasTargetsFromPlan, setHasTargetsFromPlan] = useState(false);
  const [targetsSource, setTargetsSource] = useState<'quarterly' | 'annual' | null>(null);
  const [yearType, setYearType] = useState<YearType>('FY');
  const [quarterInfo, setQuarterInfo] = useState<QuarterInfo | null>(null);

  // Initialize from existing snapshot or defaults
  const existingSnapshot = review.dashboard_snapshot || {};

  const [financials, setFinancials] = useState<FinancialMetric[]>([
    {
      id: 'revenue',
      label: 'Revenue',
      target: existingSnapshot.revenue?.target || 0,
      actual: existingSnapshot.revenue?.actual || 0
    },
    {
      id: 'grossProfit',
      label: 'Gross Profit',
      target: existingSnapshot.grossProfit?.target || 0,
      actual: existingSnapshot.grossProfit?.actual || 0
    },
    {
      id: 'netProfit',
      label: 'Net Profit',
      target: existingSnapshot.netProfit?.target || 0,
      actual: existingSnapshot.netProfit?.actual || 0
    }
  ]);

  const [kpiActuals, setKpiActuals] = useState<Record<string, number>>(
    existingSnapshot.kpis?.reduce((acc, kpi) => ({
      ...acc,
      [kpi.id]: kpi.actual
    }), {}) || {}
  );

  const [commentary, setCommentary] = useState(
    (existingSnapshot as any).commentary || ''
  );

  // Core Business Metrics from Goals
  const [coreMetrics, setCoreMetrics] = useState<CoreMetric[]>([
    {
      id: 'leadsPerMonth',
      label: 'Leads per Month',
      target: existingSnapshot.coreMetrics?.leadsPerMonth?.target || 0,
      actual: existingSnapshot.coreMetrics?.leadsPerMonth?.actual || 0,
      unit: '',
      format: 'number'
    },
    {
      id: 'conversionRate',
      label: 'Conversion Rate',
      target: existingSnapshot.coreMetrics?.conversionRate?.target || 0,
      actual: existingSnapshot.coreMetrics?.conversionRate?.actual || 0,
      unit: '%',
      format: 'percentage'
    },
    {
      id: 'avgTransactionValue',
      label: 'Avg Transaction Value',
      target: existingSnapshot.coreMetrics?.avgTransactionValue?.target || 0,
      actual: existingSnapshot.coreMetrics?.avgTransactionValue?.actual || 0,
      unit: '$',
      format: 'currency'
    },
    {
      id: 'teamHeadcount',
      label: 'Team Headcount (FTE)',
      target: existingSnapshot.coreMetrics?.teamHeadcount?.target || 0,
      actual: existingSnapshot.coreMetrics?.teamHeadcount?.actual || 0,
      unit: '',
      format: 'number'
    },
    {
      id: 'ownerHoursPerWeek',
      label: 'Owner Hours per Week',
      target: existingSnapshot.coreMetrics?.ownerHoursPerWeek?.target || 0,
      actual: existingSnapshot.coreMetrics?.ownerHoursPerWeek?.actual || 0,
      unit: 'hrs',
      format: 'hours'
    }
  ]);
  const [hasCoreMetricsFromPlan, setHasCoreMetricsFromPlan] = useState(false);

  // Fetch targets and KPIs
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[Quarter Performance] No user found');
        setIsLoading(false);
        return;
      }

      // Use activeBusiness owner ID if coach is viewing, otherwise use current user ID
      const targetUserId = activeBusiness?.ownerId || user.id;

      // Get the user's actual business profile (like Goals wizard does)
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', targetUserId)
        .single();

      // Use the profile's business_id if available, otherwise fall back to review.business_id
      const businessId = profile?.id || review.business_id;

      console.log('[Quarter Performance] User business_id from profile:', profile?.id);
      console.log('[Quarter Performance] Review business_id:', review.business_id);
      console.log('[Quarter Performance] Using business_id:', businessId);

      // Fetch ALL financial goals data (including year_type and quarterly_targets)
      const { data: goalsData, error: goalsError } = await supabase
        .from('business_financial_goals')
        .select('*, quarterly_targets, year_type')
        .eq('business_id', businessId)
        .single();

      console.log('[Quarter Performance] Goals data:', goalsData);
      console.log('[Quarter Performance] Goals error:', goalsError);

      if (goalsError && goalsError.code !== 'PGRST116') {
        console.error('[Quarter Performance] Error fetching goals:', goalsError);
      }

      // Get year type from goals or default to FY
      const loadedYearType = (goalsData?.year_type as YearType) || 'FY';
      setYearType(loadedYearType);

      // Calculate the proper quarter info based on FY/CY and the review's quarter
      const planYear = determinePlanYear(loadedYearType);
      const quarters = calculateQuarters(loadedYearType, planYear);
      const quarterKey = `q${review.quarter}` as 'q1' | 'q2' | 'q3' | 'q4';
      const currentQuarterInfo = quarters.find(q => q.id === quarterKey) || quarters[0];
      setQuarterInfo(currentQuarterInfo);

      console.log('[Quarter Performance] Year type:', loadedYearType);
      console.log('[Quarter Performance] Quarter key:', quarterKey);
      console.log('[Quarter Performance] Quarter info:', currentQuarterInfo);

      if (goalsData) {
        let qRevenue = 0;
        let qGrossProfit = 0;
        let qNetProfit = 0;
        let source: 'quarterly' | 'annual' = 'quarterly';

        // First try quarterly_targets if it exists and has data for this quarter
        const quarterlyTargets = goalsData.quarterly_targets as QuarterlyTargetsData | null;
        console.log('[Quarter Performance] Quarterly targets:', quarterlyTargets);

        if (quarterlyTargets) {
          qRevenue = parseFloat(quarterlyTargets.revenue?.[quarterKey] || '0') || 0;
          qGrossProfit = parseFloat(quarterlyTargets.grossProfit?.[quarterKey] || '0') || 0;
          qNetProfit = parseFloat(quarterlyTargets.netProfit?.[quarterKey] || '0') || 0;

          if (qRevenue > 0 || qGrossProfit > 0 || qNetProfit > 0) {
            source = 'quarterly';
            console.log('[Quarter Performance] Found quarterly targets:', { qRevenue, qGrossProfit, qNetProfit });
          }
        }

        // Fallback to annual targets divided by 4 if no quarterly targets
        if (qRevenue === 0 && qGrossProfit === 0 && qNetProfit === 0) {
          const annualRevenue = goalsData.revenue_year1 || 0;
          const annualGrossProfit = goalsData.gross_profit_year1 || 0;
          const annualNetProfit = goalsData.net_profit_year1 || 0;

          if (annualRevenue > 0 || annualGrossProfit > 0 || annualNetProfit > 0) {
            qRevenue = Math.round(annualRevenue / 4);
            qGrossProfit = Math.round(annualGrossProfit / 4);
            qNetProfit = Math.round(annualNetProfit / 4);
            source = 'annual';
            console.log('[Quarter Performance] Using annual targets /4:', { qRevenue, qGrossProfit, qNetProfit });
          }
        }

        if (qRevenue > 0 || qGrossProfit > 0 || qNetProfit > 0) {
          setHasTargetsFromPlan(true);
          setTargetsSource(source);

          // Only update targets if not already set in snapshot
          setFinancials(prev => [
            {
              ...prev[0],
              target: existingSnapshot.revenue?.target || qRevenue,
              actual: existingSnapshot.revenue?.actual || prev[0].actual
            },
            {
              ...prev[1],
              target: existingSnapshot.grossProfit?.target || qGrossProfit,
              actual: existingSnapshot.grossProfit?.actual || prev[1].actual
            },
            {
              ...prev[2],
              target: existingSnapshot.netProfit?.target || qNetProfit,
              actual: existingSnapshot.netProfit?.actual || prev[2].actual
            }
          ]);

          console.log('[Quarter Performance] Targets loaded from:', source);
        } else {
          console.log('[Quarter Performance] No targets found in goals data');
        }

        // Load Core Business Metrics from goals data
        const coreMetricsFromGoals = {
          leadsPerMonth: goalsData.leads_per_month_year1 || 0,
          conversionRate: goalsData.conversion_rate_year1 || 0,
          avgTransactionValue: goalsData.avg_transaction_value_year1 || 0,
          teamHeadcount: goalsData.team_headcount_year1 || 0,
          ownerHoursPerWeek: goalsData.owner_hours_per_week_year1 || 0
        };

        console.log('[Quarter Performance] Core metrics from goals:', coreMetricsFromGoals);

        const hasAnyCoreMetric = Object.values(coreMetricsFromGoals).some(v => v > 0);
        if (hasAnyCoreMetric) {
          setHasCoreMetricsFromPlan(true);
          setCoreMetrics(prev => prev.map(metric => {
            const goalValue = coreMetricsFromGoals[metric.id as keyof typeof coreMetricsFromGoals] || 0;
            // For quarterly targets, use the annual value (or quarterly value if available)
            const quarterlyTarget = goalValue; // These are annual targets, displayed as-is for now
            return {
              ...metric,
              target: existingSnapshot.coreMetrics?.[metric.id as keyof CoreMetricsSnapshot]?.target || quarterlyTarget,
              actual: existingSnapshot.coreMetrics?.[metric.id as keyof CoreMetricsSnapshot]?.actual || metric.actual
            };
          }));
        }
      }

      // Fetch KPIs from business_kpis table (using correct business_id)
      const { data: kpisData, error: kpisError } = await supabase
        .from('business_kpis')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('category', { ascending: true });

      console.log('[Quarter Performance] KPIs data:', kpisData);
      console.log('[Quarter Performance] KPIs error:', kpisError);

      if (!kpisError && kpisData && kpisData.length > 0) {
        setBusinessKpis(kpisData);

        // Initialize actuals from existing snapshot
        const existingActuals: Record<string, number> = {};
        existingSnapshot.kpis?.forEach(kpi => {
          existingActuals[kpi.id] = kpi.actual;
        });
        setKpiActuals(existingActuals);
      }
    } catch (err) {
      console.error('[Quarter Performance] Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Update parent whenever data changes
  useEffect(() => {
    const snapshot: DashboardSnapshot = {
      revenue: {
        target: financials[0].target,
        actual: financials[0].actual,
        variance: calculateVariance(financials[0].target, financials[0].actual),
        percentageAchieved: calculatePercentage(financials[0].target, financials[0].actual)
      },
      grossProfit: {
        target: financials[1].target,
        actual: financials[1].actual,
        variance: calculateVariance(financials[1].target, financials[1].actual),
        percentageAchieved: calculatePercentage(financials[1].target, financials[1].actual)
      },
      netProfit: {
        target: financials[2].target,
        actual: financials[2].actual,
        variance: calculateVariance(financials[2].target, financials[2].actual),
        percentageAchieved: calculatePercentage(financials[2].target, financials[2].actual)
      },
      kpis: businessKpis.map(kpi => ({
        id: kpi.kpi_id,
        name: kpi.friendly_name || kpi.name,
        target: kpi.year1_target || 0,
        actual: kpiActuals[kpi.kpi_id] || 0,
        unit: kpi.unit
      })),
      // Include Core Business Metrics
      coreMetrics: {
        leadsPerMonth: buildCoreMetricSnapshot('leadsPerMonth'),
        conversionRate: buildCoreMetricSnapshot('conversionRate'),
        avgTransactionValue: buildCoreMetricSnapshot('avgTransactionValue'),
        teamHeadcount: buildCoreMetricSnapshot('teamHeadcount'),
        ownerHoursPerWeek: buildCoreMetricSnapshot('ownerHoursPerWeek')
      },
      ...(commentary && { commentary })
    };
    onUpdate(snapshot);
  }, [financials, kpiActuals, commentary, businessKpis, coreMetrics]);

  // Helper to build core metric snapshot
  const buildCoreMetricSnapshot = (id: string) => {
    const metric = coreMetrics.find(m => m.id === id);
    if (!metric) return { target: 0, actual: 0, variance: 0 };
    return {
      target: metric.target,
      actual: metric.actual,
      variance: calculateVariance(metric.target, metric.actual)
    };
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
    if (!value) return '$0';
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const parseCurrencyInput = (value: string): number => {
    return parseInt(value.replace(/[$,]/g, '')) || 0;
  };

  const updateFinancialActual = (id: string, value: number) => {
    setFinancials(prev => prev.map(f =>
      f.id === id ? { ...f, actual: value } : f
    ));
  };

  const updateFinancialTarget = (id: string, value: number) => {
    setFinancials(prev => prev.map(f =>
      f.id === id ? { ...f, target: value } : f
    ));
  };

  const updateKpiActual = (kpiId: string, value: number) => {
    setKpiActuals(prev => ({ ...prev, [kpiId]: value }));
  };

  const updateCoreMetricActual = (id: string, value: number) => {
    setCoreMetrics(prev => prev.map(m =>
      m.id === id ? { ...m, actual: value } : m
    ));
  };

  const formatCoreMetricValue = (metric: CoreMetric, value: number): string => {
    if (!value) return '';
    switch (metric.format) {
      case 'currency':
        return formatCurrency(value);
      case 'percentage':
        return `${value}%`;
      case 'hours':
        return `${value}`;
      default:
        return `${value}`;
    }
  };

  const parseCoreMetricInput = (metric: CoreMetric, value: string): number => {
    switch (metric.format) {
      case 'currency':
        return parseCurrencyInput(value);
      case 'percentage':
        return parseFloat(value.replace('%', '')) || 0;
      default:
        return parseFloat(value) || 0;
    }
  };

  // Format KPI value based on unit type
  const formatKpiValue = (value: number, unit: string): string => {
    if (!value) return '-';
    if (unit === 'currency' || unit === '$') {
      return formatCurrency(value);
    }
    if (unit === '%' || unit === 'percentage') {
      return `${value}%`;
    }
    return `${value}${unit ? ` ${unit}` : ''}`;
  };

  // Get display unit for KPIs (hide "currency" and "percentage" text)
  const getKpiDisplayUnit = (unit: string): string => {
    if (unit === 'currency' || unit === '$') return '';
    if (unit === 'percentage') return '';
    return unit;
  };

  // Action Replay handlers
  const addActionItem = (column: ActionColumn) => {
    const value = newItems[column].trim();
    if (!value) return;

    const updated = {
      ...actionReplay,
      [column]: [...actionReplay[column], value]
    };
    onUpdateActionReplay(updated);
    setNewItems({ ...newItems, [column]: '' });
  };

  const removeActionItem = (column: ActionColumn, index: number) => {
    const updated = {
      ...actionReplay,
      [column]: actionReplay[column].filter((_: string, i: number) => i !== index)
    };
    onUpdateActionReplay(updated);
  };

  const updateKeyInsight = (insight: string) => {
    onUpdateActionReplay({ ...actionReplay, keyInsight: insight });
  };

  const handleActionKeyDown = (e: React.KeyboardEvent, column: ActionColumn) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addActionItem(column);
    }
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

  // Calculate plan year for display
  const planYear = useMemo(() => determinePlanYear(yearType), [yearType]);

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="1.2"
          subtitle="How did you perform against your quarterly goals?"
          estimatedTime={15}
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  // Group KPIs by category
  const kpisByCategory = businessKpis.reduce((acc, kpi) => {
    const cat = kpi.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(kpi);
    return acc;
  }, {} as Record<string, BusinessKpi[]>);

  return (
    <div>
      <StepHeader
        step="1.2"
        subtitle="Review your performance against your quarterly targets"
        estimatedTime={15}
      />

      {/* Quarter Header - Matching Sprint Planning Style */}
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border border-[#8E9AAF] p-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#3E3F57] mb-1">Quarter Performance Review</h2>
            <p className="text-gray-600 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {quarterInfo ? (
                <span>{quarterInfo.label} • {quarterInfo.months} • {yearType} {planYear}</span>
              ) : (
                <span>Q{review.quarter} {review.year}</span>
              )}
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
                  ? `Using annual targets ÷ 4 (set specific quarterly targets in Goals)`
                  : 'Enter your quarterly targets and actuals'
                }
              </p>
            </div>
            {hasTargetsFromPlan && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                targetsSource === 'quarterly'
                  ? 'bg-brand-orange-100 text-brand-orange-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {targetsSource === 'quarterly' ? 'From Sprint Plan' : 'From Annual Goals'}
              </span>
            )}
          </div>
        </div>

        <div className="p-5">
          {/* Info banner if targets loaded */}
          {hasTargetsFromPlan && (
            <div className={`rounded-lg p-3 mb-4 border ${
              targetsSource === 'quarterly'
                ? 'bg-brand-orange-50 border-brand-orange-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-start gap-2">
                <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                  targetsSource === 'quarterly' ? 'text-brand-orange' : 'text-amber-600'
                }`} />
                <p className={`text-sm ${
                  targetsSource === 'quarterly' ? 'text-brand-orange-700' : 'text-amber-700'
                }`}>
                  {targetsSource === 'quarterly'
                    ? 'Targets loaded from your 90-day sprint plan. Enter your actual results for the quarter.'
                    : 'Using your annual targets divided by 4. For precise quarterly targets, set them in the Goals wizard (Step 4: Annual Plan).'}
                </p>
              </div>
            </div>
          )}

          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 mb-3 px-2">
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Metric</div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
              {quarterInfo?.label || `Q${review.quarter}`} Target
            </div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
              {quarterInfo?.label || `Q${review.quarter}`} Actual
            </div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Variance</div>
          </div>

          {/* Financial Rows */}
          <div className="space-y-3">
            {financials.map((metric) => {
              const variance = calculateVariance(metric.target, metric.actual);
              return (
                <div key={metric.id} className="grid grid-cols-12 gap-4 items-center bg-gray-50 rounded-lg p-3">
                  <div className="col-span-3">
                    <span className="font-medium text-gray-900">{metric.label}</span>
                  </div>
                  <div className="col-span-3">
                    {hasTargetsFromPlan && metric.target > 0 ? (
                      // Show as read-only if loaded from plan
                      <div className="px-3 py-2 bg-gray-100 rounded-lg text-center text-sm font-medium text-gray-700">
                        {formatCurrency(metric.target)}
                      </div>
                    ) : (
                      // Editable if no plan data
                      <input
                        type="text"
                        value={metric.target ? formatCurrency(metric.target) : ''}
                        onChange={(e) => updateFinancialTarget(metric.id, parseCurrencyInput(e.target.value))}
                        placeholder="$0"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
                      />
                    )}
                  </div>
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={metric.actual ? formatCurrency(metric.actual) : ''}
                      onChange={(e) => updateFinancialActual(metric.id, parseCurrencyInput(e.target.value))}
                      placeholder="$0"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 bg-white"
                    />
                  </div>
                  <div className="col-span-3">
                    <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg ${getVarianceColor(variance)}`}>
                      {getVarianceIcon(variance)}
                      <span className="font-semibold text-sm">
                        {metric.target > 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}%` : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Link to edit targets */}
          {!hasTargetsFromPlan && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                No targets found from your 90-day sprint plan.{' '}
                <Link href="/goals" className="text-brand-orange hover:text-brand-orange-700 font-medium">
                  Set up your targets →
                </Link>
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
              <p className="text-sm text-gray-600 mt-1">
                {hasCoreMetricsFromPlan
                  ? 'Track your key operational metrics from your strategic plan'
                  : 'Essential metrics that drive your business growth'}
              </p>
            </div>
            {hasCoreMetricsFromPlan && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-brand-orange-100 text-brand-orange-700">
                From Goals
              </span>
            )}
          </div>
        </div>

        <div className="p-5">
          {/* Info banner if metrics loaded from plan */}
          {hasCoreMetricsFromPlan && (
            <div className="rounded-lg p-3 mb-4 border bg-brand-orange-50 border-brand-orange-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-orange" />
                <p className="text-sm text-brand-orange-700">
                  Targets loaded from your Year 1 goals. Enter your actual results for this quarter.
                </p>
              </div>
            </div>
          )}

          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 mb-3 px-2">
            <div className="col-span-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Metric</div>
            <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Target</div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Actual</div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Variance</div>
          </div>

          {/* Core Metric Rows */}
          <div className="space-y-3">
            {coreMetrics.map((metric) => {
              const variance = calculateVariance(metric.target, metric.actual);
              // For owner hours, lower is better (inverse variance display)
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
                      {metric.format === 'currency' && metric.target > 0
                        ? formatCurrency(metric.target)
                        : metric.format === 'percentage' && metric.target > 0
                        ? `${metric.target}%`
                        : metric.target > 0
                        ? `${metric.target}${metric.unit ? ` ${metric.unit}` : ''}`
                        : '-'}
                    </span>
                  </div>
                  <div className="col-span-3">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={formatCoreMetricValue(metric, metric.actual)}
                        onChange={(e) => updateCoreMetricActual(metric.id, parseCoreMetricInput(metric, e.target.value))}
                        placeholder={metric.format === 'currency' ? '$0' : metric.format === 'percentage' ? '0%' : '0'}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 bg-white"
                      />
                      {metric.unit && metric.format !== 'currency' && metric.format !== 'percentage' && (
                        <span className="text-xs text-gray-500 whitespace-nowrap">{metric.unit}</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-3">
                    <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg ${getVarianceColor(displayVariance)}`}>
                      {getVarianceIcon(displayVariance)}
                      <span className="font-semibold text-sm">
                        {metric.target > 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}%` : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Link to edit metrics if none configured */}
          {!hasCoreMetricsFromPlan && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                No core metrics found from your strategic plan.{' '}
                <Link href="/goals" className="text-brand-orange hover:text-brand-orange-700 font-medium">
                  Set up your targets →
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* KPIs from Plan */}
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
            <Link
              href="/goals"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-orange hover:text-brand-orange-700"
            >
              Edit KPIs
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="p-5">
          {businessKpis.length === 0 ? (
            <div className="text-center py-8">
              <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h4 className="font-semibold text-gray-900 mb-2">No KPIs Configured</h4>
              <p className="text-sm text-gray-500 mb-4">
                Set up your KPIs in the Goals wizard to track them here.
              </p>
              <Link
                href="/goals"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange-600"
              >
                Set Up KPIs
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-2">
                <div className="col-span-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">KPI</div>
                <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Target</div>
                <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Actual</div>
                <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Variance</div>
              </div>

              {Object.entries(kpisByCategory).map(([category, kpis]) => (
                <div key={category}>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-2">
                    {category}
                  </h4>
                  <div className="space-y-2">
                    {kpis.map((kpi) => {
                      const actual = kpiActuals[kpi.kpi_id] || 0;
                      const target = kpi.year1_target || 0;
                      const variance = calculateVariance(target, actual);

                      return (
                        <div key={kpi.kpi_id} className="grid grid-cols-12 gap-4 items-center bg-gray-50 rounded-lg p-3">
                          <div className="col-span-4">
                            <span className="font-medium text-gray-900 text-sm">
                              {kpi.friendly_name || kpi.name}
                            </span>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className="text-sm text-gray-600 font-medium">
                              {formatKpiValue(target, kpi.unit)}
                            </span>
                          </div>
                          <div className="col-span-3">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={kpi.unit === 'currency' || kpi.unit === '$'
                                  ? (actual ? formatCurrency(actual) : '')
                                  : (actual || '')}
                                onChange={(e) => {
                                  const val = kpi.unit === 'currency' || kpi.unit === '$'
                                    ? parseCurrencyInput(e.target.value)
                                    : parseFloat(e.target.value) || 0;
                                  updateKpiActual(kpi.kpi_id, val);
                                }}
                                placeholder={kpi.unit === 'currency' || kpi.unit === '$' ? '$0' : '0'}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
                              />
                              {getKpiDisplayUnit(kpi.unit) && (
                                <span className="text-xs text-gray-500 whitespace-nowrap">{getKpiDisplayUnit(kpi.unit)}</span>
                              )}
                            </div>
                          </div>
                          <div className="col-span-3">
                            <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg ${getVarianceColor(variance)}`}>
                              {getVarianceIcon(variance)}
                              <span className="font-semibold text-sm">
                                {target > 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}%` : '-'}
                              </span>
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
          {/* Prompts */}
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

          <textarea
            value={commentary}
            onChange={(e) => setCommentary(e.target.value)}
            placeholder="Add your observations and insights about this quarter's performance..."
            rows={4}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 resize-none"
          />
        </div>
      </div>

      {/* Action Replay - 4 Column Layout */}
      <div className="mt-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Action Replay</h2>
            <p className="text-sm text-gray-500">Reflect on your actions from last quarter using the 4-column framework</p>
          </div>
        </div>

        {/* Four Columns - Side by Side */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {(Object.keys(ACTION_COLUMN_CONFIG) as ActionColumn[]).map(column => {
            const config = ACTION_COLUMN_CONFIG[column];
            const Icon = config.icon;
            const items = actionReplay[column];

            return (
              <div key={column} className="bg-gray-50 rounded-xl border border-gray-200 p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`w-5 h-5 ${config.iconColor}`} />
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{config.title}</h3>
                    <p className="text-xs text-gray-500">{config.description}</p>
                  </div>
                </div>

                {/* Items List */}
                <div className="flex-1 space-y-2 mb-3 min-h-[120px]">
                  {items.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No items added yet</p>
                  ) : (
                    items.map((item: string, index: number) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100 group"
                      >
                        <span className="flex-1 text-sm text-gray-700">{item}</span>
                        <button
                          onClick={() => removeActionItem(column, index)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded transition-opacity"
                        >
                          <X className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Add New Item */}
                <div className="flex gap-2 mt-auto">
                  <input
                    type="text"
                    value={newItems[column]}
                    onChange={(e) => setNewItems({ ...newItems, [column]: e.target.value })}
                    onKeyDown={(e) => handleActionKeyDown(e, column)}
                    placeholder={config.placeholder}
                    className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                  <button
                    onClick={() => addActionItem(column)}
                    disabled={!newItems[column].trim()}
                    className={`p-2 rounded-lg transition-colors ${
                      newItems[column].trim()
                        ? 'bg-gray-900 text-white hover:bg-gray-800'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Key Insight */}
        <div className="bg-gradient-to-r from-brand-orange-50 to-slate-50 rounded-xl border border-brand-orange-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-brand-orange" />
            <div>
              <h3 className="font-semibold text-gray-900">Key Insight</h3>
              <p className="text-sm text-gray-500">What's the ONE thing you'll take forward from this reflection?</p>
            </div>
          </div>
          <textarea
            value={actionReplay.keyInsight}
            onChange={(e) => updateKeyInsight(e.target.value)}
            placeholder="Summarize your most important learning from this action replay..."
            rows={3}
            className="w-full px-4 py-3 border border-brand-orange-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none bg-white"
          />
        </div>
      </div>
    </div>
  );
}
