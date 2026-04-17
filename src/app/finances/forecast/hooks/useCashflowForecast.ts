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

interface PlannedSpendItem {
  id: string
  description: string
  amount: number
  month: number
  spendType: 'asset' | 'one-off' | 'monthly'
  paymentMethod: 'outright' | 'finance' | 'lease'
  financeTerm?: number
  financeRate?: number
  financeMonthlyPayment?: number
  leaseTerm?: number
  leaseMonthlyPayment?: number
  usefulLifeYears?: number
  annualDepreciation?: number
}

interface UseCashflowForecastOptions {
  forecast: FinancialForecast | null
  plLines: PLLine[]
  businessId: string
  plannedSpends?: PlannedSpendItem[]
  hasXeroConnection?: boolean
}

export interface CashflowDataQuality {
  xeroActualsCount: number       // how many Xero P&L accounts were pulled
  forecastLinesCount: number     // how many forecast P&L lines exist
  mergedLinesCount: number       // total accounts feeding the engine
  accountsOnlyInXero: number     // real spend not in the budget
  accountsOnlyInForecast: number // budget lines with no Xero data
  hasPayrollSummary: boolean     // wages, PAYG, super timed correctly
  hasOpeningBalances: boolean    // opening bank balance synced/set
  openingBalanceDate: string | null
  lastXeroSync: string | null
  actualMonthsReconciled: number // count of months where bank balance is from Xero (not derived)
}

