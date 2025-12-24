'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import ForecastService from '../services/forecast-service'
import type { PLLine, XeroConnection } from '../types'

interface UseXeroSyncOptions {
  forecastId: string | undefined
  businessId: string
  onPlLinesUpdate: (lines: PLLine[]) => void
  onXeroConnectionUpdate: (connection: XeroConnection | null) => void
  onForecastClear: () => void
}

interface UseXeroSyncReturn {
  isSyncing: boolean
  isConnectionExpired: boolean
  handleConnectXero: () => void
  handleDisconnectXero: () => void
  handleSyncFromXero: () => Promise<void>
  handleClearAndResync: () => Promise<void>
  handleDisconnectAndClearAll: () => Promise<void>
}

export function useXeroSync({
  forecastId,
  businessId,
  onPlLinesUpdate,
  onXeroConnectionUpdate,
  onForecastClear
}: UseXeroSyncOptions): UseXeroSyncReturn {
  const supabase = createClient()
  const [isSyncing, setIsSyncing] = useState(false)
  const [isConnectionExpired, setIsConnectionExpired] = useState(false)

  const handleConnectXero = useCallback(() => {
    if (!businessId) {
      toast.error('No business found. Please create a business profile first.')
      return
    }
    // Reset expired state since we're reconnecting
    setIsConnectionExpired(false)
    // Directly start OAuth flow instead of redirecting to integrations
    window.location.href = `/api/Xero/auth?business_id=${businessId}&return_to=/finances/forecast`
  }, [businessId])

  const handleDisconnectXero = useCallback(() => {
    window.location.href = '/integrations'
  }, [])

  const handleSyncFromXero = useCallback(async () => {
    if (!forecastId) return

    setIsSyncing(true)
    try {
      const response = await fetch('/api/Xero/sync-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forecast_id: forecastId,
          business_id: businessId
        })
      })

      const result = await response.json()

      if (result.success) {
        setIsConnectionExpired(false)
        const lines = await ForecastService.loadPLLines(forecastId)
        onPlLinesUpdate(lines)
        toast.success('Successfully synced data from Xero!')
      } else if (response.status === 401) {
        // Token expired - need to reconnect
        setIsConnectionExpired(true)
        toast.error('Xero connection expired. Click "Reconnect Xero" above to refresh your connection.', {
          duration: 8000
        })
      } else {
        toast.error('Error syncing from Xero: ' + result.error)
      }
    } catch (err) {
      console.error('[Forecast] Error syncing from Xero:', err)
      toast.error('Error syncing from Xero')
    } finally {
      setIsSyncing(false)
    }
  }, [forecastId, businessId, onPlLinesUpdate])

  const handleClearAndResync = useCallback(async () => {
    if (!forecastId) return

    if (!confirm('This will delete all existing P&L data and resync from Xero. Continue?')) {
      return
    }

    setIsSyncing(true)
    try {
      // Delete all existing Xero lines
      await supabase
        .from('forecast_pl_lines')
        .delete()
        .eq('forecast_id', forecastId)
        .eq('is_from_xero', true)

      // Clear the state
      onPlLinesUpdate([])

      // Wait for delete to process
      await new Promise(resolve => setTimeout(resolve, 500))

      // Sync from Xero
      const response = await fetch('/api/Xero/sync-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forecast_id: forecastId,
          business_id: businessId
        })
      })

      const result = await response.json()

      if (result.success) {
        const lines = await ForecastService.loadPLLines(forecastId)
        onPlLinesUpdate(lines)
        toast.success('Successfully cleared and resynced data from Xero!')
      } else {
        toast.error('Error syncing from Xero: ' + result.error)
      }
    } catch (err) {
      console.error('[Forecast] Error clearing and resyncing:', err)
      toast.error('Error clearing and resyncing')
    } finally {
      setIsSyncing(false)
    }
  }, [forecastId, businessId, supabase, onPlLinesUpdate])

  const handleDisconnectAndClearAll = useCallback(async () => {
    if (!confirm('⚠️ WARNING: This will permanently disconnect Xero and delete ALL forecast data (P&L lines, employees, forecasts). This cannot be undone. Continue?')) {
      return
    }

    if (!confirm('Are you absolutely sure? This will remove all sensitive data and you\'ll start fresh.')) {
      return
    }

    setIsSyncing(true)
    try {
      // Delete all P&L lines for this forecast
      if (forecastId) {
        await supabase
          .from('forecast_pl_lines')
          .delete()
          .eq('forecast_id', forecastId)
      }

      // Delete all employees for this forecast
      if (forecastId) {
        await supabase
          .from('forecast_employees')
          .delete()
          .eq('forecast_id', forecastId)
      }

      // Delete all forecasts for this business
      await supabase
        .from('financial_forecasts')
        .delete()
        .eq('business_id', businessId)

      // Disconnect Xero
      await supabase
        .from('xero_connections')
        .delete()
        .eq('business_id', businessId)

      // Clear state via callback
      onForecastClear()
      onXeroConnectionUpdate(null)

      toast.success('Successfully disconnected Xero and cleared all data. Reloading...')

      // Reload the page to start fresh
      setTimeout(() => window.location.reload(), 1000)
    } catch (err) {
      console.error('[Forecast] Error disconnecting and clearing:', err)
      toast.error('Error disconnecting and clearing data')
    } finally {
      setIsSyncing(false)
    }
  }, [forecastId, businessId, supabase, onForecastClear, onXeroConnectionUpdate])

  return {
    isSyncing,
    isConnectionExpired,
    handleConnectXero,
    handleDisconnectXero,
    handleSyncFromXero,
    handleClearAndResync,
    handleDisconnectAndClearAll
  }
}
