'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, QuarterlyTargets } from '../../types';
import { getDefaultQuarterlyTargets } from '../../types';
import { Target, DollarSign, TrendingUp, Plus, X, Loader2, AlertTriangle } from 'lucide-react';

interface QuarterlyTargetsStepProps {
  review: QuarterlyReview;
  onUpdate: (targets: QuarterlyTargets) => void;
}

export function QuarterlyTargetsStep({ review, onUpdate }: QuarterlyTargetsStepProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [annualTargets, setAnnualTargets] = useState<any>(null);
  const [existingKpis, setExistingKpis] = useState<any[]>([]);
  const [newKpiName, setNewKpiName] = useState('');
  const supabase = createClient();

  const targets = review.quarterly_targets || getDefaultQuarterlyTargets();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch annual targets (may not exist)
      let annual = null;
      try {
        const { data } = await supabase
          .from('annual_targets')
          .select('*')
          .eq('business_id', review.business_id)
          .eq('year', review.year)
          .single();
        annual = data;
      } catch (e) {
        console.log('Annual targets table not available');
      }

      // Fetch existing KPIs (may not exist or have different schema)
      let kpis: any[] = [];
      try {
        const { data } = await supabase
          .from('kpis')
          .select('*')
          .eq('business_id', review.business_id)
          .eq('is_active', true);
        kpis = data || [];
      } catch (e) {
        console.log('KPIs table not available');
      }

      setAnnualTargets(annual);
      setExistingKpis(kpis);

      // Pre-populate with quarter portion of annual targets if not already set
      if (annual && (!targets.revenue || targets.revenue === 0)) {
        const defaultTargets: QuarterlyTargets = {
          revenue: Math.round((annual.revenue_target || 0) / 4),
          grossProfit: Math.round((annual.gross_profit_target || 0) / 4),
          netProfit: Math.round((annual.net_profit_target || 0) / 4),
          kpis: kpis?.map(kpi => ({
            id: kpi.id,
            name: kpi.name,
            target: kpi.target_value || 0,
            unit: kpi.unit
          })) || []
        };
        onUpdate(defaultTargets);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateFinancial = (field: 'revenue' | 'grossProfit' | 'netProfit', value: number) => {
    onUpdate({ ...targets, [field]: value });
  };

  const updateKpi = (kpiId: string, newTarget: number) => {
    const updated = targets.kpis.map(kpi =>
      kpi.id === kpiId ? { ...kpi, target: newTarget } : kpi
    );
    onUpdate({ ...targets, kpis: updated });
  };

  const addKpi = () => {
    if (!newKpiName.trim()) return;

    const newKpi = {
      id: `custom-${Date.now()}`,
      name: newKpiName.trim(),
      target: 0,
      unit: ''
    };
    onUpdate({ ...targets, kpis: [...targets.kpis, newKpi] });
    setNewKpiName('');
  };

  const removeKpi = (kpiId: string) => {
    onUpdate({
      ...targets,
      kpis: targets.kpis.filter(kpi => kpi.id !== kpiId)
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getNextQuarter = () => {
    if (review.quarter === 4) {
      return { quarter: 1, year: review.year + 1 };
    }
    return { quarter: review.quarter + 1, year: review.year };
  };

  const nextQ = getNextQuarter();

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="4.1"
          subtitle="Set your quarterly financial targets and KPIs"
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
        subtitle={`Set your Q${nextQ.quarter} ${nextQ.year} financial targets and KPIs`}
        estimatedTime={15}
        tip="Numbers first - targets drive initiatives"
      />

      {/* Annual Context */}
      {annualTargets && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-gray-600" />
            <span className="font-medium text-gray-900">{review.year} Annual Targets (Reference)</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Revenue:</span>
              <span className="font-medium text-gray-900 ml-2">
                {formatCurrency(annualTargets.revenue_target || 0)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Gross Profit:</span>
              <span className="font-medium text-gray-900 ml-2">
                {formatCurrency(annualTargets.gross_profit_target || 0)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Net Profit:</span>
              <span className="font-medium text-gray-900 ml-2">
                {formatCurrency(annualTargets.net_profit_target || 0)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Quarterly Financial Targets */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-gray-600" />
          Q{nextQ.quarter} {nextQ.year} Financial Targets
        </h3>

        <div className="space-y-4">
          {/* Revenue */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Revenue Target
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={targets.revenue || ''}
                onChange={(e) => updateFinancial('revenue', parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent text-lg"
              />
            </div>
            {annualTargets && (
              <p className="text-xs text-gray-500 mt-1">
                Quarterly portion of annual: {formatCurrency((annualTargets.revenue_target || 0) / 4)}
              </p>
            )}
          </div>

          {/* Gross Profit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gross Profit Target
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={targets.grossProfit || ''}
                onChange={(e) => updateFinancial('grossProfit', parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent text-lg"
              />
            </div>
            {targets.revenue > 0 && targets.grossProfit > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                GP Margin: {((targets.grossProfit / targets.revenue) * 100).toFixed(1)}%
              </p>
            )}
          </div>

          {/* Net Profit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Net Profit Target
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={targets.netProfit || ''}
                onChange={(e) => updateFinancial('netProfit', parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent text-lg"
              />
            </div>
            {targets.revenue > 0 && targets.netProfit > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Net Margin: {((targets.netProfit / targets.revenue) * 100).toFixed(1)}%
              </p>
            )}
          </div>
        </div>
      </div>

      {/* KPI Targets */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gray-600" />
          Key Performance Indicators
        </h3>

        {targets.kpis.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-6 text-center mb-4">
            <AlertTriangle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600">No KPIs set. Add your key metrics below.</p>
          </div>
        ) : (
          <div className="space-y-3 mb-4">
            {targets.kpis.map(kpi => (
              <div key={kpi.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-700">{kpi.name}</span>
                  {kpi.unit && (
                    <span className="text-xs text-gray-500 ml-2">({kpi.unit})</span>
                  )}
                </div>
                <input
                  type="number"
                  value={kpi.target || ''}
                  onChange={(e) => updateKpi(kpi.id, parseInt(e.target.value) || 0)}
                  placeholder="Target"
                  className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange"
                />
                <button
                  onClick={() => removeKpi(kpi.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add KPI */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newKpiName}
            onChange={(e) => setNewKpiName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addKpi()}
            placeholder="Add a KPI (e.g., Lead Conversion Rate, Customer Satisfaction)..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange"
          />
          <button
            onClick={addKpi}
            disabled={!newKpiName.trim()}
            className="px-4 py-2 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 p-4">
        <h4 className="font-medium text-gray-900 mb-2">Q{nextQ.quarter} Target Summary</h4>
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
