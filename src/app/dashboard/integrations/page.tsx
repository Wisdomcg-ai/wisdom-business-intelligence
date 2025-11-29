'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Building2, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function IntegrationsPage() {
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

    if (!error && data) {
      setBusinesses(data);
      if (data.length > 0) setSelectedBusiness(data[0].id);
    }
  }

  async function loadConnections() {
    const { data } = await supabase
      .from('xero_connections')
      .select('*, businesses(name)')
      .order('created_at', { ascending: false });

    if (data) setConnections(data);
  }

  async function connectToXero() {
    if (!selectedBusiness) return;
    setLoading(true);
    window.location.href = `/api/xero/auth?business_id=${selectedBusiness}`;
  }

  async function syncXeroData(businessId: string) {
    setLoading(true);
    setMessage('Syncing data from Xero...');
    const response = await fetch('/api/xero/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId }),
    });
    setMessage(response.ok ? '✅ Sync complete!' : '❌ Sync failed');
    setLoading(false);
    loadConnections();
  }

  async function disconnectXero(connectionId: string) {
    if (!confirm('Disconnect from Xero?')) return;
    await supabase.from('xero_connections').delete().eq('id', connectionId);
    loadConnections();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Xero Integration</h1>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Connect a Business</h2>
        <select
          value={selectedBusiness}
          onChange={(e) => setSelectedBusiness(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg mb-4"
          disabled={loading}
        >
          <option value="">Select a business</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <button
          onClick={connectToXero}
          disabled={loading || !selectedBusiness}
          className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-400"
        >
          Connect to Xero
        </button>
        {message && <div className="mt-4 p-3 bg-teal-100 rounded">{message}</div>}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Connected Businesses</h2>
        {connections.length === 0 ? (
          <p className="text-gray-500">No connections yet</p>
        ) : (
          <div className="space-y-4">
            {connections.map((c) => (
              <div key={c.id} className="border rounded-lg p-4 flex justify-between">
                <div>
                  <h3 className="font-semibold">{c.businesses?.name}</h3>
                  <p className="text-sm text-gray-600">Org: {c.tenant_name}</p>
                  <p className="text-sm text-gray-600">
                    Last sync: {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : 'Never'}
                  </p>
                </div>
                <div className="space-x-2">
                  <button
                    onClick={() => syncXeroData(c.business_id)}
                    className="px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                  >
                    Sync
                  </button>
                  <button
                    onClick={() => disconnectXero(c.id)}
                    className="px-4 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}