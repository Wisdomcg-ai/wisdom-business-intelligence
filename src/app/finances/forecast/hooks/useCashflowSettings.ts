'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

export interface CashflowCalxaSettings {
  id?: string
  forecast_id: string
  business_id: string

  use_explicit_accounts: boolean

  bank_account_ids: string[]
  retained_earnings_account_id: string | null
  current_year_earnings_account_id: string | null

  gst_method: 'Accrual' | 'Cash'
  gst_rate: number
  gst_collected_account_id: string | null
  gst_paid_account_id: string | null
  gst_schedule: string

  wages_expense_account_id: string | null
  payg_wh_rate: number | null
  payg_wh_liability_account_id: string | null
  payg_wh_schedule: string

  super_expense_account_id: string | null
  super_payable_account_id: string | null
  super_rate: number
  super_schedule: string

  depreciation_expense_account_id: string | null
  depreciation_accumulated_account_id: string | null

  debtors_account_id: string | null
  creditors_account_id: string | null

  company_tax_rate: number
  company_tax_liability_account_id: string | null
  company_tax_schedule: string
}

interface UseCashflowSettingsReturn {
  settings: CashflowCalxaSettings | null
  isLoading: boolean
  isSaving: boolean
  isDefault: boolean
  error: string | null
  update: <K extends keyof CashflowCalxaSettings>(key: K, value: CashflowCalxaSettings[K]) => void
  save: () => Promise<boolean>
  reload: () => Promise<void>
}

export function useCashflowSettings(forecastId: string | undefined): UseCashflowSettingsReturn {
  const [settings, setSettings] = useState<CashflowCalxaSettings | null>(null)
  const [isDefault, setIsDefault] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!forecastId) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/forecast/cashflow/settings?forecast_id=${forecastId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Failed to load settings (${res.status})`)
        return
      }
      const { data, is_default } = await res.json()
      setSettings(data)
      setIsDefault(!!is_default)
    } catch (err) {
      console.error('[useCashflowSettings] load error:', err)
      setError('Network error loading settings')
    } finally {
      setIsLoading(false)
    }
  }, [forecastId])

  useEffect(() => {
    if (forecastId) load()
  }, [forecastId, load])

  const update = useCallback(
    <K extends keyof CashflowCalxaSettings>(key: K, value: CashflowCalxaSettings[K]) => {
      setSettings(prev => (prev ? { ...prev, [key]: value } : prev))
    },
    []
  )

  const save = useCallback(async (): Promise<boolean> => {
    if (!settings) return false
    setIsSaving(true)
    try {
      const res = await fetch('/api/forecast/cashflow/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? 'Failed to save cashflow settings')
        return false
      }
      const { data } = await res.json()
      setSettings(data)
      setIsDefault(false)
      toast.success('Cashflow settings saved')
      return true
    } catch (err) {
      console.error('[useCashflowSettings] save error:', err)
      toast.error('Failed to save cashflow settings')
      return false
    } finally {
      setIsSaving(false)
    }
  }, [settings])

  return {
    settings,
    isLoading,
    isSaving,
    isDefault,
    error,
    update,
    save,
    reload: load,
  }
}
