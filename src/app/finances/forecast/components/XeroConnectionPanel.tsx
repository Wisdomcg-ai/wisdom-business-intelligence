'use client'

import { Settings, Upload, Download, Link as LinkIcon, AlertTriangle, RefreshCw, ExternalLink, Unlink } from 'lucide-react'
import Link from 'next/link'
import type { XeroConnection } from '../types'

interface XeroConnectionPanelProps {
  xeroConnection: XeroConnection | null
  isSaving: boolean
  isExpired?: boolean
  onConnect: () => void
  onDisconnect: () => void
  onSync: () => void
  onClearAndResync: () => void
  onOpenCSVImport: () => void
}

export default function XeroConnectionPanel({
  xeroConnection,
  isSaving,
  isExpired = false,
  onConnect,
  onDisconnect,
  onSync,
  onClearAndResync,
  onOpenCSVImport
}: XeroConnectionPanelProps) {
  // Check if token is expired
  const tokenExpired = isExpired || (xeroConnection?.expires_at && new Date(xeroConnection.expires_at) <= new Date())

  if (xeroConnection && tokenExpired) {
    // Expired connection - show prominent reconnect UI
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-900">
                Xero Connection Expired
              </p>
              <p className="text-xs text-amber-700">
                Your Xero session has expired. Click Reconnect to refresh your connection.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onConnect}
            className="flex items-center space-x-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reconnect Xero</span>
          </button>
        </div>
      </div>
    )
  }

  if (xeroConnection) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
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
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Manage</span>
          </Link>
          <button
            type="button"
            onClick={onSync}
            disabled={isSaving}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-brand-orange bg-brand-orange-50 rounded-lg hover:bg-brand-orange-100 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Sync from Xero</span>
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            disabled={isSaving}
            className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            title="Disconnect Xero"
          >
            <Unlink className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
        <p className="text-sm text-gray-600">Not connected to Xero</p>
      </div>
      <div className="flex items-center space-x-3">
        <button
          type="button"
          onClick={onOpenCSVImport}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-brand-orange bg-brand-orange-50 rounded-lg hover:bg-brand-orange-100 transition-colors"
        >
          <Upload className="w-4 h-4" />
          <span>Import CSV</span>
        </button>
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
