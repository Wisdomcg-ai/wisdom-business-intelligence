'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import type {
  PLLine,
  PayrollSummary,
  CashflowAssumptions,
  CashflowForecastData,
  FinancialForecast,
} from '../types'
import { generateCashflowForecast, getDefaultCashflowAssumptions } from '@/lib/cashflow/engine'

interface UseCashflowForecastOptions {
  forecast: FinancialForecast | null
  plLines: PLLine[]
  businessId: string
}

interface UseCashflowForecastReturn {
  data: CashflowForecastData | null
  assumptions: CashflowAssumptions
  payrollSummary: PayrollSummary | null
  isLoading: boolean
  isSyncing: boolean
  saveAssumptions: (updated: Partial<CashflowAssumptions>) => Promise<void>
  syncFromXero: () => Promise<void>
  updateAssumption: <K extends keyof CashflowAssumptions>(key: K, value: CashflowAssumptions[K]) => void
}

export function useCashflowForecast({
  forecast,
  plLines,
  businessId,
}: UseCashflowForecastOptions): UseCashflowForecastReturn {
  const [assumptions, setAssumptions] = useState<CashflowAssumptions>(getDefaultCashflowAssumptions())
  const [payrollSummary, setPayrollSummary] = useState<PayrollSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Load assumptions and payroll summary on mount
  useEffect(() => {
    if (!forecast?.id || !businessId) return
    loadData()
  }, [forecast?.id, businessId])

  const loadData = async () => {
    if (!forecast?.id) return
    setIsLoading(true)

    try {
      // Load assumptions and payroll summary in parallel
      const [assumptionsRes, payrollRes] = await Promise.all([
        fetch(`/api/forecast/cashflow/assumptions?forecast_id=${forecast.id}`),
        loadPayrollSummary(forecast.id),
      ])

      if (assumptionsRes.ok) {
        const { data } = await assumptionsRes.json()
        if (data) {
          setAssumptions({
            ...getDefaultCashflowAssumptions(),
            ...data,
            loans: data.loans || [],
            planned_stock_changes: data.planned_stock_changes || {},
          })
        }
      }

      setPayrollSummary(payrollRes)
      setLoaded(true)
    } catch (err) {
      console.error('[useCashflowForecast] Error loading data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Run engine client-side via useMemo (instant updates)
  const data = useMemo(() => {
    if (!forecast || !loaded || plLines.length === 0) return null

    try {
      return generateCashflowForecast(plLines, payrollSummary, assumptions, forecast)
    } catch (err) {
      console.error('[useCashflowForecast] Engine error:', err)
      return null
    }
  }, [plLines, payrollSummary, assumptions, forecast, loaded])

  const updateAssumption = useCallback(<K extends keyof CashflowAssumptions>(key: K, value: CashflowAssumptions[K]) => {
    setAssumptions(prev => ({ ...prev, [key]: value }))
  }, [])

  const saveAssumptions = useCallback(async (updated: Partial<CashflowAssumptions>) => {
    if (!forecast?.id || !businessId) return

    const merged = { ...assumptions, ...updated }
    setAssumptions(merged)

    try {
      const res = await fetch('/api/forecast/cashflow/assumptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forecast_id: forecast.id,
          business_id: businessId,
          ...merged,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to save assumptions')
      }

      toast.success('Cashflow assumptions saved')
    } catch (err) {
      console.error('[useCashflowForecast] Save error:', err)
      toast.error('Failed to save cashflow assumptions')
    }
  }, [forecast?.id, businessId, assumptions])

  const syncFromXero = useCallback(async () => {
    if (!forecast?.id || !businessId) return

    setIsSyncing(true)
    try {
      // Use the forecast's actual_start_month as the balance date
      // (end of the month before the forecast period starts)
      const [y, m] = forecast.actual_start_month.split('-').map(Number)
      const balanceDate = new Date(y, m - 1, 0) // Last day of prior month
      const balanceDateStr = `${balanceDate.getFullYear()}-${String(balanceDate.getMonth() + 1).padStart(2, '0')}-${String(balanceDate.getDate()).padStart(2, '0')}`

      const res = await fetch('/api/forecast/cashflow/sync-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          forecast_id: forecast.id,
          balance_date: balanceDateStr,
          save: true,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to sync from Xero')
      }

      const { data: syncedData } = await res.json()

      // Update local assumptions with synced values
      setAssumptions(prev => ({
        ...prev,
        opening_bank_balance: syncedData.opening_bank_balance,
        opening_trade_debtors: syncedData.opening_trade_debtors,
        opening_trade_creditors: syncedData.opening_trade_creditors,
        opening_gst_liability: syncedData.opening_gst_liability,
        opening_payg_wh_liability: syncedData.opening_payg_wh_liability,
        opening_payg_instalment_liability: syncedData.opening_payg_instalment_liability || 0,
        opening_super_liability: syncedData.opening_super_liability,
        opening_stock: syncedData.opening_stock,
        dso_days: syncedData.dso_days,
        dso_auto_calculated: syncedData.dso_auto_calculated,
        dpo_days: syncedData.dpo_days,
        dpo_auto_calculated: syncedData.dpo_auto_calculated,
        balance_date: syncedData.balance_date,
        last_xero_sync_at: syncedData.last_xero_sync_at,
        // Merge detected loans (don't overwrite existing loan config)
        loans: syncedData.detected_loans?.length > 0 && prev.loans.length === 0
          ? syncedData.detected_loans.map((l: any) => ({
              name: l.name,
              balance: l.balance,
              monthly_repayment: 0,
              interest_rate: 0.065,
              is_interest_only: false,
            }))
          : prev.loans,
      }))

      toast.success('Opening balances synced from Xero')
    } catch (err) {
      console.error('[useCashflowForecast] Sync error:', err)
      toast.error('Failed to sync from Xero')
    } finally {
      setIsSyncing(false)
    }
  }, [forecast?.id, businessId, forecast?.actual_start_month])

  return {
    data,
    assumptions,
    payrollSummary,
    isLoading,
    isSyncing,
    saveAssumptions,
    syncFromXero,
    updateAssumption,
  }
}

async function loadPayrollSummary(forecastId: string): Promise<PayrollSummary | null> {
  try {
    const res = await fetch(`/api/forecast/${forecastId}`)
    if (!res.ok) return null
    const { data } = await res.json()

    // Try loading from forecast_payroll_summary table via supabase
    // Since we're client-side, use the forecast API
    // The payroll summary may be stored in the forecast's assumptions
    return null // Will be enhanced when payroll data is available
  } catch {
    return null
  }
}
