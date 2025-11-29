// /app/xero-connect/page.tsx
// This page lets you connect a business to Xero
// Copy this ENTIRE file exactly as shown

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function XeroConnectPage() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Load businesses when page loads
  useEffect(() => {
    loadBusinesses();
    loadConnections();
  }, []);

  // Function to load businesses from database
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

  // Function to load existing connections
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

  // Function to start Xero connection
  async function connectToXero() {
    if (!selectedBusiness) {
      setMessage('Please select a business first');
      return;
    }

    setLoading(true);
    setMessage('Redirecting to Xero...');

    // Store the business ID in localStorage so we can retrieve it after redirect
    localStorage.setItem('xero_business_id', selectedBusiness);

    // Redirect to Xero OAuth
    // We'll create this API route next
    window.location.href = `/api/xero/auth?business_id=${selectedBusiness}`;
  }

  // Function to sync data from Xero
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
        loadConnections(); // Reload connections to show updated sync time
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

  // Function to disconnect from Xero
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
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Xero Integration</h1>

      {/* Connection Form */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Connect a Business to Xero</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Select Business
            </label>
            <select
              value={selectedBusiness}
              onChange={(e) => setSelectedBusiness(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="">-- Select a business --</option>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={connectToXero}
            disabled={loading || !selectedBusiness}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Processing...' : 'Connect to Xero'}
          </button>

          {message && (
            <div className={`p-3 rounded-lg ${
              message.includes('✅') ? 'bg-green-100 text-green-800' :
              message.includes('❌') ? 'bg-red-100 text-red-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {message}
            </div>
          )}
        </div>
      </div>

      {/* Existing Connections */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Existing Connections</h2>
        
        {connections.length === 0 ? (
          <p className="text-gray-500">No connections yet</p>
        ) : (
          <div className="space-y-4">
            {connections.map((connection) => (
              <div key={connection.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">
                      {connection.businesses?.name || 'Unknown Business'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Organization: {connection.tenant_name}
                    </p>
                    <p className="text-sm text-gray-600">
                      Status: <span className={
                        connection.connection_status === 'active' 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }>
                        {connection.connection_status}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600">
                      Last sync: {connection.last_sync_at 
                        ? new Date(connection.last_sync_at).toLocaleString() 
                        : 'Never'}
                    </p>
                    {connection.unreconciled_count > 0 && (
                      <p className="text-sm text-yellow-600">
                        ⚠️ {connection.unreconciled_count} unreconciled transactions
                      </p>
                    )}
                  </div>
                  <div className="space-x-2">
                    <button
                      onClick={() => syncXeroData(connection.business_id)}
                      disabled={loading}
                      className="px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 text-sm"
                    >
                      Sync Now
                    </button>
                    <button
                      onClick={() => disconnectXero(connection.id)}
                      disabled={loading}
                      className="px-4 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 text-sm"
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