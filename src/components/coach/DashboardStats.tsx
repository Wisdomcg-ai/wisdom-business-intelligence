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
  color: 'navy' | 'teal' | 'amber' | 'orange'
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
  navy: {
    bg: 'bg-brand-navy-50',
    icon: 'bg-brand-navy',
    text: 'text-brand-navy'
  },
  teal: {
    bg: 'bg-brand-teal-50',
    icon: 'bg-brand-teal',
    text: 'text-brand-teal'
  },
  amber: {
    bg: 'bg-amber-50',
    icon: 'bg-amber-600',
    text: 'text-amber-600'
  },
  orange: {
    bg: 'bg-brand-orange-50',
    icon: 'bg-brand-orange',
    text: 'text-brand-orange'
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
      color: 'navy',
      href: '/coach/clients'
    },
    {
      label: 'Sessions This Week',
      value: sessionsThisWeek,
      icon: Calendar,
      trend: sessionsTrend !== undefined ? { value: Math.abs(sessionsTrend), isUp: sessionsTrend >= 0 } : undefined,
      color: 'teal',
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
      color: 'orange',
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
                  stat.trend.isUp ? 'text-brand-teal' : 'text-red-600'
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
