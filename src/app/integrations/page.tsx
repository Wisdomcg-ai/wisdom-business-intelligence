'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Link2, CheckCircle, XCircle, RefreshCw, Trash2, ExternalLink, Plus, Settings } from 'lucide-react'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import PageHeader from '@/components/ui/PageHeader'

interface Integration {
  id: string
  name: string
  description: string
  icon: string
  status: 'connected' | 'disconnected'
  lastSync?: string
  accountName?: string
}

export default function IntegrationsPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()
  const [loading, setLoading] = useState(true)
  const [xeroConnected, setXeroConnected] = useState(false)
  const [xeroData, setXeroData] = useState<any>(null)
  const [syncing, setSyncing] = useState(false)
  const [businessId, setBusinessId] = useState<string | null>(null)

  // Check for success/error query params from OAuth callback
  const successParam = searchParams.get('success')
  const errorParam = searchParams.get('error')

  useEffect(() => {
    if (!contextLoading) {
      loadIntegrations()
    }
  }, [contextLoading, activeBusiness?.id, successParam])

  async function loadIntegrations() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    console.log('[Integrations] User ID:', user.id)

    // Use activeBusiness if viewing as coach, otherwise get user's own business
    let bizId: string | null = null
    if (activeBusiness?.id) {
      bizId = activeBusiness.id
    } else {
      // Get user's business first to get the business_id
      const { data: businessData, error: businessError } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()

      console.log('[Integrations] Business data:', businessData)
      console.log('[Integrations] Business error:', businessError)
      bizId = businessData?.id || null
    }

    if (bizId) {
      setBusinessId(bizId)

      // Check Xero connection via API (bypasses RLS)
      try {
        const response = await fetch(`/api/Xero/status?business_id=${bizId}`)
        const data = await response.json()

        console.log('[Integrations] Xero status:', data)

        if (data.connected && data.connection) {
          setXeroConnected(true)
          setXeroData(data.connection)
        } else {
          setXeroConnected(false)
          setXeroData(null)
        }
      } catch (err) {
        console.error('[Integrations] Error checking Xero status:', err)
        setXeroConnected(false)
        setXeroData(null)
      }
    }

    setLoading(false)
  }

  async function handleConnectXero() {
    if (!businessId) {
      alert('No business found. Please create a business profile first.')
      return
    }

    // Redirect to Xero OAuth
    window.location.href = `/api/Xero/auth?business_id=${businessId}`
  }

  async function handleDisconnectXero() {
    if (!businessId || !confirm('Are you sure you want to disconnect Xero?')) return

    setSyncing(true)
    try {
      const { error } = await supabase
        .from('xero_connections')
        .delete()
        .eq('business_id', businessId)

      if (error) throw error

      setXeroConnected(false)
      setXeroData(null)
    } catch (error) {
      console.error('Error disconnecting Xero:', error)
      alert('Failed to disconnect Xero')
    } finally {
      setSyncing(false)
    }
  }

  async function handleSyncXero() {
    if (!businessId) return

    setSyncing(true)
    try {
      const res = await fetch(`/api/Xero/sync?business_id=${businessId}`)
      const data = await res.json()

      if (data.success) {
        alert('Xero data synced successfully!')
        await loadIntegrations()
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      console.error('Error syncing Xero:', error)
      alert('Failed to sync Xero: ' + error.message)
    } finally {
      setSyncing(false)
    }
  }

  const integrations: Integration[] = [
    {
      id: 'xero',
      name: 'Xero',
      description: 'Sync your financial data from Xero accounting software',
      icon: '📊',
      status: xeroConnected ? 'connected' : 'disconnected',
      lastSync: xeroData?.last_sync_at,
      accountName: xeroData?.tenant_name
    },
    {
      id: 'hubspot',
      name: 'HubSpot',
      description: 'Sync customer and deal data from HubSpot CRM',
      icon: '🎯',
      status: 'disconnected'
    }
  ]

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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6">
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
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className={`rounded-xl shadow-sm border bg-white p-4 sm:p-6 transition-all ${
                integration.status === 'connected'
                  ? 'border-green-500'
                  : 'border-gray-200 hover:border-brand-orange-400 hover:shadow-md'
              }`}
            >
              {/* Icon and Status */}
              <div className="flex items-start justify-between mb-4">
                <div className="text-3xl sm:text-4xl">{integration.icon}</div>
                {integration.status === 'connected' ? (
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

              {/* Account Info (if connected) */}
              {integration.status === 'connected' && integration.accountName && (
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
                {integration.id === 'xero' ? (
                  integration.status === 'connected' ? (
                    <>
                      <button
                        onClick={handleSyncXero}
                        disabled={syncing}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Syncing...' : 'Sync Now'}
                      </button>
                      <button
                        onClick={handleDisconnectXero}
                        disabled={syncing}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Disconnect
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
          ))}
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
