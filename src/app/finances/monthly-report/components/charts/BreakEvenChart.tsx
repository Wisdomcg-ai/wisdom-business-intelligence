'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Legend,
} from 'recharts'
import type { FullYearReport } from '../../types'
import { CHART_COLORS } from './chart-colors'
import { fmtCurrency, fmtAxisTick, getMonthLabel, ChartCard } from './chart-utils'

export interface BreakEvenDataPoint {
  monthLabel: string
  month: string
  revenue: number
  breakEvenRevenue: number
  fixedCosts: number
  variableCostRatio: number
  source: 'actual' | 'forecast'
}

export interface BreakEvenSummary {
  currentMonthRevenue: number
  currentMonthBreakEven: number
  marginOfSafety: number
  marginOfSafetyPct: number
  averageBreakEven: number
  monthsAboveBreakEven: number
  totalMonths: number
}

export function transformBreakEvenData(report: FullYearReport): { data: BreakEvenDataPoint[]; summary: BreakEvenSummary } {
  const revSection = report.sections.find(s => s.category === 'Revenue')
  const cogsSection = report.sections.find(s => s.category === 'Cost of Sales')
  const opexSection = report.sections.find(s => s.category === 'Operating Expenses')
  const otherExpSection = report.sections.find(s => s.category === 'Other Expenses')

  if (!revSection) return { data: [], summary: { currentMonthRevenue: 0, currentMonthBreakEven: 0, marginOfSafety: 0, marginOfSafetyPct: 0, averageBreakEven: 0, monthsAboveBreakEven: 0, totalMonths: 0 } }

  // Step 1: Calculate a blended variable cost ratio from actual months only.
  // Using per-month ratios causes the break-even line to jump around — a blended
  // ratio from actual data gives a stable, accurate break-even point.
  let totalActualRevenue = 0
  let totalActualCogs = 0
  for (let i = 0; i < report.gross_profit.months.length; i++) {
    if (report.gross_profit.months[i].source !== 'actual') continue
    totalActualRevenue += revSection.subtotal.months[i]?.actual || 0
    totalActualCogs += cogsSection?.subtotal.months[i]?.actual || 0
  }

  // Fallback: if no actuals yet, use budget totals for the ratio
  if (totalActualRevenue === 0) {
    for (let i = 0; i < report.gross_profit.months.length; i++) {
      totalActualRevenue += revSection.subtotal.months[i]?.budget || 0
      totalActualCogs += cogsSection?.subtotal.months[i]?.budget || 0
    }
  }

  const blendedVariableCostRatio = totalActualRevenue > 0 ? totalActualCogs / totalActualRevenue : 0
  const blendedContributionMarginRatio = 1 - blendedVariableCostRatio

  // Step 2: Build per-month data using the blended ratio
  const data: BreakEvenDataPoint[] = report.gross_profit.months.map((gpMonth, i) => {
    const isActual = gpMonth.source === 'actual'

    // Revenue = operating revenue only (exclude Other Income — it doesn't have COGS)
    const revenue = isActual
      ? (revSection.subtotal.months[i]?.actual || 0)
      : (revSection.subtotal.months[i]?.budget || 0)

    // Fixed costs = OpEx + Other Expenses (don't scale with revenue)
    const fixedCosts = isActual
      ? (opexSection?.subtotal.months[i]?.actual || 0) + (otherExpSection?.subtotal.months[i]?.actual || 0)
      : (opexSection?.subtotal.months[i]?.budget || 0) + (otherExpSection?.subtotal.months[i]?.budget || 0)

    // Break-even = Fixed Costs / Contribution Margin Ratio (blended)
    const breakEvenRevenue = blendedContributionMarginRatio > 0
      ? fixedCosts / blendedContributionMarginRatio
      : fixedCosts * 2 // fallback if no margin at all

    return {
      monthLabel: getMonthLabel(gpMonth.month),
      month: gpMonth.month,
      revenue,
      breakEvenRevenue: Math.round(breakEvenRevenue),
      fixedCosts,
      variableCostRatio: blendedVariableCostRatio,
      source: gpMonth.source,
    }
  })

  // Find the last actual month for the summary KPI
  const actualData = data.filter(d => d.source === 'actual')
  const lastActual = actualData.length > 0 ? actualData[actualData.length - 1] : data[0]
  const marginOfSafety = lastActual ? lastActual.revenue - lastActual.breakEvenRevenue : 0
  const marginOfSafetyPct = lastActual && lastActual.revenue > 0 ? (marginOfSafety / lastActual.revenue) * 100 : 0

  const beValues = data.map(d => d.breakEvenRevenue).filter(v => v > 0)
  const averageBreakEven = beValues.length > 0 ? beValues.reduce((a, b) => a + b, 0) / beValues.length : 0
  const monthsAboveBreakEven = data.filter(d => d.revenue >= d.breakEvenRevenue).length

  return {
    data,
    summary: {
      currentMonthRevenue: lastActual?.revenue || 0,
      currentMonthBreakEven: lastActual?.breakEvenRevenue || 0,
      marginOfSafety,
      marginOfSafetyPct,
      averageBreakEven,
      monthsAboveBreakEven,
      totalMonths: data.length,
    },
  }
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as BreakEvenDataPoint | undefined
  if (!point) return null
  const surplus = point.revenue - point.breakEvenRevenue
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-1">
        {label}
        {point.source === 'forecast' && <span className="ml-1.5 text-gray-400 font-normal">(Forecast)</span>}
      </p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-600">{entry.name}</span>
          </span>
          <span className="font-medium">{fmtCurrency(entry.value ?? 0)}</span>
        </div>
      ))}
      <div className="border-t border-gray-100 mt-1 pt-1 space-y-0.5">
        <div className="flex justify-between text-gray-400">
          <span>Fixed costs</span>
          <span>{fmtCurrency(point.fixedCosts)}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Contribution margin</span>
          <span>{((1 - point.variableCostRatio) * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{surplus >= 0 ? 'Above break-even' : 'Below break-even'}</span>
          <span className={`font-medium ${surplus >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtCurrency(surplus)}</span>
        </div>
      </div>
    </div>
  )
}

interface Props {
  fullYearReport: FullYearReport
}

export default function BreakEvenChart({ fullYearReport }: Props) {
  const { data, summary } = transformBreakEvenData(fullYearReport)
  if (data.length === 0) return null

  const lastActualIdx = data.reduce((acc, d, i) => d.source === 'actual' ? i : acc, -1)
  const firstForecastLabel = lastActualIdx < data.length - 1 ? data[lastActualIdx + 1]?.monthLabel : null
  const lastForecastLabel = data[data.length - 1]?.monthLabel

  const isAbove = summary.marginOfSafety >= 0

  return (
    <ChartCard title="Break-Even Analysis" subtitle="Revenue needed to cover all costs each month" tooltip="Shows the minimum revenue you need each month just to cover your costs (the break-even line). When your actual revenue is above the line, you're profitable. The gap between them is your margin of safety — the bigger the better.">
      {/* KPI summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-0.5">Break-Even Point</p>
          <p className="text-sm font-semibold text-gray-900">{fmtCurrency(summary.currentMonthBreakEven)}</p>
          <p className="text-xs text-gray-400">per month</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${isAbove ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className="text-xs text-gray-500 mb-0.5">Margin of Safety</p>
          <p className={`text-sm font-semibold ${isAbove ? 'text-green-700' : 'text-red-700'}`}>
            {isAbove ? '+' : ''}{fmtCurrency(summary.marginOfSafety)}
          </p>
          <p className={`text-xs ${isAbove ? 'text-green-500' : 'text-red-500'}`}>
            {summary.marginOfSafetyPct.toFixed(1)}% of revenue
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-0.5">Months Profitable</p>
          <p className="text-sm font-semibold text-gray-900">{summary.monthsAboveBreakEven} / {summary.totalMonths}</p>
          <p className="text-xs text-gray-400">above break-even</p>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="breakEvenProfitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.positive.hex} stopOpacity={0.2} />
              <stop offset="95%" stopColor={CHART_COLORS.positive.hex} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmtAxisTick} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          {firstForecastLabel && lastForecastLabel && (
            <ReferenceArea x1={firstForecastLabel} x2={lastForecastLabel} fill="#f8fafc" fillOpacity={0.8} label={{ value: 'Forecast', position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
          )}
          {firstForecastLabel && (
            <ReferenceLine x={firstForecastLabel} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
          )}
          <Legend />
          <Area
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke={CHART_COLORS.revenue.hex}
            fill="url(#breakEvenProfitGrad)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="breakEvenRevenue"
            name="Break-Even"
            stroke={CHART_COLORS.negative.hex}
            fill="none"
            strokeWidth={2}
            strokeDasharray="6 3"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
