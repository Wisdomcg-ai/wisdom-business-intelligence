'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'

interface XeroConnectionData {
  id: string
  tenant_name: string
  is_active: boolean
  last_synced_at: string | null
  expires_at: string
}

interface XeroStatusResponse {
  connected: boolean
  expired?: boolean
  connection: XeroConnectionData | null
}

export function useXeroConnection(businessId: string) {
  const router = useRouter()
  const pathname = usePathname()
  const [xeroConnection, setXeroConnection] = useState<XeroConnectionData | null>(null)
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
        const res = await fetch(`/api/Xero/status?business_id=${businessId}`)
        if (!res.ok) {
          // A 5xx here is not evidence of anything about the client's Xero.
          // Previously the body was parsed anyway, `data.connected` came back
          // undefined, and the else-branch below reported "not connected".
          setCheckFailed(true)
          setXeroConnection(null)
          setIsExpired(false)
          setError('Could not check the Xero connection')
          return
        }
        const data: XeroStatusResponse = await res.json()
        setCheckFailed(false)

        if (data.connected && data.connection) {
          setXeroConnection(data.connection)
          setIsExpired(false)
        } else if (data.expired) {
          setXeroConnection(null)
          setIsExpired(true)
        } else {
          setXeroConnection(null)
          setIsExpired(false)
        }
      } catch (err) {
        console.error('[useXeroConnection] Status fetch error:', err)
        // Same reasoning as the !res.ok branch: a network or parse failure tells
        // us nothing about whether Xero is connected. Leaving xeroConnection at
        // null made the banner assert "Not connected to Xero" above a fully
        // populated report rendered from Xero data already in the database.
        setCheckFailed(true)
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
