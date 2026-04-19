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
 *
 * Detection = single query: COUNT(xero_connections WHERE business_id=X AND is_active AND include_in_consolidation) >= 2
 */

import { useState, useEffect, useCallback } from 'react'
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
          setError(
            body.error ??
              `Failed to load consolidated report (${res.status})`,
          )
          return null
        }
        setReport(body.report ?? null)
        return body.report ?? null
      } catch (err: any) {
        setError(err?.message ?? 'Network error loading consolidated report')
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [businessId, isConsolidationGroup],
  )

  return {
    report,
    isLoading,
    error,
    isConsolidationGroup,
    generateConsolidated,
  }
}
