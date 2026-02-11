'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';

export default function XeroConnectPage() {
  const supabase = createClient();
  const [businessId, setBusinessId] = useState('');
  const [userId, setUserId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [connection, setConnection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // Load user and business when page loads
  useEffect(() => {
    loadUserAndBusiness();

    // Check for success/error in URL params
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');

    if (success === 'connected') {
      setMessage('Successfully connected to Xero!');
    } else if (error) {
      const errorMessages: { [key: string]: string } = {
        'xero_denied': 'Connection denied. Please try again.',
        'missing_params': 'Invalid connection parameters.',
        'invalid_state': 'Invalid connection state.',
        'token_exchange_failed': 'Failed to exchange authorization code.',
        'connections_failed': 'Failed to get Xero organizations.',
        'no_organizations': 'No Xero organizations found.',
        'user_not_found': 'User account not found.',
        'database_error': 'Failed to save connection.',
        'unknown_error': 'An unknown error occurred.'
      };
      setMessage(errorMessages[error] || 'An error occurred during connection.');
    }
  }, []);

  // Function to load current user and their business
  async function loadUserAndBusiness() {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage('Please log in first');
        setLoading(false);
        return;
      }

      setUserId(user.id);

      // Get business profile
      const { data: profile, error: profileError } = await supabase
        .from('business_profiles')
        .select('id, business_name')
        .eq('user_id', user.id)
        .single();

      if (profileError || !profile) {
        console.error('Error loading business profile:', profileError);
        setMessage('Error loading business profile');
        setLoading(false);
        return;
      }

      setBusinessId(profile.id);
      setBusinessName(profile.business_name || 'Your Business');

      // Load existing connection
      await loadConnection(profile.id);

      setLoading(false);
    } catch (error) {
      console.error('Error loading user/business:', error);
      setMessage('Error loading data');
      setLoading(false);
    }
  }

  // Function to load existing connection
  async function loadConnection(bizId: string) {
    const { data, error } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', bizId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error loading connection:', error);
    } else if (data && data.is_active) {
      setConnection(data);
    }
  }

  // Function to start Xero connection
  async function connectToXero() {
    if (!businessId) {
      setMessage('Business ID not found');
      return;
    }

    setLoading(true);
    setMessage('Redirecting to Xero...');

    // Redirect to Xero OAuth (note: capital X in Xero)
    window.location.href = `/api/Xero/auth?business_id=${businessId}`;
  }

  // Function to disconnect from Xero
  async function disconnectXero() {
    if (!confirm('Are you sure you want to disconnect from Xero?')) {
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('xero_connections')
      .update({ is_active: false })
      .eq('business_id', businessId);

    if (error) {
      setMessage('Failed to disconnect');
      console.error('Disconnect error:', error);
    } else {
      setMessage('Disconnected from Xero');
      setConnection(null);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Xero Integration</h1>
          <p className="text-gray-600">Connect your Xero account to import financial data</p>
        </div>

        {/* Connection Status Card */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          {connection ? (
            // Connected State
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Connected to Xero</h2>
                    <p className="text-sm text-gray-600">{businessName}</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Xero Organization:</span>
                  <span className="font-medium text-gray-900">{connection.tenant_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Connected:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(connection.created_at).toLocaleDateString()}
                  </span>
                </div>
                {connection.last_synced_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Last Synced:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(connection.last_synced_at).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t pt-4 flex space-x-3">
                <button
                  onClick={() => window.location.href = '/finances/forecast'}
                  className="flex-1 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors font-medium"
                >
                  Go to Financial Forecast
                </button>
                <button
                  onClick={disconnectXero}
                  disabled={loading}
                  className="px-4 py-2 text-red-600 border border-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            // Not Connected State
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <XCircle className="w-8 h-8 text-gray-400" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Not Connected</h2>
                  <p className="text-sm text-gray-600">{businessName}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 mb-4">
                  Connect to Xero to automatically import your financial data including:
                </p>
                <ul className="text-sm text-gray-600 space-y-1 mb-4 ml-4">
                  <li>• Profit & Loss statements</li>
                  <li>• Chart of accounts</li>
                  <li>• Transaction history</li>
                  <li>• Bank balances</li>
                </ul>
                <button
                  onClick={connectToXero}
                  disabled={loading}
                  className="w-full px-6 py-3 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors font-medium disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <ExternalLink className="w-5 h-5" />
                  <span>{loading ? 'Redirecting...' : 'Connect to Xero'}</span>
                </button>
              </div>
            </div>
          )}

          {message && (
            <div className={`mt-4 p-3 rounded-lg ${
              message.includes('Successfully')
                ? 'bg-green-100 text-green-800'
                : message.includes('Disconnected') || message.includes('Failed') || message.includes('denied') || message.includes('error')
                ? 'bg-red-100 text-red-800'
                : 'bg-brand-orange-100 text-brand-orange-800'
            }`}>
              {message}
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="mt-6 p-4 bg-brand-orange-50 rounded-lg">
          <p className="text-sm text-brand-orange-800">
            <strong>Note:</strong> You'll be redirected to Xero to authorize access.
            Make sure you're logged into the correct Xero organization before connecting.
          </p>
        </div>
      </div>
    </div>
  );
}