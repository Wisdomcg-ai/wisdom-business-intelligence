'use client'

import { Upload, Download, Link as LinkIcon, AlertTriangle, Clock, RefreshCw, ExternalLink, Unlink } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  describeXeroStatus,
  type XeroStatusConnection,
  type XeroStatusResponse,
} from '@/lib/xero/business-status-view'

interface XeroConnectionPanelProps {
  xeroConnection: Pick<XeroStatusConnection, 'tenant_name' | 'last_synced_at' | 'expires_at'> | null
  /**
   * The whole business, every org (/api/Xero/status). When present it decides
   * what the panel says — it used to name whichever single org the status route
   * picked, and the page's fallback query picked an arbitrary one.
   */
  status?: XeroStatusResponse | null
  /**
   * The status check itself failed. Not "not connected": the panel says it could
   * not check and offers no Connect button. Without this the page used to render
   * a 500 as "Not connected to Xero".
   */
  checkFailed?: boolean
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
  status,
  checkFailed = false,
  isSaving,
  isExpired = false,
  onConnect,
  onDisconnect,
  onSync,
  onClearAndResync,
  onOpenCSVImport
}: XeroConnectionPanelProps) {
  const pathname = usePathname()
  const integrationsHref = pathname.includes('/coach/clients/')
    ? pathname.replace(/\/view\/.*$/, '/view/integrations')
    : '/integrations'

  const manageLink = (
    <Link
      href={integrationsHref}
      className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
    >
      <ExternalLink className="w-4 h-4" />
      <span>Manage</span>
    </Link>
  )

  const liveActions = (
    <>
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
    </>
  )

  const expiredPanel = (title: string, detail: string) => (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-900">{title}</p>
            <p className="text-xs text-amber-700">{detail}</p>
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

  const connectedPanel = (title: string, detail: string | null) => (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
        <div>
          <p className="text-sm font-medium text-gray-900">{title}</p>
          {detail && <p className="text-xs text-gray-500">{detail}</p>}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {manageLink}
        {liveActions}
      </div>
    </div>
  )

  const notConnectedPanel = (
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

  // A sync Xero just refused outranks what the last status check said.
  if (isExpired) {
    return expiredPanel('Xero Connection Expired', 'Your Xero session has expired. Click Reconnect to refresh your connection.')
  }

  if (checkFailed) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 bg-amber-400 rounded-full"></div>
          <p className="text-sm text-amber-800">
            Couldn&apos;t check the Xero connection just now — the figures below are from the last successful sync.
          </p>
        </div>
        <div className="flex items-center space-x-2">{manageLink}</div>
      </div>
    )
  }

  if (status) {
    const copy = describeXeroStatus(status)
    if (copy.tone === 'none') return notConnectedPanel
    if (copy.tone === 'ok' || copy.tone === 'pending') return connectedPanel(copy.title, copy.detail)
    if (copy.tone === 'reconnect') return expiredPanel(copy.title, copy.detail ?? 'Reconnect Xero to sync the latest figures.')
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {copy.tone === 'attention' ? (
            <Clock className="w-4 h-4 text-amber-600" />
          ) : (
            <div className="w-3 h-3 bg-amber-400 rounded-full"></div>
          )}
          <div>
            <p className="text-sm font-medium text-amber-900">{copy.title}</p>
            {copy.detail && <p className="text-xs text-amber-700">{copy.detail}</p>}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {manageLink}
          {copy.canSync && liveActions}
        </div>
      </div>
    )
  }

  // A reader with no business status: the connection row alone.
  const tokenExpired = xeroConnection?.expires_at && new Date(xeroConnection.expires_at) <= new Date()

  if (xeroConnection && tokenExpired) {
    // Expired connection - show prominent reconnect UI
    return expiredPanel('Xero Connection Expired', 'Your Xero session has expired. Click Reconnect to refresh your connection.')
  }

  if (xeroConnection) {
    return connectedPanel(
      `Connected to Xero: ${xeroConnection.tenant_name ?? ''}`,
      xeroConnection.last_synced_at ? `Last synced: ${new Date(xeroConnection.last_synced_at).toLocaleString()}` : null,
    )
  }

  return notConnectedPanel
}
