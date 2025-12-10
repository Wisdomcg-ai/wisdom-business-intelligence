'use client'

import {
  LayoutDashboard,
  Building2,
  Target,
  TrendingUp,
  ListChecks,
  FileText,
  MessageSquare,
  StickyNote,
  Users,
  CalendarCheck,
  History
} from 'lucide-react'

export type TabId = 'overview' | 'profile' | 'goals' | 'financials' | 'actions' | 'documents' | 'messages' | 'notes' | 'team' | 'weekly-reviews' | 'activity-log'

interface Tab {
  id: TabId
  label: string
  icon: React.ElementType
  badge?: number
}

interface ClientFileTabsProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  badges?: {
    actions?: number
    messages?: number
  }
  enabledModules?: {
    goals?: boolean
    forecast?: boolean
    documents?: boolean
    chat?: boolean
  }
}

export function ClientFileTabs({
  activeTab,
  onTabChange,
  badges = {},
  enabledModules = { goals: true, forecast: true, documents: true, chat: true }
}: ClientFileTabsProps) {
  const allTabs: Tab[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'profile', label: 'Profile', icon: Building2 },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'weekly-reviews', label: 'Weekly Reviews', icon: CalendarCheck },
    { id: 'goals', label: 'Goals & Planning', icon: Target },
    { id: 'financials', label: 'Financials', icon: TrendingUp },
    { id: 'actions', label: 'Actions', icon: ListChecks, badge: badges.actions },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'messages', label: 'Messages', icon: MessageSquare, badge: badges.messages },
    { id: 'notes', label: 'Notes', icon: StickyNote },
    { id: 'activity-log', label: 'Activity Log', icon: History },
  ]

  // Filter tabs based on enabled modules
  const tabs = allTabs.filter(tab => {
    if (tab.id === 'goals' && !enabledModules.goals) return false
    if (tab.id === 'financials' && !enabledModules.forecast) return false
    if (tab.id === 'documents' && !enabledModules.documents) return false
    if (tab.id === 'messages' && !enabledModules.chat) return false
    return true
  })

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="px-6">
        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors
                  ${isActive
                    ? 'border-brand-orange text-brand-orange'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`
                    ml-1 px-2 py-0.5 text-xs rounded-full font-medium
                    ${isActive ? 'bg-brand-orange-100 text-brand-orange' : 'bg-gray-100 text-gray-600'}
                  `}>
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

export default ClientFileTabs
