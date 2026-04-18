'use client'

/**
 * useConsolidatedReport — detects whether a given `businessId` is a
 * consolidation_groups.business_id (i.e. a consolidation parent) and, if so,
 * fetches the consolidated P&L for the requested month + fiscal year.
 *
 * Returned fields:
 *   - report                  — the ConsolidatedReport payload (loose typing)
 *   - isLoading               — while the fetch is in flight
 *   - error                   — fetch or API error
 *   - isConsolidationGroup    — null = detection in flight; false = single-entity;
 *                               true = consolidation parent
 *   - generateConsolidated    — trigger a consolidated report fetch for a given month
 *
 * Contract:
 * - Detection does ONE cheap query: `consolidation_groups.select('id').eq(business_id, id)`.
 * - Browser supabase client is the singleton from `@/lib/supabase/client`
 *   (same client that `page.tsx` already uses — prevents multiple clients
 *   flickering auth state).
 * - Per MLTE-05: this hook is ALSO consumed by `useMonthlyReport` to decide
 *   whether the Actual-vs-Budget tab should hit `/api/monthly-report/consolidated`
 *   instead of `/generate`. See the sibling hook for the adapter.
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

  // 1. Detect whether this businessId is a consolidation group parent.
  useEffect(() => {
    if (!businessId) {
      setIsConsolidationGroup(null)
      return
    }
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('consolidation_groups')
      .select('id')
      .eq('business_id', businessId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsConsolidationGroup(!!data)
      })
      // .catch guards RLS-denied / network errors — treat as "not a group"
      // rather than poisoning the hook.
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
