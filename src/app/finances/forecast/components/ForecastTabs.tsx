'use client'

import { TrendingUp, Users, Clock } from 'lucide-react'

export type ForecastTab = 'pl' | 'payroll' | 'versions'

interface ForecastTabsProps {
  activeTab: ForecastTab
  onTabChange: (tab: ForecastTab) => void
}

const tabs: { id: ForecastTab; label: string; icon: typeof TrendingUp }[] = [
  { id: 'pl', label: 'P&L Forecast', icon: TrendingUp },
  { id: 'payroll', label: 'Payroll & Staff', icon: Users },
  { id: 'versions', label: 'Versions', icon: Clock }
]

export default function ForecastTabs({ activeTab, onTabChange }: ForecastTabsProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm mb-6">
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === id
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </div>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
