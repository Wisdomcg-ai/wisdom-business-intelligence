'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

export interface XeroAccount {
  id: string
  business_id: string
  xero_account_id: string
  account_code: string | null
  account_name: string
  xero_type: string | null        // BANK | CURRENT | CURRLIAB | FIXED | EXPENSE etc.
  xero_class: string | null       // ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
  xero_status: string | null      // ACTIVE | ARCHIVED
  tax_type: string | null
  description: string | null
  bank_account_type: string | null // BANK | CREDITCARD | PAYPAL (for Type=BANK accounts only)
  last_synced_at: string
}

export interface GroupedXeroAccounts {
  all: XeroAccount[]
  bank: XeroAccount[]             // xero_type = BANK AND bank_account_type != CREDITCARD (incl. null for legacy)
  creditCards: XeroAccount[]      // xero_type = BANK AND bank_account_type = CREDITCARD
  currentAssets: XeroAccount[]    // xero_type = CURRENT
  fixedAssets: XeroAccount[]      // xero_type = FIXED
  inventory: XeroAccount[]        // xero_type = INVENTORY
  currentLiabilities: XeroAccount[] // xero_type = CURRLIAB
  termLiabilities: XeroAccount[]  // xero_type = TERMLIAB | LIABILITY
  equity: XeroAccount[]           // xero_type = EQUITY
  revenue: XeroAccount[]          // xero_type = REVENUE | OTHERINCOME | SALES
  expenses: XeroAccount[]         // xero_type = EXPENSE | OVERHEADS | DIRECTCOSTS
  depreciation: XeroAccount[]     // xero_type = DEPRECIATN — subset of expenses
}

interface UseXeroAccountsReturn {
  accounts: XeroAccount[]
  grouped: GroupedXeroAccounts
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  lastSyncedAt: string | null
  refresh: () => Promise<void>
}

function groupAccounts(accounts: XeroAccount[]): GroupedXeroAccounts {
  const byType = (types: string[]) =>
    accounts.filter(a => a.xero_type && types.includes(a.xero_type.toUpperCase()) && a.xero_status !== 'ARCHIVED')

  const allBank = byType(['BANK'])
  // Split BANK accounts by Xero's BankAccountType:
  //   CREDITCARD → creditCards group
  //   anything else (BANK, PAYPAL, null) → bank group
  const bank = allBank.filter(a => (a.bank_account_type ?? '').toUpperCase() !== 'CREDITCARD')
  const creditCards = allBank.filter(a => (a.bank_account_type ?? '').toUpperCase() === 'CREDITCARD')

  return {
    all: accounts,
    bank,
    creditCards,
    currentAssets: byType(['CURRENT']),
    fixedAssets: byType(['FIXED', 'NONCURRENT']),
    inventory: byType(['INVENTORY']),
    currentLiabilities: byType(['CURRLIAB']),
    termLiabilities: byType(['TERMLIAB', 'LIABILITY']),
    equity: byType(['EQUITY']),
    revenue: byType(['REVENUE', 'OTHERINCOME', 'SALES']),
    expenses: byType(['EXPENSE', 'OVERHEADS', 'DIRECTCOSTS', 'OTHEREXPENSE']),
    depreciation: byType(['DEPRECIATN']),
  }
}

/**
 * Hook that loads the full Xero Chart of Accounts for a business,
 * grouping them by account type for dropdown population in settings UIs.
 *
 * Backed by the xero_accounts cache table + /api/Xero/chart-of-accounts-full.
 * Refreshes the cache from Xero on demand via refresh().
 */
export function useXeroAccounts(businessId: string): UseXeroAccountsReturn {
  const [accounts, setAccounts] = useState<XeroAccount[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    if (!businessId) return
    if (refresh) setIsRefreshing(true)
    else setIsLoading(true)
    setError(null)
    try {
      const url = `/api/Xero/chart-of-accounts-full?business_id=${businessId}${refresh ? '&refresh=true' : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Failed to load accounts (${res.status})`)
        return
      }
      const { data } = await res.json()
      setAccounts(data ?? [])
    } catch (err) {
      console.error('[useXeroAccounts] load error:', err)
      setError('Network error loading Xero accounts')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [businessId])

  useEffect(() => {
    if (businessId) load(false)
  }, [businessId, load])

  const refresh = useCallback(() => load(true), [load])

  const grouped = useMemo(() => groupAccounts(accounts), [accounts])

  const lastSyncedAt = useMemo(() => {
    if (accounts.length === 0) return null
    return accounts.reduce(
      (latest, a) => a.last_synced_at > latest ? a.last_synced_at : latest,
      accounts[0].last_synced_at
    )
  }, [accounts])

  return {
    accounts,
    grouped,
    isLoading,
    isRefreshing,
    error,
    lastSyncedAt,
    refresh,
  }
}
