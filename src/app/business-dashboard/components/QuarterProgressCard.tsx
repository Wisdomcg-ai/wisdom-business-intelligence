'use client'

import { TrendingUp, TrendingDown, Minus, DollarSign, PiggyBank, Wallet } from 'lucide-react'
import type { QuarterInfo } from '../hooks/useBusinessDashboard'

interface MetricCardProps {
  label: string
  target: number
  actual: number
  trend: 'ahead' | 'on-track' | 'behind'
  formatCurrency: (value: number | undefined | null) => string
  icon: React.ReactNode
  progressPercent: number
}

function MetricCard({ label, target, actual, trend, formatCurrency, icon, progressPercent }: MetricCardProps) {
  const getTrendIcon = () => {
    if (trend === 'ahead') return <TrendingUp className="w-4 h-4" />
    if (trend === 'behind') return <TrendingDown className="w-4 h-4" />
    return <Minus className="w-4 h-4" />
  }

  const getTrendColors = () => {
    if (trend === 'ahead') return {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      badge: 'bg-emerald-100 text-emerald-700',
      progress: 'bg-emerald-500',
      icon: 'bg-emerald-100 text-emerald-600'
    }
    if (trend === 'behind') return {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      badge: 'bg-red-100 text-red-700',
      progress: 'bg-red-500',
      icon: 'bg-red-100 text-red-600'
    }
    return {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      badge: 'bg-amber-100 text-amber-700',
      progress: 'bg-amber-500',
      icon: 'bg-amber-100 text-amber-600'
    }
  }

  const getTrendLabel = () => {
    if (trend === 'ahead') return 'Ahead'
    if (trend === 'behind') return 'Behind'
    return 'On Track'
  }

  const colors = getTrendColors()
  const percentOfTarget = target > 0 ? Math.round((actual / target) * 100) : 0
  const cappedProgress = Math.min(percentOfTarget, 100)

  return (
    <div className={`p-5 rounded-xl border ${colors.border} ${colors.bg} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${colors.icon} flex items-center justify-center`}>
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(actual)}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${colors.badge}`}>
          {getTrendIcon()}
          {getTrendLabel()}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Progress to Target</span>
          <span className="font-semibold">{percentOfTarget}%</span>
        </div>
        <div className="w-full h-2 bg-white rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.progress} rounded-full transition-all duration-500`}
            style={{ width: `${cappedProgress}%` }}
          />
        </div>
      </div>

      {/* Target Info */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Q Target: {formatCurrency(target)}</span>
        <span className={`font-medium ${percentOfTarget >= progressPercent ? 'text-emerald-600' : 'text-gray-600'}`}>
          {percentOfTarget >= progressPercent ? '✓ Pacing well' : `Need ${Math.round(progressPercent - percentOfTarget)}% more`}
        </span>
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

// Calculate business health score based on trends
function calculateHealthScore(
  revenueTrend: string,
  grossProfitTrend: string,
  netProfitTrend: string,
  progressPercent: number,
  revenuePercent: number,
  grossProfitPercent: number,
  netProfitPercent: number
): { score: number; label: string; color: string } {
  // Weight: Revenue 40%, Gross Profit 30%, Net Profit 30%
  let score = 0

  // Trend scoring (max 50 points)
  const trendScore = (trend: string) => {
    if (trend === 'ahead') return 50
    if (trend === 'on-track') return 35
    return 15
  }

  score += trendScore(revenueTrend) * 0.4
  score += trendScore(grossProfitTrend) * 0.3
  score += trendScore(netProfitTrend) * 0.3

  // Pacing bonus (max 50 points) - how well are they pacing against time
  const avgPercent = (revenuePercent + grossProfitPercent + netProfitPercent) / 3
  const pacingRatio = progressPercent > 0 ? avgPercent / progressPercent : 1
  const pacingScore = Math.min(pacingRatio * 50, 50)

  score += pacingScore

  const finalScore = Math.round(Math.min(score, 100))

  if (finalScore >= 80) return { score: finalScore, label: 'Excellent', color: 'text-emerald-600' }
  if (finalScore >= 60) return { score: finalScore, label: 'Good', color: 'text-blue-600' }
  if (finalScore >= 40) return { score: finalScore, label: 'Needs Focus', color: 'text-amber-600' }
  return { score: finalScore, label: 'At Risk', color: 'text-red-600' }
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
  const revenuePercent = revenueTarget > 0 ? (revenueQTD / revenueTarget) * 100 : 0
  const grossProfitPercent = grossProfitTarget > 0 ? (grossProfitQTD / grossProfitTarget) * 100 : 0
  const netProfitPercent = netProfitTarget > 0 ? (netProfitQTD / netProfitTarget) * 100 : 0

  const health = calculateHealthScore(
    revenueTrend,
    grossProfitTrend,
    netProfitTrend,
    progress.percentComplete,
    revenuePercent,
    grossProfitPercent,
    netProfitPercent
  )

  return (
    <div className="rounded-xl shadow-sm border border-gray-200 bg-white overflow-hidden mb-6">
      {/* Header with Health Score */}
      <div className="bg-gradient-to-r from-brand-navy to-brand-navy/90 px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Circular Progress Indicator */}
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="6"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="#F97316"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${progress.percentComplete * 1.76} 176`}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-white">{progress.percentComplete}%</span>
              </div>
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">{currentQuarterInfo.label} Progress</h2>
              <p className="text-white/70 text-sm">
                Week {progress.currentWeek} of {progress.totalWeeks} • {currentQuarterInfo.months}
              </p>
            </div>
          </div>

          {/* Business Health Score */}
          <div className="bg-white/10 backdrop-blur rounded-xl px-5 py-3 text-center">
            <p className="text-white/70 text-xs uppercase tracking-wide mb-1">Business Health</p>
            <p className={`text-3xl font-bold text-white`}>{health.score}</p>
            <p className={`text-sm font-medium ${health.score >= 60 ? 'text-emerald-300' : health.score >= 40 ? 'text-amber-300' : 'text-red-300'}`}>
              {health.label}
            </p>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Revenue"
            target={revenueTarget}
            actual={revenueQTD}
            trend={revenueTrend}
            formatCurrency={formatCurrency}
            icon={<DollarSign className="w-5 h-5" />}
            progressPercent={progress.percentComplete}
          />
          <MetricCard
            label="Gross Profit"
            target={grossProfitTarget}
            actual={grossProfitQTD}
            trend={grossProfitTrend}
            formatCurrency={formatCurrency}
            icon={<PiggyBank className="w-5 h-5" />}
            progressPercent={progress.percentComplete}
          />
          <MetricCard
            label="Net Profit"
            target={netProfitTarget}
            actual={netProfitQTD}
            trend={netProfitTrend}
            formatCurrency={formatCurrency}
            icon={<Wallet className="w-5 h-5" />}
            progressPercent={progress.percentComplete}
          />
        </div>
      </div>
    </div>
  )
}
