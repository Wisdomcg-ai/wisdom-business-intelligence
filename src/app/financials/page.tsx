'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DollarSign, TrendingUp, TrendingDown, Activity, Link2 } from 'lucide-react';
import Link from 'next/link';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import PageHeader from '@/components/ui/PageHeader';

export default function FinancialsPage() {
  const supabase = createClient();
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contextLoading) {
      loadMetrics();
    }
  }, [contextLoading, activeBusiness?.id]);

  async function loadMetrics() {
    setLoading(true);

    // Determine the correct business_profiles.id for data queries
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
      // Get current user's business profile
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();
        bizId = profile?.id || null;
      }
    }

    if (!bizId) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('financial_metrics')
      .select('*')
      .eq('business_id', bizId)
      .order('metric_date', { ascending: false })
      .limit(1)
      .single();

    setMetrics(data);
    setLoading(false);
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(value || 0);
  };

  const formatPercent = (value: number) => {
    return `${(value || 0).toFixed(1)}%`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <PageHeader
        title="Financial Dashboard"
        subtitle={activeBusiness?.name || "Track your financial metrics and performance"}
        icon={DollarSign}
      />

      {loading || contextLoading ? (
        <div className="text-center py-12">Loading...</div>
      ) : metrics ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
                <span className="text-xs sm:text-sm text-gray-500">Cash</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{formatCurrency(metrics.total_cash)}</p>
            </div>

            <div className="bg-white rounded-xl shadow p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-brand-orange" />
                <span className="text-xs sm:text-sm text-gray-500">Revenue</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{formatCurrency(metrics.revenue_month)}</p>
            </div>

            <div className="bg-white rounded-xl shadow p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-brand-navy" />
                <span className="text-xs sm:text-sm text-gray-500">Net Profit</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{formatCurrency(metrics.net_profit_month)}</p>
              <p className="text-xs sm:text-sm text-gray-500">{formatPercent(metrics.net_margin_percent)} margin</p>
            </div>

            <div className="bg-white rounded-xl shadow p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingDown className="h-6 w-6 sm:h-8 sm:w-8 text-red-600" />
                <span className="text-xs sm:text-sm text-gray-500">Expenses</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{formatCurrency(metrics.expenses_month)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold mb-4">P&L Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-sm sm:text-base">Revenue</span>
                <span className="font-medium text-sm sm:text-base">{formatCurrency(metrics.revenue_month)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-sm sm:text-base">Cost of Sales</span>
                <span className="font-medium text-sm sm:text-base">{formatCurrency(metrics.cogs_month)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-sm sm:text-base">Gross Profit</span>
                <span className="font-medium text-sm sm:text-base">{formatCurrency(metrics.gross_profit_month)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-sm sm:text-base">Operating Expenses</span>
                <span className="font-medium text-sm sm:text-base">{formatCurrency(metrics.expenses_month)}</span>
              </div>
              <div className="flex justify-between py-2 font-bold">
                <span className="text-sm sm:text-base">Net Profit</span>
                <span className="text-sm sm:text-base">{formatCurrency(metrics.net_profit_month)}</span>
              </div>
            </div>
          </div>

          <div className="text-xs sm:text-sm text-gray-500">
            Last updated: {metrics.created_at ? new Date(metrics.created_at).toLocaleString() : 'Never'}
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-brand-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-8 h-8 text-brand-orange" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Financial Data Yet</h3>
          <p className="text-sm sm:text-base text-gray-500 mb-6 max-w-md mx-auto px-4">
            Connect your Xero account to automatically sync your financial data and see real-time metrics here.
          </p>
          <Link
            href="/xero-connect"
            className="inline-flex items-center gap-2 bg-brand-orange text-white px-6 py-3 rounded-lg font-medium hover:bg-brand-orange-600 transition-colors"
          >
            <Link2 className="w-5 h-5" />
            Connect Xero
          </Link>
        </div>
      )}
    </div>
  );
}