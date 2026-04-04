'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Building2, CheckCircle, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

interface Tenant {
  tenantId: string;
  tenantName: string;
}

export default function SelectOrgPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pendingId = searchParams.get('pending_id');
  const businessId = searchParams.get('business_id');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch pending connection data
  useEffect(() => {
    if (!pendingId) {
      setError('Invalid link. Please try connecting Xero again.');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch pending tenants
        const res = await fetch(`/api/Xero/pending-connection?pending_id=${pendingId}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Connection session expired. Please try again.');
          setLoading(false);
          return;
        }

        const data = await res.json();
        setTenants(data.tenants || []);

        // Fetch business name for display
        if (businessId) {
          try {
            const bizRes = await fetch(`/api/business-profile?business_id=${businessId}`);
            if (bizRes.ok) {
              const bizData = await bizRes.json();
              setBusinessName(bizData.profile?.business_name || bizData.profile?.name || '');
            }
          } catch {
            // Non-critical — just won't show business name
          }
        }
      } catch {
        setError('Failed to load connection data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [pendingId, businessId]);

  const handleConnect = async () => {
    if (!selectedTenantId || !pendingId) return;
    setConnecting(true);
    setError(null);

    try {
      const res = await fetch('/api/Xero/complete-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pending_id: pendingId,
          tenant_id: selectedTenantId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to connect. Please try again.');
        setConnecting(false);
        return;
      }

      // Redirect to the return URL
      router.push(data.redirect_to || '/integrations?success=connected');
    } catch {
      setError('Connection failed. Please try again.');
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading Xero organisations...</span>
        </div>
      </div>
    );
  }

  if (error && tenants.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Connection Expired</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/integrations')}
            className="px-6 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy/90 transition-colors"
          >
            Back to Integrations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm max-w-lg w-full">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#13B5EA]/10 rounded-full flex items-center justify-center">
              <img src="/logos/xero.svg" alt="Xero" className="w-6 h-6" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Select Xero Organisation</h1>
          </div>
          {businessName && (
            <p className="text-sm text-gray-600">
              Which Xero organisation should be connected to <strong>{businessName}</strong>?
            </p>
          )}
          {!businessName && (
            <p className="text-sm text-gray-600">
              Select the Xero organisation to connect.
            </p>
          )}
        </div>

        {/* Tenant List */}
        <div className="px-8 py-4">
          <div className="space-y-2">
            {tenants.map((tenant) => (
              <button
                key={tenant.tenantId}
                onClick={() => setSelectedTenantId(tenant.tenantId)}
                className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                  selectedTenantId === tenant.tenantId
                    ? 'border-brand-orange bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <Building2 className={`w-5 h-5 flex-shrink-0 ${
                  selectedTenantId === tenant.tenantId ? 'text-brand-orange' : 'text-gray-400'
                }`} />
                <span className={`text-sm font-medium ${
                  selectedTenantId === tenant.tenantId ? 'text-gray-900' : 'text-gray-700'
                }`}>
                  {tenant.tenantName}
                </span>
                {selectedTenantId === tenant.tenantId && (
                  <CheckCircle className="w-5 h-5 text-brand-orange ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={() => router.push('/integrations')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={!selectedTenantId || connecting}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedTenantId && !connecting
                ? 'bg-brand-navy text-white hover:bg-brand-navy/90'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                Connect
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
