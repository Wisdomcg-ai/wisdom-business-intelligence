'use client'

import { Users, Calendar, ListChecks, MessageSquare, TrendingUp, TrendingDown } from 'lucide-react'

interface StatCard {
  label: string
  value: number
  icon: React.ElementType
  trend?: {
    value: number
    isUp: boolean
  }
  color: 'indigo' | 'green' | 'amber' | 'rose'
  href?: string
}

interface DashboardStatsProps {
  activeClients: number
  sessionsThisWeek: number
  pendingActions: number
  unreadMessages: number
  clientsTrend?: number
  sessionsTrend?: number
}

const colorClasses = {
  indigo: {
    bg: 'bg-indigo-50',
    icon: 'bg-indigo-600',
    text: 'text-indigo-600'
  },
  green: {
    bg: 'bg-green-50',
    icon: 'bg-green-600',
    text: 'text-green-600'
  },
  amber: {
    bg: 'bg-amber-50',
    icon: 'bg-amber-600',
    text: 'text-amber-600'
  },
  rose: {
    bg: 'bg-rose-50',
    icon: 'bg-rose-600',
    text: 'text-rose-600'
  }
}

export function DashboardStats({
  activeClients,
  sessionsThisWeek,
  pendingActions,
  unreadMessages,
  clientsTrend,
  sessionsTrend
}: DashboardStatsProps) {
  const stats: StatCard[] = [
    {
      label: 'Active Clients',
      value: activeClients,
      icon: Users,
      trend: clientsTrend !== undefined ? { value: Math.abs(clientsTrend), isUp: clientsTrend >= 0 } : undefined,
      color: 'indigo',
      href: '/coach/clients'
    },
    {
      label: 'Sessions This Week',
      value: sessionsThisWeek,
      icon: Calendar,
      trend: sessionsTrend !== undefined ? { value: Math.abs(sessionsTrend), isUp: sessionsTrend >= 0 } : undefined,
      color: 'green',
      href: '/coach/schedule'
    },
    {
      label: 'Pending Actions',
      value: pendingActions,
      icon: ListChecks,
      color: 'amber',
      href: '/coach/actions'
    },
    {
      label: 'Unread Messages',
      value: unreadMessages,
      icon: MessageSquare,
      color: 'rose',
      href: '/coach/messages'
    }
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        const colors = colorClasses[stat.color]

        return (
          <a
            key={stat.label}
            href={stat.href}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between">
              <div className={`${colors.icon} p-3 rounded-xl`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              {stat.trend && (
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  stat.trend.isUp ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.trend.isUp ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  <span>{stat.trend.value}%</span>
                </div>
              )}
            </div>

            <div className="mt-4">
              <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500 mt-1 group-hover:text-gray-700 transition-colors">
                {stat.label}
              </p>
            </div>
          </a>
        )
      })}
    </div>
  )
}

export default DashboardStats
