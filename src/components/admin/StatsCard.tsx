'use client'

import { ReactNode } from 'react'
import { LucideIcon, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  iconColor?: 'teal' | 'blue' | 'purple' | 'amber' | 'red' | 'green' | 'slate'
  trend?: {
    value: number
    label: string
  }
  onClick?: () => void
  highlighted?: boolean
}

const iconColorClasses = {
  teal: 'bg-teal-100 text-teal-600',
  blue: 'bg-blue-100 text-blue-600',
  purple: 'bg-purple-100 text-purple-600',
  amber: 'bg-amber-100 text-amber-600',
  red: 'bg-red-100 text-red-600',
  green: 'bg-green-100 text-green-600',
  slate: 'bg-slate-100 text-slate-600',
}

const highlightBorderClasses = {
  teal: 'ring-2 ring-teal-500/20',
  blue: 'ring-2 ring-blue-500/20',
  purple: 'ring-2 ring-purple-500/20',
  amber: 'ring-2 ring-amber-500/20',
  red: 'ring-2 ring-red-500/20',
  green: 'ring-2 ring-green-500/20',
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
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900">{value}</p>
            {trend && (
              <span className={`inline-flex items-center gap-0.5 text-sm font-medium ${trend.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
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
  color?: 'teal' | 'blue' | 'purple' | 'amber' | 'red' | 'green'
}

export function CompactStatsCard({ title, value, icon: Icon, color = 'teal' }: CompactStatsCardProps) {
  const colorClasses = {
    teal: 'bg-teal-50 border-teal-100',
    blue: 'bg-blue-50 border-blue-100',
    purple: 'bg-purple-50 border-purple-100',
    amber: 'bg-amber-50 border-amber-100',
    red: 'bg-red-50 border-red-100',
    green: 'bg-green-50 border-green-100',
  }

  const iconBgClasses = {
    teal: 'bg-teal-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    green: 'bg-green-500',
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colorClasses[color]}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBgClasses[color]}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{title}</p>
        <p className="text-lg font-bold text-slate-900">{value}</p>
      </div>
    </div>
  )
}
