'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Building2, CheckSquare, Square, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

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
  const [selectedTenantIds, setSelectedTenantIds] = useState<Set<string>>(new Set());
  const [businessName, setBusinessName] = useState<string>('');
  const [returnTo, setReturnTo] = useState<string>('/integrations');
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
        const res = await fetch(`/api/Xero/pending-connection?pending_id=${pendingId}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Connection session expired. Please try again.');
          setLoading(false);
          return;
        }

        const data = await res.json();
        const fetchedTenants: Tenant[] = data.tenants || [];
        setTenants(fetchedTenants);
        // Pre-select ALL tenants by default — multi-tenant consolidation is the
        // common path. Users can uncheck any they don't want.
        setSelectedTenantIds(new Set(fetchedTenants.map((t) => t.tenantId)));
        if (data.return_to) setReturnTo(data.return_to);

        if (businessId) {
          try {
            const bizRes = await fetch(`/api/business-profile?business_id=${businessId}`);
            if (bizRes.ok) {
              const bizData = await bizRes.json();
              setBusinessName(bizData.profile?.business_name || bizData.profile?.name || '');
            }
          } catch {
            // Non-critical
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

  const toggleTenant = (tenantId: string) => {
    setSelectedTenantIds((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  };

  const handleConnect = async () => {
    if (selectedTenantIds.size === 0 || !pendingId) return;
    setConnecting(true);
    setError(null);

    try {
      const res = await fetch('/api/Xero/complete-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pending_id: pendingId,
          tenant_ids: Array.from(selectedTenantIds),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to connect. Please try again.');
        setConnecting(false);
        return;
      }

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
            onClick={() => router.push(returnTo)}
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
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-sky-400/10 rounded-full flex items-center justify-center">
              <Building2 className="w-5 h-5 text-sky-400" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Select Xero Organisations</h1>
          </div>
          {businessName && (
            <p className="text-sm text-gray-600">
              Which Xero organisations should be connected to <strong>{businessName}</strong>? Select one or more — each will become a column in your consolidated reports.
            </p>
          )}
          {!businessName && (
            <p className="text-sm text-gray-600">
              Select one or more Xero organisations to connect. Multiple organisations can be consolidated into a single report.
            </p>
          )}
        </div>

        <div className="px-8 py-4">
          <div className="flex items-center justify-between mb-3 text-xs text-gray-500">
            <span>
              {selectedTenantIds.size} of {tenants.length} selected
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedTenantIds(new Set(tenants.map((t) => t.tenantId)))}
                className="hover:text-gray-700"
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedTenantIds(new Set())}
                className="hover:text-gray-700"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {tenants.map((tenant) => {
              const isSelected = selectedTenantIds.has(tenant.tenantId);
              return (
                <button
                  key={tenant.tenantId}
                  onClick={() => toggleTenant(tenant.tenantId)}
                  className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                    isSelected
                      ? 'border-brand-orange bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5 flex-shrink-0 text-brand-orange" />
                  ) : (
                    <Square className="w-5 h-5 flex-shrink-0 text-gray-400" />
                  )}
                  <Building2 className={`w-5 h-5 flex-shrink-0 ${isSelected ? 'text-brand-orange' : 'text-gray-400'}`} />
                  <span className={`text-sm font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                    {tenant.tenantName}
                  </span>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="px-8 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={() => router.push(returnTo)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={selectedTenantIds.size === 0 || connecting}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedTenantIds.size > 0 && !connecting
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
                Connect {selectedTenantIds.size > 1 ? `${selectedTenantIds.size} organisations` : 'organisation'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
