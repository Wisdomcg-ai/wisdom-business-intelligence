'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { ForecastAssumptions } from './wizard-v4/types/assumptions'

interface ForecastMultiYearSummaryProps {
  assumptions: ForecastAssumptions
  fiscalYear: number
}

function formatCurrency(value: number): string {
  const abs = Math.abs(value)
  let str: string
  if (abs >= 1_000_000) {
    str = `$${(abs / 1_000_000).toFixed(1)}M`
  } else if (abs >= 1_000) {
    str = `$${Math.round(abs / 1_000)}k`
  } else {
    str = `$${Math.round(abs)}`
  }
  return value < 0 ? `(${str})` : str
}

interface YearData {
  label: string
  revenue: number
  grossProfitPct: number
  netProfitPct: number
  netProfit: number
  revenueQuarterly?: { q1: number; q2: number; q3: number; q4: number }
}

export default function ForecastMultiYearSummary({ assumptions, fiscalYear }: ForecastMultiYearSummaryProps) {
  const goals = assumptions.goals
  if (!goals) return null

  const duration = (assumptions as any).forecastDuration as number || 1
  if (duration < 2) return null // Only show if multi-year

  const years: YearData[] = []

  // Year 1
  if (goals.year1) {
    const rev = goals.year1.revenue
    years.push({
      label: `FY${(fiscalYear) % 100}`,
      revenue: rev,
      grossProfitPct: goals.year1.grossProfitPct,
      netProfitPct: goals.year1.netProfitPct,
      netProfit: rev * (goals.year1.netProfitPct / 100),
    })
  }

  // Year 2
  if (duration >= 2 && goals.year2) {
    const rev = goals.year2.revenue
    // Aggregate quarterly revenue from lines if available
    const revenueQ = aggregateQuarterly(assumptions.revenue.lines, 'year2Quarterly')
    years.push({
      label: `FY${(fiscalYear + 1) % 100}`,
      revenue: rev,
      grossProfitPct: goals.year2.grossProfitPct,
      netProfitPct: goals.year2.netProfitPct,
      netProfit: rev * (goals.year2.netProfitPct / 100),
      revenueQuarterly: revenueQ,
    })
  }

  // Year 3
  if (duration >= 3 && goals.year3) {
    const rev = goals.year3.revenue
    const revenueQ = aggregateQuarterly(assumptions.revenue.lines, 'year3Quarterly')
    years.push({
      label: `FY${(fiscalYear + 2) % 100}`,
      revenue: rev,
      grossProfitPct: goals.year3.grossProfitPct,
      netProfitPct: goals.year3.netProfitPct,
      netProfit: rev * (goals.year3.netProfitPct / 100),
      revenueQuarterly: revenueQ,
    })
  }

  if (years.length < 2) return null

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="w-3.5 h-3.5 text-green-500" />
    if (current < previous) return <TrendingDown className="w-3.5 h-3.5 text-red-500" />
    return <Minus className="w-3.5 h-3.5 text-gray-400" />
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-4 sm:mb-6">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-gray-900">{duration}-Year Forecast Summary</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
              {years.map((y) => (
                <th key={y.label} className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase">{y.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            <tr>
              <td className="px-5 py-3 font-medium text-gray-700">Revenue</td>
              {years.map((y, i) => (
                <td key={y.label} className="px-5 py-3 text-right font-semibold text-gray-900">
                  <span className="inline-flex items-center gap-1.5">
                    {formatCurrency(y.revenue)}
                    {i > 0 && getTrendIcon(y.revenue, years[i - 1].revenue)}
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-5 py-3 font-medium text-gray-700">Gross Profit %</td>
              {years.map((y) => (
                <td key={y.label} className="px-5 py-3 text-right text-gray-900">{y.grossProfitPct.toFixed(1)}%</td>
              ))}
            </tr>
            <tr>
              <td className="px-5 py-3 font-medium text-gray-700">Net Profit</td>
              {years.map((y, i) => (
                <td key={y.label} className={`px-5 py-3 text-right font-semibold ${y.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  <span className="inline-flex items-center gap-1.5">
                    {formatCurrency(y.netProfit)}
                    <span className="text-xs font-normal text-gray-500">({y.netProfitPct.toFixed(1)}%)</span>
                  </span>
                </td>
              ))}
            </tr>
            {/* Quarterly breakdown for Year 2/3 if available */}
            {years.some(y => y.revenueQuarterly) && (
              <tr>
                <td className="px-5 py-3 font-medium text-gray-500 text-xs">Revenue (Quarterly)</td>
                {years.map((y) => (
                  <td key={y.label} className="px-5 py-3 text-right text-xs text-gray-500">
                    {y.revenueQuarterly
                      ? `Q1: ${formatCurrency(y.revenueQuarterly.q1)} · Q2: ${formatCurrency(y.revenueQuarterly.q2)} · Q3: ${formatCurrency(y.revenueQuarterly.q3)} · Q4: ${formatCurrency(y.revenueQuarterly.q4)}`
                      : '—'
                    }
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function aggregateQuarterly(
  lines: { year2Quarterly?: { q1: number; q2: number; q3: number; q4: number }; year3Quarterly?: { q1: number; q2: number; q3: number; q4: number } }[],
  key: 'year2Quarterly' | 'year3Quarterly'
): { q1: number; q2: number; q3: number; q4: number } | undefined {
  const hasData = lines.some(l => l[key])
  if (!hasData) return undefined

  return lines.reduce(
    (acc, line) => {
      const q = line[key]
      if (!q) return acc
      return {
        q1: acc.q1 + q.q1,
        q2: acc.q2 + q.q2,
        q3: acc.q3 + q.q3,
        q4: acc.q4 + q.q4,
      }
    },
    { q1: 0, q2: 0, q3: 0, q4: 0 }
  )
}
