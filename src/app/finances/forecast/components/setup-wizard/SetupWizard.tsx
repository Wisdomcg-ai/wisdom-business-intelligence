'use client'

import React, { useState, useCallback, useMemo } from 'react'
import {
  Target,
  BarChart3,
  Users,
  Wallet,
  TrendingUp,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  X
} from 'lucide-react'
import type { FinancialForecast, PLLine, XeroConnection, DistributionMethod } from '../../types'
import type { SetupWizardData, WizardStep } from './types'
import { calculatePriorYearAnalysis } from './prior-year-analysis'

// Step components
import Step1ReviewGoals from './steps/Step1ReviewGoals'
import Step2PriorYearAnalysis from './steps/Step2PriorYearAnalysis'
import Step3TeamPlanning from './steps/Step3TeamPlanning'
import Step4OperatingCosts from './steps/Step4OperatingCosts'
import Step5StrategicInvestments from './steps/Step5StrategicInvestments'
import Step6ReviewGenerate from './steps/Step6ReviewGenerate'

interface SetupWizardProps {
  isOpen: boolean
  onClose: () => void
  forecast: FinancialForecast
  plLines: PLLine[]
  xeroConnection: XeroConnection | null
  businessIndustry?: string
  businessId?: string
  onImportFromAnnualPlan: () => Promise<void>
  onOpenCSVImport: () => void
  onConnectXero: () => void
  onGenerateForecast: (data: {
    revenueGoal: number
    grossProfitGoal: number
    netProfitGoal: number
    distributionMethod: DistributionMethod
    cogsPercentage: number
    teamMembers: any[]
    opexCategories: any[]
    fiveWaysData?: {
      leads: { current: number; target: number }
      conversionRate: { current: number; target: number }
      transactions: { current: number; target: number }
      avgSaleValue: { current: number; target: number }
      margin: { current: number; target: number }
      calculatedRevenue: number
      calculatedGrossProfit: number
      industryId?: string
    }
  }) => Promise<void>
}

const STEPS: { id: WizardStep; title: string; subtitle: string; icon: React.ElementType }[] = [
  { id: 'goals', title: 'Your Plan', subtitle: 'Confirm targets', icon: Target },
  { id: 'prior-year', title: 'History', subtitle: 'Analyse patterns', icon: BarChart3 },
  { id: 'team', title: 'Team', subtitle: 'People costs', icon: Users },
  { id: 'opex', title: 'Running Costs', subtitle: 'Daily expenses', icon: Wallet },
  { id: 'investments', title: 'Big Projects', subtitle: 'One-off spend', icon: TrendingUp },
  { id: 'review', title: 'Reality Check', subtitle: 'Generate forecast', icon: Sparkles }
]

