'use client'
// Phase 35 Plan 06: Sibling hook to useMonthlyReport — queries cfo_report_status
// for the status pill that lives in the monthly-report top bar.
//
// Deliberately separate from useMonthlyReport to keep churn isolated. This hook
// does NOT re-resolve the dual-ID; the caller is expected to pass the already-
// resolved businesses.id.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type ReportStatus = 'draft' | 'ready_for_review' | 'approved' | 'sent'

export interface ReportStatusState {
  status: ReportStatus | null
  sentAt: string | null
  approvedAt: string | null
  loading: boolean
  error: string | null
}

export function useReportStatus(
  businessId: string | null,
  periodMonth: string | null,
) {
  const [state, setState] = useState<ReportStatusState>({
    status: null,
    sentAt: null,
    approvedAt: null,
    loading: true,
    error: null,
  })

  const refresh = useCallback(async () => {
    if (!businessId || !periodMonth) {
      setState({
        status: null,
        sentAt: null,
        approvedAt: null,
        loading: false,
        error: null,
      })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('cfo_report_status')
        .select('status, sent_at, approved_at')
        .eq('business_id', businessId)
        .eq('period_month', periodMonth)
        .maybeSingle()
      if (error) throw error
      setState({
        status: (data?.status as ReportStatus | undefined) ?? 'draft',
        sentAt: data?.sent_at ?? null,
        approvedAt: data?.approved_at ?? null,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState({
        status: null,
        sentAt: null,
        approvedAt: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [businessId, periodMonth])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Phase 35 D-16: keep the pill in sync with server-side status changes that
  // fire as side-effects of other actions (commentary/snapshot/settings save
  // → revertReportIfApproved). Without this, the pill stays stale until the
  // next page mount.
  useEffect(() => {
    if (!businessId || !periodMonth) return
    const onFocus = () => { refresh() }
    window.addEventListener('focus', onFocus)
    const interval = setInterval(refresh, 10_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [businessId, periodMonth, refresh])

  return { ...state, refresh }
}
