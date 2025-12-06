'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useBusinessContext } from '@/hooks/useBusinessContext';

export default function QuarterlyForecastPage() {
  const router = useRouter();
  const supabase = createClient();
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();
  const [loading, setLoading] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [visionTargets, setVisionTargets] = useState<any>(null);
  
  // Get current quarter
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const currentYear = now.getFullYear();
  
  const [selectedQuarter, setSelectedQuarter] = useState({
    year: currentYear,
    quarter: currentQuarter
  });

  const [formData, setFormData] = useState({
    month1_revenue: '',
    month1_gross_profit_percent: '',
    month1_net_profit_percent: '',
    month1_cash: '',
    
    month2_revenue: '',
    month2_gross_profit_percent: '',
    month2_net_profit_percent: '',
    month2_cash: '',
    
    month3_revenue: '',
    month3_gross_profit_percent: '',
    month3_net_profit_percent: '',
    month3_cash: ''
  });

  const [calculations, setCalculations] = useState({
    total_revenue: 0,
    total_gross_profit: 0,
    total_net_profit: 0,
    revenue_gap: 0,
    revenue_gap_percent: 0
  });

  useEffect(() => {
    if (!contextLoading) {
      loadData();
    }
  }, [selectedQuarter, contextLoading, activeBusiness?.id]);

  useEffect(() => {
    calculateTotalsAndGaps();
  }, [formData, visionTargets]);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      // Determine the correct business_profiles.id for data queries
      // Vision targets and forecasts are stored with business_profiles.id
      let bizId: string | null = null;
      if (activeBusiness?.id) {
        // Coach view: activeBusiness.id is businesses.id
        // Need to look up the corresponding business_profiles.id
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('business_id', activeBusiness.id)
          .single();

        bizId = profile?.id || null;
      } else {
        // Get user's own business profile
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();

        bizId = profile?.id || null;
      }

      if (!bizId) {
        router.push('/business-profile');
        return;
      }
      setBusinessId(bizId);

      // Load vision targets
      const { data: vision } = await supabase
        .from('vision_targets')
        .select('*')
        .eq('business_id', bizId)
        .single();

      setVisionTargets(vision);

      // Load existing forecast if any
      const { data: forecast } = await supabase
        .from('quarterly_forecasts')
        .select('*')
        .eq('business_id', bizId)
        .eq('quarter_year', selectedQuarter.year)
        .eq('quarter_number', selectedQuarter.quarter)
        .single();

      if (forecast) {
        setFormData({
          month1_revenue: forecast.month1_revenue?.toString() || '',
          month1_gross_profit_percent: forecast.month1_gross_profit_percent?.toString() || '',
          month1_net_profit_percent: forecast.month1_net_profit_percent?.toString() || '',
          month1_cash: forecast.month1_cash?.toString() || '',
          month2_revenue: forecast.month2_revenue?.toString() || '',
          month2_gross_profit_percent: forecast.month2_gross_profit_percent?.toString() || '',
          month2_net_profit_percent: forecast.month2_net_profit_percent?.toString() || '',
          month2_cash: forecast.month2_cash?.toString() || '',
          month3_revenue: forecast.month3_revenue?.toString() || '',
          month3_gross_profit_percent: forecast.month3_gross_profit_percent?.toString() || '',
          month3_net_profit_percent: forecast.month3_net_profit_percent?.toString() || '',
          month3_cash: forecast.month3_cash?.toString() || ''
        });
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  function calculateTotalsAndGaps() {
    const m1Revenue = parseFloat(formData.month1_revenue || '0');
    const m2Revenue = parseFloat(formData.month2_revenue || '0');
    const m3Revenue = parseFloat(formData.month3_revenue || '0');
    const totalRevenue = m1Revenue + m2Revenue + m3Revenue;

    const m1GrossProfit = m1Revenue * parseFloat(formData.month1_gross_profit_percent || '0') / 100;
    const m2GrossProfit = m2Revenue * parseFloat(formData.month2_gross_profit_percent || '0') / 100;
    const m3GrossProfit = m3Revenue * parseFloat(formData.month3_gross_profit_percent || '0') / 100;
    const totalGrossProfit = m1GrossProfit + m2GrossProfit + m3GrossProfit;

    const m1NetProfit = m1Revenue * parseFloat(formData.month1_net_profit_percent || '0') / 100;
    const m2NetProfit = m2Revenue * parseFloat(formData.month2_net_profit_percent || '0') / 100;
    const m3NetProfit = m3Revenue * parseFloat(formData.month3_net_profit_percent || '0') / 100;
    const totalNetProfit = m1NetProfit + m2NetProfit + m3NetProfit;

    // Calculate gap to 1-year pace
    let revenueGap = 0;
    let revenueGapPercent = 0;
    if (visionTargets?.one_year_revenue) {
      const quarterlyTarget = visionTargets.one_year_revenue / 4;
      revenueGap = totalRevenue - quarterlyTarget;
      revenueGapPercent = (revenueGap / quarterlyTarget) * 100;
    }

    setCalculations({
      total_revenue: totalRevenue,
      total_gross_profit: totalGrossProfit,
      total_net_profit: totalNetProfit,
      revenue_gap: revenueGap,
      revenue_gap_percent: revenueGapPercent
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      if (!businessId) throw new Error('No business ID');

      const forecastData = {
        business_id: businessId,
        quarter_year: selectedQuarter.year,
        quarter_number: selectedQuarter.quarter,
        
        month1_revenue: parseFloat(formData.month1_revenue || '0'),
        month1_gross_profit: parseFloat(formData.month1_revenue || '0') * parseFloat(formData.month1_gross_profit_percent || '0') / 100,
        month1_gross_profit_percent: parseFloat(formData.month1_gross_profit_percent || '0'),
        month1_net_profit: parseFloat(formData.month1_revenue || '0') * parseFloat(formData.month1_net_profit_percent || '0') / 100,
        month1_net_profit_percent: parseFloat(formData.month1_net_profit_percent || '0'),
        month1_cash: parseFloat(formData.month1_cash || '0'),
        
        month2_revenue: parseFloat(formData.month2_revenue || '0'),
        month2_gross_profit: parseFloat(formData.month2_revenue || '0') * parseFloat(formData.month2_gross_profit_percent || '0') / 100,
        month2_gross_profit_percent: parseFloat(formData.month2_gross_profit_percent || '0'),
        month2_net_profit: parseFloat(formData.month2_revenue || '0') * parseFloat(formData.month2_net_profit_percent || '0') / 100,
        month2_net_profit_percent: parseFloat(formData.month2_net_profit_percent || '0'),
        month2_cash: parseFloat(formData.month2_cash || '0'),
        
        month3_revenue: parseFloat(formData.month3_revenue || '0'),
        month3_gross_profit: parseFloat(formData.month3_revenue || '0') * parseFloat(formData.month3_gross_profit_percent || '0') / 100,
        month3_gross_profit_percent: parseFloat(formData.month3_gross_profit_percent || '0'),
        month3_net_profit: parseFloat(formData.month3_revenue || '0') * parseFloat(formData.month3_net_profit_percent || '0') / 100,
        month3_net_profit_percent: parseFloat(formData.month3_net_profit_percent || '0'),
        month3_cash: parseFloat(formData.month3_cash || '0'),
        
        total_revenue: calculations.total_revenue,
        total_gross_profit: calculations.total_gross_profit,
        total_gross_profit_percent: calculations.total_revenue > 0 ? (calculations.total_gross_profit / calculations.total_revenue) * 100 : 0,
        total_net_profit: calculations.total_net_profit,
        total_net_profit_percent: calculations.total_revenue > 0 ? (calculations.total_net_profit / calculations.total_revenue) * 100 : 0,
        
        revenue_gap: calculations.revenue_gap,
        revenue_gap_percent: calculations.revenue_gap_percent,
        
        is_active: true,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('quarterly_forecasts')
        .upsert(forecastData, { 
          onConflict: 'business_id,quarter_year,quarter_number' 
        });

      if (error) throw error;

      router.push('/goals');
    } catch (error) {
      console.error('Error saving forecast:', error);
      alert('Failed to save forecast');
    } finally {
      setLoading(false);
    }
  }

  function getMonthName(quarterNum: number, monthIndex: number) {
    const firstMonth = (quarterNum - 1) * 3;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[firstMonth + monthIndex];
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Quarterly Forecast</h1>
              <p className="text-gray-600 mt-1">Project your quarterly financial performance</p>
            </div>
            <Link href="/goals" className="text-gray-600 hover:text-gray-900">
              Back to Goals
            </Link>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Quarter Selection */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Select Quarter:</label>
              <select
                value={selectedQuarter.quarter}
                onChange={(e) => setSelectedQuarter({ ...selectedQuarter, quarter: parseInt(e.target.value) })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
              >
                <option value={1}>Q1</option>
                <option value={2}>Q2</option>
                <option value={3}>Q3</option>
                <option value={4}>Q4</option>
              </select>
              <input
                type="number"
                value={selectedQuarter.year}
                onChange={(e) => setSelectedQuarter({ ...selectedQuarter, year: parseInt(e.target.value) })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange w-24"
              />
            </div>
          </div>

          {/* Monthly Projections */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Monthly Projections</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-4">Metric</th>
                    <th className="text-center py-2 px-4">{getMonthName(selectedQuarter.quarter, 0)}</th>
                    <th className="text-center py-2 px-4">{getMonthName(selectedQuarter.quarter, 1)}</th>
                    <th className="text-center py-2 px-4">{getMonthName(selectedQuarter.quarter, 2)}</th>
                    <th className="text-center py-2 px-4 bg-gray-50">Quarter Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium">Revenue</td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <span className="absolute left-2 top-2 text-gray-500">$</span>
                        <input
                          type="number"
                          value={formData.month1_revenue}
                          onChange={(e) => setFormData({ ...formData, month1_revenue: e.target.value })}
                          className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <span className="absolute left-2 top-2 text-gray-500">$</span>
                        <input
                          type="number"
                          value={formData.month2_revenue}
                          onChange={(e) => setFormData({ ...formData, month2_revenue: e.target.value })}
                          className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <span className="absolute left-2 top-2 text-gray-500">$</span>
                        <input
                          type="number"
                          value={formData.month3_revenue}
                          onChange={(e) => setFormData({ ...formData, month3_revenue: e.target.value })}
                          className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 bg-gray-50 text-center font-semibold">
                      {formatCurrency(calculations.total_revenue)}
                    </td>
                  </tr>

                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium">Gross Profit %</td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={formData.month1_gross_profit_percent}
                          onChange={(e) => setFormData({ ...formData, month1_gross_profit_percent: e.target.value })}
                          className="w-full pr-7 px-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={formData.month2_gross_profit_percent}
                          onChange={(e) => setFormData({ ...formData, month2_gross_profit_percent: e.target.value })}
                          className="w-full pr-7 px-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={formData.month3_gross_profit_percent}
                          onChange={(e) => setFormData({ ...formData, month3_gross_profit_percent: e.target.value })}
                          className="w-full pr-7 px-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 bg-gray-50 text-center font-semibold">
                      {calculations.total_revenue > 0 
                        ? ((calculations.total_gross_profit / calculations.total_revenue) * 100).toFixed(1) 
                        : '0'}%
                    </td>
                  </tr>

                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium">Net Profit %</td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={formData.month1_net_profit_percent}
                          onChange={(e) => setFormData({ ...formData, month1_net_profit_percent: e.target.value })}
                          className="w-full pr-7 px-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={formData.month2_net_profit_percent}
                          onChange={(e) => setFormData({ ...formData, month2_net_profit_percent: e.target.value })}
                          className="w-full pr-7 px-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={formData.month3_net_profit_percent}
                          onChange={(e) => setFormData({ ...formData, month3_net_profit_percent: e.target.value })}
                          className="w-full pr-7 px-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 bg-gray-50 text-center font-semibold">
                      {calculations.total_revenue > 0 
                        ? ((calculations.total_net_profit / calculations.total_revenue) * 100).toFixed(1) 
                        : '0'}%
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 font-medium">Cash Position</td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <span className="absolute left-2 top-2 text-gray-500">$</span>
                        <input
                          type="number"
                          value={formData.month1_cash}
                          onChange={(e) => setFormData({ ...formData, month1_cash: e.target.value })}
                          className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <span className="absolute left-2 top-2 text-gray-500">$</span>
                        <input
                          type="number"
                          value={formData.month2_cash}
                          onChange={(e) => setFormData({ ...formData, month2_cash: e.target.value })}
                          className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <span className="absolute left-2 top-2 text-gray-500">$</span>
                        <input
                          type="number"
                          value={formData.month3_cash}
                          onChange={(e) => setFormData({ ...formData, month3_cash: e.target.value })}
                          className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 bg-gray-50 text-center">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Gap Analysis */}
          {visionTargets && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Gap Analysis</h2>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Quarterly Target (1-Year Pace)</span>
                  <span className="font-medium">{formatCurrency(visionTargets.one_year_revenue / 4)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Forecasted Revenue</span>
                  <span className="font-medium">{formatCurrency(calculations.total_revenue)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600 font-medium">Gap to Target</span>
                  <span className={`font-bold ${calculations.revenue_gap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(calculations.revenue_gap)} ({calculations.revenue_gap_percent.toFixed(1)}%)
                  </span>
                </div>
              </div>

              {calculations.revenue_gap < 0 && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    📊 You're forecasting {formatCurrency(Math.abs(calculations.revenue_gap))} behind pace. 
                    Consider selecting strategic initiatives to close this gap.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <Link
              href="/goals"
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Forecast'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}