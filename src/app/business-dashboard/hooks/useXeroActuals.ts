'use client'

import { useState, useEffect } from 'react'
import type { XeroBusinessDataClock, XeroOrgDataClock } from '@/lib/xero/connection-status'

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
  /** The charts' "Last synced" clock (see businessDataClock); null while there are no charts to label. */
  lastSync: XeroBusinessDataClock | null
  isLoading: boolean
  hasData: boolean
  /** The request failed or did not come back as an answer. Not the same as "no data yet". */
  loadFailed: boolean
}

const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))

function parseOrgClocks(value: unknown): XeroOrgDataClock[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const orgs: XeroOrgDataClock[] = []
  for (const org of value) {
    if (!org || typeof org !== 'object') return null
    const { tenantName, lastSyncAt } = org as Record<string, unknown>
    if (tenantName !== null && typeof tenantName !== 'string') return null
    if (lastSyncAt !== null && !isInstant(lastSyncAt)) return null
    orgs.push({ tenantName, lastSyncAt })
  }
  return orgs
}

/**
 * The route's `lastSync`, or `unknown` when it is not one. A missing or garbled
 * clock is a check that did not come back: never "no Xero", and never a date
 * fresher than one of the orgs it lists.
 */
function parseLastSync(value: unknown): XeroBusinessDataClock {
  const unknown: XeroBusinessDataClock = { status: 'unknown' }
  if (!value || typeof value !== 'object') return unknown
  const clock = value as Record<string, unknown>
  if (clock.status === 'none') return { status: 'none' }

  const orgs = parseOrgClocks(clock.orgs)
  if (!orgs) return unknown
  if (clock.status === 'never_synced') {
    return orgs.some((o) => o.lastSyncAt === null) ? { status: 'never_synced', orgs } : unknown
  }
  if (clock.status === 'synced' && isInstant(clock.lastSyncAt)) {
    const lastSyncMs = Date.parse(clock.lastSyncAt)
    const noOrgOlder = orgs.every((o) => o.lastSyncAt !== null && Date.parse(o.lastSyncAt) >= lastSyncMs)
    return noOrgOlder ? { status: 'synced', lastSyncAt: clock.lastSyncAt, orgs } : unknown
  }
  return unknown
}

/**
 * Fetches monthly actual vs forecast chart data for the business dashboard.
 * Uses /api/forecast/dashboard-actuals endpoint.
 * Fetches when businessId or refreshTrigger changes.
 * Pass a refreshTrigger counter that increments to force a refetch (e.g. after manual Xero sync).
 */
export function useXeroActuals(businessId: string | undefined, refreshTrigger?: number): UseXeroActualsResult {
  const [chartData, setChartData] = useState<MonthlyChartPoint[] | null>(null)
  const [lastSync, setLastSync] = useState<XeroBusinessDataClock | null>(null)
  // Seeded as loading when there is a business to load, so the first paint is the
  // skeleton rather than the "No Xero data yet" empty state.
  const [isLoading, setIsLoading] = useState(Boolean(businessId))
  const [hasData, setHasData] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (!businessId) {
      setChartData(null)
      setLastSync(null)
      setHasData(false)
      setLoadFailed(false)
      setIsLoading(false)
      return
    }

    let cancelled = false

    const showFailure = () => {
      setChartData(null)
      setLastSync(null)
      setHasData(false)
      setLoadFailed(true)
    }

    async function fetchChartData() {
      setIsLoading(true)
      setLoadFailed(false)
      try {
        const url = `/api/forecast/dashboard-actuals?businessId=${encodeURIComponent(businessId!)}`
        const response = await fetch(url)

        if (!response.ok) {
          console.error('[useXeroActuals] API error:', response.status, response.statusText)
          if (!cancelled) showFailure()
          return
        }

        const json = await response.json()

        if (!cancelled) {
          if (json?.hasData === true && Array.isArray(json.data?.months)) {
            setChartData(json.data.months)
            setLastSync(parseLastSync(json.data.lastSync))
            setHasData(true)
          } else if (json?.hasData === false) {
            setChartData(null)
            setLastSync(null)
            setHasData(false)
          } else {
            console.error('[useXeroActuals] Unreadable response body')
            showFailure()
          }
        }
      } catch (err) {
        console.error('[useXeroActuals] Fetch error:', err)
        if (!cancelled) showFailure()
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

  return { chartData, lastSync, isLoading, hasData, loadFailed }
}
