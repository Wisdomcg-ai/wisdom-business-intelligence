'use client'

import { TrendingUp, DollarSign, Target, Users } from 'lucide-react'
import { StatsCard } from '@/components/admin/StatsCard'
import type { FinancialForecast, PLLine } from '../types'
import type { ForecastAssumptions } from './wizard-v4/types/assumptions'

interface ForecastKPISummaryProps {
  assumptions: ForecastAssumptions | null
  forecast: FinancialForecast
  plLines: PLLine[]
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}k`
  }
  return `$${value.toFixed(0)}`
}

export default function ForecastKPISummary({ assumptions, forecast, plLines }: ForecastKPISummaryProps) {
  // Revenue
  const revenueGoal = assumptions?.goals?.year1?.revenue || forecast.revenue_goal || 0
  const priorYearRevenue = assumptions?.revenue?.lines?.reduce((sum, l) => sum + (l.priorYearTotal || 0), 0) || 0
  const revenueTrend = priorYearRevenue > 0
    ? Math.round(((revenueGoal - priorYearRevenue) / priorYearRevenue) * 100)
    : undefined

  // Gross Profit %
  const grossProfitGoal = assumptions?.goals?.year1?.grossProfitPct || (
    forecast.revenue_goal && forecast.gross_profit_goal
      ? (forecast.gross_profit_goal / forecast.revenue_goal) * 100
      : 0
  )

  // Net Profit
  const netProfitGoal = forecast.net_profit_goal || 0
  const netProfitPct = revenueGoal > 0 ? ((netProfitGoal / revenueGoal) * 100).toFixed(1) : '0'

  // Team
  const existingCount = assumptions?.team?.existingTeam?.filter(m => m.includeInForecast !== false).length || 0
  const newHiresCount = assumptions?.team?.plannedHires?.length || 0
  const totalHeadcount = existingCount + newHiresCount

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 sm:mb-6">
      <StatsCard
        title="Revenue"
        value={formatCompact(revenueGoal)}
        icon={TrendingUp}
        iconColor="navy"
        trend={revenueTrend !== undefined ? { value: revenueTrend, label: 'vs prior year' } : undefined}
      />
      <StatsCard
        title="Gross Profit"
        value={`${grossProfitGoal.toFixed(1)}%`}
        icon={DollarSign}
        iconColor="teal"
      />
      <StatsCard
        title="Net Profit"
        value={netProfitGoal ? `${formatCompact(netProfitGoal)} (${netProfitPct}%)` : '-'}
        icon={Target}
        iconColor="orange"
      />
      <StatsCard
        title="Team"
        value={`${totalHeadcount} people`}
        subtitle={newHiresCount > 0 ? `+${newHiresCount} new hires` : undefined}
        icon={Users}
        iconColor="amber"
      />
    </div>
  )
}
