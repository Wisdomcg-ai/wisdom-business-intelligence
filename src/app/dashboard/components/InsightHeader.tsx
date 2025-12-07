'use client'

import Link from 'next/link'
import { RefreshCw, AlertTriangle, Target, Calendar, PartyPopper, LayoutDashboard } from 'lucide-react'
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
        bg: 'bg-brand-orange/10',
        border: 'border-brand-orange/30',
        iconBg: 'bg-brand-orange/20',
        iconColor: 'text-brand-orange',
        textColor: 'text-brand-orange-700'
      }
    case 'medium':
      return {
        bg: 'bg-brand-navy/5',
        border: 'border-brand-navy/20',
        iconBg: 'bg-brand-navy/10',
        iconColor: 'text-brand-navy',
        textColor: 'text-brand-navy'
      }
    case 'low':
      return {
        bg: 'bg-brand-orange/10',
        border: 'border-brand-orange/30',
        iconBg: 'bg-brand-orange/20',
        iconColor: 'text-brand-orange',
        textColor: 'text-brand-orange-700'
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
    <div>
      {/* Navy Page Header - Banner Style */}
      <div className="bg-brand-navy border-b-4 border-brand-orange">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-brand-orange rounded-xl flex items-center justify-center">
                <LayoutDashboard className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                <p className="text-white/70 mt-0.5">Your business at a glance</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
              title="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Smart Insight Card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className={`${style.bg} rounded-xl border ${style.border} p-5`}>
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 ${style.iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
            <Icon className={`h-5 w-5 ${style.iconColor}`} />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className={`font-semibold ${style.textColor} mb-1`}>
              {activeInsight.title}
            </h2>
            <p className="text-sm text-gray-600">
              {activeInsight.message}
            </p>

            {activeInsight.actionLabel && activeInsight.actionHref && (
              <Link
                href={activeInsight.actionHref}
                className="inline-flex items-center mt-3 px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                {activeInsight.actionLabel}
              </Link>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
