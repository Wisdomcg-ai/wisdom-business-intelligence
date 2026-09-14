import { useState, useCallback, useMemo } from 'react'
import type { WagesDetailData } from '../types'
import { wagesLayoutKey } from '@/lib/monthly-report/wages-roster-budget'

/**
 * `pdfLayout` is the layout the page prints — the one the export's Payroll
 * Report reads its roster from. The per-employee budgets come off that roster's
 * weekly salaries, so every load sends it, and data loaded for a different
 * roster is not handed out: after a layout save or an applied template the tab
 * and the export load again, rather than print the old roster's budgets beside
 * the new roster's Payroll Report.
 */
export function useWagesDetail(businessId: string, pdfLayout: unknown) {
  const layoutKey = useMemo(() => wagesLayoutKey(pdfLayout), [pdfLayout])
  const [loaded, setLoaded] = useState<{ data: WagesDetailData; layoutKey: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [failure, setFailure] = useState<{ message: string; layoutKey: string } | null>(null)

  const loadWagesDetail = useCallback(async (
    reportMonth: string,
    fiscalYear: number,
    wagesAccountNames: string[],
    budgetForecastId?: string | null
  ) => {
    if (!businessId || wagesAccountNames.length === 0) return null
    const requestKey = wagesLayoutKey(pdfLayout)
    setIsLoading(true)
    setFailure(null)

    try {
      const res = await fetch('/api/monthly-report/wages-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          report_month: reportMonth,
          fiscal_year: fiscalYear,
          wages_account_names: wagesAccountNames,
          budget_forecast_id: budgetForecastId || undefined,
          pdf_layout: pdfLayout ?? null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setFailure({ message: data.error || 'Failed to load wages detail', layoutKey: requestKey })
        return null
      }

      setLoaded({ data: data.data, layoutKey: requestKey })
      return data.data
    } catch (err) {
      setFailure({ message: err instanceof Error ? err.message : 'Failed to load wages detail', layoutKey: requestKey })
      return null
    } finally {
      setIsLoading(false)
    }
  }, [businessId, pdfLayout])

  const clear = useCallback(() => {
    setLoaded(null)
    setFailure(null)
  }, [])

  const wagesDetail = loaded?.layoutKey === layoutKey ? loaded.data : null
  const error = failure?.layoutKey === layoutKey ? failure.message : null

  return { wagesDetail, isLoading, error, loadWagesDetail, clear }
}
