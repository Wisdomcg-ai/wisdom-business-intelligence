import { useState, useCallback } from 'react'
import type { SubscriptionDetailData } from '../types'

export function useSubscriptionDetail(businessId: string) {
  const [subscriptionDetail, setSubscriptionDetail] = useState<SubscriptionDetailData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSubscriptionDetail = useCallback(async (reportMonth: string, accountCodes: string[]) => {
    if (!businessId || accountCodes.length === 0) return null
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/monthly-report/subscription-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          report_month: reportMonth,
          account_codes: accountCodes,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load subscription detail')
        return null
      }

      setSubscriptionDetail(data.data)
      return data.data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription detail')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [businessId])

  const clear = useCallback(() => {
    setSubscriptionDetail(null)
    setError(null)
  }, [])

  return { subscriptionDetail, isLoading, error, loadSubscriptionDetail, clear }
}
