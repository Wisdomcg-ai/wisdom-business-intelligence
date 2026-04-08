'use client'

import { useState, useEffect } from 'react'

export interface MonthlyChartPoint {
  month: string
  label: string
  revenueActual: number | null
  revenueForecast: number | null
  gpActual: number | null
  gpForecast: number | null
  npActual: number | null
  npForecast: number | null
}

interface UseXeroActualsResult {
  chartData: MonthlyChartPoint[] | null
  lastSyncedAt: string | null
  isLoading: boolean
  hasData: boolean
}

/**
 * Fetches monthly actual vs forecast chart data for the business dashboard.
 * Uses /api/forecast/dashboard-actuals endpoint.
 * Fetches when businessId or refreshTrigger changes.
 * Pass a refreshTrigger counter that increments to force a refetch (e.g. after manual Xero sync).
 */
export function useXeroActuals(businessId: string | undefined, refreshTrigger?: number): UseXeroActualsResult {
  const [chartData, setChartData] = useState<MonthlyChartPoint[] | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasData, setHasData] = useState(false)

  useEffect(() => {
    if (!businessId) {
      setChartData(null)
      setLastSyncedAt(null)
      setHasData(false)
      setIsLoading(false)
      return
    }

    let cancelled = false

    async function fetchChartData() {
      setIsLoading(true)
      try {
        const url = `/api/forecast/dashboard-actuals?businessId=${encodeURIComponent(businessId!)}`
        const response = await fetch(url)

        if (!response.ok) {
          console.error('[useXeroActuals] API error:', response.status, response.statusText)
          if (!cancelled) {
            setChartData(null)
            setHasData(false)
          }
          return
        }

        const json = await response.json()

        if (!cancelled) {
          if (json.hasData && json.data?.months) {
            setChartData(json.data.months)
            setLastSyncedAt(json.data.lastSyncedAt || null)
            setHasData(true)
          } else {
            setChartData(null)
            setLastSyncedAt(null)
            setHasData(false)
          }
        }
      } catch (err) {
        console.error('[useXeroActuals] Fetch error:', err)
        if (!cancelled) {
          setChartData(null)
          setHasData(false)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchChartData()

    return () => {
      cancelled = true
    }
  }, [businessId, refreshTrigger])

  return { chartData, lastSyncedAt, isLoading, hasData }
}
