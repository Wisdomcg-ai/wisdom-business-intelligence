// /app/dashboard/integrations/xero/page.tsx
// Xero integration page that fits within your dashboard structure

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Building2, RefreshCw, AlertCircle, CheckCircle, Link, Unlink } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function XeroIntegrationPage() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadBusinesses();
    loadConnections();
  }, []);

  async function loadBusinesses() {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Error loading businesses:', error);
      setMessage('Error loading businesses');
    } else {
      setBusinesses(data || []);
      if (data && data.length > 0) {
        setSelectedBusiness(data[0].id);
      }
    }
  }

  async function loadConnections() {
    const { data, error } = await supabase
      .from('xero_connections')
      .select('*, businesses(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading connections:', error);
    } else {
      setConnections(data || []);
    }
  }

  async function connectToXero() {
    if (!selectedBusiness) {
      setMessage('Please select a business first');
      return;
    }

    setLoading(true);
    setMessage('Redirecting to Xero...');
    localStorage.setItem('xero_business_id', selectedBusiness);
    window.location.href = `/api/xero/auth?business_id=${selectedBusiness}`;
  }

  async function syncXeroData(businessId: string) {
    setLoading(true);
    setMessage('Syncing data from Xero...');

    try {
      const response = await fetch('/api/xero/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ business_id: businessId }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('✅ Sync complete!');
        loadConnections();
      } else {
        setMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setMessage('❌ Failed to sync data');
      console.error('Sync error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function disconnectXero(connectionId: string) {
    if (!confirm('Are you sure you want to disconnect from Xero?')) {
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('xero_connections')
      .delete()
      .eq('id', connectionId);

    if (error) {
      setMessage('❌ Failed to disconnect');
    } else {
      setMessage('✅ Disconnected from Xero');
      loadConnections();
    }
    setLoading(false);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Xero Integration</h1>
        <p className="text-gray-600">
          Connect your Xero account to automatically sync financial data, track cash flow, and monitor business performance.
        </p>
      </div>

      {/* Connection Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <Building2 className="h-5 w-5 text-brand-teal" />
            <span className="text-2xl font-bold">{businesses.length}</span>
          </div>
          <p className="text-sm text-gray-600">Total Businesses</p>
        </div>
        
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <Link className="h-5 w-5 text-green-600" />
            <span className="text-2xl font-bold">{connections.filter(c => c.connection_status === 'active').length}</span>
          </div>
          <p className="text-sm text-gray-600">Connected</p>
        </div>
        
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <Unlink className="h-5 w-5 text-gray-400" />
            <span className="text-2xl font-bold">{businesses.length - connections.filter(c => c.connection_status === 'active').length}</span>
          </div>
          <p className="text-sm text-gray-600">Not Connected</p>
        </div>
      </div>

      {/* New Connection Form */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Connect New Business</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">
              Select Business to Connect
            </label>
            <select
              value={selectedBusiness}
              onChange={(e) => setSelectedBusiness(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-teal focus:border-brand-teal-500"
              disabled={loading}
            >
              <option value="">-- Select a business --</option>
              {businesses
                .filter(b => !connections.find(c => c.business_id === b.id && c.connection_status === 'active'))
                .map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
            </select>
          </div>

          <button
            onClick={connectToXero}
            disabled={loading || !selectedBusiness}
            className="px-4 py-2 bg-brand-teal text-white rounded-lg hover:bg-brand-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Processing...' : 'Connect to Xero'}
          </button>

          {message && (
            <div className={`p-3 rounded-lg ${
              message.includes('✅') ? 'bg-green-50 text-green-800 border border-green-200' :
              message.includes('❌') ? 'bg-red-50 text-red-800 border border-red-200' :
              'bg-brand-teal-50 text-brand-teal-800 border border-brand-teal-200'
            }`}>
              {message}
            </div>
          )}
        </div>
      </div>

      {/* Connected Businesses */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Connected Businesses</h2>
        
        {connections.length === 0 ? (
          <p className="text-gray-500">No businesses connected to Xero yet.</p>
        ) : (
          <div className="space-y-3">
            {connections.map((connection) => (
              <div key={connection.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">
                        {connection.businesses?.name || 'Unknown Business'}
                      </h3>
                      {connection.connection_status === 'active' ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600">
                        Organization: <span className="font-medium">{connection.tenant_name}</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Last sync: <span className="font-medium">
                          {connection.last_sync_at 
                            ? new Date(connection.last_sync_at).toLocaleString() 
                            : 'Never synced'}
                        </span>
                      </p>
                      {connection.unreconciled_count > 0 && (
                        <p className="text-sm text-yellow-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {connection.unreconciled_count} unreconciled transactions
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => syncXeroData(connection.business_id)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm transition-colors flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Sync
                    </button>
                    <button
                      onClick={() => disconnectXero(connection.id)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}