import { useState, useCallback } from 'react'
import type { GeneratedReport, VarianceCommentary } from '../types'

export function useMonthlyReport(businessId: string) {
  const [report, setReport] = useState<GeneratedReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateReport = useCallback(async (reportMonth: string, fiscalYear: number, forceDraft?: boolean) => {
    if (!businessId) return
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/monthly-report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          report_month: reportMonth,
          fiscal_year: fiscalYear,
          force_draft: forceDraft,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to generate report')
        if (data.code === 'NO_MAPPINGS') {
          return { needsMappings: true }
        }
        return null
      }

      setReport(data.report)
      return data.report
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [businessId])

  const saveSnapshot = useCallback(async (
    reportData: GeneratedReport,
    options?: { status?: 'draft' | 'final'; coachNotes?: string; generatedBy?: string; commentary?: VarianceCommentary }
  ) => {
    try {
      const res = await fetch('/api/monthly-report/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: reportData.business_id,
          report_month: reportData.report_month,
          fiscal_year: reportData.fiscal_year,
          status: options?.status || (reportData.is_draft ? 'draft' : 'final'),
          is_draft: options?.status === 'final' ? false : reportData.is_draft,
          unreconciled_count: reportData.unreconciled_count,
          report_data: reportData,
          summary: reportData.summary,
          coach_notes: options?.coachNotes,
          generated_by: options?.generatedBy,
          commentary: options?.commentary || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return data.snapshot
    } catch (err) {
      console.error('[useMonthlyReport] Save snapshot error:', err)
      throw err
    }
  }, [])

  const loadSnapshot = useCallback(async (reportMonth: string) => {
    try {
      const res = await fetch(
        `/api/monthly-report/snapshot?business_id=${businessId}&report_month=${reportMonth}`
      )
      const data = await res.json()
      if (data.snapshot) {
        setReport(data.snapshot.report_data)
        return data.snapshot
      }
      return null
    } catch (err) {
      console.error('[useMonthlyReport] Load snapshot error:', err)
      return null
    }
  }, [businessId])

  return {
    report,
    setReport,
    isLoading,
    error,
    generateReport,
    saveSnapshot,
    loadSnapshot,
  }
}
