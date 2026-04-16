'use client'

import { useState, useCallback } from 'react'
import type { BalanceSheetData, BalanceSheetCompare } from '../types'

interface UseBalanceSheetReturn {
  balanceSheet: BalanceSheetData | null
  isLoading: boolean
  error: string | null
  compare: BalanceSheetCompare
  setCompare: (c: BalanceSheetCompare) => void
  load: (month: string) => Promise<void>
  clear: () => void
}

export function useBalanceSheet(businessId: string): UseBalanceSheetReturn {
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [compare, setCompareState] = useState<BalanceSheetCompare>('yoy')

  const load = useCallback(async (month: string) => {
    if (!businessId || !month) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/Xero/balance-sheet?business_id=${businessId}&month=${month}&compare=${compare}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Failed to load balance sheet (${res.status})`)
        setBalanceSheet(null)
        return
      }
      const data: BalanceSheetData = await res.json()
      setBalanceSheet(data)
    } catch (err) {
      setError('Network error loading balance sheet')
      setBalanceSheet(null)
    } finally {
      setIsLoading(false)
    }
  }, [businessId, compare])

  const setCompare = useCallback((c: BalanceSheetCompare) => {
    setCompareState(c)
    setBalanceSheet(null) // clear so re-load is triggered
  }, [])

  const clear = useCallback(() => {
    setBalanceSheet(null)
    setError(null)
  }, [])

  return { balanceSheet, isLoading, error, compare, setCompare, load, clear }
}
