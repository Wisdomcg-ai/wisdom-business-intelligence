'use client'

import Link from 'next/link'
import { type LucideIcon } from 'lucide-react'
import type { FinancialGoals } from '../types'
import { formatCurrency } from '../utils/formatters'
import ProgressRing from './ProgressRing'

interface GoalsCardProps {
  title: string
  goals: FinancialGoals | null
  icon: LucideIcon
  emptyStateText: string
  emptyStateCta: string
  emptyStateHref: string
  subtitle?: string
  daysRemaining?: number
  timeProgress?: number
  isShowingPlanningQuarter?: boolean
}

export default function GoalsCard({
  title,
  goals,
  icon: Icon,
  emptyStateText,
  emptyStateCta,
  emptyStateHref,
  subtitle,
  daysRemaining,
  timeProgress = 0,
  isShowingPlanningQuarter
}: GoalsCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-brand-navy border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-brand-navy/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-navy/10 rounded-lg flex items-center justify-center">
              <Icon className="h-4 w-4 text-brand-navy" />
            </div>
            <div>
              <h3 className="font-semibold text-brand-navy">{title}</h3>
              {subtitle && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-500">{subtitle}</p>
                  {isShowingPlanningQuarter && (
                    <span className="text-[10px] font-medium text-brand-orange-700 bg-brand-orange-100 px-1.5 py-0.5 rounded">
                      Planning
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {daysRemaining !== undefined && !isShowingPlanningQuarter && (
            <span className="text-xs font-medium text-brand-navy bg-brand-navy/10 px-2 py-1 rounded">
              {daysRemaining}d left
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {goals ? (
          <div className="flex items-start gap-5">
            {/* Progress Ring */}
            <div className="flex-shrink-0">
              <ProgressRing progress={timeProgress} size={72} strokeWidth={5} />
              <p className="text-xs text-gray-500 text-center mt-1">Time elapsed</p>
            </div>

            {/* Goals Data */}
            <div className="flex-1 min-w-0">
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Revenue Target</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(goals.revenue)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Gross Profit</p>
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(goals.grossProfit)}</p>
                  <p className="text-xs text-brand-orange font-medium">{goals.grossMargin.toFixed(0)}% margin</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Net Profit</p>
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(goals.netProfit)}</p>
                  <p className="text-xs text-brand-orange font-medium">{goals.netMargin.toFixed(0)}% margin</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto mb-3 bg-brand-navy/10 rounded-lg flex items-center justify-center">
              <Icon className="h-6 w-6 text-brand-navy/50" />
            </div>
            <p className="text-gray-700 font-medium mb-1">{emptyStateText}</p>
            <p className="text-sm text-gray-500 mb-4">Set targets to track progress</p>
            <Link
              href={emptyStateHref}
              className="inline-flex items-center px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              {emptyStateCta}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
