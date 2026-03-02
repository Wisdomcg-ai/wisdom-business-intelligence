'use client'

import React, { useState, useEffect } from 'react'
import {
  FileCheck,
  Check,
  AlertTriangle,
  AlertCircle,
  Info,
  DollarSign,
  Users,
  TrendingUp,
  Target,
  Loader2
} from 'lucide-react'
import type {
  WizardContext,
  ValidationConcern,
  ForecastSummary,
  XeroEmployee,
  ForecastInvestment,
  BusinessGoals
} from '../../types'

interface ReviewStepProps {
  context: WizardContext
  team: XeroEmployee[]
  investments: ForecastInvestment[]
  goals: BusinessGoals | null
  onComplete: () => void
  onFlagForReview: () => void
  isCompleting: boolean
}

export default function ReviewStep({
  context,
  team,
  investments,
  goals,
  onComplete,
  onFlagForReview,
  isCompleting
}: ReviewStepProps) {
  const [concerns, setConcerns] = useState<ValidationConcern[]>([])
  const [summary, setSummary] = useState<ForecastSummary | null>(null)
  const [isValidating, setIsValidating] = useState(true)

  // Calculate summary
  useEffect(() => {
    const calculateSummary = () => {
      const revenueTarget = goals?.revenue_target || 0
      const teamCosts = team.reduce((sum, emp) => sum + (emp.annual_salary || 0) * 1.12, 0)
      const investmentTotal = investments.reduce((sum, inv) => sum + (inv.amount || 0), 0)
      const operationsCosts = revenueTarget * 0.15 // Estimate

      const totalCosts = teamCosts + operationsCosts + investmentTotal
      const grossProfit = goals?.gross_profit_target || (revenueTarget * 0.7)
      const netProfit = goals?.profit_target || (grossProfit - totalCosts)
      const netMargin = revenueTarget > 0 ? (netProfit / revenueTarget) * 100 : 0

      setSummary({
        revenue: { year1: revenueTarget },
        costs: {
          team: teamCosts,
          operations: operationsCosts,
          investments: investmentTotal,
          total: totalCosts
        },
        profit: {
          gross: grossProfit,
          net: netProfit,
          margin: netMargin
        },
        headcount: {
          current: team.filter(e => e.from_xero).length,
          planned: team.filter(e => !e.from_xero).length,
          endOfYear: team.length
        },
        keyDecisions: context.decisions_made?.slice(-5).map(d =>
          `${d.decision_type}: ${JSON.stringify(d.decision_data).substring(0, 50)}`
        ) || []
      })
    }

    const validate = () => {
      const newConcerns: ValidationConcern[] = []

      // Check revenue target
      if (!goals?.revenue_target) {
        newConcerns.push({
          severity: 'error',
          category: 'Goals',
          message: 'No revenue target set',
          suggestion: 'Set a revenue target in the Setup step'
        })
      }

      // Check team costs vs revenue
      const teamTotal = team.reduce((sum, emp) => sum + (emp.annual_salary || 0) * 1.12, 0)
      const revenueTarget = goals?.revenue_target || 0
      const teamCostRatio = revenueTarget > 0 ? (teamTotal / revenueTarget) * 100 : 0

      if (teamCostRatio > 60) {
        newConcerns.push({
          severity: 'warning',
          category: 'Team Costs',
          message: `Team costs are ${teamCostRatio.toFixed(1)}% of revenue target`,
          suggestion: 'Consider if revenue target is achievable or reduce team costs'
        })
      }

      // Check for unclassified team members
      const unclassified = team.filter(emp => !emp.classification)
      if (unclassified.length > 0) {
        newConcerns.push({
          severity: 'warning',
          category: 'Team',
          message: `${unclassified.length} team member(s) without classification`,
          suggestion: 'Classify all team members for accurate cost categorization'
        })
      }

      // Check profit margin
      const profitTarget = goals?.profit_target || 0
      const profitMargin = revenueTarget > 0 ? (profitTarget / revenueTarget) * 100 : 0

      if (profitMargin < 5 && revenueTarget > 0) {
        newConcerns.push({
          severity: 'warning',
          category: 'Profitability',
          message: `Net profit margin is only ${profitMargin.toFixed(1)}%`,
          suggestion: 'Consider increasing prices or reducing costs'
        })
      }

      if (profitMargin > 40) {
        newConcerns.push({
          severity: 'info',
          category: 'Profitability',
          message: `Net profit margin of ${profitMargin.toFixed(1)}% is very high`,
          suggestion: 'Verify this is realistic or if costs are underestimated'
        })
      }

      setConcerns(newConcerns)
      setIsValidating(false)
    }

    calculateSummary()
    validate()
  }, [goals, team, investments, context.decisions_made])

  const hasErrors = concerns.some(c => c.severity === 'error')
  const hasWarnings = concerns.some(c => c.severity === 'warning')

  const getSeverityIcon = (severity: ValidationConcern['severity']) => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />
    }
  }

  const getSeverityClass = (severity: ValidationConcern['severity']) => {
    switch (severity) {
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200'
      case 'info':
        return 'bg-blue-50 border-blue-200'
    }
  }

  if (isValidating) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Validating your forecast...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Validation Status */}
      <div className={`rounded-xl p-6 border ${
        hasErrors ? 'bg-red-50 border-red-200' :
        hasWarnings ? 'bg-yellow-50 border-yellow-200' :
        'bg-green-50 border-green-200'
      }`}>
        <div className="flex items-center gap-4">
          {hasErrors ? (
            <AlertCircle className="w-8 h-8 text-red-500" />
          ) : hasWarnings ? (
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
          ) : (
            <Check className="w-8 h-8 text-green-500" />
          )}
          <div>
            <h3 className={`text-lg font-semibold ${
              hasErrors ? 'text-red-900' :
              hasWarnings ? 'text-yellow-900' :
              'text-green-900'
            }`}>
              {hasErrors ? 'Issues Found' :
               hasWarnings ? 'Warnings to Review' :
               'Looking Good!'}
            </h3>
            <p className={`text-sm ${
              hasErrors ? 'text-red-700' :
              hasWarnings ? 'text-yellow-700' :
              'text-green-700'
            }`}>
              {hasErrors ? 'Please fix the errors before completing' :
               hasWarnings ? 'Review the warnings below, but you can still proceed' :
               'Your forecast is ready to finalize'}
            </p>
          </div>
        </div>
      </div>

      {/* Concerns List */}
      {concerns.length > 0 && (
        <div className="space-y-3">
          {concerns.map((concern, index) => (
            <div
              key={index}
              className={`rounded-lg p-4 border ${getSeverityClass(concern.severity)}`}
            >
              <div className="flex items-start gap-3">
                {getSeverityIcon(concern.severity)}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase">
                      {concern.category}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{concern.message}</p>
                  {concern.suggestion && (
                    <p className="text-sm text-gray-600 mt-1">{concern.suggestion}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4">
          {/* Revenue */}
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-brand-orange-100 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-brand-orange" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Revenue Target</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${summary.revenue.year1.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Profit */}
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Net Profit</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${summary.profit.net.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">{summary.profit.margin.toFixed(1)}% margin</p>
              </div>
            </div>
          </div>

          {/* Team */}
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Team</p>
                <p className="text-2xl font-bold text-gray-900">
                  {summary.headcount.endOfYear} people
                </p>
                <p className="text-xs text-gray-500">
                  ${summary.costs.team.toLocaleString()} total cost
                </p>
              </div>
            </div>
          </div>

          {/* Investments */}
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Investments</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${summary.costs.investments.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">{investments.length} planned</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <button
          onClick={onFlagForReview}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
        >
          Flag for Coach Review
        </button>

        <button
          onClick={onComplete}
          disabled={hasErrors || isCompleting}
          className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCompleting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Completing...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Complete Forecast
            </>
          )}
        </button>
      </div>
    </div>
  )
}
