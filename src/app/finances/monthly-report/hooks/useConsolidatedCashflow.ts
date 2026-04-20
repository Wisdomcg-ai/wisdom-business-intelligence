'use client'

/**
 * useConsolidatedCashflow — Phase 34, Iteration 34.2.
 *
 * Mirrors useConsolidatedBalanceSheet:
 *   - Reuses the same multi-tenant detection query (2+ active, included tenants)
 *   - Fetches /api/monthly-report/consolidated-cashflow for a given fiscal year
 *   - Returned `report` is the ConsolidatedCashflowReport payload
 *
 * Detection is duplicated (vs importing useConsolidatedReport) so that the
 * cashflow tab works even when the P&L / BS hooks are unused on the page. All
 * three detection hooks run the same query and will always agree.
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ConsolidatedCashflowResponse {
  success: boolean
  // Loose typing — ConsolidatedCashflowReport shape lives in
  // @/lib/consolidation/cashflow and is intentionally not imported here
  // (keeps server-only types out of the client bundle).
  report: any
}

export function useConsolidatedCashflow(
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

  // 2. Fetch the consolidated cashflow for a given fiscal year.
  const generateCashflow = useCallback(
    async (fiscalYear: number) => {
      if (!businessId || !isConsolidationGroup) return null
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(
          '/api/monthly-report/consolidated-cashflow',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              business_id: businessId,
              fiscal_year: fiscalYear,
            }),
          },
        )
        const body: Partial<ConsolidatedCashflowResponse> & { error?: string } =
          await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(
            body.error ??
              `Failed to load consolidated cashflow (${res.status})`,
          )
          return null
        }
        setReport(body.report ?? null)
        return body.report ?? null
      } catch (err: any) {
        setError(err?.message ?? 'Network error loading consolidated cashflow')
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
    generateCashflow,
  }
}
