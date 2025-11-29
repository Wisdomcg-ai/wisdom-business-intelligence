'use client'

import Link from 'next/link'
import { RefreshCw, AlertTriangle, Target, Calendar, PartyPopper } from 'lucide-react'
import type { DashboardInsight } from '../types'

interface InsightHeaderProps {
  insight?: DashboardInsight
  onRefresh: () => void
}

function getInsightIcon(type: DashboardInsight['type']) {
  switch (type) {
    case 'rock_attention':
      return AlertTriangle
    case 'goal_deadline':
      return Target
    case 'weekly_review':
      return Calendar
    case 'celebration':
      return PartyPopper
    default:
      return Target
  }
}

function getInsightStyle(priority: DashboardInsight['priority']) {
  switch (priority) {
    case 'high':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600'
      }
    case 'medium':
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        iconBg: 'bg-gray-100',
        iconColor: 'text-gray-600'
      }
    case 'low':
      return {
        bg: 'bg-teal-50',
        border: 'border-teal-200',
        iconBg: 'bg-teal-100',
        iconColor: 'text-teal-600'
      }
  }
}

export default function InsightHeader({ insight, onRefresh }: InsightHeaderProps) {
  const defaultInsight: DashboardInsight = {
    type: 'goal_deadline',
    title: 'Welcome Back',
    message: 'Review your progress and stay focused on what matters most.',
    priority: 'low'
  }

  const activeInsight = insight || defaultInsight
  const Icon = getInsightIcon(activeInsight.type)
  const style = getInsightStyle(activeInsight.priority)

  return (
    <div className={`${style.bg} rounded-lg border ${style.border} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1">
          <div className={`w-10 h-10 ${style.iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
            <Icon className={`h-5 w-5 ${style.iconColor}`} />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 mb-1">
              {activeInsight.title}
            </h2>
            <p className="text-sm text-gray-600">
              {activeInsight.message}
            </p>

            {activeInsight.actionLabel && activeInsight.actionHref && (
              <Link
                href={activeInsight.actionHref}
                className="inline-flex items-center mt-3 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
              >
                {activeInsight.actionLabel}
              </Link>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white transition-colors flex-shrink-0"
          title="Refresh"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
