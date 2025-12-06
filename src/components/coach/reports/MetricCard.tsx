'use client'

import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: number
    label: string
    isPositive?: boolean
  }
  icon?: LucideIcon
  iconColor?: string
  iconBgColor?: string
  onClick?: () => void
}

export function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  iconColor = 'text-brand-orange',
  iconBgColor = 'bg-brand-orange-100',
  onClick
}: MetricCardProps) {
  const getTrendIcon = () => {
    if (!trend) return null
    if (trend.value > 0) return <TrendingUp className="w-4 h-4" />
    if (trend.value < 0) return <TrendingDown className="w-4 h-4" />
    return <Minus className="w-4 h-4" />
  }

  const getTrendColor = () => {
    if (!trend) return ''
    if (trend.isPositive === undefined) {
      return trend.value >= 0 ? 'text-green-600' : 'text-red-600'
    }
    return trend.isPositive ? 'text-green-600' : 'text-red-600'
  }

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 p-5 ${
        onClick ? 'cursor-pointer hover:border-brand-orange-300 hover:shadow-sm transition-all' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${getTrendColor()}`}>
              {getTrendIcon()}
              <span>{Math.abs(trend.value)}%</span>
              <span className="text-gray-500 font-normal">{trend.label}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={`w-12 h-12 ${iconBgColor} rounded-xl flex items-center justify-center`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
        )}
      </div>
      {onClick && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
          <span className="text-brand-orange font-medium">View details</span>
          <ArrowRight className="w-4 h-4 text-brand-orange" />
        </div>
      )}
    </div>
  )
}

// Mini version for inline stats
export function MiniMetric({
  label,
  value,
  trend
}: {
  label: string
  value: string | number
  trend?: number
}) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
      {trend !== undefined && (
        <p className={`text-xs font-medium mt-1 ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {trend >= 0 ? '+' : ''}{trend}%
        </p>
      )}
    </div>
  )
}

export default MetricCard
