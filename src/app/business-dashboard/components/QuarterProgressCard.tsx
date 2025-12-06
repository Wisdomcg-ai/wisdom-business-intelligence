'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { QuarterInfo } from '../hooks/useBusinessDashboard'

interface MetricCardProps {
  label: string
  target: number
  actual: number
  trend: 'ahead' | 'on-track' | 'behind'
  formatCurrency: (value: number | undefined | null) => string
}

function MetricCard({ label, target, actual, trend, formatCurrency }: MetricCardProps) {
  const getTrendIcon = () => {
    if (trend === 'ahead') return <TrendingUp className="w-5 h-5 text-green-600" />
    if (trend === 'behind') return <TrendingDown className="w-5 h-5 text-red-600" />
    return <Minus className="w-5 h-5 text-yellow-600" />
  }

  const getTrendColor = () => {
    if (trend === 'ahead') return 'bg-green-50 border-green-200'
    if (trend === 'behind') return 'bg-red-50 border-red-200'
    return 'bg-yellow-50 border-yellow-200'
  }

  const getTrendLabel = () => {
    if (trend === 'ahead') return 'Ahead of Pace'
    if (trend === 'behind') return 'Behind Pace'
    return 'On Track'
  }

  const percentOfTarget = target > 0 ? Math.round((actual / target) * 100) : 0

  return (
    <div className={`p-4 rounded-lg border-2 ${getTrendColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
        {getTrendIcon()}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Target:</span>
          <span className="font-semibold">{formatCurrency(target)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Actual (QTD):</span>
          <span className="font-semibold">{formatCurrency(actual)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">% of Target:</span>
          <span className="font-semibold">{percentOfTarget}%</span>
        </div>
        <div className="pt-2 border-t mt-2">
          <span className="text-xs font-medium">{getTrendLabel()}</span>
        </div>
      </div>
    </div>
  )
}

interface QuarterProgressCardProps {
  currentQuarterInfo: QuarterInfo
  progress: { currentWeek: number; totalWeeks: number; percentComplete: number }
  revenueQTD: number
  grossProfitQTD: number
  netProfitQTD: number
  revenueTarget: number
  grossProfitTarget: number
  netProfitTarget: number
  revenueTrend: 'ahead' | 'on-track' | 'behind'
  grossProfitTrend: 'ahead' | 'on-track' | 'behind'
  netProfitTrend: 'ahead' | 'on-track' | 'behind'
  formatCurrency: (value: number | undefined | null) => string
}

export default function QuarterProgressCard({
  currentQuarterInfo,
  progress,
  revenueQTD,
  grossProfitQTD,
  netProfitQTD,
  revenueTarget,
  grossProfitTarget,
  netProfitTarget,
  revenueTrend,
  grossProfitTrend,
  netProfitTrend,
  formatCurrency
}: QuarterProgressCardProps) {
  return (
    <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{currentQuarterInfo.label} Progress</h2>
          <p className="text-gray-600">
            Week {progress.currentWeek} of {progress.totalWeeks} ({progress.percentComplete}% complete)
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600">{currentQuarterInfo.months}</div>
          <div className="w-48 h-2 bg-gray-200 rounded-full mt-2">
            <div
              className="h-2 bg-brand-orange rounded-full transition-all"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <MetricCard
          label="Revenue"
          target={revenueTarget}
          actual={revenueQTD}
          trend={revenueTrend}
          formatCurrency={formatCurrency}
        />
        <MetricCard
          label="Gross Profit"
          target={grossProfitTarget}
          actual={grossProfitQTD}
          trend={grossProfitTrend}
          formatCurrency={formatCurrency}
        />
        <MetricCard
          label="Net Profit"
          target={netProfitTarget}
          actual={netProfitQTD}
          trend={netProfitTrend}
          formatCurrency={formatCurrency}
        />
      </div>
    </div>
  )
}
