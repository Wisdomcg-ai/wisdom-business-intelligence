'use client'

import { Upload, Download, Link as LinkIcon, AlertTriangle, Clock, RefreshCw, ExternalLink, Unlink } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { describeXeroStatus, type XeroStatusResponse } from '@/lib/xero/business-status-view'

interface XeroConnectionPanelProps {
  /**
   * The whole business, every org (/api/Xero/status) — the ONLY thing that can
   * make this panel say "connected". It used to name whichever single org the
   * status route picked, and the page's fallback query picked an arbitrary one.
   * Null means there is no answer: the panel says it could not check.
   */
  status: XeroStatusResponse | null
  /**
   * The status check itself failed. Not "not connected": the panel says it could
   * not check and offers no Connect button. Without this the page used to render
   * a 500 as "Not connected to Xero".
   */
  checkFailed?: boolean
  isSaving: boolean
  /** A sync Xero just refused (401). */
  isExpired?: boolean
  onConnect: () => void
  onDisconnect: () => void
  onSync: () => void
  onClearAndResync: () => void
  onOpenCSVImport: () => void
}

export default function XeroConnectionPanel({
  status,
  checkFailed = false,
  isSaving,
  isExpired = false,
  onConnect,
  onDisconnect,
  onSync,
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

  const syncButton = (
    <button
      type="button"
      onClick={onSync}
      disabled={isSaving}
      className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-brand-orange bg-brand-orange-50 rounded-lg hover:bg-brand-orange-100 transition-colors disabled:opacity-50"
    >
      <Download className="w-4 h-4" />
      <span>Sync from Xero</span>
    </button>
  )

  const disconnectButton = (
    <button
      type="button"
      onClick={onDisconnect}
      disabled={isSaving}
      className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
      title="Disconnect Xero"
    >
      <Unlink className="w-4 h-4" />
    </button>
  )

  const reconnectButton = (
    <button
      type="button"
      onClick={onConnect}
      className="flex items-center space-x-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors shadow-sm"
    >
      <RefreshCw className="w-4 h-4" />
      <span>Reconnect Xero</span>
    </button>
  )

  // A sync Xero just refused outranks what the last status check said.
  if (isExpired) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-900">Xero Connection Expired</p>
              <p className="text-xs text-amber-700">
                Your Xero session has expired. Click Reconnect to refresh your connection.
              </p>
            </div>
          </div>
          {reconnectButton}
        </div>
      </div>
    )
  }

  if (!status || checkFailed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
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

  const copy = describeXeroStatus(status)
  const canManage = status.can_manage
  // Sync from Xero is open to anyone with access to the business; connecting and
  // disconnecting are not.
  const sync = copy.canSync ? syncButton : null
  const reconnect = canManage && copy.needsReconnect ? reconnectButton : null
  const disconnect = canManage ? disconnectButton : null

  if (copy.tone === 'none') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
          <p className="text-sm text-gray-600">Not connected to Xero</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpenCSVImport}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-brand-orange bg-brand-orange-50 rounded-lg hover:bg-brand-orange-100 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Import CSV</span>
          </button>
          {canManage && (
            <button
              type="button"
              onClick={onConnect}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors"
            >
              <LinkIcon className="w-4 h-4" />
              <span>Connect Xero</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  if (copy.tone === 'ok' || copy.tone === 'pending') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${copy.tone === 'pending' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
          <div>
            <p className="text-sm font-medium text-gray-900">{copy.title}</p>
            {copy.detail && <p className="text-xs text-gray-500">{copy.detail}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {manageLink}
          {sync}
          {disconnect}
        </div>
      </div>
    )
  }

  if (copy.tone === 'reconnect') {
    // An org is disconnected or stopped refreshing. Any other org keeps syncing,
    // so the sync action stays alongside the reconnect.
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-900">{copy.title}</p>
              {copy.detail && <p className="text-xs text-amber-700">{copy.detail}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {manageLink}
            {sync}
            {reconnect}
          </div>
        </div>
      </div>
    )
  }

  // Old numbers, or a check that could not finish: never green, actions kept.
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
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
      <div className="flex flex-wrap items-center gap-2">
        {manageLink}
        {sync}
        {reconnect}
        {disconnect}
      </div>
    </div>
  )
}
