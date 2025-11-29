'use client'

import React, { useState, useEffect } from 'react'
import { Target, TrendingUp, DollarSign, CheckCircle2, ArrowRight, ArrowLeft, Calendar, Percent, RefreshCw, AlertCircle, Sparkles } from 'lucide-react'
import type { FinancialForecast, DistributionMethod, PLLine } from '../types'
import { GoalValidator } from '../utils/goal-validator'
import type { GoalValidationResult } from '../utils/goal-validator'
import GoalValidationModal from './GoalValidationModal'
import ForecastService from '../services/forecast-service'

interface ForecastWizardProps {
  forecast: FinancialForecast
  plLines: PLLine[]
  onSave: (data: {
    revenue_goal: number
    gross_profit_goal: number
    net_profit_goal: number
    revenue_distribution_method: DistributionMethod
    cogs_percentage: number
    opex_budget?: number
  }, options?: { isAutoSave?: boolean }) => void
  onImportFromAnnualPlan: () => void
  onApplyBulkOpExIncrease: (percentageIncrease: number) => void
  isSaving: boolean
}

type WizardStep = 1 | 2 | 3 | 4

export default function ForecastWizard({
  forecast,
  plLines,
  onSave,
  onImportFromAnnualPlan,
  onApplyBulkOpExIncrease,
  isSaving
}: ForecastWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [hasAutoImported, setHasAutoImported] = useState(false)

  // Step 1: Goals
  const [revenueGoal, setRevenueGoal] = useState(forecast.revenue_goal || 0)
  const [grossProfitGoal, setGrossProfitGoal] = useState(forecast.gross_profit_goal || 0)
  const [netProfitGoal, setNetProfitGoal] = useState(forecast.net_profit_goal || 0)

  // Step 2: Distribution - Default to seasonal pattern
  const [distributionMethod, setDistributionMethod] = useState<DistributionMethod>(
    forecast.revenue_distribution_method || 'seasonal_pattern'
  )

  // Step 3: Costs
  const [cogsPercentage, setCogsPercentage] = useState<number>(() => {
    if (forecast.cogs_percentage !== undefined && forecast.cogs_percentage !== null) {
      return forecast.cogs_percentage * 100
    }
    if (forecast.revenue_goal && forecast.gross_profit_goal) {
      const cogs = forecast.revenue_goal - forecast.gross_profit_goal
      return (cogs / forecast.revenue_goal) * 100
    }
    return 40
  })
  const [opexIncrease, setOpexIncrease] = useState<string>('5')

  // OpEx Intelligence State
  const [customOpExBudget, setCustomOpExBudget] = useState<number | null>(null)
  const [showOpExWarning, setShowOpExWarning] = useState(false)
  const [opExMode, setOpExMode] = useState<'auto' | 'fy25' | 'custom'>('auto')

  // Goal Validation State
  const [showValidationModal, setShowValidationModal] = useState(false)
  const [validationResult, setValidationResult] = useState<GoalValidationResult | null>(null)
  const [pendingGenerate, setPendingGenerate] = useState(false)

  // Calculate fiscal years
  const forecastFY = forecast.fiscal_year || new Date().getFullYear() + 1
  const actualsFY = forecastFY - 1 // Previous year is actuals

  // Calculate Prior Year Actual OpEx from plLines (e.g., FY25 actuals for FY26 forecast)
  // IMPORTANT: Only sum BASELINE months (FY25), not current year actuals (FY26 YTD)
  const fy25ActualOpEx = React.useMemo(() => {
    const opexLines = plLines.filter(l =>
      l.category === 'Operating Expenses' &&
      l.account_name !== 'Total Operating Expenses'
    )

    // Get baseline month keys from forecast
    const baselineMonths: string[] = []
    if (forecast.baseline_start_month && forecast.baseline_end_month) {
      let currentDate = new Date(forecast.baseline_start_month + '-01')
      const endDate = new Date(forecast.baseline_end_month + '-01')

      while (currentDate <= endDate) {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        baselineMonths.push(`${year}-${month.toString().padStart(2, '0')}`)
        currentDate.setMonth(currentDate.getMonth() + 1)
      }
    }

    // Sum only baseline months
    return opexLines.reduce((sum, line) => {
      const baselineTotal = baselineMonths.reduce((monthSum, monthKey) => {
        return monthSum + (line.actual_months?.[monthKey] || 0)
      }, 0)
      return sum + baselineTotal
    }, 0)
  }, [plLines, forecast.baseline_start_month, forecast.baseline_end_month])

  // Calculate implied OpEx from goals
  const impliedOpExBudget = grossProfitGoal > 0 && netProfitGoal > 0
    ? grossProfitGoal - netProfitGoal
    : 0

  // Calculate the effective OpEx budget to use
  const effectiveOpExBudget = opExMode === 'custom'
    ? (customOpExBudget || impliedOpExBudget)
    : opExMode === 'fy25'
    ? fy25ActualOpEx
    : impliedOpExBudget

  // Calculate % change from prior year
  const opexChangePercent = fy25ActualOpEx > 0
    ? ((effectiveOpExBudget - fy25ActualOpEx) / fy25ActualOpEx) * 100
    : 0

  // Check if OpEx change is significant (>20% or <-20%)
  const isSignificantOpExChange = Math.abs(opexChangePercent) > 20

  // Auto-import goals on mount if they don't exist yet
  useEffect(() => {
    const shouldAutoImport = !hasAutoImported && (!forecast.revenue_goal || forecast.revenue_goal === 0)

    if (shouldAutoImport) {
      setHasAutoImported(true)
      onImportFromAnnualPlan()
    }
  }, [hasAutoImported, forecast.revenue_goal, onImportFromAnnualPlan])

  // Sync with forecast prop changes (e.g., after import)
  useEffect(() => {
    console.log('[ForecastWizard] Syncing with forecast prop:', {
      revenue_goal: forecast.revenue_goal,
      gross_profit_goal: forecast.gross_profit_goal,
      net_profit_goal: forecast.net_profit_goal
    })

    if (forecast.revenue_goal !== undefined && forecast.revenue_goal !== null) {
      setRevenueGoal(forecast.revenue_goal)
    }
    if (forecast.gross_profit_goal !== undefined && forecast.gross_profit_goal !== null) {
      setGrossProfitGoal(forecast.gross_profit_goal)
    }
    if (forecast.net_profit_goal !== undefined && forecast.net_profit_goal !== null) {
      setNetProfitGoal(forecast.net_profit_goal)
    }
    if (forecast.revenue_distribution_method) {
      setDistributionMethod(forecast.revenue_distribution_method)
    }

    // Auto-calculate COGS % from imported goals
    if (forecast.revenue_goal && forecast.gross_profit_goal && forecast.revenue_goal > 0) {
      const cogs = forecast.revenue_goal - forecast.gross_profit_goal
      const calculatedCogsPercent = (cogs / forecast.revenue_goal) * 100
      setCogsPercentage(calculatedCogsPercent)
    } else if (forecast.cogs_percentage !== undefined && forecast.cogs_percentage !== null) {
      setCogsPercentage(forecast.cogs_percentage * 100)
    }
  }, [forecast.revenue_goal, forecast.gross_profit_goal, forecast.net_profit_goal, forecast.revenue_distribution_method, forecast.cogs_percentage])

  // Auto-save draft (debounced)
  useEffect(() => {
    const hasChanges =
      revenueGoal !== (forecast.revenue_goal || 0) ||
      grossProfitGoal !== (forecast.gross_profit_goal || 0) ||
      netProfitGoal !== (forecast.net_profit_goal || 0) ||
      cogsPercentage !== ((forecast.cogs_percentage || 0) * 100) ||
      distributionMethod !== (forecast.revenue_distribution_method || 'seasonal_pattern')

    if (!hasChanges || revenueGoal === 0) return

    const timer = setTimeout(() => {
      onSave({
        revenue_goal: revenueGoal,
        gross_profit_goal: grossProfitGoal,
        net_profit_goal: netProfitGoal,
        revenue_distribution_method: distributionMethod,
        cogs_percentage: cogsPercentage / 100,
        opex_budget: effectiveOpExBudget
      }, { isAutoSave: true })
    }, 2000)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueGoal, grossProfitGoal, netProfitGoal, cogsPercentage, distributionMethod])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Calculated values
  const cogsAmount = revenueGoal - grossProfitGoal
  const calculatedCogsPercent = revenueGoal > 0 ? (cogsAmount / revenueGoal) * 100 : 0
  const monthlyRevenue = revenueGoal / 12
  const grossMargin = revenueGoal > 0 ? (grossProfitGoal / revenueGoal) * 100 : 0

  // Warning for unrealistic profit structure
  const getProfitWarning = () => {
    if (grossProfitGoal > 0 && netProfitGoal > 0 && Math.abs(grossProfitGoal - netProfitGoal) < 100) {
      return {
        type: 'error',
        message: 'Your Gross Profit and Net Profit are the same, which assumes zero operating expenses. This is unrealistic - you need to account for rent, salaries, marketing, utilities, etc.'
      }
    }
    if (grossProfitGoal > 0 && netProfitGoal > grossProfitGoal) {
      return {
        type: 'error',
        message: 'Your Net Profit cannot be higher than your Gross Profit. Net Profit = Gross Profit - Operating Expenses.'
      }
    }
    return null
  }

  // Validation
  const isStep1Valid = revenueGoal > 0 && grossProfitGoal > 0 && netProfitGoal >= 0 && !getProfitWarning()
  const isStep2Valid = true // Always valid, has default
  const isStep3Valid = cogsPercentage >= 0 && cogsPercentage <= 100

  // Validation warnings
  const getCogsWarning = () => {
    if (cogsPercentage < 10) return { type: 'info', message: 'Very low cost of sales - is this a service business?' }
    if (cogsPercentage > 80) return { type: 'warning', message: 'High cost of sales - this leaves little for profit' }
    return null
  }

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((currentStep + 1) as WizardStep)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as WizardStep)
    }
  }

  const handleGenerate = () => {
    console.log('[ForecastWizard] Generating forecast with data:', {
      revenue_goal: revenueGoal,
      gross_profit_goal: grossProfitGoal,
      net_profit_goal: netProfitGoal,
      revenue_distribution_method: distributionMethod,
      cogs_percentage: cogsPercentage / 100,
      opex_budget: effectiveOpExBudget,
      opex_mode: opExMode
    })

    // Get month keys for validation
    const currentYearMonthKeys = ForecastService.getCurrentYearMonthKeys(
      forecast.baseline_end_month!,
      forecast.forecast_start_month!
    )
    const forecastMonthKeys = ForecastService.getForecastMonthKeys(
      forecast.forecast_start_month!,
      forecast.forecast_end_month!
    )

    // Validate goals before generating
    const validation = GoalValidator.validateGoals({
      revenueGoal,
      grossProfitGoal,
      netProfitGoal,
      plLines,
      currentYearMonthKeys,
      forecastMonthKeys
    })

    // If there are errors, show the validation modal
    if (!validation.isValid) {
      setValidationResult(validation)
      setShowValidationModal(true)
      setPendingGenerate(true)
      return
    }

    // If valid, proceed with generation
    proceedWithGeneration()
  }

  const proceedWithGeneration = () => {
    onSave({
      revenue_goal: revenueGoal,
      gross_profit_goal: grossProfitGoal,
      net_profit_goal: netProfitGoal,
      revenue_distribution_method: distributionMethod,
      cogs_percentage: cogsPercentage / 100,
      opex_budget: effectiveOpExBudget
    }, { isAutoSave: false })

    setPendingGenerate(false)
    setShowValidationModal(false)
  }

  const handleAutoAdjust = (adjustments: any) => {
    // Apply the suggested adjustments
    if (adjustments.revenueGoal !== undefined) {
      setRevenueGoal(adjustments.revenueGoal)
    }
    if (adjustments.grossProfitGoal !== undefined) {
      setGrossProfitGoal(adjustments.grossProfitGoal)
    }
    if (adjustments.netProfitGoal !== undefined) {
      setNetProfitGoal(adjustments.netProfitGoal)
    }

    // Close modal
    setShowValidationModal(false)
    setPendingGenerate(false)
  }

  const handleApplyOpEx = () => {
    const percentage = parseFloat(opexIncrease) || 0
    onApplyBulkOpExIncrease(percentage)
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1: return isStep1Valid
      case 2: return isStep2Valid
      case 3: return isStep3Valid
      case 4: return true
      default: return false
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Progress Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Build Your Financial Forecast</h1>
        <p className="text-gray-600 mb-6">Follow these simple steps to create your forecast</p>

        {/* Progress Bar - Clickable Steps */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentStep(1)}
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                currentStep >= 1
                  ? 'bg-teal-600 text-white hover:bg-teal-700'
                  : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              } cursor-pointer`}
            >
              {currentStep > 1 ? <CheckCircle2 className="w-5 h-5" /> : '1'}
            </button>
            <div className={`h-1 w-20 ${currentStep > 1 ? 'bg-teal-600' : 'bg-gray-200'}`}></div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentStep(2)}
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                currentStep >= 2
                  ? 'bg-teal-600 text-white hover:bg-teal-700'
                  : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              } cursor-pointer`}
            >
              {currentStep > 2 ? <CheckCircle2 className="w-5 h-5" /> : '2'}
            </button>
            <div className={`h-1 w-20 ${currentStep > 2 ? 'bg-teal-600' : 'bg-gray-200'}`}></div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentStep(3)}
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                currentStep >= 3
                  ? 'bg-teal-600 text-white hover:bg-teal-700'
                  : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              } cursor-pointer`}
            >
              {currentStep > 3 ? <CheckCircle2 className="w-5 h-5" /> : '3'}
            </button>
            <div className={`h-1 w-20 ${currentStep > 3 ? 'bg-teal-600' : 'bg-gray-200'}`}></div>
          </div>
          <button
            onClick={() => setCurrentStep(4)}
            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
              currentStep >= 4
                ? 'bg-teal-600 text-white hover:bg-teal-700'
                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
            } cursor-pointer`}
          >
            4
          </button>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-600">
          <button onClick={() => setCurrentStep(1)} className="hover:text-teal-600 transition-colors cursor-pointer">Goals</button>
          <button onClick={() => setCurrentStep(2)} className="hover:text-teal-600 transition-colors cursor-pointer">Distribution</button>
          <button onClick={() => setCurrentStep(3)} className="hover:text-teal-600 transition-colors cursor-pointer">Costs</button>
          <button onClick={() => setCurrentStep(4)} className="hover:text-teal-600 transition-colors cursor-pointer">Review</button>
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 min-h-[500px]">
        {/* Step 1: Set Your Goals */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                <Target className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Step 1: Set Your Goals</h2>
                <p className="text-sm text-gray-600">What do you want to achieve this year?</p>
              </div>
            </div>

            {/* Import Indicator */}
            {forecast.goal_source === 'goals_wizard' && forecast.annual_plan_id && (
              <div className="mb-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-teal-600" />
                  <span className="text-sm font-medium text-teal-900">
                    Goals imported from your Goals & Targets wizard
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-6">
              {/* Revenue Goal */}
              <div>
                <label className="block text-base font-medium text-gray-900 mb-2">
                  Revenue Goal
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Your total sales target for FY{forecast.fiscal_year}
                </p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">$</span>
                  <input
                    type="number"
                    value={revenueGoal || ''}
                    onChange={(e) => setRevenueGoal(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-4 py-3 text-xl font-semibold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="0"
                  />
                </div>
                {revenueGoal > 0 && (
                  <p className="mt-2 text-sm text-gray-600">
                    💡 That's about <strong>{formatCurrency(monthlyRevenue)}</strong> per month
                  </p>
                )}
              </div>

              {/* Gross Profit Goal */}
              <div>
                <label className="block text-base font-medium text-gray-900 mb-2">
                  Gross Profit Goal
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Revenue minus cost of goods/services sold
                </p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">$</span>
                  <input
                    type="number"
                    value={grossProfitGoal || ''}
                    onChange={(e) => setGrossProfitGoal(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-4 py-3 text-xl font-semibold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="0"
                  />
                </div>
                {grossProfitGoal > 0 && revenueGoal > 0 && (
                  <p className="mt-2 text-sm text-gray-600">
                    💡 That's a <strong>{grossMargin.toFixed(1)}%</strong> gross margin
                  </p>
                )}
              </div>

              {/* Net Profit Goal */}
              <div>
                <label className="block text-base font-medium text-gray-900 mb-2">
                  Net Profit Goal
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Your target profit after all expenses are paid
                </p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">$</span>
                  <input
                    type="number"
                    value={netProfitGoal || ''}
                    onChange={(e) => setNetProfitGoal(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-4 py-3 text-xl font-semibold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="0"
                  />
                </div>
                {revenueGoal > 0 && netProfitGoal > 0 && (
                  <p className="mt-2 text-sm text-gray-600">
                    💡 That's a <strong>{((netProfitGoal / revenueGoal) * 100).toFixed(1)}%</strong> net profit margin
                  </p>
                )}

                {/* Profit Structure Warning */}
                {getProfitWarning() && (
                  <div className="mt-3 p-4 rounded-lg bg-red-50 border-2 border-red-300">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-red-900 mb-1">
                          ⚠️ Unrealistic Profit Structure
                        </p>
                        <p className="text-sm text-red-800">
                          {getProfitWarning()!.message}
                        </p>
                        {grossProfitGoal > 0 && netProfitGoal > 0 && (
                          <p className="text-sm text-red-800 mt-2">
                            <strong>Suggested:</strong> Your Net Profit should be lower than {formatCurrency(grossProfitGoal)} to account for operating expenses like rent, salaries, and marketing.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Update from Annual Plan Option */}
              <div className="border-t pt-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <RefreshCw className="w-5 h-5 text-gray-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 mb-1">
                        Updated your Annual Plan?
                      </p>
                      <p className="text-xs text-gray-600 mb-3">
                        Refresh your goals from the Goals & Targets wizard
                      </p>
                      <button
                        onClick={onImportFromAnnualPlan}
                        className="text-sm font-medium text-teal-600 hover:text-teal-700"
                      >
                        Update from Annual Plan →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Revenue Distribution */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Step 2: How Should Revenue Flow?</h2>
                <p className="text-sm text-gray-600">Choose how to spread your revenue across the year</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Seasonal Pattern Option */}
              <button
                onClick={() => setDistributionMethod('seasonal_pattern')}
                className={`w-full text-left p-5 rounded-lg border-2 transition-all ${
                  distributionMethod === 'seasonal_pattern'
                    ? 'border-green-500 bg-green-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-5 h-5 text-gray-600" />
                      <h3 className="font-semibold text-gray-900">Follow seasonal pattern</h3>
                      <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded">RECOMMENDED</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Use your historical monthly pattern from FY{forecast.fiscal_year - 1}, scaled to your new target
                    </p>
                  </div>
                  {distributionMethod === 'seasonal_pattern' && (
                    <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 ml-3" />
                  )}
                </div>
              </button>

              {/* Even Split Option */}
              <button
                onClick={() => setDistributionMethod('even')}
                className={`w-full text-left p-5 rounded-lg border-2 transition-all ${
                  distributionMethod === 'even'
                    ? 'border-green-500 bg-green-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-5 h-5 text-gray-600" />
                      <h3 className="font-semibold text-gray-900">Same amount each month</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      Perfect for steady businesses or if you're not sure about seasonal patterns
                    </p>
                    {revenueGoal > 0 && (
                      <p className="text-sm font-medium text-gray-900">
                        = {formatCurrency(monthlyRevenue)} every month
                      </p>
                    )}
                  </div>
                  {distributionMethod === 'even' && (
                    <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 ml-3" />
                  )}
                </div>
              </button>

              {/* Custom Option */}
              <button
                onClick={() => setDistributionMethod('custom')}
                className={`w-full text-left p-5 rounded-lg border-2 transition-all ${
                  distributionMethod === 'custom'
                    ? 'border-green-500 bg-green-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-5 h-5 text-gray-600" />
                      <h3 className="font-semibold text-gray-900">I'll set it manually</h3>
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">ADVANCED</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Set specific amounts for each month in the P&L table
                    </p>
                  </div>
                  {distributionMethod === 'custom' && (
                    <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 ml-3" />
                  )}
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Cost Assumptions */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Percent className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Step 3: Your Costs</h2>
                <p className="text-sm text-gray-600">Help us understand your expenses</p>
              </div>
            </div>

            <div className="space-y-8">
              {/* COGS Percentage */}
              <div>
                <label className="block text-base font-medium text-gray-900 mb-2">
                  What percentage of revenue goes to producing your product or service?
                </label>
                <p className="text-sm text-gray-600 mb-4">
                  This is your Cost of Sales (COGS) - materials, direct labor, etc.
                </p>

                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl font-bold text-gray-900">{cogsPercentage.toFixed(0)}%</span>
                    <span className="text-sm text-gray-600">of revenue</span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={cogsPercentage}
                    onChange={(e) => setCogsPercentage(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  />

                  <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>

                  {revenueGoal > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Cost of Sales:</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(cogsAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Gross Profit:</span>
                        <span className="font-semibold text-green-600">{formatCurrency(grossProfitGoal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Gross Margin:</span>
                        <span className="font-semibold text-gray-900">{grossMargin.toFixed(1)}%</span>
                      </div>
                    </div>
                  )}

                  {getCogsWarning() && (
                    <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 ${
                      getCogsWarning()!.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' : 'bg-teal-50 border border-teal-200'
                    }`}>
                      <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        getCogsWarning()!.type === 'warning' ? 'text-yellow-600' : 'text-teal-600'
                      }`} />
                      <p className={`text-xs ${
                        getCogsWarning()!.type === 'warning' ? 'text-yellow-800' : 'text-teal-800'
                      }`}>
                        {getCogsWarning()!.message}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* OpEx Intelligence Section */}
              <div>
                <label className="block text-base font-medium text-gray-900 mb-2">
                  Operating Expenses Budget
                </label>
                <p className="text-sm text-gray-600 mb-4">
                  Based on your goals, let's determine your operating expenses budget
                </p>

                <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                  {/* OpEx Comparison */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-xs text-gray-600 mb-1">FY{actualsFY} Actual</div>
                      <div className="text-lg font-bold text-gray-900">{formatCurrency(fy25ActualOpEx)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-600 mb-1">Implied by Goals</div>
                      <div className="text-lg font-bold text-teal-600">{formatCurrency(impliedOpExBudget)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-600 mb-1">Change</div>
                      <div className={`text-lg font-bold ${opexChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {opexChangePercent >= 0 ? '+' : ''}{opexChangePercent.toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* Warning for significant changes */}
                  {isSignificantOpExChange && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-yellow-900 mb-2">
                            ⚠️ Significant OpEx Change Detected
                          </h4>
                          <p className="text-xs text-yellow-800 mb-3">
                            Your goals imply OpEx of {formatCurrency(impliedOpExBudget)}, but FY{actualsFY} actual was {formatCurrency(fy25ActualOpEx)}
                            ({opexChangePercent >= 0 ? 'increase' : 'decrease'} of {Math.abs(opexChangePercent).toFixed(0)}%).
                            {opexChangePercent < -20 && ' This is a significant cost reduction. '}
                            {opexChangePercent > 20 && ' This is a significant cost increase. '}
                            Which approach would you like to use?
                          </p>

                          {/* OpEx Mode Options */}
                          <div className="space-y-2">
                            <button
                              onClick={() => setOpExMode('auto')}
                              className={`w-full text-left px-3 py-2 rounded-lg border-2 transition-all ${
                                opExMode === 'auto'
                                  ? 'border-teal-500 bg-teal-50 text-teal-900'
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm font-semibold">Use Goal-Based OpEx ({formatCurrency(impliedOpExBudget)})</div>
                                  <div className="text-xs opacity-75">Hit your net profit target of {formatCurrency(netProfitGoal)}</div>
                                </div>
                                {opExMode === 'auto' && <CheckCircle2 className="w-5 h-5 text-teal-600" />}
                              </div>
                            </button>

                            <button
                              onClick={() => setOpExMode('fy25')}
                              className={`w-full text-left px-3 py-2 rounded-lg border-2 transition-all ${
                                opExMode === 'fy25'
                                  ? 'border-teal-500 bg-teal-50 text-teal-900'
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm font-semibold">Use FY{actualsFY} Baseline ({formatCurrency(fy25ActualOpEx)})</div>
                                  <div className="text-xs opacity-75">Keep spending at historical levels, adjust profit goal</div>
                                </div>
                                {opExMode === 'fy25' && <CheckCircle2 className="w-5 h-5 text-teal-600" />}
                              </div>
                            </button>

                            <button
                              onClick={() => setOpExMode('custom')}
                              className={`w-full text-left px-3 py-2 rounded-lg border-2 transition-all ${
                                opExMode === 'custom'
                                  ? 'border-teal-500 bg-teal-50 text-teal-900'
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="text-sm font-semibold">Custom OpEx Budget</div>
                                  {opExMode === 'custom' && (
                                    <input
                                      type="number"
                                      value={customOpExBudget || impliedOpExBudget}
                                      onChange={(e) => setCustomOpExBudget(parseFloat(e.target.value) || 0)}
                                      className="mt-2 w-full px-3 py-2 border border-gray-300 rounded text-sm"
                                      placeholder="Enter amount"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  )}
                                </div>
                                {opExMode === 'custom' && <CheckCircle2 className="w-5 h-5 text-teal-600" />}
                              </div>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Summary of effective OpEx budget */}
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">OpEx Budget for FY{forecast.fiscal_year}:</span>
                      <span className="text-xl font-bold text-gray-900">{formatCurrency(effectiveOpExBudget)}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      This will be distributed across your operating expense lines based on FY{actualsFY} spending patterns
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review & Generate */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Step 4: Review Your Forecast</h2>
                <p className="text-sm text-gray-600">Everything look good? Let's build it!</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Summary Card */}
              <div className="bg-gradient-to-br from-teal-50 to-teal-50 rounded-lg p-6 border border-teal-200">
                <h3 className="font-semibold text-gray-900 mb-4">Your Forecast Summary</h3>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">Annual Revenue Target:</span>
                    <span className="text-lg font-bold text-gray-900">{formatCurrency(revenueGoal)}</span>
                  </div>

                  <div className="flex justify-between items-center pl-4 border-l-2 border-gray-300">
                    <span className="text-sm text-gray-600">Monthly Average:</span>
                    <span className="text-sm font-semibold text-gray-700">{formatCurrency(monthlyRevenue)}</span>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-teal-200">
                    <span className="text-sm text-gray-700">Cost of Sales ({calculatedCogsPercent.toFixed(0)}%):</span>
                    <span className="text-lg font-semibold text-gray-900">{formatCurrency(cogsAmount)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">Gross Profit ({grossMargin.toFixed(1)}% margin):</span>
                    <span className="text-lg font-bold text-green-600">{formatCurrency(grossProfitGoal)}</span>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-teal-200">
                    <span className="text-sm text-gray-700">Target Net Profit:</span>
                    <span className="text-lg font-bold text-teal-600">{formatCurrency(netProfitGoal)}</span>
                  </div>

                  <div className="pt-3 border-t border-teal-200 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Revenue Distribution:</span>
                      <span className="font-medium text-gray-900">
                        {distributionMethod === 'even' && 'Even split across months'}
                        {distributionMethod === 'seasonal_pattern' && 'Seasonal pattern'}
                        {distributionMethod === 'custom' && 'Custom (set manually)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">OpEx Annual Increase:</span>
                      <span className="font-medium text-gray-900">{opexIncrease}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* What Happens Next */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3">What happens next?</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">We'll create your Revenue and COGS forecast</p>
                      <p className="text-xs text-gray-600">Based on your distribution method and cost percentage</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Apply your OpEx pattern</p>
                      <p className="text-xs text-gray-600">We'll set up Operating Expenses with your {opexIncrease}% increase</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Review and customize</p>
                      <p className="text-xs text-gray-600">Fine-tune individual lines in the P&L Forecast tab</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <div className="pt-4">
                <button
                  onClick={handleGenerate}
                  disabled={isSaving || !isStep1Valid || !isStep3Valid}
                  className="w-full py-4 bg-gradient-to-r from-teal-600 to-teal-700 text-white text-lg font-semibold rounded-lg hover:from-teal-700 hover:to-teal-800 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Building Your Forecast...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Build My Forecast
                    </>
                  )}
                </button>

                {/* Apply OpEx Button */}
                <button
                  onClick={handleApplyOpEx}
                  disabled={isSaving}
                  className="w-full mt-3 py-3 bg-white border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Or Apply OpEx Pattern Only
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={handleBack}
          disabled={currentStep === 1}
          className="flex items-center gap-2 px-6 py-3 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-sm text-gray-600">
          Step {currentStep} of 4
        </div>

        {currentStep < 4 && (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        )}

        {currentStep === 4 && (
          <div className="w-24"></div>
        )}
      </div>

      {/* Auto-save indicator */}
      {!isSaving && revenueGoal > 0 && (
        <div className="text-center mt-4">
          <p className="text-xs text-gray-500">✓ Draft saved automatically</p>
        </div>
      )}

      {/* Goal Validation Modal */}
      {validationResult && (
        <GoalValidationModal
          isOpen={showValidationModal}
          onClose={() => {
            setShowValidationModal(false)
            setPendingGenerate(false)
          }}
          validationResult={validationResult}
          onAutoAdjust={handleAutoAdjust}
          onGenerateAnyway={proceedWithGeneration}
        />
      )}
    </div>
  )
}
