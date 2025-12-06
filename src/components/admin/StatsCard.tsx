'use client'

import { ReactNode } from 'react'
import { LucideIcon, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  iconColor?: 'orange' | 'navy' | 'teal' | 'amber' | 'red' | 'slate'
  trend?: {
    value: number
    label: string
  }
  onClick?: () => void
  highlighted?: boolean
}

const iconColorClasses = {
  orange: 'bg-brand-orange-100 text-brand-orange',
  navy: 'bg-brand-navy-50 text-brand-navy',
  teal: 'bg-brand-teal-100 text-brand-teal',
  amber: 'bg-amber-100 text-amber-600',
  red: 'bg-red-100 text-red-600',
  slate: 'bg-slate-100 text-gray-600',
}

const highlightBorderClasses = {
  orange: 'ring-2 ring-brand-orange/20',
  navy: 'ring-2 ring-brand-navy/20',
  teal: 'ring-2 ring-brand-teal/20',
  amber: 'ring-2 ring-amber-500/20',
  red: 'ring-2 ring-red-500/20',
  slate: 'ring-2 ring-slate-500/20',
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'teal',
  trend,
  onClick,
  highlighted = false
}: StatsCardProps) {
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      onClick={onClick}
      className={`
        relative bg-white rounded-2xl border border-slate-200 p-6
        transition-all duration-200
        ${onClick ? 'cursor-pointer hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5 text-left w-full' : ''}
        ${highlighted ? highlightBorderClasses[iconColor] : ''}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-brand-navy">{value}</p>
            {trend && (
              <span className={`inline-flex items-center gap-0.5 text-sm font-medium ${trend.value >= 0 ? 'text-brand-teal' : 'text-red-600'}`}>
                {trend.value >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {Math.abs(trend.value)}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconColorClasses[iconColor]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>

      {onClick && (
        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </div>
      )}
    </Component>
  )
}

// Compact variant for smaller displays
interface CompactStatsCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  color?: 'orange' | 'navy' | 'teal' | 'amber' | 'red'
}

export function CompactStatsCard({ title, value, icon: Icon, color = 'orange' }: CompactStatsCardProps) {
  const colorClasses = {
    orange: 'bg-brand-orange-50 border-brand-orange-100',
    navy: 'bg-brand-navy-50 border-brand-navy-100',
    teal: 'bg-brand-teal-50 border-brand-teal-100',
    amber: 'bg-amber-50 border-amber-100',
    red: 'bg-red-50 border-red-100',
  }

  const iconBgClasses = {
    orange: 'bg-brand-orange',
    navy: 'bg-brand-navy',
    teal: 'bg-brand-teal',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colorClasses[color]}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBgClasses[color]}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500">{title}</p>
        <p className="text-lg font-bold text-brand-navy">{value}</p>
      </div>
    </div>
  )
}
