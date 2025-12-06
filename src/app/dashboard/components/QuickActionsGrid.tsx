'use client'

import Link from 'next/link'
import { CheckSquare, XCircle, AlertCircle, FileText, TrendingUp, Compass } from 'lucide-react'

const quickActions = [
  {
    href: '/todo',
    icon: CheckSquare,
    title: 'To-Do List',
    color: 'text-brand-orange'
  },
  {
    href: '/stop-doing',
    icon: XCircle,
    title: 'Stop Doing',
    color: 'text-gray-600'
  },
  {
    href: '/issues',
    icon: AlertCircle,
    title: 'Issues',
    color: 'text-amber-600'
  },
  {
    href: '/one-page-plan',
    icon: FileText,
    title: 'One Page Plan',
    color: 'text-gray-600'
  },
  {
    href: '/finances/forecast',
    icon: TrendingUp,
    title: 'Forecast',
    color: 'text-gray-600'
  },
  {
    href: '/business-dashboard',
    icon: Compass,
    title: 'KPIs',
    color: 'text-gray-600'
  }
]

export default function QuickActionsGrid() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 hover:border-brand-orange-300 hover:bg-brand-orange-50 transition-all text-gray-700 hover:text-brand-orange-700"
              >
                <Icon className={`h-4 w-4 ${action.color}`} />
                <span className="text-sm font-medium">{action.title}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
