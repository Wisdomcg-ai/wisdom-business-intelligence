'use client'

import { useMemo } from 'react'
import { BarChart3, Link2, Clock, Calendar, TrendingUp, CreditCard, Users, DollarSign, PieChart, Scale, Layers } from 'lucide-react'
import type { ReportTab } from '../types'

interface MonthlyReportTabsProps {
  activeTab: ReportTab
  onTabChange: (tab: ReportTab) => void
  hasUnmapped?: boolean
  showSubscriptions?: boolean
  showWages?: boolean
  showCashflow?: boolean
  showCharts?: boolean
  showBalanceSheet?: boolean
  /** Phase 34: true when the active business is a consolidation parent. */
  showConsolidated?: boolean
  /** Phase 34 Iteration 34.1: true when consolidation parent + BS section enabled. */
  showConsolidatedBS?: boolean
  /** Phase 34 Iteration 34.2: true when consolidation parent + cashflow section enabled. */
  showConsolidatedCashflow?: boolean
}

type TabDef = { id: ReportTab; label: string; icon: typeof BarChart3 }

const baseTabs: TabDef[] = [
  { id: 'report', label: 'Budget vs Actual', icon: BarChart3 },
  { id: 'full-year', label: 'Full Year', icon: Calendar },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
]

const endTabs: TabDef[] = [
  { id: 'mapping', label: 'Account Mapping', icon: Link2 },
  { id: 'history', label: 'Report History', icon: Clock },
]

export default function MonthlyReportTabs({ activeTab, onTabChange, hasUnmapped, showSubscriptions, showWages, showCashflow, showCharts, showBalanceSheet, showConsolidated, showConsolidatedBS, showConsolidatedCashflow }: MonthlyReportTabsProps) {
  const tabs = useMemo(() => {
    const result = [...baseTabs]
    // Consolidated P&L — only for consolidation parents. Insert near the top
    // so it surfaces next to the primary Actual-vs-Budget report.
    if (showConsolidated) {
      result.push({ id: 'consolidated', label: 'Consolidated P&L', icon: Layers })
    }
    if (showCharts) {
      result.push({ id: 'charts', label: 'Charts', icon: PieChart })
    }
    if (showSubscriptions) {
      result.push({ id: 'subscriptions', label: 'Subscriptions', icon: CreditCard })
    }
    if (showWages) {
      result.push({ id: 'wages', label: 'Wages', icon: Users })
    }
    if (showCashflow) {
      result.push({ id: 'cashflow', label: 'Cashflow', icon: DollarSign })
    }
    if (showBalanceSheet) {
      result.push({ id: 'balance-sheet', label: 'Balance Sheet', icon: Scale })
    }
    // Iteration 34.1: Consolidated BS tab — only for consolidation parents.
    // Placed next to the single-entity Balance Sheet so switching between the
    // two views is one click.
    if (showConsolidatedBS) {
      result.push({ id: 'balance-sheet-consolidated', label: 'Consolidated BS', icon: Scale })
    }
    // Iteration 34.2: Consolidated Cashflow tab — only for consolidation parents.
    // Placed alongside the single-entity Cashflow / Consolidated BS tabs.
    if (showConsolidatedCashflow) {
      result.push({ id: 'cashflow-consolidated', label: 'Consolidated Cashflow', icon: DollarSign })
    }
    result.push(...endTabs)
    return result
  }, [showSubscriptions, showWages, showCashflow, showCharts, showBalanceSheet, showConsolidated, showConsolidatedBS, showConsolidatedCashflow])

  return (
    <div className="bg-white rounded-lg shadow-sm mb-6">
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6 overflow-x-auto" aria-label="Tabs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors relative whitespace-nowrap ${
                activeTab === id
                  ? 'border-brand-orange-500 text-brand-orange'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Icon className="w-4 h-4" />
                <span>{label}</span>
                {id === 'mapping' && hasUnmapped && (
                  <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    !
                  </span>
                )}
              </div>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
