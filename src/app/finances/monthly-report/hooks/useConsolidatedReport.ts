'use client'

/**
 * useConsolidatedReport — detects whether a given `businessId` has 2+ active
 * Xero connections (i.e. needs consolidation) and, if so, fetches the
 * consolidated P&L for the requested month + fiscal year.
 *
 * Returned fields:
 *   - report                  — ConsolidatedReport payload (loose typing)
 *   - isLoading               — while fetch is in flight
 *   - error                   — fetch or API error
 *   - isConsolidationGroup    — null = detection in flight; false = single-tenant;
 *                               true = multi-tenant (2+ connections)
 *   - generateConsolidated    — trigger a fetch for a given month
 *   - reportFor               — the cached report, only if it is for that month + year
 *
 * Detection = single query: COUNT(xero_connections WHERE business_id=X AND is_active AND include_in_consolidation) >= 2
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ConsolidatedReportPayload {
  success: boolean
  // Loose typing — ConsolidatedReport shape is owned by @/lib/consolidation/types
  // and kept out of the client bundle to avoid cross-package coupling here.
  report: any
}

export function useConsolidatedReport(
  businessId: string | null | undefined,
) {
  const [report, setReport] = useState<any | null>(null)
  // The month and fiscal year `report` was generated for (DRG-16).
  const [reportPeriod, setReportPeriod] = useState<{ reportMonth: string; fiscalYear: number } | null>(null)
  // Bumped by every request and every clear(); a response whose number is no
  // longer current has been superseded and is not cached.
  const latestRequest = useRef(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConsolidationGroup, setIsConsolidationGroup] = useState<
    boolean | null
  >(null)

  // 1. Detect whether this business has 2+ consolidation-eligible tenants.
  useEffect(() => {
    if (!businessId) {
      setIsConsolidationGroup(null)
      return
    }
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('xero_connections')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_active', true)
      .eq('include_in_consolidation', true)
      .then(({ count }) => {
        if (!cancelled) setIsConsolidationGroup((count ?? 0) >= 2)
      })
      .then(undefined, () => {
        if (!cancelled) setIsConsolidationGroup(false)
      })
    return () => {
      cancelled = true
    }
  }, [businessId])

  // 2. Fetch the consolidated report for a given month + fiscal year.
  const generateConsolidated = useCallback(
    async (reportMonth: string, fiscalYear: number) => {
      if (!businessId || !isConsolidationGroup) return null
      const request = ++latestRequest.current
      const current = () => request === latestRequest.current
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/monthly-report/consolidated', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            report_month: reportMonth,
            fiscal_year: fiscalYear,
          }),
        })
        const body: Partial<ConsolidatedReportPayload> & {
          error?: string
        } = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (current()) {
            setError(
              body.error ??
                `Failed to load consolidated report (${res.status})`,
            )
          }
          return null
        }
        // The caller gets the month it asked for either way; only the cache
        // refuses a response a month change or a newer request has overtaken.
        if (current()) {
          setReport(body.report ?? null)
          setReportPeriod({ reportMonth, fiscalYear })
        }
        return body.report ?? null
      } catch (err: any) {
        if (current()) setError(err?.message ?? 'Network error loading consolidated report')
        return null
      } finally {
        if (current()) setIsLoading(false)
      }
    },
    [businessId, isConsolidationGroup],
  )

  // WA.4 — the page lazy-loads with a `!report` guard, so a fiscal-year switch
  // must clear the cache or the consolidated tabs keep showing the previous FY.
  // DRG-16 — and a month change, and it must also stop a request still in
  // flight from refilling the cache with the month just left.
  const clear = useCallback(() => {
    latestRequest.current++
    setReport(null)
    setReportPeriod(null)
    setError(null)
    setIsLoading(false)
  }, [])

  /**
   * The cached report, only when it was generated for this month and fiscal
   * year. The export reads this rather than `report`, which is whatever the
   * tab last loaded.
   */
  const reportFor = useCallback(
    (reportMonth: string, fiscalYear: number) =>
      report && reportPeriod?.reportMonth === reportMonth && reportPeriod?.fiscalYear === fiscalYear
        ? report
        : null,
    [report, reportPeriod],
  )

  return {
    report,
    isLoading,
    error,
    isConsolidationGroup,
    generateConsolidated,
    reportFor,
    clear,
  }
}
