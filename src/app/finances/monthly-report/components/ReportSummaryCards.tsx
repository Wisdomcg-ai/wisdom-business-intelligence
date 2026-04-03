'use client'

import { DollarSign, TrendingUp, TrendingDown, Percent } from 'lucide-react'
import type { ReportSummary } from '../types'

interface ReportSummaryCardsProps {
  summary: ReportSummary
  hasBudget: boolean
}

function formatCurrency(value: number): string {
  const abs = Math.abs(value)
  let str: string
  if (abs >= 1_000_000) str = `$${(abs / 1_000_000).toFixed(1)}M`
  else if (abs >= 1_000) str = `$${(abs / 1_000).toFixed(1)}k`
  else str = `$${abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  return value < 0 ? `(${str})` : str
}

function VarianceBadge({ value, percent, isRevenue }: { value: number; percent: number; isRevenue?: boolean }) {
  // For revenue: positive variance = favorable
  // For expenses: already calculated with correct sign convention
  const isFavorable = value >= 0
  const color = isFavorable ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'
  const arrow = isFavorable ? '+' : ''

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {arrow}{formatCurrency(value)} ({percent >= 0 ? '+' : ''}{percent.toFixed(1)}%)
    </span>
  )
}

export default function ReportSummaryCards({ summary, hasBudget }: ReportSummaryCardsProps) {
  const cards = [
    {
      label: 'Revenue',
      actual: summary.revenue.actual,
      budget: summary.revenue.budget,
      variance: summary.revenue.variance,
      variancePercent: summary.revenue.variance_percent,
      icon: <DollarSign className="w-5 h-5 text-brand-navy" />,
      isRevenue: true,
    },
    {
      label: 'Gross Profit',
      actual: summary.gross_profit.actual,
      budget: summary.gross_profit.budget,
      variance: summary.gross_profit.variance,
      variancePercent: summary.gross_profit.gp_percent,
      icon: <TrendingUp className="w-5 h-5 text-green-600" />,
      isRevenue: true,
      extraLabel: `GP ${summary.gross_profit.gp_percent.toFixed(1)}%`,
    },
    {
      label: 'Operating Expenses',
      actual: summary.opex.actual,
      budget: summary.opex.budget,
      variance: summary.opex.variance,
      variancePercent: summary.opex.variance_percent,
      icon: <TrendingDown className="w-5 h-5 text-amber-600" />,
    },
    {
      label: 'Net Profit',
      actual: summary.net_profit.actual,
      budget: summary.net_profit.budget,
      variance: summary.net_profit.variance,
      variancePercent: summary.net_profit.np_percent,
      icon: <Percent className="w-5 h-5 text-brand-orange" />,
      isRevenue: true,
      extraLabel: `NP ${summary.net_profit.np_percent.toFixed(1)}%`,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => (
        <div key={card.label} className="bg-white rounded-xl p-4 sm:p-5 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-500">{card.label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatCurrency(card.actual)}
              </p>
              {hasBudget && (
                <div className="mt-1.5">
                  <p className="text-xs text-gray-500">
                    Budget: {formatCurrency(card.budget)}
                  </p>
                  <div className="mt-1">
                    <VarianceBadge
                      value={card.variance}
                      percent={card.variancePercent}
                      isRevenue={card.isRevenue}
                    />
                  </div>
                </div>
              )}
              {card.extraLabel && (
                <p className="mt-1 text-xs font-medium text-gray-600">{card.extraLabel}</p>
              )}
            </div>
            <div className="p-2 bg-gray-50 rounded-lg">
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
