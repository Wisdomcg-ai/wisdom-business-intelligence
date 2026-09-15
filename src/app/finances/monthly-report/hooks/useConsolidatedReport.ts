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
 *   - reportFor               — the month + fiscal year `report` was built for
 *   - prime                   — put a report Generate already fetched in the cache
 *
 * Detection = single query: COUNT(xero_connections WHERE business_id=X AND is_active AND include_in_consolidation) >= 2
 *
 * The cache holds ONE report and says which month it is. The export used to
 * reuse it whatever month it was: IICT opened on July (rate stored), moved to
 * August (none) and generated, and the August pack's pre-flight read July's
 * empty missing-rate list and passed. Only the latest request owns the cache —
 * a load superseded by another, by prime or by clear still answers its caller
 * but no longer writes over what replaced it.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ConsolidatedReportPayload {
  success: boolean
  // Loose typing — ConsolidatedReport shape is owned by @/lib/consolidation/types
  // and kept out of the client bundle to avoid cross-package coupling here.
  report: any
}

export interface ConsolidatedReportFor {
  reportMonth: string
  fiscalYear: number
}

/**
 * The cached consolidated report when it was built for this month and fiscal
 * year, else null — the caller loads the right one rather than print another
 * month's per-entity figures, or check another month's exchange rates.
 */
export function cachedConsolidatedFor(
  cache: { report: any | null; reportFor: ConsolidatedReportFor | null },
  reportMonth: string,
  fiscalYear: number,
): any | null {
  if (!cache.report || !cache.reportFor) return null
  return cache.reportFor.reportMonth === reportMonth && cache.reportFor.fiscalYear === fiscalYear
    ? cache.report
    : null
}

export function useConsolidatedReport(
  businessId: string | null | undefined,
) {
  const [report, setReport] = useState<any | null>(null)
  const [reportFor, setReportFor] = useState<ConsolidatedReportFor | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConsolidationGroup, setIsConsolidationGroup] = useState<
    boolean | null
  >(null)
  // Bumped by every load, prime and clear; a load writes state only while it
  // is still the latest.
  const requestSeq = useRef(0)

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
      const seq = ++requestSeq.current
      const latest = () => seq === requestSeq.current
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
          if (latest()) {
            setError(
              body.error ??
                `Failed to load consolidated report (${res.status})`,
            )
          }
          return null
        }
        if (latest()) {
          setReport(body.report ?? null)
          setReportFor(body.report ? { reportMonth, fiscalYear } : null)
        }
        return body.report ?? null
      } catch (err: any) {
        if (latest()) setError(err?.message ?? 'Network error loading consolidated report')
        return null
      } finally {
        if (latest()) setIsLoading(false)
      }
    },
    [businessId, isConsolidationGroup],
  )

  // The consolidated response a Generate already adapted into the statements
  // (useMonthlyReport's onConsolidatedReport): the per-entity page then prints
  // the same generation, with no second request, and a report cached before
  // the rates were loaded stops refusing the export once Generate has run.
  const prime = useCallback((primed: any, reportMonth: string, fiscalYear: number) => {
    requestSeq.current++
    setReport(primed ?? null)
    setReportFor(primed ? { reportMonth, fiscalYear } : null)
    setError(null)
    setIsLoading(false)
  }, [])

  // WA.4 — the page lazy-loads with a `!report` guard, so a fiscal-year switch
  // must clear the cache or the consolidated tabs keep showing the previous FY.
  const clear = useCallback(() => {
    requestSeq.current++
    setReport(null)
    setReportFor(null)
    setError(null)
    setIsLoading(false)
  }, [])

  return {
    report,
    reportFor,
    isLoading,
    error,
    isConsolidationGroup,
    generateConsolidated,
    prime,
    clear,
  }
}
