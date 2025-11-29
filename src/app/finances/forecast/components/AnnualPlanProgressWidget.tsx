'use client'

import React, { useState, useEffect } from 'react'
import { Target, TrendingUp, Calendar, ExternalLink, AlertCircle } from 'lucide-react'
import type { FinancialForecast } from '../types'
import { formatCurrency } from '../utils/currency'

interface AnnualPlanProgressWidgetProps {
  forecast: FinancialForecast
  className?: string
}

interface ProgressData {
  ytdRevenue: number
  ytdGrossProfit: number
  ytdNetProfit: number
  annualRevenueGoal: number
  annualGrossProfitGoal: number
  annualNetProfitGoal: number
  monthsElapsed: number
  totalMonths: number
}

export default function AnnualPlanProgressWidget({
  forecast,
  className = ''
}: AnnualPlanProgressWidgetProps) {
  const [progressData, setProgressData] = useState<ProgressData | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    calculateProgress()
  }, [forecast])

  const calculateProgress = () => {
    if (!forecast) return

    // Calculate which month we're in
    const now = new Date()
    const forecastStart = new Date(forecast.forecast_start_month)
    const forecastEnd = new Date(forecast.forecast_end_month)

    // Calculate months elapsed in the forecast period
    const monthsElapsed = Math.max(0,
      (now.getFullYear() - forecastStart.getFullYear()) * 12 +
      (now.getMonth() - forecastStart.getMonth())
    )

    // Total months in forecast
    const totalMonths =
      (forecastEnd.getFullYear() - forecastStart.getFullYear()) * 12 +
      (forecastEnd.getMonth() - forecastStart.getMonth()) + 1

    // For now, we'll use simple linear projection
    // In a real implementation, you'd sum up actual revenue from P&L lines
    const expectedPercentage = Math.min(monthsElapsed / totalMonths, 1)

    setProgressData({
      ytdRevenue: 0, // TODO: Sum from actual P&L data
      ytdGrossProfit: 0, // TODO: Calculate from P&L
      ytdNetProfit: 0, // TODO: Calculate from P&L
      annualRevenueGoal: forecast.revenue_goal || 0,
      annualGrossProfitGoal: forecast.gross_profit_goal || 0,
      annualNetProfitGoal: forecast.net_profit_goal || 0,
      monthsElapsed,
      totalMonths
    })
  }

  if (!forecast.annual_plan_id || !progressData) {
    return null
  }

  const monthsElapsedPercent = Math.round((progressData.monthsElapsed / progressData.totalMonths) * 100)

  // Calculate progress percentages
  const revenueProgress = progressData.annualRevenueGoal > 0
    ? Math.round((progressData.ytdRevenue / progressData.annualRevenueGoal) * 100)
    : 0

  const gpProgress = progressData.annualGrossProfitGoal > 0
    ? Math.round((progressData.ytdGrossProfit / progressData.annualGrossProfitGoal) * 100)
    : 0

  const npProgress = progressData.annualNetProfitGoal > 0
    ? Math.round((progressData.ytdNetProfit / progressData.annualNetProfitGoal) * 100)
    : 0

  // Determine status color based on progress vs time elapsed
  const getStatusColor = (progress: number, timeElapsed: number) => {
    if (progress >= timeElapsed) return 'text-green-600 bg-green-50 border-green-200'
    if (progress >= timeElapsed * 0.8) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  const getStatusText = (progress: number, timeElapsed: number) => {
    if (progress >= timeElapsed) return 'On Track'
    if (progress >= timeElapsed * 0.8) return 'Slightly Behind'
    return 'Needs Attention'
  }

  return (
    <div className={`border-2 border-teal-200 rounded-lg bg-gradient-to-br from-teal-50 to-teal-50 ${className}`}>
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-teal-100/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Annual Plan Progress</h3>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="w-3 h-3 text-gray-500" />
                <span className="text-xs text-gray-600">
                  {progressData.monthsElapsed} of {progressData.totalMonths} months ({monthsElapsedPercent}%)
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/goals"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
            >
              <span>View Plan</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-teal-200 p-4 space-y-4">
          {/* Revenue Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Revenue</span>
              <span className="text-xs text-gray-500">
                {formatCurrency(progressData.ytdRevenue, forecast.currency || 'AUD')} / {formatCurrency(progressData.annualRevenueGoal, forecast.currency || 'AUD')}
              </span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-600 transition-all duration-500"
                style={{ width: `${Math.min(revenueProgress, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs font-semibold text-teal-900">{revenueProgress}% Complete</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getStatusColor(revenueProgress, monthsElapsedPercent)}`}>
                {getStatusText(revenueProgress, monthsElapsedPercent)}
              </span>
            </div>
          </div>

          {/* Gross Profit Progress */}
          {progressData.annualGrossProfitGoal > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Gross Profit</span>
                <span className="text-xs text-gray-500">
                  {formatCurrency(progressData.ytdGrossProfit, forecast.currency || 'AUD')} / {formatCurrency(progressData.annualGrossProfitGoal, forecast.currency || 'AUD')}
                </span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 transition-all duration-500"
                  style={{ width: `${Math.min(gpProgress, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs font-semibold text-green-900">{gpProgress}% Complete</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getStatusColor(gpProgress, monthsElapsedPercent)}`}>
                  {getStatusText(gpProgress, monthsElapsedPercent)}
                </span>
              </div>
            </div>
          )}

          {/* Net Profit Progress */}
          {progressData.annualNetProfitGoal > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Net Profit</span>
                <span className="text-xs text-gray-500">
                  {formatCurrency(progressData.ytdNetProfit, forecast.currency || 'AUD')} / {formatCurrency(progressData.annualNetProfitGoal, forecast.currency || 'AUD')}
                </span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all duration-500"
                  style={{ width: `${Math.min(npProgress, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs font-semibold text-purple-900">{npProgress}% Complete</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getStatusColor(npProgress, monthsElapsedPercent)}`}>
                  {getStatusText(npProgress, monthsElapsedPercent)}
                </span>
              </div>
            </div>
          )}

          {/* Note about actuals */}
          <div className="flex items-start gap-2 p-3 bg-teal-100 border border-teal-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-teal-800">
              <strong>Note:</strong> YTD actuals will be calculated from your P&L data once you add revenue and expense lines.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
