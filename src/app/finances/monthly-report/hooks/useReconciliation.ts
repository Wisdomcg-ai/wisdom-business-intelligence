import { useState, useCallback } from 'react'
import type { ReconciliationStatus } from '../types'

export function useReconciliation(businessId: string) {
  const [reconciliation, setReconciliation] = useState<ReconciliationStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkReconciliation = useCallback(async (month?: string) => {
    if (!businessId) return
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ business_id: businessId })
      if (month) params.set('month', month)

      const res = await fetch(`/api/Xero/reconciliation?${params}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to check reconciliation')
        return null
      }

      setReconciliation(data)
      return data as ReconciliationStatus
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check reconciliation')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [businessId])

  return {
    reconciliation,
    isLoading,
    error,
    checkReconciliation,
  }
}