interface UseCashflowForecastReturn {
  data: CashflowForecastData | null
  assumptions: CashflowAssumptions
  payrollSummary: PayrollSummary | null
  dataQuality: CashflowDataQuality
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
  plannedSpends = [],
  hasXeroConnection = false,
}: UseCashflowForecastOptions): UseCashflowForecastReturn {
  const [assumptions, setAssumptions] = useState<CashflowAssumptions>(getDefaultCashflowAssumptions())
  const [payrollSummary, setPayrollSummary] = useState<PayrollSummary | null>(null)
  const [mergedLines, setMergedLines] = useState<PLLine[]>([])
  const [xeroActualsCount, setXeroActualsCount] = useState(0)
  const [actualBankBalances, setActualBankBalances] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [hasAutoSynced, setHasAutoSynced] = useState(false)

  // Load assumptions, payroll summary, and Xero actuals on mount
  useEffect(() => {
    if (!forecast?.id || !businessId) return
    loadData()
  }, [forecast?.id, businessId])

  const loadData = async () => {
    if (!forecast?.id) return
    setIsLoading(true)

    try {
      // Load assumptions, payroll, and Xero actuals in parallel
      const [assumptionsRes, payrollRes, xeroActualsRes] = await Promise.all([
        fetch(`/api/forecast/cashflow/assumptions?forecast_id=${forecast.id}`),
        loadPayrollSummary(forecast.id),
        businessId ? fetch(`/api/forecast/cashflow/xero-actuals?business_id=${businessId}`) : Promise.resolve(null),
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

      // Merge Xero actuals with forecast P&L lines
      let xeroActuals: PLLine[] = []
      if (xeroActualsRes && xeroActualsRes.ok) {
        const { data: xeroData } = await xeroActualsRes.json()
        if (xeroData) {
          xeroActuals = xeroData
        }
      }
      setXeroActualsCount(xeroActuals.length)
      setMergedLines(mergeActualsAndForecast(xeroActuals, plLines))

      setPayrollSummary(payrollRes)
      setLoaded(true)
    } catch (err) {
      console.error('[useCashflowForecast] Error loading data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Re-merge when plLines change (e.g. after forecast update)
  useEffect(() => {
    if (loaded && plLines.length > 0) {
      // Re-merge preserving existing xero actuals
      setMergedLines(prev => {
        const xeroOnlyLines = prev.filter(l => l.id?.startsWith('xero-actual-') && !plLines.some(fl => fl.account_name === l.account_name))
        return mergeActualsAndForecast(xeroOnlyLines, plLines)
      })
    }
  }, [plLines, loaded])

  // Fetch actual monthly bank balances from Xero for the actuals period.
  // These override the engine's derived bank_at_beginning/bank_at_end so the
  // cashflow reconciles directly to the Xero bank.
  useEffect(() => {
    if (!hasXeroConnection || !businessId || !forecast?.actual_start_month || !forecast?.actual_end_month) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/forecast/cashflow/bank-balances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            from_month: forecast.actual_start_month,
            to_month: forecast.actual_end_month,
          }),
        })
        if (!res.ok) return
        const { data } = await res.json()
        if (!cancelled && data) setActualBankBalances(data)
      } catch (err) {
        console.error('[useCashflowForecast] Bank balances fetch error:', err)
      }
    })()
    return () => { cancelled = true }
  }, [hasXeroConnection, businessId, forecast?.actual_start_month, forecast?.actual_end_month, assumptions.last_xero_sync_at])

  // Auto-sync from Xero on first load if no balances have been set
  useEffect(() => {
    if (
      loaded &&
      hasXeroConnection &&
      !hasAutoSynced &&
      !isSyncing &&
      assumptions.opening_bank_balance === 0 &&
      !assumptions.balance_date &&
      forecast?.id &&
      forecast?.actual_start_month
    ) {
      setHasAutoSynced(true)
      syncFromXero()
    }
  }, [loaded, hasXeroConnection, hasAutoSynced, isSyncing, assumptions.opening_bank_balance, assumptions.balance_date, forecast?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Run engine client-side via useMemo (instant updates)
  // Use mergedLines (Xero actuals + forecast) for the most complete picture
  const data = useMemo(() => {
    const linesToUse = mergedLines.length > 0 ? mergedLines : plLines
    if (!forecast || !loaded || linesToUse.length === 0) return null

    try {
      const engineOutput = generateCashflowForecast(linesToUse, payrollSummary, assumptions, forecast, plannedSpends)
      if (!engineOutput) return null

      // Post-process: override bank balances for ACTUAL months with Xero's real
      // month-end bank balance. Derived balances from P&L + timing will never
      // exactly match Xero (owner drawings, loan movements, transfers, etc.
      // aren't in the P&L). For past months we trust Xero; for future months
      // we use the engine's projection, carrying forward from the last actual.
      const hasActualBalances = Object.keys(actualBankBalances).length > 0
      if (!hasActualBalances) return engineOutput

      const adjustedMonths = [...engineOutput.months]
      let lastActualEnd: number | null = null

      for (let i = 0; i < adjustedMonths.length; i++) {
        const m = adjustedMonths[i]
        if (m.source === 'actual' && actualBankBalances[m.month] !== undefined) {
          // Xero has the real month-end balance — use it
          const actualEnd = actualBankBalances[m.month]
          const openingForThisMonth = i === 0
            ? (actualBankBalances[m.month] - (m.net_movement ?? 0)) // infer from first month's net
            : (adjustedMonths[i - 1].bank_at_end ?? m.bank_at_beginning)
          adjustedMonths[i] = {
            ...m,
            bank_at_beginning: i === 0 ? assumptions.opening_bank_balance : openingForThisMonth,
            bank_at_end: actualEnd,
            net_movement: actualEnd - (i === 0 ? assumptions.opening_bank_balance : openingForThisMonth),
          }
          lastActualEnd = actualEnd
        } else if (lastActualEnd !== null && m.source !== 'actual') {
          // First forecast month after the actual period — rebase from last actual
          const opening = i > 0 ? (adjustedMonths[i - 1].bank_at_end ?? lastActualEnd) : lastActualEnd
          adjustedMonths[i] = {
            ...m,
            bank_at_beginning: opening,
            bank_at_end: opening + (m.net_movement ?? 0),
          }
          // From here on, subsequent forecast months carry forward normally (they already do)
          lastActualEnd = null // stop rebasing
        }
      }

      // Recompute lowest bank balance after adjustments
      let lowest = Infinity
      let lowestMonth = ''
      for (const m of adjustedMonths) {
        if (m.bank_at_end !== undefined && m.bank_at_end < lowest) {
          lowest = m.bank_at_end
          lowestMonth = m.month
        }
      }

      return {
        ...engineOutput,
        months: adjustedMonths,
        lowest_bank_balance: lowest === Infinity ? 0 : Math.round(lowest * 100) / 100,
        lowest_bank_month: lowestMonth,
      }
    } catch (err) {
      console.error('[useCashflowForecast] Engine error:', err)
      return null
    }
  }, [mergedLines, plLines, payrollSummary, assumptions, forecast, loaded, plannedSpends, actualBankBalances])

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

  // Compute data quality metrics so the UI can show what's actually feeding the cashflow
  const dataQuality = useMemo<CashflowDataQuality>(() => {
    const forecastNames = new Set(plLines.map(l => l.account_name))
    const xeroOnlyCount = mergedLines.filter(
      l => !forecastNames.has(l.account_name) && !!l.actual_months && Object.keys(l.actual_months).length > 0
    ).length
    const forecastOnlyCount = plLines.filter(
      fl => !mergedLines.some(ml => ml.account_name === fl.account_name && !!ml.actual_months && Object.keys(ml.actual_months).length > 0)
    ).length
    return {
      xeroActualsCount,
      forecastLinesCount: plLines.length,
      mergedLinesCount: mergedLines.length,
      accountsOnlyInXero: xeroOnlyCount,
      accountsOnlyInForecast: forecastOnlyCount,
      hasPayrollSummary: !!payrollSummary,
      hasOpeningBalances: assumptions.opening_bank_balance !== 0 || !!assumptions.balance_date,
      openingBalanceDate: assumptions.balance_date || null,
      lastXeroSync: assumptions.last_xero_sync_at || null,
      actualMonthsReconciled: Object.keys(actualBankBalances).length,
    }
  }, [plLines, mergedLines, xeroActualsCount, payrollSummary, assumptions, actualBankBalances])

  return {
    data,
    assumptions,
    payrollSummary,
    dataQuality,
    isLoading,
    isSyncing,
    saveAssumptions,
    syncFromXero,
    updateAssumption,
  }
}

async function loadPayrollSummary(forecastId: string): Promise<PayrollSummary | null> {
  try {
    const res = await fetch(`/api/forecast/cashflow/payroll-summary?forecast_id=${forecastId}`)
    if (!res.ok) return null
    const { data } = await res.json()
    return data || null
  } catch {
    return null
  }
}

/**
 * Merge Xero actuals with forecast P&L lines.
 *
 * For each account:
 * - If it exists in both Xero and forecast: use Xero actual_months + forecast forecast_months
 * - If it exists only in Xero: include with actual_months only (real spend not in budget)
 * - If it exists only in forecast: keep as-is (manual/budget-only lines)
 *
 * This ensures the cashflow reflects ALL real cash movements for past months,
 * plus the budget projection for future months.
 */
function mergeActualsAndForecast(xeroLines: PLLine[], forecastLines: PLLine[]): PLLine[] {
  // Build a map by account name for efficient matching
  const accountMap = new Map<string, { xero: PLLine | null; forecast: PLLine | null }>()

  for (const fl of forecastLines) {
    accountMap.set(fl.account_name, { xero: null, forecast: fl })
  }

  for (const xl of xeroLines) {
    const existing = accountMap.get(xl.account_name)
    if (existing) {
      existing.xero = xl
    } else {
      accountMap.set(xl.account_name, { xero: xl, forecast: null })
    }
  }

  const result: PLLine[] = []

  for (const [accountName, { xero, forecast: fc }] of accountMap) {
    if (fc && xero) {
      // Account exists in both — merge Xero actuals into the forecast line
      result.push({
        ...fc,
        actual_months: {
          ...(fc.actual_months || {}),
          ...(xero.actual_months || {}), // Xero actuals override forecast actuals
        },
      })
    } else if (fc) {
      // Forecast only — keep as-is
      result.push(fc)
    } else if (xero) {
      // Xero only — real account not in the budget, still affects cash
      result.push({
        ...xero,
        account_name: accountName,
        forecast_months: {}, // No budget data
      })
    }
  }

  return result
}
