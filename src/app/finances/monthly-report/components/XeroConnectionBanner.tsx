'use client'

import { AlertTriangle, Clock, RefreshCw, ExternalLink, Link as LinkIcon, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { describeXeroStatus, type XeroStatusResponse } from '@/lib/xero/business-status-view'

interface XeroConnectionData {
  id: string | null
  tenant_name: string | null
  is_active: boolean
  last_synced_at: string | null
  expires_at: string | null
}

interface XeroConnectionBannerProps {
  xeroConnection: XeroConnectionData | null
  /**
   * The whole business, every org (/api/Xero/status). When present it decides
   * what the banner says. It used to name ONE org — for IICT Group, "Connected to
   * Xero: IICT Group Limited · Last synced today" while IICT Group Pty Ltd had
   * not synced in five days. A business is as healthy as its worst org.
   */
  status?: XeroStatusResponse | null
  isExpired: boolean
  /**
   * PRES-09 — the connection status could not be determined (the status route
   * errored, returned non-2xx, or the request never completed). Distinct from
   * "not connected", which is a positive claim we have no evidence for. Takes
   * precedence over the disconnected state.
   */
  checkFailed?: boolean
  isLoading: boolean
  isSyncing: boolean
  onConnect: () => void
  onSync: () => void
  onManage: () => void
}

export default function XeroConnectionBanner({
  xeroConnection,
  status,
  isExpired,
  checkFailed = false,
  isLoading,
  isSyncing,
  onConnect,
  onSync,
  onManage,
}: XeroConnectionBannerProps) {
  const pathname = usePathname()
  const integrationsHref = pathname.includes('/coach/clients/')
    ? pathname.replace(/\/view\/.*$/, '/view/integrations')
    : '/integrations'

  const manageLink = (
    <Link
      href={integrationsHref}
      className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <ExternalLink className="w-3.5 h-3.5" />
      <span>Manage</span>
    </Link>
  )

  const syncButton = (
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
  )

  const reconnectButton = (
    <button
      type="button"
      onClick={onConnect}
      className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors"
    >
      <RefreshCw className="w-4 h-4" />
      <span>Reconnect Xero</span>
    </button>
  )

  const connected = (title: string, detail: string | null) => (
    <div className="mb-4 px-4 py-3 bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"></div>
          <div>
            <p className="text-sm font-medium text-gray-900">{title}</p>
            {detail && <p className="text-xs text-gray-500">{detail}</p>}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {manageLink}
          {syncButton}
        </div>
      </div>
    </div>
  )

  const disconnected = (
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

  // Expired state — a sync Xero just refused
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
          {reconnectButton}
        </div>
      </div>
    )
  }

  if (status) {
    const copy = describeXeroStatus(status)

    if (copy.tone === 'none') return disconnected

    if (copy.tone === 'ok' || copy.tone === 'pending') return connected(copy.title, copy.detail)

    // An org is disconnected or stopped refreshing: a person must reconnect.
    // Any other org keeps syncing, so the figures below are still partly live.
    if (copy.tone === 'reconnect') {
      return (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-900">{copy.title}</p>
                {copy.detail && <p className="text-xs text-amber-700">{copy.detail}</p>}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {manageLink}
              {reconnectButton}
            </div>
          </div>
        </div>
      )
    }

    // Old numbers, or a check that could not finish. Neither is a green tick,
    // and neither hides the Sync button while an org can still sync.
    return (
      <div className="mb-4 px-4 py-3 bg-amber-50 rounded-lg border border-amber-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {copy.tone === 'attention' ? (
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            ) : (
              <div className="w-3 h-3 bg-amber-400 rounded-full flex-shrink-0"></div>
            )}
            <div>
              <p className="text-sm font-medium text-amber-900">{copy.title}</p>
              {copy.detail && <p className="text-xs text-amber-700">{copy.detail}</p>}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {manageLink}
            {copy.canSync && syncButton}
          </div>
        </div>
      </div>
    )
  }

  // Connected state (a reader that has no business status)
  if (xeroConnection) {
    return connected(
      `Connected to Xero: ${xeroConnection.tenant_name ?? ''}`,
      xeroConnection.last_synced_at
        ? `Last synced: ${new Date(xeroConnection.last_synced_at).toLocaleString()}`
        : null,
    )
  }

  // PRES-09 — checked before the disconnected state. A failed status check used
  // to render "Not connected to Xero" with a Connect button, sitting directly
  // above a fully populated P&L rendered from Xero data already in the database.
  // For a user who is "not a numbers person" that contradiction is unresolvable:
  // is the report real or not? It also hid the "Sync P&L Data" button, removing
  // the one action that might have helped.
  if (checkFailed) {
    return (
      <div className="mb-4 px-4 py-3 bg-amber-50 rounded-lg border border-amber-200">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 bg-amber-400 rounded-full flex-shrink-0"></div>
          <p className="text-sm text-amber-800">
            Couldn&apos;t check the Xero connection just now — the figures below are
            from the last successful sync.
          </p>
        </div>
      </div>
    )
  }

  // Disconnected state
  return disconnected
}
