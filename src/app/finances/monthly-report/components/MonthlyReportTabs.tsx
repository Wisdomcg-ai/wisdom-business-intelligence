'use client'

import { useMemo } from 'react'
import { BarChart3, Link2, Clock, Calendar, TrendingUp, CreditCard, Users, DollarSign, PieChart } from 'lucide-react'
import type { ReportTab } from '../types'

interface MonthlyReportTabsProps {
  activeTab: ReportTab
  onTabChange: (tab: ReportTab) => void
  hasUnmapped?: boolean
  showSubscriptions?: boolean
  showWages?: boolean
  showCashflow?: boolean
  showCharts?: boolean
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

export default function MonthlyReportTabs({ activeTab, onTabChange, hasUnmapped, showSubscriptions, showWages, showCashflow, showCharts }: MonthlyReportTabsProps) {
  const tabs = useMemo(() => {
    const result = [...baseTabs]
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
    result.push(...endTabs)
    return result
  }, [showSubscriptions, showWages, showCashflow, showCharts])

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
