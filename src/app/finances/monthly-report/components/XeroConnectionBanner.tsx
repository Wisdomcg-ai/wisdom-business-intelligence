'use client'

import { AlertTriangle, RefreshCw, ExternalLink, Link as LinkIcon, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface XeroConnectionData {
  id: string
  tenant_name: string
  is_active: boolean
  last_synced_at: string | null
  expires_at: string
}

interface XeroConnectionBannerProps {
  xeroConnection: XeroConnectionData | null
  isExpired: boolean
  isLoading: boolean
  isSyncing: boolean
  onConnect: () => void
  onSync: () => void
  onManage: () => void
}

export default function XeroConnectionBanner({
  xeroConnection,
  isExpired,
  isLoading,
  isSyncing,
  onConnect,
  onSync,
  onManage,
}: XeroConnectionBannerProps) {
  if (isLoading) {
    return (
      <div className="mb-4 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center space-x-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Checking Xero connection...</span>
        </div>
      </div>
    )
  }

  // Expired state
  if (isExpired) {
    return (
      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-900">Xero Connection Expired</p>
              <p className="text-xs text-amber-700">Reconnect to sync your latest P&L data.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onConnect}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reconnect Xero</span>
          </button>
        </div>
      </div>
    )
  }

  // Connected state
  if (xeroConnection) {
    return (
      <div className="mb-4 px-4 py-3 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"></div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Connected to Xero: {xeroConnection.tenant_name}
              </p>
              {xeroConnection.last_synced_at && (
                <p className="text-xs text-gray-500">
                  Last synced: {new Date(xeroConnection.last_synced_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Link
              href="/integrations"
              className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Manage</span>
            </Link>
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              className="flex items-center space-x-2 px-4 py-1.5 text-sm font-medium text-brand-orange bg-brand-orange-50 rounded-lg hover:bg-brand-orange-100 transition-colors disabled:opacity-50"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Sync P&L Data</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Disconnected state
  return (
    <div className="mb-4 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 bg-gray-400 rounded-full flex-shrink-0"></div>
          <p className="text-sm text-gray-600">Not connected to Xero</p>
        </div>
        <button
          type="button"
          onClick={onConnect}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors"
        >
          <LinkIcon className="w-4 h-4" />
          <span>Connect Xero</span>
        </button>
      </div>
    </div>
  )
}
