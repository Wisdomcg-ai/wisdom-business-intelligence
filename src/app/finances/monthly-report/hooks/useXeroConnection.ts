'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import {
  fetchXeroBusinessStatus,
  type XeroStatusConnection,
  type XeroStatusResponse,
} from '@/lib/xero/business-status-view'

export function useXeroConnection(businessId: string) {
  const router = useRouter()
  const pathname = usePathname()
  // Present when the business has a live Xero org — gates the post-OAuth sync.
  const [xeroConnection, setXeroConnection] = useState<XeroStatusConnection | null>(null)
  // The whole business, every org: what the banner renders.
  const [xeroStatus, setXeroStatus] = useState<XeroStatusResponse | null>(null)
  // Set only by a sync that Xero refused (401); the status carries everything else.
  const [isExpired, setIsExpired] = useState(false)
  // PRES-09 — started as `false`, so between mount and the first response the
  // banner rendered its "Not connected to Xero" state as a settled answer. The
  // unknown must not render as an answer: start loading.
  const [isLoading, setIsLoading] = useState(true)
  // Distinct from `error`: this specifically means we could not determine the
  // connection state, so the banner must not claim "not connected".
  const [checkFailed, setCheckFailed] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Read the connection — and its clock — from the server.
   *
   * This is the ONLY thing that sets `last_synced_at` in this hook. handleSync
   * used to assign `new Date().toISOString()` straight into state after any 2xx,
   * so XeroConnectionBanner printed "Last synced: <a second ago>" over a sync
   * whose P&L had just failed. That is the client-side twin of the database
   * stamp deleted from the sync route: a clock moved by the act of asking,
   * not by data arriving. `xero_connections.last_synced_at` has exactly one
   * writer (syncBusinessXeroPL, per tenant, on that tenant's own success) —
   * so after a sync we re-read it rather than predict it.
   *
   * `silent` skips the loading flag: the banner swaps its whole body for
   * "Checking Xero connection..." while isLoading is true, and a post-sync
   * re-read should refresh the line in place, not blank the banner.
   */
  const refreshStatus = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!businessId) return

      if (!silent) setIsLoading(true)
      setError(null)

      try {
        // A non-2xx, a network or parse failure, or a body that is not a status
        // answer all come back not-ok: none of them is evidence about the
        // client's Xero. Each used to fall through to "not connected", which put
        // "Not connected to Xero" above a report built from Xero data already in
        // the database.
        const result = await fetchXeroBusinessStatus(businessId)
        setIsExpired(false)
        if (!result.ok) {
          setCheckFailed(true)
          setXeroStatus(null)
          setXeroConnection(null)
          setError('Could not check the Xero connection')
          return
        }
        setCheckFailed(false)
        setXeroStatus(result.data)
        setXeroConnection(result.data.connected ? result.data.connection : null)
      } catch (err) {
        console.error('[useXeroConnection] Status fetch error:', err)
        setCheckFailed(true)
        setXeroStatus(null)
        setXeroConnection(null)
        setError('Failed to check Xero connection')
      } finally {
        if (!silent) setIsLoading(false)
      }
    },
    [businessId],
  )

  // Fetch connection status on mount / when businessId changes
  useEffect(() => {
    if (!businessId) return
    refreshStatus()
  }, [businessId, refreshStatus])

  const handleConnect = useCallback(() => {
    if (!businessId) return
    window.location.href = `/api/Xero/auth?business_id=${businessId}&return_to=${encodeURIComponent(pathname)}`
  }, [businessId, pathname])

  const handleSync = useCallback(async () => {
    if (!businessId) return
    setIsSyncing(true)

    try {
      const res = await fetch('/api/monthly-report/sync-xero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })

      const data = await res.json()

      if (res.status === 401) {
        setIsExpired(true)
        setXeroConnection(null)
        toast.error('Xero connection expired. Please reconnect.')
        return false
      }

      if (!res.ok) {
        toast.error(data.error || 'Sync failed')
        return false
      }

      // A 2xx is not a sync. The route answers 200 whenever it reached the end
      // — the balance-sheet mirror always runs — and reports the P&L outcome in
      // `success`/`pl_status`. 'error' there means nothing landed: every org
      // failed, or the single-flight guard refused a second concurrent run and
      // no P&L was attempted. Say so, and leave the clock alone.
      if (!data.success) {
        await refreshStatus({ silent: true })
        toast.error(data.error || 'Xero sync failed — the figures on screen have not changed')
        return false
      }

      // Re-read the clock the server actually wrote (see refreshStatus).
      await refreshStatus({ silent: true })

      // `months_synced` was never a field of this response — the route returns
      // `months_fetched` — so this toast has been reading "across undefined
      // months" on every successful sync.
      const summary = `Synced ${data.accounts_synced} accounts across ${data.months_fetched} months`
      if (data.pl_status === 'partial' || (data.errors?.length ?? 0) > 0) {
        // Something landed, but not all of it. Claiming a clean sync here is
        // how a half-synced client reads as a healthy one.
        toast.warning(`${summary} — some data did not sync`)
      } else {
        toast.success(summary)
      }
      return true
    } catch (err) {
      console.error('[useXeroConnection] Sync error:', err)
      toast.error('Failed to sync P&L data')
      return false
    } finally {
      setIsSyncing(false)
    }
  }, [businessId, refreshStatus])

  const handleManage = useCallback(() => {
    const integrationsPath = pathname.includes('/coach/clients/')
      ? pathname.replace(/\/view\/.*$/, '/view/integrations')
      : '/integrations'
    router.push(integrationsPath)
  }, [router, pathname])

  return {
    xeroConnection,
    xeroStatus,
    isExpired,
    isLoading,
    isSyncing,
    error,
    checkFailed,
    handleConnect,
    handleSync,
    handleManage,
  }
}
