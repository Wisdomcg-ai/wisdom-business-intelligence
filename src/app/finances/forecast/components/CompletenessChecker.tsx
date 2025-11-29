'use client'

import React from 'react'
import { CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react'
import type { FinancialForecast, PLLine } from '../types'
import { ForecastValidationService, ValidationIssue } from '../services/validation-service'

interface CompletenessCheckerProps {
  forecast: FinancialForecast
  plLines: PLLine[]
  forecastMonthKeys: string[]
  className?: string
}

export default function CompletenessChecker({
  forecast,
  plLines,
  forecastMonthKeys,
  className = ''
}: CompletenessCheckerProps) {
  const [isExpanded, setIsExpanded] = React.useState(false)

  // Calculate completeness
  const hasRevenueGoal = (forecast.revenue_goal || 0) > 0
  const hasDistributionMethod = !!forecast.revenue_distribution_method
  const hasCOGS = forecast.cogs_percentage !== undefined && forecast.cogs_percentage !== null
  const revenueLines = plLines.filter(l => l.category === 'Revenue')
  const expenseLines = plLines.filter(l =>
    l.category === 'Operating Expenses' || l.category === 'Cost of Sales'
  )

  // Count forecast months with data
  const forecastMonthsWithData = forecastMonthKeys.filter(monthKey => {
    return revenueLines.some(line =>
      line.forecast_months[monthKey] !== undefined &&
      line.forecast_months[monthKey] !== null
    )
  }).length

  const completeness = ForecastValidationService.calculateCompleteness(
    hasRevenueGoal,
    hasDistributionMethod,
    hasCOGS,
    forecastMonthsWithData,
    forecastMonthKeys.length,
    revenueLines.length > 0,
    expenseLines.length > 0
  )

  // Gather validation issues
  const issues: ValidationIssue[] = []

  if (!hasRevenueGoal) {
    issues.push({
      severity: 'error',
      field: 'revenue_goal',
      message: 'Revenue goal not set',
      suggestion: 'Go to Assumptions tab and enter your annual revenue target'
    })
  }

  if (!hasDistributionMethod) {
    issues.push({
      severity: 'warning',
      field: 'revenue_distribution_method',
      message: 'Revenue distribution method not selected',
      suggestion: 'Choose how to spread revenue across months'
    })
  }

  if (!hasCOGS) {
    issues.push({
      severity: 'warning',
      field: 'cogs_percentage',
      message: 'COGS percentage not set',
      suggestion: 'Enter your cost of sales percentage'
    })
  }

  if (revenueLines.length === 0) {
    issues.push({
      severity: 'error',
      field: 'revenue_lines',
      message: 'No revenue lines defined',
      suggestion: 'Add at least one revenue stream in the P&L Forecast tab'
    })
  }

  if (expenseLines.length === 0) {
    issues.push({
      severity: 'warning',
      field: 'expense_lines',
      message: 'No expense lines defined',
      suggestion: 'Add operating expenses to complete your forecast'
    })
  }

  if (forecastMonthsWithData < forecastMonthKeys.length) {
    const missing = forecastMonthKeys.length - forecastMonthsWithData
    issues.push({
      severity: 'warning',
      field: 'forecast_months',
      message: `${missing} month(s) missing forecast data`,
      suggestion: 'Complete all forecast months for accurate projections'
    })
  }

  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')

  const getStatusIcon = () => {
    if (errors.length > 0) {
      return <XCircle className="w-5 h-5 text-red-600" />
    }
    if (warnings.length > 0) {
      return <AlertCircle className="w-5 h-5 text-yellow-600" />
    }
    return <CheckCircle2 className="w-5 h-5 text-green-600" />
  }

  const getStatusText = () => {
    if (errors.length > 0) {
      return `${errors.length} error(s) - Cannot finalize`
    }
    if (warnings.length > 0) {
      return `${warnings.length} warning(s)`
    }
    return 'Ready to finalize'
  }

  const getStatusColor = () => {
    if (errors.length > 0) return 'border-red-200 bg-red-50'
    if (warnings.length > 0) return 'border-yellow-200 bg-yellow-50'
    return 'border-green-200 bg-green-50'
  }

  return (
    <div className={`border-2 rounded-lg ${getStatusColor()} ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div className="text-left">
            <div className="text-sm font-bold text-gray-900">
              Forecast Completeness: {completeness}%
            </div>
            <div className="text-xs text-gray-600">{getStatusText()}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress Bar */}
          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                completeness === 100 ? 'bg-green-600' :
                completeness >= 75 ? 'bg-teal-600' :
                completeness >= 50 ? 'bg-yellow-600' :
                'bg-red-600'
              }`}
              style={{ width: `${completeness}%` }}
            />
          </div>
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-600" />
          )}
        </div>
      </button>

      {/* Expanded Details */}
      {isExpanded && issues.length > 0 && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-200">
          {errors.map((issue, idx) => (
            <div key={`error-${idx}`} className="flex items-start gap-2 p-3 bg-red-100 border border-red-200 rounded-lg">
              <XCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <div className="font-semibold text-red-900">{issue.message}</div>
                {issue.suggestion && (
                  <div className="text-red-700 text-xs mt-1">{issue.suggestion}</div>
                )}
              </div>
            </div>
          ))}
          {warnings.map((issue, idx) => (
            <div key={`warning-${idx}`} className="flex items-start gap-2 p-3 bg-yellow-100 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <div className="font-semibold text-yellow-900">{issue.message}</div>
                {issue.suggestion && (
                  <div className="text-yellow-700 text-xs mt-1">{issue.suggestion}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Success State */}
      {isExpanded && issues.length === 0 && (
        <div className="px-4 pb-4 border-t border-gray-200">
          <div className="flex items-center gap-2 p-3 bg-green-100 border border-green-200 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <div className="text-sm font-medium text-green-900">
              All checks passed! Your forecast is complete and ready to finalize.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
