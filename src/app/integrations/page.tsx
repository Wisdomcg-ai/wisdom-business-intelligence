'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Link2, CheckCircle, XCircle, RefreshCw, Trash2, Plus, Settings, AlertTriangle, Clock, HelpCircle, MinusCircle } from 'lucide-react'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { resolveBusinessId } from '@/lib/business/resolveBusinessId'
import PageHeader from '@/components/ui/PageHeader'
import {
  describeXeroStatus,
  fetchXeroBusinessStatus,
  type XeroStatusOrg,
  type XeroStatusResponse,
} from '@/lib/xero/business-status-view'

interface Integration {
  id: string
  name: string
  description: string
  icon: string
  /** 'unknown' — we could not check. Counted as neither connected nor available. */
  status: 'connected' | 'disconnected' | 'unknown'
  lastSync?: string
  accountName?: string
}

/** One org's own state, in words. */
function orgStateLabel(org: XeroStatusOrg): string {
  const date = (iso: string) => new Date(iso).toLocaleDateString()
  switch (org.status) {
    case 'connected':
      return org.last_sync_at ? `Synced ${date(org.last_sync_at)}` : 'Connected'
    case 'pending_first_sync':
      return 'First sync pending'
    case 'data_stale':
      return org.last_sync_at ? `Not updated since ${date(org.last_sync_at)}` : 'Never synced'
    case 'auth_stale':
      return 'Stopped refreshing — reconnect'
    case 'dead':
      return 'Disconnected — reconnect'
    case 'unknown':
    default:
      return "Couldn't check"
  }
}

function OrgStateIcon({ status }: { status: XeroStatusOrg['status'] }) {
  if (status === 'connected') return <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
  if (status === 'pending_first_sync') return <Clock className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
  if (status === 'data_stale') return <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
  if (status === 'dead' || status === 'auth_stale') return <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
  return <HelpCircle className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
}

