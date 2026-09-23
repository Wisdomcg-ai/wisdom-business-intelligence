'use client'

import { TrendingUp, DollarSign, Target, Users } from 'lucide-react'
import { StatsCard } from '@/components/admin/StatsCard'
import type { FinancialForecast, PLLine } from '../types'
import type { ForecastAssumptions } from './wizard-v4/types/assumptions'
import { sumAnnualPlan } from '../utils/pl-line-categories'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'

interface ForecastKPISummaryProps {
  assumptions: ForecastAssumptions | null
  forecast: FinancialForecast
  plLines: PLLine[]
  /** Business fiscal year start month (1-12). Scopes the plan to Year 1. */
  yearStartMonth?: number
  /**
   * True when plLines are Xero actuals + projections rather than a saved
   * forecast (Phase 65). Those are not a plan, so the cards show goals.
   */
  isEstimatedMode?: boolean
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

export default function ForecastKPISummary({
  assumptions,
  forecast,
  plLines,
  yearStartMonth = DEFAULT_YEAR_START_MONTH,
  isEstimatedMode = false,
}: ForecastKPISummaryProps) {
  // ── The operator's Step-1 targets ─────────────────────────────────────────
  const revenueGoal = assumptions?.goals?.year1?.revenue || forecast.revenue_goal || 0
  const grossProfitPctGoal = assumptions?.goals?.year1?.grossProfitPct || (
    forecast.revenue_goal && forecast.gross_profit_goal
      ? (forecast.gross_profit_goal / forecast.revenue_goal) * 100
      : 0
  )
  // Read from the SAME source as the revenue goal above. The three cards are a
  // single statement — a net profit taken from the published column while
  // revenue comes from live assumptions divides a figure from one era by a
  // figure from another and prints a margin that was never true of either.
  const netProfitGoal = assumptions?.goals?.year1?.netProfitPct != null && revenueGoal > 0
    ? revenueGoal * (assumptions.goals.year1.netProfitPct / 100)
    : forecast.net_profit_goal || 0
  const netProfitPctGoal = revenueGoal > 0 ? (netProfitGoal / revenueGoal) * 100 : 0

  // ── What the stored P&L actually plans ────────────────────────────────────
  //
  // These cards sit directly above the P&L table, and until 8 Sep 2026 they
  // ignored it: the "Net Profit" card printed the GOAL, so Urban Road read
  // $530k (8.8%) over a table — and a wizard Review — that both said $536,245
  // (8.9%). Show the plan, and keep the goal beside it as the comparison.
  const y1MonthKeys = generateFiscalMonthKeys(forecast.fiscal_year, yearStartMonth)
  const plan = sumAnnualPlan(plLines, y1MonthKeys)
  const showPlan = plan.hasPlan && !isEstimatedMode

  const revenueValue = showPlan ? plan.revenue : revenueGoal
  const grossProfitPctValue = showPlan ? plan.grossProfitPct : grossProfitPctGoal
  const netProfitValue = showPlan ? plan.netProfit : netProfitGoal
  const netProfitPctValue = showPlan ? plan.netProfitPct : netProfitPctGoal

  // Prior-year comparison stays anchored to what is on the card.
  const priorYearRevenue = assumptions?.revenue?.lines?.reduce((sum, l) => sum + (l.priorYearTotal || 0), 0) || 0
  const revenueTrend = priorYearRevenue > 0
    ? Math.round(((revenueValue - priorYearRevenue) / priorYearRevenue) * 100)
    : undefined

  // Only say "Goal …" when the plan actually differs from it — an exact match
  // is the normal case and repeating it twice is noise.
  const goalSubtitle = (planValue: number, goalValue: number, text: string, tolerance = 1000) =>
    showPlan && goalValue > 0 && Math.abs(planValue - goalValue) >= tolerance ? text : undefined

  const netProfitSubtitle = showPlan
    ? (netProfitGoal > 0 && (Math.abs(netProfitValue - netProfitGoal) >= 1000 ||
        Math.abs(netProfitPctValue - netProfitPctGoal) >= 0.1)
        ? `Goal ${formatCompact(netProfitGoal)} (${netProfitPctGoal.toFixed(1)}%)`
        : undefined)
    : 'Target'

  // Team
  const existingCount = assumptions?.team?.existingTeam?.filter(m => m.includeInForecast !== false).length || 0
  const newHiresCount = assumptions?.team?.plannedHires?.length || 0
  const totalHeadcount = existingCount + newHiresCount

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 sm:mb-6">
      <StatsCard
        title="Revenue"
        value={formatCompact(revenueValue)}
        subtitle={showPlan
          ? goalSubtitle(revenueValue, revenueGoal, `Goal ${formatCompact(revenueGoal)}`)
          : 'Target'}
        icon={TrendingUp}
        iconColor="navy"
        trend={revenueTrend !== undefined ? { value: revenueTrend, label: 'vs prior year' } : undefined}
      />
      <StatsCard
        title="Gross Profit"
        value={`${grossProfitPctValue.toFixed(1)}%`}
        subtitle={showPlan
          ? (grossProfitPctGoal > 0 && Math.abs(grossProfitPctValue - grossProfitPctGoal) >= 0.1
              ? `Goal ${grossProfitPctGoal.toFixed(1)}%`
              : undefined)
          : 'Target'}
        icon={DollarSign}
        iconColor="teal"
      />
      <StatsCard
        title="Net Profit"
        value={netProfitValue ? `${formatCompact(netProfitValue)} (${netProfitPctValue.toFixed(1)}%)` : '-'}
        subtitle={netProfitSubtitle}
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
