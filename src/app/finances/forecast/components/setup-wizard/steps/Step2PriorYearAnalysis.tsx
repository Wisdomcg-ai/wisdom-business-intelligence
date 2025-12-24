'use client'

import React, { useMemo } from 'react'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  DollarSign,
  CheckCircle,
  Upload,
  Link as LinkIcon,
  MessageSquare,
  ArrowRight,
  Info,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import type { SetupWizardData, PriorYearAnalysis } from '../types'
import { getIndustryConfig } from '../industry-configs'

interface Step2Props {
  data: SetupWizardData
  onUpdate: (updates: Partial<SetupWizardData>) => void
  onOpenCSVImport: () => void
  onConnectXero: () => void
  hasXeroConnection: boolean
  fiscalYear: number
}

interface CFOInsight {
  id: string
  type: 'success' | 'warning' | 'info'
  title: string
  message: string
  metric?: string
}

export default function Step2PriorYearAnalysis({
  data,
  onUpdate,
  onOpenCSVImport,
  onConnectXero,
  hasXeroConnection,
  fiscalYear
}: Step2Props) {
  const [showDetails, setShowDetails] = React.useState(false)
  const analysis = data.priorYearAnalysis
  const hasData = data.hasActualData && analysis
  const industryConfig = getIndustryConfig(data.industryId)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Generate CFO insights from the analysis
  const cfoInsights = useMemo((): CFOInsight[] => {
    if (!analysis) return []

    const insights: CFOInsight[] = []
    const benchmarkMargin = industryConfig.benchmarks.avgMargin

    // 1. Revenue Pattern Insight
    if (analysis.seasonalityScore > 40) {
      const peakMonthName = new Date(analysis.peakMonth.month + '-01').toLocaleString('en-AU', { month: 'long' })
      const lowMonthName = new Date(analysis.lowMonth.month + '-01').toLocaleString('en-AU', { month: 'long' })
      insights.push({
        id: 'seasonality',
        type: 'info',
        title: 'Revenue Pattern',
        message: `Your business is seasonal. ${peakMonthName} was your peak at ${formatCurrency(analysis.peakMonth.amount)}, while ${lowMonthName} was slowest at ${formatCurrency(analysis.lowMonth.amount)}. I'll use this pattern in your forecast.`,
        metric: `${analysis.seasonalityScore.toFixed(0)}% seasonal`
      })
    } else {
      insights.push({
        id: 'seasonality',
        type: 'success',
        title: 'Revenue Pattern',
        message: `Your revenue is relatively stable month-to-month, which makes forecasting easier. Your average monthly revenue was ${formatCurrency(analysis.averageMonthlyRevenue)}.`,
        metric: 'Stable'
      })
    }

    // 2. Margin Health Insight
    const marginDiff = analysis.grossMargin - benchmarkMargin
    if (marginDiff >= 5) {
      insights.push({
        id: 'margin',
        type: 'success',
        title: 'What You Keep',
        message: `You kept ${analysis.grossMargin.toFixed(1)}% of revenue after delivery costs - that's above the typical ${benchmarkMargin}% for ${industryConfig.name}. Well done - this gives you room for investment.`,
        metric: `${analysis.grossMargin.toFixed(0)}%`
      })
    } else if (marginDiff >= -5) {
      insights.push({
        id: 'margin',
        type: 'info',
        title: 'What You Keep',
        message: `You kept ${analysis.grossMargin.toFixed(1)}% of revenue after delivery costs - that's in line with the typical ${benchmarkMargin}% for ${industryConfig.name}. Solid performance.`,
        metric: `${analysis.grossMargin.toFixed(0)}%`
      })
    } else {
      insights.push({
        id: 'margin',
        type: 'warning',
        title: 'What You Keep',
        message: `You kept ${analysis.grossMargin.toFixed(1)}% of revenue after delivery costs - that's ${Math.abs(marginDiff).toFixed(0)}% below the typical ${benchmarkMargin}% for ${industryConfig.name}. Consider reviewing your pricing or delivery costs.`,
        metric: `${analysis.grossMargin.toFixed(0)}%`
      })
    }

    // 3. Fixed Costs Insight
    const fixedCostsPerMonth = analysis.totalOpEx / 12
    const breakEvenRevenue = fixedCostsPerMonth / (analysis.grossMargin / 100)
    insights.push({
      id: 'fixed-costs',
      type: 'info',
      title: 'Running Costs',
      message: `Your monthly running costs average ${formatCurrency(fixedCostsPerMonth)}. At your current margins, you need ${formatCurrency(breakEvenRevenue)}/month in revenue just to break even before profit.`,
      metric: formatCurrency(fixedCostsPerMonth) + '/mo'
    })

    // 4. Team Cost Insight (if wages are a significant portion)
    const wagesCategory = analysis.opexByCategory.find(c =>
      c.name.toLowerCase().includes('wage') ||
      c.name.toLowerCase().includes('salary') ||
      c.name.toLowerCase().includes('payroll')
    )
    if (wagesCategory && wagesCategory.percentage > 30) {
      const teamAsPercentOfRevenue = (wagesCategory.amount / analysis.totalRevenue) * 100
      insights.push({
        id: 'team-costs',
        type: teamAsPercentOfRevenue > 40 ? 'warning' : 'info',
        title: 'Team Investment',
        message: teamAsPercentOfRevenue > 40
          ? `Team wages are ${teamAsPercentOfRevenue.toFixed(0)}% of revenue, which is on the high side. Consider reviewing utilisation or pricing to improve this ratio.`
          : `Team wages are ${teamAsPercentOfRevenue.toFixed(0)}% of revenue. This is within healthy range for ${industryConfig.name}.`,
        metric: `${teamAsPercentOfRevenue.toFixed(0)}% of rev`
      })
    }

    // 5. Net Profit Insight
    if (analysis.netMargin < 5) {
      insights.push({
        id: 'net-profit',
        type: 'warning',
        title: 'Real Profit',
        message: `You kept only ${analysis.netMargin.toFixed(1)}% as real profit. While you made ${formatCurrency(analysis.netProfit)}, there's limited buffer for unexpected costs. We should work on improving this.`,
        metric: `${analysis.netMargin.toFixed(0)}%`
      })
    } else if (analysis.netMargin >= 15) {
      insights.push({
        id: 'net-profit',
        type: 'success',
        title: 'Real Profit',
        message: `Excellent! You kept ${analysis.netMargin.toFixed(1)}% as real profit - that's ${formatCurrency(analysis.netProfit)}. Great foundation for growth investment.`,
        metric: `${analysis.netMargin.toFixed(0)}%`
      })
    } else {
      insights.push({
        id: 'net-profit',
        type: 'info',
        title: 'Real Profit',
        message: `You kept ${analysis.netMargin.toFixed(1)}% as real profit - that's ${formatCurrency(analysis.netProfit)}. Healthy, but there's room to improve through cost management or pricing.`,
        metric: `${analysis.netMargin.toFixed(0)}%`
      })
    }

    return insights
  }, [analysis, industryConfig])

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-red-500" />
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-green-500" />
    return <Minus className="w-4 h-4 text-gray-400" />
  }

  return (
    <div className="space-y-6">
      {/* CFO Header */}
      <div className="bg-gradient-to-r from-brand-navy to-brand-navy-800 rounded-xl p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-xl mb-2">What Does History Tell Us?</h3>
            <p className="text-white/80">
              {hasData
                ? `I've analysed your FY${fiscalYear - 1} data. Here's what I found that will help shape your forecast.`
                : `Connect your accounting data so I can identify patterns and give you tailored insights.`
              }
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

          {/* Quick Stats Row */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 uppercase mb-1">Revenue</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(analysis.totalRevenue)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 uppercase mb-1">What You Made</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(analysis.grossProfit)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 uppercase mb-1">Running Costs</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(analysis.totalOpEx)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 uppercase mb-1">What You Kept</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(analysis.netProfit)}</div>
            </div>
          </div>

          {/* CFO Insights - The Star of the Show */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-brand-navy" />
              Key Insights from FY{fiscalYear - 1}
            </h4>

            {cfoInsights.map((insight) => (
              <div
                key={insight.id}
                className={`rounded-xl p-5 flex items-start gap-4 ${
                  insight.type === 'success' ? 'bg-green-50 border border-green-200' :
                  insight.type === 'warning' ? 'bg-amber-50 border border-amber-200' :
                  'bg-blue-50 border border-blue-200'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  insight.type === 'success' ? 'bg-green-100' :
                  insight.type === 'warning' ? 'bg-amber-100' :
                  'bg-blue-100'
                }`}>
                  {insight.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : insight.type === 'warning' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  ) : (
                    <Info className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h5 className={`font-semibold ${
                      insight.type === 'success' ? 'text-green-900' :
                      insight.type === 'warning' ? 'text-amber-900' :
                      'text-blue-900'
                    }`}>
                      {insight.title}
                    </h5>
                    {insight.metric && (
                      <span className={`text-sm font-medium px-2 py-0.5 rounded ${
                        insight.type === 'success' ? 'bg-green-100 text-green-700' :
                        insight.type === 'warning' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {insight.metric}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${
                    insight.type === 'success' ? 'text-green-800' :
                    insight.type === 'warning' ? 'text-amber-800' :
                    'text-blue-800'
                  }`}>
                    {insight.message}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Expandable Details Section */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="font-medium text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gray-500" />
                View Detailed Breakdown
              </span>
              {showDetails ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>

            {showDetails && (
              <div className="px-5 pb-5 space-y-5 border-t border-gray-200 pt-4">
                {/* Revenue Pattern Chart */}
                <div>
                  <h5 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-brand-orange" />
                    Monthly Revenue Pattern
                  </h5>
                  <div className="relative h-32">
                    <div className="absolute inset-0 flex items-end justify-between gap-1">
                      {analysis.monthlyRevenuePattern.map((month) => {
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
                                className={`w-full max-w-[32px] rounded-t transition-all ${
                                  isAboveAvg ? 'bg-brand-orange-500' : 'bg-brand-orange-300'
                                } group-hover:bg-brand-orange`}
                                style={{ height: `${Math.max(4, heightPercent)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">
                              {month.month.split('-')[1]}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Cost Breakdown */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-gray-900 mb-3">Top Revenue Sources</h5>
                    <div className="space-y-2">
                      {analysis.revenueByCategory.slice(0, 4).map((cat) => (
                        <div key={cat.name} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 truncate">{cat.name}</span>
                          <span className="font-medium text-gray-900">{cat.percentage.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-900 mb-3">Top Running Costs</h5>
                    <div className="space-y-2">
                      {analysis.opexByCategory.slice(0, 4).map((cat) => (
                        <div key={cat.name} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 truncate flex items-center gap-1">
                            {cat.name}
                            <TrendIcon trend={cat.trend} />
                          </span>
                          <span className="font-medium text-gray-900">{formatCurrency(cat.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* How We'll Use This */}
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-brand-orange" />
              How This Shapes Your Forecast
            </h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">
                  Seasonal patterns applied to revenue distribution
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">
                  Expense ratios used as baseline for budgets
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">
                  Margin benchmarks inform profit targets
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* No Data State */
        <div className="space-y-6">
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-8">
            <div className="text-center max-w-md mx-auto">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Connect Your Data
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Import your FY{fiscalYear - 1} P&L data so I can analyse your patterns
                and give you tailored insights for your forecast.
              </p>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={onConnectXero}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors font-medium"
                >
                  <LinkIcon className="w-4 h-4" />
                  {hasXeroConnection ? 'Sync from Xero' : 'Connect Xero'}
                </button>
                <button
                  onClick={onOpenCSVImport}
                  className="flex items-center gap-2 px-5 py-2.5 text-gray-700 border border-gray-300 bg-white rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  <Upload className="w-4 h-4" />
                  Import CSV
                </button>
              </div>
            </div>
          </div>

          {/* What You're Missing */}
          <div className="bg-brand-navy/5 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-3">What You'll Get With Data</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-brand-navy mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">Seasonal revenue patterns identified</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-brand-navy mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">Margin health vs industry benchmarks</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-brand-navy mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">Fixed cost baseline calculated</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-brand-navy mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">Expense trends highlighted</span>
              </div>
            </div>
          </div>

          {/* Skip Option */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-amber-900 mb-1">Proceeding Without Data</h4>
                <p className="text-sm text-amber-800">
                  You can continue without prior year data, but your forecast will use
                  even monthly distribution instead of seasonal patterns. I recommend
                  importing at least 6 months of data for better accuracy.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