export default function IntegrationsPage() {
  const supabase = createClient()
  const pathname = usePathname()
  const { activeBusiness, currentUser, isLoading: contextLoading } = useBusinessContext()
  const [loading, setLoading] = useState(true)
  // Every org of the business, classified on the server — the same answer as the
  // coach pill and the /cfo board. This page used to read the active rows itself:
  // a disconnected org vanished from the list, every listed org got a green tick
  // however old its numbers, and a failed read rendered "Not Connected".
  const [xeroStatus, setXeroStatus] = useState<XeroStatusResponse | null>(null)
  const [xeroCheckFailed, setXeroCheckFailed] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [businessId, setBusinessId] = useState<string | null>(null)

  useEffect(() => {
    if (!contextLoading) {
      loadIntegrations()
    }
  }, [contextLoading, activeBusiness?.id])

  async function loadIntegrations() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    // Business resolution via the shared role-aware helper.
    const { businessId: bizId } = await resolveBusinessId(supabase, {
      userId: user.id,
      role: currentUser?.role ?? null,
      activeBusinessId: activeBusiness?.id ?? null,
    })

    if (bizId) {
      setBusinessId(bizId)
      const check = await fetchXeroBusinessStatus(bizId)
      setXeroCheckFailed(!check.ok)
      setXeroStatus(check.ok ? check.data : null)
    }

    setLoading(false)
  }

  async function handleConnectXero() {
    if (!businessId) {
      alert('No business found. Please create a business profile first.')
      return
    }

    // Redirect to Xero OAuth — use current pathname so coach view context is preserved
    window.location.href = `/api/Xero/auth?business_id=${businessId}&return_to=${encodeURIComponent(pathname)}`
  }

  async function handleDisconnectXero() {
    if (!businessId || !confirm('Are you sure you want to disconnect Xero?')) return

    setSyncing(true)
    try {
      // Phase 53-01: route through the server-side disconnect endpoint so the
      // dual-ID delete fires (covers rows under BOTH businesses.id AND
      // business_profiles.id). Do NOT optimistically flip — JDS 2026-05-05
      // taught us that flipping before the server confirms hides stale rows
      // that survive a partial delete. State only changes when the server
      // confirms deleted_count > 0, and then it is re-read, not assumed.
      const res = await fetch('/api/Xero/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok && data.success && (data.deleted_count ?? 0) > 0) {
        await loadIntegrations()
      } else {
        const message = data.message || data.error || 'Failed to disconnect Xero'
        console.error('[Integrations] Disconnect failed:', { status: res.status, data })
        alert(message)
      }
    } catch (error) {
      console.error('Error disconnecting Xero:', error)
      alert(error instanceof Error ? error.message : 'Failed to disconnect Xero')
    } finally {
      setSyncing(false)
    }
  }

  async function handleSyncXero() {
    if (!businessId) return

    setSyncing(true)
    try {
      // Use the tenant-aware sync endpoint — loops over all active connections
      // for the business and tags each row with tenant_id.
      const res = await fetch('/api/monthly-report/sync-xero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })
      const data = await res.json()

      if (data.success) {
        const tenantMsg = data.tenants_synced
          ? `${data.tenants_synced}/${data.tenants_total} Xero organisations synced (${data.accounts_synced} accounts)`
          : 'Xero data synced successfully'
        alert(tenantMsg)
        await loadIntegrations()
      } else {
        throw new Error(data.error || 'Sync failed')
      }
    } catch (error: any) {
      console.error('Error syncing Xero:', error)
      alert('Failed to sync Xero: ' + error.message)
    } finally {
      setSyncing(false)
    }
  }

  const xeroCopy = xeroStatus ? describeXeroStatus(xeroStatus) : null
  const xeroIntegrationStatus: Integration['status'] = xeroCheckFailed
    ? 'unknown'
    : xeroStatus && xeroStatus.orgs.length > 0 && xeroStatus.connected
      ? 'connected'
      : 'disconnected'

  const integrations: Integration[] = [
    {
      id: 'xero',
      name: 'Xero',
      description: 'Sync your financial data from Xero accounting software',
      icon: '📊',
      status: xeroIntegrationStatus,
    },
    {
      id: 'hubspot',
      name: 'HubSpot',
      description: 'Sync customer and deal data from HubSpot CRM',
      icon: '🎯',
      status: 'disconnected'
    }
  ]

  // Xero has orgs to show: connected ones, and disconnected ones that still need a reconnect.
  const xeroHasOrgs = !xeroCheckFailed && !!xeroStatus && xeroStatus.orgs.length > 0
  const xeroHealthy = xeroCopy?.tone === 'ok' || xeroCopy?.tone === 'pending'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Link2 className="w-8 h-8 text-brand-orange animate-pulse mx-auto mb-4" />
          <p className="text-gray-600">Loading integrations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PageHeader
        variant="banner"
        title="Integrations"
        subtitle="Connect your business tools and services"
        icon={Link2}
      />

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {integrations.filter(i => i.status === 'connected').length}
                </p>
                <p className="text-sm text-gray-600">Connected</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-gray-400" />
              <div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {integrations.filter(i => i.status === 'disconnected').length}
                </p>
                <p className="text-sm text-gray-600">Available</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Link2 className="w-8 h-8 text-brand-orange" />
              <div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {integrations.length}
                </p>
                <p className="text-sm text-gray-600">Total Integrations</p>
              </div>
            </div>
          </div>
        </div>

        {/* Integrations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {integrations.map((integration) => {
            const isXero = integration.id === 'xero'
            const borderClass = isXero
              ? xeroHealthy
                ? 'border-green-500'
                : xeroHasOrgs || xeroCheckFailed
                  ? 'border-amber-300'
                  : 'border-gray-200 hover:border-brand-orange-400 hover:shadow-md'
              : integration.status === 'connected'
                ? 'border-green-500'
                : 'border-gray-200 hover:border-brand-orange-400 hover:shadow-md'

            return (
            <div
              key={integration.id}
              className={`rounded-xl shadow-sm border bg-white p-4 sm:p-6 transition-all ${borderClass}`}
            >
              {/* Icon and Status */}
              <div className="flex items-start justify-between mb-4">
                <div className="text-3xl sm:text-4xl">{integration.icon}</div>
                {isXero && (xeroCheckFailed || (xeroHasOrgs && xeroCopy?.tone === 'unknown')) ? (
                  <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-800 text-xs font-medium rounded-full">
                    <HelpCircle className="w-3 h-3" />
                    Couldn&apos;t check
                  </span>
                ) : isXero && xeroHasOrgs && !xeroHealthy && !xeroStatus?.connected ? (
                  <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-xs font-medium rounded-full">
                    <AlertTriangle className="w-3 h-3" />
                    Disconnected
                  </span>
                ) : isXero && xeroHasOrgs && !xeroHealthy ? (
                  <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-800 text-xs font-medium rounded-full">
                    <AlertTriangle className="w-3 h-3" />
                    Needs attention
                  </span>
                ) : integration.status === 'connected' ? (
                  <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                    <CheckCircle className="w-3 h-3" />
                    Connected
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                    Not Connected
                  </span>
                )}
              </div>

              {/* Name and Description */}
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                {integration.name}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {integration.description}
              </p>

              {/* Xero: we could not check — say so, and offer nothing that assumes an answer */}
              {isXero && xeroCheckFailed && (
                <div className="mb-4 p-3 bg-amber-50 rounded-lg">
                  <p className="text-sm text-amber-800">
                    Couldn&apos;t check your Xero connection just now. This is not a sign that it is disconnected.
                  </p>
                </div>
              )}

              {/* Xero: every org, each with its own state */}
              {isXero && xeroHasOrgs && xeroStatus && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  {!xeroHealthy && xeroCopy && (
                    <p className="text-sm font-medium text-amber-900 mb-2">{xeroCopy.title}</p>
                  )}
                  <p className="text-xs text-gray-600 mb-2">
                    Organisation{xeroStatus.orgs.length > 1 ? `s (${xeroStatus.orgs.length})` : ''}
                  </p>
                  <ul className="space-y-1">
                    {xeroStatus.orgs.map((org) => (
                      <li key={org.connection_id ?? org.tenant_id ?? org.tenant_name ?? ''} className="flex items-center gap-2 text-sm">
                        <OrgStateIcon status={org.status} />
                        <span className="font-medium text-gray-900 truncate">
                          {org.display_name || org.tenant_name || 'Xero organisation'}
                        </span>
                        <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
                          {orgStateLabel(org)}
                        </span>
                      </li>
                    ))}
                    {xeroStatus.retired_orgs.map((org) => (
                      <li key={`retired-${org.connection_id ?? org.tenant_id ?? org.tenant_name ?? ''}`} className="flex items-center gap-2 text-sm text-gray-400">
                        <MinusCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{org.display_name || org.tenant_name || 'Xero organisation'}</span>
                        <span className="text-xs ml-auto flex-shrink-0">Switched off</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!isXero && integration.status === 'connected' && integration.accountName && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600">Connected Account</p>
                  <p className="text-sm font-medium text-gray-900">{integration.accountName}</p>
                  {integration.lastSync && (
                    <p className="text-xs text-gray-500 mt-1">
                      Last synced: {new Date(integration.lastSync).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2">
                {isXero ? (
                  xeroCheckFailed ? (
                    <button
                      onClick={loadIntegrations}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Try again
                    </button>
                  ) : xeroHasOrgs ? (
                    <>
                      {xeroCopy?.tone === 'reconnect' && (
                        <button
                          onClick={handleConnectXero}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 transition-colors"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Reconnect Xero
                        </button>
                      )}
                      {xeroCopy?.canSync && (
                        <button
                          onClick={handleSyncXero}
                          disabled={syncing}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                          {syncing ? 'Syncing...' : 'Sync Now'}
                        </button>
                      )}
                      {xeroCopy?.tone !== 'reconnect' && (
                        <button
                          onClick={handleConnectXero}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-brand-orange hover:bg-orange-50 text-brand-orange text-sm font-medium rounded-lg transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Add Another Organisation
                        </button>
                      )}
                      <button
                        onClick={handleDisconnectXero}
                        disabled={syncing}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Disconnect All
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleConnectXero}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Connect {integration.name}
                    </button>
                  )
                ) : (
                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 text-gray-500 text-sm font-medium rounded-lg cursor-not-allowed"
                  >
                    Coming Soon
                  </button>
                )}
              </div>
            </div>
            )
          })}
        </div>

        {/* Help Section */}
        <div className="rounded-xl shadow-sm border border-brand-orange-200 bg-brand-orange-50 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-brand-orange flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-brand-navy mb-2">Need Help with Integrations?</h3>
              <p className="text-sm text-brand-orange-700 mb-3">
                Integrations sync data automatically to keep your business insights up to date. Some integrations require
                admin access to your third-party accounts.
              </p>
              <ul className="text-sm text-brand-orange space-y-1">
                <li>• Data syncs automatically every 24 hours</li>
                <li>• You can manually sync anytime</li>
                <li>• Disconnect integrations anytime without data loss</li>
                <li>• More integrations coming soon!</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
