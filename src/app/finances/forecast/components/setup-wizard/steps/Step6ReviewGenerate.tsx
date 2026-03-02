'use client'

import React, { useMemo } from 'react'
import {
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Target,
  Users,
  Wallet,
  TrendingUp,
  Calendar,
  DollarSign,
  ArrowRight,
  Play,
  MessageSquare,
  Info,
  Lightbulb,
  AlertCircle
} from 'lucide-react'
import type { SetupWizardData, DistributionMethod } from '../types'

interface Step6Props {
  data: SetupWizardData
  onUpdate: (updates: Partial<SetupWizardData>) => void
  onGenerate: () => void
  isGenerating: boolean
  fiscalYear: number
}

export default function Step6ReviewGenerate({
  data,
  onUpdate,
  onGenerate,
  isGenerating,
  fiscalYear
}: Step6Props) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Calculate the complete P&L summary
  const summary = useMemo(() => {
    // Revenue and COGS
    const cogsAmount = data.revenueGoal - data.grossProfitGoal
    const cogsPercent = data.revenueGoal > 0 ? (cogsAmount / data.revenueGoal) * 100 : 0
    const grossMargin = 100 - cogsPercent

    // Total OpEx (including strategic investments)
    const teamCosts = data.totalWagesOpEx + data.totalWagesCOGS
    const opexCosts = data.totalOpExForecast
    const strategicCosts = data.totalInvestmentCost || 0
    const totalOpEx = data.totalWagesOpEx + opexCosts + strategicCosts

    // Calculate what net profit will actually be
    const calculatedNetProfit = data.grossProfitGoal - totalOpEx
    const netMargin = data.revenueGoal > 0 ? (calculatedNetProfit / data.revenueGoal) * 100 : 0

    // Gap to target
    const profitGap = calculatedNetProfit - data.netProfitGoal
    const isOnTrack = profitGap >= 0
    const gapPercent = data.netProfitGoal > 0
      ? (profitGap / data.netProfitGoal) * 100
      : 0

    return {
      cogsAmount,
      cogsPercent,
      grossMargin,
      teamCosts,
      opexCosts,
      strategicCosts,
      totalOpEx,
      calculatedNetProfit,
      netMargin,
      profitGap,
      gapPercent,
      isOnTrack
    }
  }, [data])

  // CFO Insight - the main "does it work?" assessment
  const getCFOInsight = () => {
    if (data.revenueGoal === 0) {
      return {
        type: 'warning' as const,
        title: 'Missing Revenue Goal',
        message: "You haven't set a revenue goal yet. Go back to Step 1 to import your targets from your Annual Plan."
      }
    }

    if (summary.isOnTrack && summary.gapPercent > 20) {
      return {
        type: 'success' as const,
        title: 'Looking Strong',
        message: `You're on track to keep ${formatCurrency(summary.calculatedNetProfit)} - that's ${formatCurrency(summary.profitGap)} more than your goal. You've got a healthy buffer built in.`
      }
    }

    if (summary.isOnTrack && summary.gapPercent >= 0) {
      return {
        type: 'success' as const,
        title: 'On Track',
        message: `Your numbers work. You'll keep ${formatCurrency(summary.calculatedNetProfit)} (${summary.netMargin.toFixed(1)}% of what you make), which hits your goal${summary.profitGap > 0 ? ` with ${formatCurrency(summary.profitGap)} to spare` : ''}.`
      }
    }

    if (summary.profitGap < 0 && Math.abs(summary.gapPercent) <= 10) {
      return {
        type: 'info' as const,
        title: 'Nearly There',
        message: `You're ${formatCurrency(Math.abs(summary.profitGap))} short of your profit goal - that's only ${Math.abs(summary.gapPercent).toFixed(0)}% off. A few small adjustments and you'll be there.`
      }
    }

    return {
      type: 'warning' as const,
      title: 'Budget Gap to Close',
      message: `Your current plan shows ${formatCurrency(Math.abs(summary.profitGap))} less profit than your goal. You'll need to cut costs or increase revenue to hit your target.`
    }
  }

  const cfoInsight = getCFOInsight()

  // Validation summary
  const validations = useMemo(() => {
    return [
      {
        label: 'Revenue & profit goals',
        passed: data.revenueGoal > 0 && data.grossProfitGoal > 0,
        icon: Target
      },
      {
        label: 'Team planned',
        passed: data.teamMembers.length > 0,
        icon: Users
      },
      {
        label: 'Running costs set',
        passed: data.opexCategories.length > 0,
        icon: Wallet
      },
      {
        label: 'Projects costed',
        passed: data.strategicInvestments.length === 0 ||
          data.strategicInvestments.every(i => i.cost > 0),
        icon: Lightbulb
      }
    ]
  }, [data])

  const passedCount = validations.filter(v => v.passed).length
  const hasRequiredData = data.revenueGoal > 0

  return (
    <div className="space-y-6">
      {/* CFO Header */}
      <div className="bg-gradient-to-r from-brand-navy to-brand-navy-800 rounded-xl p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-xl mb-2">Does It All Work?</h3>
            <p className="text-white/80">
              Let me run the numbers and show you if your plan adds up.
              If there's a gap, I'll help you see where to look.
            </p>
          </div>
        </div>
      </div>

      {/* CFO Insight - Main Assessment */}
      <div className={`rounded-xl p-6 flex items-start gap-4 ${
        cfoInsight.type === 'success' ? 'bg-green-50 border border-green-200' :
        cfoInsight.type === 'warning' ? 'bg-amber-50 border border-amber-200' :
        'bg-blue-50 border border-blue-200'
      }`}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
          cfoInsight.type === 'success' ? 'bg-green-100' :
          cfoInsight.type === 'warning' ? 'bg-amber-100' :
          'bg-blue-100'
        }`}>
          {cfoInsight.type === 'success' ? (
            <CheckCircle className="w-6 h-6 text-green-600" />
          ) : cfoInsight.type === 'warning' ? (
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          ) : (
            <Info className="w-6 h-6 text-blue-600" />
          )}
        </div>
        <div>
          <h4 className={`font-bold text-lg mb-1 ${
            cfoInsight.type === 'success' ? 'text-green-900' :
            cfoInsight.type === 'warning' ? 'text-amber-900' :
            'text-blue-900'
          }`}>
            {cfoInsight.title}
          </h4>
          <p className={`text-sm ${
            cfoInsight.type === 'success' ? 'text-green-800' :
            cfoInsight.type === 'warning' ? 'text-amber-800' :
            'text-blue-800'
          }`}>
            {cfoInsight.message}
          </p>
        </div>
      </div>

      {/* The Numbers - Visual P&L Summary */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h4 className="font-semibold text-gray-900">FY{fiscalYear} Forecast Summary</h4>
        </div>

        <div className="p-5 space-y-3">
          {/* Revenue */}
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-700">Revenue</span>
            <span className="font-bold text-gray-900 text-lg">{formatCurrency(data.revenueGoal)}</span>
          </div>

          {/* Less COGS */}
          <div className="flex justify-between items-center py-2 text-sm">
            <span className="text-gray-500 pl-4">Less: Cost of delivery ({summary.cogsPercent.toFixed(0)}%)</span>
            <span className="text-gray-600">({formatCurrency(summary.cogsAmount)})</span>
          </div>

          {/* Gross Profit */}
          <div className="flex justify-between items-center py-2 border-t border-gray-100">
            <div>
              <span className="text-gray-700 font-medium">What You Make</span>
              <span className="text-xs text-gray-400 ml-2">(Gross Profit)</span>
            </div>
            <div className="text-right">
              <span className="font-bold text-gray-900">{formatCurrency(data.grossProfitGoal)}</span>
              <span className="text-xs text-gray-500 ml-2">({summary.grossMargin.toFixed(0)}%)</span>
            </div>
          </div>

          {/* Operating Expenses Breakdown */}
          <div className="flex justify-between items-center py-2 text-sm">
            <span className="text-gray-500 pl-4">Back Office wages</span>
            <span className="text-gray-600">({formatCurrency(data.totalWagesOpEx)})</span>
          </div>
          <div className="flex justify-between items-center py-2 text-sm">
            <span className="text-gray-500 pl-4">Other running costs</span>
            <span className="text-gray-600">({formatCurrency(summary.opexCosts)})</span>
          </div>
          {summary.strategicCosts > 0 && (
            <div className="flex justify-between items-center py-2 text-sm">
              <span className="text-gray-500 pl-4">Big projects</span>
              <span className="text-gray-600">({formatCurrency(summary.strategicCosts)})</span>
            </div>
          )}

          {/* Total OpEx */}
          <div className="flex justify-between items-center py-2 text-sm border-t border-gray-100">
            <span className="text-gray-600 pl-4">Total running costs</span>
            <span className="text-gray-700 font-medium">({formatCurrency(summary.totalOpEx)})</span>
          </div>

          {/* Net Profit */}
          <div className={`flex justify-between items-center py-3 border-t-2 rounded-lg px-3 -mx-3 ${
            summary.isOnTrack ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
          }`}>
            <div>
              <span className="font-bold text-gray-900">What You Keep</span>
              <span className="text-xs text-gray-400 ml-2">(Net Profit)</span>
            </div>
            <div className="text-right">
              <span className={`font-bold text-xl ${summary.isOnTrack ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(summary.calculatedNetProfit)}
              </span>
              <span className="text-xs text-gray-500 ml-2">({summary.netMargin.toFixed(1)}%)</span>
            </div>
          </div>

          {/* Gap to Target */}
          {data.netProfitGoal > 0 && (
            <div className="flex justify-between items-center py-2 text-sm">
              <span className="text-gray-500">Your target: {formatCurrency(data.netProfitGoal)}</span>
              <span className={summary.isOnTrack ? 'text-green-600' : 'text-red-600'}>
                {summary.isOnTrack ? '+' : ''}{formatCurrency(summary.profitGap)} {summary.isOnTrack ? 'buffer' : 'gap'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Checks */}
      <div className="grid grid-cols-4 gap-3">
        {validations.map((check, index) => {
          const Icon = check.icon
          return (
            <div
              key={index}
              className={`p-3 rounded-lg text-center ${
                check.passed ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2 ${
                check.passed ? 'bg-green-100' : 'bg-gray-200'
              }`}>
                {check.passed ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <Icon className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <div className={`text-xs ${check.passed ? 'text-green-700' : 'text-gray-500'}`}>
                {check.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Distribution Method */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-brand-orange" />
          How Should I Spread Your Revenue?
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          Choose how to distribute your {formatCurrency(data.revenueGoal)} target across the year.
        </p>

        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => onUpdate({ distributionMethod: 'even' })}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              data.distributionMethod === 'even'
                ? 'border-brand-orange bg-brand-orange-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className={`text-sm font-bold mb-1 ${
              data.distributionMethod === 'even' ? 'text-brand-navy' : 'text-gray-900'
            }`}>
              Even Monthly
            </div>
            <div className="text-xs text-gray-500">
              {formatCurrency(data.revenueGoal / 12)} each month
            </div>
          </button>

          <button
            onClick={() => onUpdate({ distributionMethod: 'seasonal_pattern' })}
            disabled={!data.hasActualData}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              data.distributionMethod === 'seasonal_pattern'
                ? 'border-brand-orange bg-brand-orange-50'
                : data.hasActualData
                  ? 'border-gray-200 bg-white hover:border-gray-300'
                  : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className={`text-sm font-bold mb-1 ${
              data.distributionMethod === 'seasonal_pattern' ? 'text-brand-navy' : 'text-gray-900'
            }`}>
              Last Year's Pattern
            </div>
            <div className="text-xs text-gray-500">
              {data.hasActualData ? 'Match your FY seasonal trends' : 'Needs prior year data'}
            </div>
          </button>

          <button
            onClick={() => onUpdate({ distributionMethod: 'custom' })}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              data.distributionMethod === 'custom'
                ? 'border-brand-orange bg-brand-orange-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className={`text-sm font-bold mb-1 ${
              data.distributionMethod === 'custom' ? 'text-brand-navy' : 'text-gray-900'
            }`}>
              Custom
            </div>
            <div className="text-xs text-gray-500">
              Set your own monthly targets
            </div>
          </button>
        </div>
      </div>

      {/* What Happens Next */}
      <div className="bg-gray-50 rounded-xl p-5">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-brand-orange" />
          When You Generate
        </h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <DollarSign className="w-4 h-4 text-brand-orange mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">
              I'll build a month-by-month P&L forecast you can fine-tune
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-brand-navy mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">
              Team costs will spread based on their start months
            </span>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex flex-col items-center justify-center pt-4 gap-3">
        <button
          onClick={onGenerate}
          disabled={isGenerating || !hasRequiredData}
          className="flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-brand-orange to-brand-orange-700 text-white rounded-xl hover:from-brand-orange-700 hover:to-brand-orange-800 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span className="text-lg font-semibold">Building Your Forecast...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              <span className="text-lg font-semibold">Generate FY{fiscalYear} Forecast</span>
            </>
          )}
        </button>

        {!hasRequiredData && (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Set a revenue goal in Step 1 to continue
          </p>
        )}
      </div>
    </div>
  )
}