export default function SetupWizard({
  isOpen,
  onClose,
  forecast,
  plLines,
  xeroConnection,
  businessIndustry,
  businessId,
  onImportFromAnnualPlan,
  onOpenCSVImport,
  onConnectXero,
  onGenerateForecast
}: SetupWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isImporting, setIsImporting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  // Calculate baseline month keys for prior year analysis
  const baselineMonthKeys = useMemo(() => {
    if (!forecast.baseline_start_month || !forecast.baseline_end_month) {
      return []
    }

    const keys: string[] = []
    const [startYear, startMonth] = forecast.baseline_start_month.split('-').map(Number)
    const [endYear, endMonth] = forecast.baseline_end_month.split('-').map(Number)

    let year = startYear
    let month = startMonth

    while (year < endYear || (year === endYear && month <= endMonth)) {
      keys.push(`${year}-${String(month).padStart(2, '0')}`)
      month++
      if (month > 12) {
        month = 1
        year++
      }
    }

    return keys
  }, [forecast.baseline_start_month, forecast.baseline_end_month])

  // Calculate prior year analysis from P&L lines
  const priorYearAnalysis = useMemo(() => {
    if (plLines.length === 0 || baselineMonthKeys.length === 0) return null
    return calculatePriorYearAnalysis(plLines, baselineMonthKeys)
  }, [plLines, baselineMonthKeys])

  // Initialize wizard data from forecast
  const [wizardData, setWizardData] = useState<SetupWizardData>(() => ({
    revenueGoal: forecast.revenue_goal || 0,
    grossProfitGoal: forecast.gross_profit_goal || 0,
    netProfitGoal: forecast.net_profit_goal || 0,
    goalsSource: forecast.goal_source === 'goals_wizard' ? 'goals_wizard' : 'manual',
    goalsLastUpdated: forecast.updated_at,

    priorYearAnalysis: priorYearAnalysis || undefined,
    hasActualData: plLines.some(l => Object.keys(l.actual_months || {}).length > 0),
    dataSource: xeroConnection ? 'xero' : plLines.length > 0 ? 'csv' : 'none',

    teamMembers: [],
    totalWagesCOGS: 0,
    totalWagesOpEx: 0,

    opexCategories: [],
    totalOpExForecast: 0,

    strategicInvestments: [],
    totalInvestmentCost: 0,

    fiveWaysData: undefined,
    industryId: businessIndustry || 'other',

    distributionMethod: forecast.revenue_distribution_method || 'even',
    cogsPercentage: forecast.cogs_percentage
      ? forecast.cogs_percentage * 100
      : forecast.revenue_goal && forecast.gross_profit_goal
        ? ((forecast.revenue_goal - forecast.gross_profit_goal) / forecast.revenue_goal) * 100
        : 40
  }))

  // Update wizard data when prior year analysis is calculated
  React.useEffect(() => {
    if (priorYearAnalysis) {
      setWizardData(prev => ({
        ...prev,
        priorYearAnalysis,
        hasActualData: true
      }))
    }
  }, [priorYearAnalysis])

  // Update handler
  const handleUpdate = useCallback((updates: Partial<SetupWizardData>) => {
    setWizardData(prev => ({ ...prev, ...updates }))
  }, [])

  // Import from annual plan handler
  const handleImportFromAnnualPlan = useCallback(async () => {
    setIsImporting(true)
    try {
      await onImportFromAnnualPlan()
      // After import, the forecast prop should be updated
      // We'll update our local state when the forecast changes
      setWizardData(prev => ({
        ...prev,
        revenueGoal: forecast.revenue_goal || prev.revenueGoal,
        grossProfitGoal: forecast.gross_profit_goal || prev.grossProfitGoal,
        netProfitGoal: forecast.net_profit_goal || prev.netProfitGoal,
        goalsSource: 'goals_wizard'
      }))
    } finally {
      setIsImporting(false)
    }
  }, [onImportFromAnnualPlan, forecast])

  // Generate forecast handler
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    try {
      // Prepare 5 Ways data for saving
      const fiveWaysForSave = wizardData.fiveWaysData ? {
        leads: { current: wizardData.fiveWaysData.leads.current, target: wizardData.fiveWaysData.leads.target },
        conversionRate: { current: wizardData.fiveWaysData.conversionRate.current, target: wizardData.fiveWaysData.conversionRate.target },
        transactions: { current: wizardData.fiveWaysData.transactions.current, target: wizardData.fiveWaysData.transactions.target },
        avgSaleValue: { current: wizardData.fiveWaysData.avgSaleValue.current, target: wizardData.fiveWaysData.avgSaleValue.target },
        margin: { current: wizardData.fiveWaysData.margin.current, target: wizardData.fiveWaysData.margin.target },
        calculatedRevenue: wizardData.fiveWaysData.calculatedRevenue,
        calculatedGrossProfit: wizardData.fiveWaysData.calculatedGrossProfit,
        industryId: wizardData.industryId
      } : undefined

      await onGenerateForecast({
        revenueGoal: wizardData.revenueGoal,
        grossProfitGoal: wizardData.grossProfitGoal,
        netProfitGoal: wizardData.netProfitGoal,
        distributionMethod: wizardData.distributionMethod,
        cogsPercentage: wizardData.cogsPercentage / 100,
        teamMembers: wizardData.teamMembers,
        opexCategories: wizardData.opexCategories,
        fiveWaysData: fiveWaysForSave
      })
      onClose()
    } catch (error) {
      console.error('Error generating forecast:', error)
    } finally {
      setIsGenerating(false)
    }
  }, [wizardData, onGenerateForecast, onClose])

  // Navigation
  const canGoBack = currentStepIndex > 0
  const canGoForward = currentStepIndex < STEPS.length - 1
  const currentStep = STEPS[currentStepIndex]

  const goBack = () => {
    if (canGoBack) setCurrentStepIndex(prev => prev - 1)
  }

  const goForward = () => {
    if (canGoForward) setCurrentStepIndex(prev => prev + 1)
  }

  const goToStep = (index: number) => {
    setCurrentStepIndex(index)
  }

  // Render current step content
  const renderStepContent = () => {
    switch (currentStep.id) {
      case 'goals':
        return (
          <Step1ReviewGoals
            data={wizardData}
            onUpdate={handleUpdate}
            onImportFromGoalsWizard={handleImportFromAnnualPlan}
            isImporting={isImporting}
            fiscalYear={forecast.fiscal_year}
          />
        )
      case 'prior-year':
        return (
          <Step2PriorYearAnalysis
            data={wizardData}
            onUpdate={handleUpdate}
            onOpenCSVImport={onOpenCSVImport}
            onConnectXero={onConnectXero}
            hasXeroConnection={!!xeroConnection}
            fiscalYear={forecast.fiscal_year}
          />
        )
      case 'team':
        return (
          <Step3TeamPlanning
            data={wizardData}
            onUpdate={handleUpdate}
            fiscalYear={forecast.fiscal_year}
            businessId={businessId}
          />
        )
      case 'opex':
        return (
          <Step4OperatingCosts
            data={wizardData}
            onUpdate={handleUpdate}
            fiscalYear={forecast.fiscal_year}
          />
        )
      case 'investments':
        return (
          <Step5StrategicInvestments
            data={wizardData}
            onUpdate={handleUpdate}
            fiscalYear={forecast.fiscal_year}
            businessId={businessId}
          />
        )
      case 'review':
        return (
          <Step6ReviewGenerate
            data={wizardData}
            onUpdate={handleUpdate}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            fiscalYear={forecast.fiscal_year}
          />
        )
      default:
        return null
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              FY{forecast.fiscal_year} Forecast Setup
            </h2>
            <p className="text-sm text-gray-500">
              Build your financial forecast step by step
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Navigation */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const Icon = step.icon
              const isActive = index === currentStepIndex
              const isCompleted = index < currentStepIndex
              const isClickable = index <= currentStepIndex + 1

              return (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => isClickable && goToStep(index)}
                    disabled={!isClickable}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${isActive
                        ? 'bg-brand-orange-50 text-brand-orange-700'
                        : isCompleted
                          ? 'text-green-700 hover:bg-green-50'
                          : isClickable
                            ? 'text-gray-500 hover:bg-gray-50'
                            : 'text-gray-300 cursor-not-allowed'
                      }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isActive
                        ? 'bg-brand-orange text-white'
                        : isCompleted
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}>
                      {isCompleted ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="hidden lg:block text-left">
                      <div className={`text-sm font-medium ${isActive ? 'text-brand-orange-700' : ''}`}>
                        {step.title}
                      </div>
                      <div className="text-xs text-gray-400">
                        {step.subtitle}
                      </div>
                    </div>
                  </button>

                  {index < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${index < currentStepIndex ? 'bg-green-500' : 'bg-gray-200'
                      }`} />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {renderStepContent()}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-white rounded-b-2xl">
          <button
            onClick={goBack}
            disabled={!canGoBack}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <div className="text-sm text-gray-500">
            Step {currentStepIndex + 1} of {STEPS.length}
          </div>

          {currentStep.id !== 'review' ? (
            <button
              onClick={goForward}
              disabled={!canGoForward}
              className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div /> // Empty div for spacing since generate button is in Step 6
          )}
        </div>
      </div>
    </div>
  )
}
