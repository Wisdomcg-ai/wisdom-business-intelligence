import { useState, useCallback } from 'react'
import type { FullYearReport } from '../types'

export function useFullYearReport(businessId: string) {
  const [fullYearReport, setFullYearReport] = useState<FullYearReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFullYear = useCallback(async (fiscalYear: number) => {
    if (!businessId) return
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/monthly-report/full-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          fiscal_year: fiscalYear,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load full year projection')
        return null
      }

      setFullYearReport(data.report)
      return data.report
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load full year projection')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [businessId])

  // WA.4 — the page lazy-loads with a `!fullYearReport` guard, so a fiscal-year
  // switch must clear the cache or the Full Year/Trends/Charts tabs keep
  // showing the previous FY.
  const clearFullYear = useCallback(() => {
    setFullYearReport(null)
    setError(null)
  }, [])

  return { fullYearReport, isLoading, error, loadFullYear, clearFullYear }
}
