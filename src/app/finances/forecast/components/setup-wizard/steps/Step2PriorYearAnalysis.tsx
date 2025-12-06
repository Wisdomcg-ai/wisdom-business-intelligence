'use client'

import React, { useMemo } from 'react'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  PieChart,
  Calendar,
  DollarSign,
  Percent,
  AlertTriangle,
  CheckCircle,
  Upload,
  Link as LinkIcon,
  Sparkles,
  ArrowRight,
  Info
} from 'lucide-react'
import type { SetupWizardData, PriorYearAnalysis } from '../types'
import { generateInsights } from '../prior-year-analysis'

interface Step2Props {
  data: SetupWizardData
  onUpdate: (updates: Partial<SetupWizardData>) => void
  onOpenCSVImport: () => void
  onConnectXero: () => void
  hasXeroConnection: boolean
  fiscalYear: number
}

export default function Step2PriorYearAnalysis({
  data,
  onUpdate,
  onOpenCSVImport,
  onConnectXero,
  hasXeroConnection,
  fiscalYear
}: Step2Props) {
  const analysis = data.priorYearAnalysis
  const hasData = data.hasActualData && analysis

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const insights = useMemo(() => {
    if (!analysis) return []
    return generateInsights(analysis)
  }, [analysis])

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-red-500" />
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-green-500" />
    return <Minus className="w-4 h-4 text-gray-400" />
  }

  return (
    <div className="space-y-6">
      {/* Teaching Banner */}
      <div className="bg-gradient-to-r from-brand-orange to-brand-orange-700 rounded-lg p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg mb-1">Step 2: Analyse Your Prior Year</h3>
            <p className="text-brand-orange-100 text-sm">
              Understanding what happened last year helps you forecast what's realistic for next year.
              Let's look at your revenue patterns, costs, and trends.
            </p>
          </div>
        </div>
      </div>

      {/* Why This Matters */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-amber-900 mb-1">Why This Matters</h4>
            <p className="text-sm text-amber-800">
              Your past performance is the best predictor of future results. By analysing your
              revenue splits, seasonal patterns, and expense ratios, we can build a forecast
              that's grounded in reality – not wishful thinking.
            </p>
          </div>
        </div>
      </div>

      {hasData && analysis ? (
        <div className="space-y-6">
          {/* Data Source Indicator */}
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-gray-700">
              FY{fiscalYear - 1} data loaded from{' '}
              <span className="text-brand-orange capitalize">{data.dataSource}</span>
            </span>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-brand-orange" />
                <span className="text-xs font-medium text-gray-500 uppercase">Total Revenue</span>
              </div>
              <div className="text-xl font-bold text-gray-900">
                {formatCurrency(analysis.totalRevenue)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Avg {formatCurrency(analysis.averageMonthlyRevenue)}/mo
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="w-4 h-4 text-green-600" />
                <span className="text-xs font-medium text-gray-500 uppercase">Gross Margin</span>
              </div>
              <div className="text-xl font-bold text-gray-900">
                {analysis.grossMargin.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                GP: {formatCurrency(analysis.grossProfit)}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-brand-orange" />
                <span className="text-xs font-medium text-gray-500 uppercase">Net Margin</span>
              </div>
              <div className="text-xl font-bold text-gray-900">
                {analysis.netMargin.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                NP: {formatCurrency(analysis.netProfit)}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-brand-orange-600" />
                <span className="text-xs font-medium text-gray-500 uppercase">Seasonality</span>
              </div>
              <div className="text-xl font-bold text-gray-900">
                {analysis.seasonalityScore.toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {analysis.seasonalityScore < 20 ? 'Very stable' :
                  analysis.seasonalityScore < 40 ? 'Moderate' :
                    analysis.seasonalityScore < 60 ? 'Seasonal' : 'Highly seasonal'}
              </div>
            </div>
          </div>

          {/* Revenue Pattern Chart */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-orange" />
              Monthly Revenue Pattern
            </h4>
            <div className="relative h-40">
              <div className="absolute inset-0 flex items-end justify-between gap-1">
                {analysis.monthlyRevenuePattern.map((month, index) => {
                  const maxAmount = Math.max(...analysis.monthlyRevenuePattern.map(m => m.amount))
                  const heightPercent = maxAmount > 0 ? (month.amount / maxAmount) * 100 : 0
                  const isAboveAvg = month.percentOfAvg > 100

                  return (
                    <div
                      key={month.month}
                      className="flex-1 flex flex-col items-center group"
                    >
                      <div className="w-full relative flex justify-center mb-1">
                        <div
                          className={`w-full max-w-[40px] rounded-t transition-all ${isAboveAvg ? 'bg-brand-orange-500' : 'bg-brand-orange-300'
                            } group-hover:bg-brand-orange`}
                          style={{ height: `${Math.max(4, heightPercent)}%` }}
                        />
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                            {formatCurrency(month.amount)}
                            <br />
                            <span className="text-gray-300">
                              {month.percentOfAvg.toFixed(0)}% of avg
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500">
                        {month.month.split('-')[1]}
                      </span>
                    </div>
                  )
                })}
              </div>
              {/* Average line */}
              <div
                className="absolute left-0 right-0 border-t-2 border-dashed border-brand-orange-400"
                style={{ bottom: '50%' }}
              >
                <span className="absolute -top-5 right-0 text-xs text-brand-orange bg-white px-1">
                  Avg
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 text-sm">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-brand-orange-500 rounded" />
                  <span className="text-gray-600">Above average</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-brand-orange-300 rounded" />
                  <span className="text-gray-600">Below average</span>
                </span>
              </div>
              <div className="text-gray-500">
                Peak: <strong className="text-gray-900">{analysis.peakMonth.month}</strong> |
                Low: <strong className="text-gray-900">{analysis.lowMonth.month}</strong>
              </div>
            </div>
          </div>

          {/* Revenue & Cost Breakdown */}
          <div className="grid grid-cols-2 gap-4">
            {/* Revenue Breakdown */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-green-600" />
                Revenue Breakdown
              </h4>
              <div className="space-y-3">
                {analysis.revenueByCategory.slice(0, 5).map((cat, index) => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700 truncate">{cat.name}</span>
                      <span className="font-medium text-gray-900 ml-2">
                        {cat.percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${cat.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {analysis.revenueByCategory.length > 5 && (
                <p className="text-xs text-gray-500 mt-3">
                  + {analysis.revenueByCategory.length - 5} more categories
                </p>
              )}
            </div>

            {/* OpEx Breakdown */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-red-600" />
                Operating Expenses ({analysis.opexPercentage.toFixed(1)}% of revenue)
              </h4>
              <div className="space-y-3">
                {analysis.opexByCategory.slice(0, 5).map((cat, index) => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700 truncate flex items-center gap-1.5">
                        {cat.name}
                        <TrendIcon trend={cat.trend} />
                      </span>
                      <span className="font-medium text-gray-900 ml-2">
                        {formatCurrency(cat.amount)}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-400 rounded-full"
                        style={{ width: `${cat.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {analysis.opexByCategory.length > 5 && (
                <p className="text-xs text-gray-500 mt-3">
                  + {analysis.opexByCategory.length - 5} more categories
                </p>
              )}
            </div>
          </div>

          {/* AI Insights */}
          {insights.length > 0 && (
            <div className="bg-gradient-to-br from-brand-orange-50 to-brand-orange-100 border border-brand-orange-200 rounded-xl p-5">
              <h4 className="font-semibold text-brand-navy mb-3 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-orange" />
                Key Insights from FY{fiscalYear - 1}
              </h4>
              <div className="space-y-2">
                {insights.map((insight, index) => (
                  <p key={index} className="text-sm text-brand-orange-800">
                    {insight}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* What This Means */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-brand-orange" />
              How We'll Use This Data
            </h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-brand-orange font-bold">•</span>
                <span>
                  <strong>Seasonal patterns</strong> will be applied to your revenue forecast
                  (unless you choose "even split")
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-orange font-bold">•</span>
                <span>
                  <strong>Expense ratios</strong> give you a baseline for budgeting each category
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-orange font-bold">•</span>
                <span>
                  <strong>Trend analysis</strong> helps identify costs that need attention
                </span>
              </li>
            </ul>
          </div>
        </div>
      ) : (
        /* No Data State */
        <div className="space-y-6">
          <div className="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
            <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Prior Year Data Available
            </h3>
            <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
              Import your FY{fiscalYear - 1} P&L data to unlock pattern-based forecasting
              and see valuable insights about your business.
            </p>
            <div className="flex items-center justify-center gap-4">
              {hasXeroConnection ? (
                <button
                  onClick={onConnectXero}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
                >
                  <LinkIcon className="w-4 h-4" />
                  Sync from Xero
                </button>
              ) : (
                <button
                  onClick={onConnectXero}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
                >
                  <LinkIcon className="w-4 h-4" />
                  Connect Xero
                </button>
              )}
              <button
                onClick={onOpenCSVImport}
                className="flex items-center gap-2 px-4 py-2 text-brand-orange border border-brand-orange-200 bg-white rounded-lg hover:bg-brand-orange-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import CSV
              </button>
            </div>
          </div>

          {/* Skip Option */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-amber-900 mb-1">Can I Skip This?</h4>
                <p className="text-sm text-amber-800">
                  Yes, you can proceed without prior year data. However, your forecast will
                  use "even split" distribution instead of your actual seasonal patterns.
                  We recommend importing at least 6 months of data for better accuracy.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
