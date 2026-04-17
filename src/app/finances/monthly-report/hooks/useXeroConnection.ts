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
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch connection status on mount / when businessId changes
  useEffect(() => {
    if (!businessId) return

    const fetchStatus = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/Xero/status?business_id=${businessId}`)
        const data: XeroStatusResponse = await res.json()

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

      // Update last_synced_at in state
      setXeroConnection(prev => prev ? {
        ...prev,
        last_synced_at: new Date().toISOString(),
      } : prev)

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
    isExpired,
    isLoading,
    isSyncing,
    error,
    handleConnect,
    handleSync,
    handleManage,
  }
}
