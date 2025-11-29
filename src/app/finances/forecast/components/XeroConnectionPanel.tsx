'use client'

import { Settings, Upload, Download, Link as LinkIcon } from 'lucide-react'
import type { XeroConnection } from '../types'

interface XeroConnectionPanelProps {
  xeroConnection: XeroConnection | null
  isSaving: boolean
  onConnect: () => void
  onDisconnect: () => void
  onSync: () => void
  onClearAndResync: () => void
  onOpenCSVImport: () => void
}

export default function XeroConnectionPanel({
  xeroConnection,
  isSaving,
  onConnect,
  onDisconnect,
  onSync,
  onClearAndResync,
  onOpenCSVImport
}: XeroConnectionPanelProps) {
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
          <button
            type="button"
            onClick={onDisconnect}
            disabled={isSaving}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <Settings className="w-4 h-4" />
            <span>Manage Connection</span>
          </button>
          <button
            type="button"
            onClick={onClearAndResync}
            disabled={isSaving}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            <span>Clear & Resync</span>
          </button>
          <button
            type="button"
            onClick={onSync}
            disabled={isSaving}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-teal-600 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Sync from Xero</span>
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
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-teal-600 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
        >
          <Upload className="w-4 h-4" />
          <span>Import CSV</span>
        </button>
        <button
          type="button"
          onClick={onConnect}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
        >
          <LinkIcon className="w-4 h-4" />
          <span>Connect Xero</span>
        </button>
      </div>
    </div>
  )
}
