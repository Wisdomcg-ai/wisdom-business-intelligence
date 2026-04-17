'use client'

import { useState, useCallback, useEffect } from 'react'
import type { CashflowStatement, ListType } from '@/lib/cashflow/statement'

export interface ClassificationRow {
  id?: string
  forecast_id: string
  xero_account_id: string
  account_code: string | null
  account_name: string | null
  account_type: string | null
  list_type: ListType
}

interface UseCashflowStatementReturn {
  statement: CashflowStatement | null
  classifications: ClassificationRow[]
  isLoadingStatement: boolean
  isLoadingClassifications: boolean
  isAutoClassifying: boolean
  error: string | null
  loadStatement: (from: string, to: string) => Promise<void>
  reloadClassifications: () => Promise<void>
  autoClassify: () => Promise<number>
  upsertClassification: (row: ClassificationRow) => Promise<void>
}

export function useCashflowStatement(forecastId: string | undefined): UseCashflowStatementReturn {
  const [statement, setStatement] = useState<CashflowStatement | null>(null)
  const [classifications, setClassifications] = useState<ClassificationRow[]>([])
  const [isLoadingStatement, setIsLoadingStatement] = useState(false)
  const [isLoadingClassifications, setIsLoadingClassifications] = useState(false)
  const [isAutoClassifying, setIsAutoClassifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadClassifications = useCallback(async () => {
    if (!forecastId) return
    setIsLoadingClassifications(true)
    try {
      const res = await fetch(`/api/forecast/cashflow/classifications?forecast_id=${forecastId}`)
      if (!res.ok) return
      const { data } = await res.json()
      setClassifications(data ?? [])
    } finally {
      setIsLoadingClassifications(false)
    }
  }, [forecastId])

  useEffect(() => {
    if (forecastId) loadClassifications()
  }, [forecastId, loadClassifications])

  const loadStatement = useCallback(async (from: string, to: string) => {
    if (!forecastId) return
    setIsLoadingStatement(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/forecast/cashflow/statement?forecast_id=${forecastId}&from=${from}&to=${to}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Failed to load statement (${res.status})`)
        setStatement(null)
        return
      }
      const { data } = await res.json()
      setStatement(data)
    } catch (err) {
      console.error('[useCashflowStatement] loadStatement error:', err)
      setError('Network error loading statement')
      setStatement(null)
    } finally {
      setIsLoadingStatement(false)
    }
  }, [forecastId])

  const autoClassify = useCallback(async (): Promise<number> => {
    if (!forecastId) return 0
    setIsAutoClassifying(true)
    try {
      const res = await fetch('/api/forecast/cashflow/classifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forecast_id: forecastId, auto_classify: true }),
      })
      if (!res.ok) return 0
      const { inserted } = await res.json()
      await loadClassifications()
      return inserted ?? 0
    } finally {
      setIsAutoClassifying(false)
    }
  }, [forecastId, loadClassifications])

  const upsertClassification = useCallback(async (row: ClassificationRow) => {
    if (!forecastId) return
    try {
      const res = await fetch('/api/forecast/cashflow/classifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forecast_id: forecastId,
          xero_account_id: row.xero_account_id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: row.account_type,
          list_type: row.list_type,
        }),
      })
      if (!res.ok) return
      await loadClassifications()
    } catch (err) {
      console.error('[useCashflowStatement] upsertClassification error:', err)
    }
  }, [forecastId, loadClassifications])

  return {
    statement,
    classifications,
    isLoadingStatement,
    isLoadingClassifications,
    isAutoClassifying,
    error,
    loadStatement,
    reloadClassifications: loadClassifications,
    autoClassify,
    upsertClassification,
  }
}
