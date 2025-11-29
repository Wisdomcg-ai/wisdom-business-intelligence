'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { DollarSign, TrendingUp, TrendingDown, Activity } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function FinancialsPage() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBusinesses();
  }, []);

  useEffect(() => {
    if (selectedBusiness) {
      loadMetrics(selectedBusiness);
    }
  }, [selectedBusiness]);

  async function loadBusinesses() {
    const { data } = await supabase
      .from('businesses')
      .select('id, name')
      .order('name');
    
    if (data) {
      setBusinesses(data);
      if (data.length > 0) setSelectedBusiness(data[0].id);
    }
  }

  async function loadMetrics(businessId: string) {
    setLoading(true);
    const { data } = await supabase
      .from('financial_metrics')
      .select('*')
      .eq('business_id', businessId)
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
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Financial Dashboard</h1>
        <select
          value={selectedBusiness}
          onChange={(e) => setSelectedBusiness(e.target.value)}
          className="px-4 py-2 border rounded-lg"
        >
          {businesses.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : metrics ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="h-8 w-8 text-green-600" />
                <span className="text-sm text-gray-500">Cash</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(metrics.total_cash)}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="h-8 w-8 text-blue-600" />
                <span className="text-sm text-gray-500">Revenue</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(metrics.revenue_month)}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-2">
                <Activity className="h-8 w-8 text-purple-600" />
                <span className="text-sm text-gray-500">Net Profit</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(metrics.net_profit_month)}</p>
              <p className="text-sm text-gray-500">{formatPercent(metrics.net_margin_percent)} margin</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingDown className="h-8 w-8 text-red-600" />
                <span className="text-sm text-gray-500">Expenses</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(metrics.expenses_month)}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">P&L Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span>Revenue</span>
                <span className="font-medium">{formatCurrency(metrics.revenue_month)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span>Cost of Sales</span>
                <span className="font-medium">{formatCurrency(metrics.cogs_month)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span>Gross Profit</span>
                <span className="font-medium">{formatCurrency(metrics.gross_profit_month)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span>Operating Expenses</span>
                <span className="font-medium">{formatCurrency(metrics.expenses_month)}</span>
              </div>
              <div className="flex justify-between py-2 font-bold">
                <span>Net Profit</span>
                <span>{formatCurrency(metrics.net_profit_month)}</span>
              </div>
            </div>
          </div>
          
          <div className="text-sm text-gray-500">
            Last updated: {metrics.created_at ? new Date(metrics.created_at).toLocaleString() : 'Never'}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          No financial data available. Connect and sync with Xero first.
        </div>
      )}
    </div>
  );
}
EOF