'use client'

/**
 * useConsolidatedBalanceSheet — Phase 34, Iteration 34.1.
 *
 * Mirrors useConsolidatedReport (P&L) but for the Balance Sheet:
 *   - Reuses the same multi-tenant detection query (2+ active, included tenants)
 *   - Fetches /api/monthly-report/consolidated-bs for a given report month +
 *     fiscal year
 *   - Returned `report` is the ConsolidatedBalanceSheet payload
 *
 * Detection is duplicated (vs importing useConsolidatedReport) so that the BS
 * tab works even when the P&L hook is unused on the page. The underlying
 * detection query is identical so both hooks will always agree.
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ConsolidatedBSResponse {
  success: boolean
  // Loose typing — ConsolidatedBalanceSheet shape is owned by
  // @/lib/consolidation/balance-sheet and intentionally not imported here
  // (keeps server-only types out of the client bundle).
  report: any
}

export function useConsolidatedBalanceSheet(
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

  // 2. Fetch the consolidated BS for a given month + fiscal year.
  const generateBalanceSheet = useCallback(
    async (reportMonth: string, fiscalYear: number) => {
      if (!businessId || !isConsolidationGroup) return null
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/monthly-report/consolidated-bs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            report_month: reportMonth,
            fiscal_year: fiscalYear,
          }),
        })
        const body: Partial<ConsolidatedBSResponse> & { error?: string } = await res
          .json()
          .catch(() => ({}))
        if (!res.ok) {
          setError(
            body.error ??
              `Failed to load consolidated balance sheet (${res.status})`,
          )
          return null
        }
        setReport(body.report ?? null)
        return body.report ?? null
      } catch (err: any) {
        setError(err?.message ?? 'Network error loading consolidated BS')
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
    generateBalanceSheet,
  }
}
