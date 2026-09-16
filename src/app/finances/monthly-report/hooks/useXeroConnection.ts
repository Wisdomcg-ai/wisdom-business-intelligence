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

  // Fetch connection status on mount / when businessId changes
  useEffect(() => {
    if (!businessId) return

    const fetchStatus = async () => {
      setIsLoading(true)
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
        setIsLoading(false)
      }
    }

    fetchStatus()
  }, [businessId])

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

      // Re-ask rather than stamping "synced just now" on the banner: a sync that
      // reached some orgs and not others must not read as the whole business.
      const refreshed = await fetchXeroBusinessStatus(businessId)
      if (refreshed.ok) {
        setCheckFailed(false)
        setXeroStatus(refreshed.data)
        setXeroConnection(refreshed.data.connected ? refreshed.data.connection : null)
      }

      toast.success(`Synced ${data.accounts_synced} accounts across ${data.months_synced} months`)
      return true
    } catch (err) {
      console.error('[useXeroConnection] Sync error:', err)
      toast.error('Failed to sync P&L data')
      return false
    } finally {
      setIsSyncing(false)
    }
  }, [businessId])

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
