import { useState, useCallback } from 'react'
import type { WagesDetailData } from '../types'

export function useWagesDetail(businessId: string) {
  const [wagesDetail, setWagesDetail] = useState<WagesDetailData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadWagesDetail = useCallback(async (
    reportMonth: string,
    fiscalYear: number,
    wagesAccountNames: string[],
    budgetForecastId?: string | null
  ) => {
    if (!businessId || wagesAccountNames.length === 0) return null
    setIsLoading(true)
    setError(null)

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
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load wages detail')
        return null
      }

      setWagesDetail(data.data)
      return data.data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wages detail')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [businessId])

  const clear = useCallback(() => {
    setWagesDetail(null)
    setError(null)
  }, [])

  return { wagesDetail, isLoading, error, loadWagesDetail, clear }
}
