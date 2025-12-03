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
  Percent,
  ArrowRight,
  Play,
  BarChart3
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

  // Calculate summary metrics
  const summary = useMemo(() => {
    const cogsAmount = data.revenueGoal - data.grossProfitGoal
    const cogsPercent = data.revenueGoal > 0 ? (cogsAmount / data.revenueGoal) * 100 : 0

    const totalOpEx = data.totalWagesOpEx + data.totalOpExForecast
    const opexPercent = data.revenueGoal > 0 ? (totalOpEx / data.revenueGoal) * 100 : 0

    const calculatedNetProfit = data.grossProfitGoal - totalOpEx
    const netMargin = data.revenueGoal > 0 ? (calculatedNetProfit / data.revenueGoal) * 100 : 0

    const profitGap = calculatedNetProfit - data.netProfitGoal
    const isOnTrack = profitGap >= 0

    return {
      cogsAmount,
      cogsPercent,
      totalOpEx,
      opexPercent,
      calculatedNetProfit,
      netMargin,
      profitGap,
      isOnTrack
    }
  }, [data])

  // Validation checks
  const validations = useMemo(() => {
    const checks = []

    // Goals check
    if (data.revenueGoal > 0) {
      checks.push({ label: 'Revenue goal set', passed: true, value: formatCurrency(data.revenueGoal) })
    } else {
      checks.push({ label: 'Revenue goal set', passed: false, value: 'Not set' })
    }

    // Prior year data check
    if (data.hasActualData) {
      checks.push({ label: 'Prior year data imported', passed: true, value: data.dataSource })
    } else {
      checks.push({ label: 'Prior year data imported', passed: false, value: 'Optional - will use even distribution' })
    }

    // Team planning check
    if (data.teamMembers.length > 0) {
      checks.push({
        label: 'Team planned',
        passed: true,
        value: `${data.teamMembers.length} members, ${formatCurrency(data.totalWagesOpEx + data.totalWagesCOGS)} total wages`
      })
    } else {
      checks.push({ label: 'Team planned', passed: false, value: 'No team members added' })
    }

    // OpEx check
    if (data.opexCategories.length > 0) {
      checks.push({
        label: 'Operating costs planned',
        passed: true,
        value: `${data.opexCategories.length} categories, ${formatCurrency(data.totalOpExForecast)}`
      })
    } else {
      checks.push({ label: 'Operating costs planned', passed: false, value: 'No categories set' })
    }

    // Budget check
    if (summary.isOnTrack) {
      checks.push({
        label: 'Budget aligned with profit goal',
        passed: true,
        value: `${formatCurrency(summary.profitGap)} buffer`
      })
    } else {
      checks.push({
        label: 'Budget aligned with profit goal',
        passed: false,
        value: `${formatCurrency(Math.abs(summary.profitGap))} over budget`
      })
    }

    return checks
  }, [data, summary, formatCurrency])

  const allPassed = validations.every(v => v.passed) || validations.filter(v => !v.passed).every(v =>
    v.label === 'Prior year data imported' || v.label === 'Team planned' || v.label === 'Operating costs planned'
  )

  return (
    <div className="space-y-6">
      {/* Teaching Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg mb-1">Step 6: Review & Generate</h3>
            <p className="text-teal-100 text-sm">
              Let's make sure everything looks right before we build your forecast.
              This is your last chance to adjust before generating.
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-teal-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">Revenue Goal</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatCurrency(data.revenueGoal)}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">Gross Margin</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {(100 - summary.cogsPercent).toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">
            GP: {formatCurrency(data.grossProfitGoal)}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">Total OpEx</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatCurrency(summary.totalOpEx)}
          </div>
          <div className="text-xs text-gray-500">
            {summary.opexPercent.toFixed(1)}% of revenue
          </div>
        </div>

        <div className={`border rounded-xl p-4 ${summary.isOnTrack
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
          }`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-gray-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">Net Profit</span>
          </div>
          <div className={`text-xl font-bold ${summary.isOnTrack ? 'text-green-700' : 'text-red-700'}`}>
            {formatCurrency(summary.calculatedNetProfit)}
          </div>
          <div className="text-xs text-gray-500">
            {summary.netMargin.toFixed(1)}% margin
          </div>
        </div>
      </div>

      {/* Profit Analysis */}
      {!summary.isOnTrack && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-red-900 mb-1">Profit Goal Warning</h4>
              <p className="text-sm text-red-800">
                Your planned costs exceed what's needed to hit your net profit goal of{' '}
                {formatCurrency(data.netProfitGoal)} by {formatCurrency(Math.abs(summary.profitGap))}.
                You can still generate the forecast, but consider:
              </p>
              <ul className="mt-2 text-sm text-red-800 list-disc list-inside space-y-1">
                <li>Reducing operating expenses</li>
                <li>Increasing your revenue goal</li>
                <li>Improving your gross margin (reducing COGS)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Validation Checklist */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h4 className="font-semibold text-gray-900">Pre-Generate Checklist</h4>
          <span className={`text-sm font-medium ${allPassed ? 'text-green-600' : 'text-amber-600'}`}>
            {validations.filter(v => v.passed).length}/{validations.length} complete
          </span>
        </div>

        <div className="divide-y divide-gray-100">
          {validations.map((check, index) => (
            <div key={index} className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {check.passed ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                )}
                <span className={`text-sm ${check.passed ? 'text-gray-900' : 'text-gray-500'}`}>
                  {check.label}
                </span>
              </div>
              <span className="text-sm text-gray-500">{check.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Distribution Method */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-teal-600" />
          Revenue Distribution Method
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          How should we spread your revenue goal across the 12 months?
        </p>

        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => onUpdate({ distributionMethod: 'even' })}
            className={`p-4 rounded-lg border-2 transition-all text-left ${data.distributionMethod === 'even'
                ? 'border-teal-500 bg-teal-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
          >
            <div className={`text-sm font-bold mb-1 ${data.distributionMethod === 'even' ? 'text-teal-900' : 'text-gray-900'
              }`}>
              Even Split
            </div>
            <div className="text-xs text-gray-500">
              Same amount each month ({formatCurrency(data.revenueGoal / 12)}/mo)
            </div>
          </button>

          <button
            onClick={() => onUpdate({ distributionMethod: 'seasonal_pattern' })}
            disabled={!data.hasActualData}
            className={`p-4 rounded-lg border-2 transition-all text-left ${data.distributionMethod === 'seasonal_pattern'
                ? 'border-teal-500 bg-teal-50'
                : data.hasActualData
                  ? 'border-gray-200 bg-white hover:border-gray-300'
                  : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
              }`}
          >
            <div className={`text-sm font-bold mb-1 ${data.distributionMethod === 'seasonal_pattern' ? 'text-teal-900' : 'text-gray-900'
              }`}>
              Match FY{fiscalYear - 1} Pattern
            </div>
            <div className="text-xs text-gray-500">
              {data.hasActualData
                ? 'Uses your actual seasonal pattern'
                : 'Requires prior year data'}
            </div>
          </button>

          <button
            onClick={() => onUpdate({ distributionMethod: 'custom' })}
            className={`p-4 rounded-lg border-2 transition-all text-left ${data.distributionMethod === 'custom'
                ? 'border-teal-500 bg-teal-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
          >
            <div className={`text-sm font-bold mb-1 ${data.distributionMethod === 'custom' ? 'text-teal-900' : 'text-gray-900'
              }`}>
              Custom
            </div>
            <div className="text-xs text-gray-500">
              Enter custom amounts in P&L table
            </div>
          </button>
        </div>
      </div>

      {/* What Happens Next */}
      <div className="bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-200 rounded-xl p-5">
        <h4 className="font-semibold text-teal-900 mb-3 flex items-center gap-2">
          <ArrowRight className="w-5 h-5 text-teal-600" />
          What Happens When You Generate
        </h4>
        <ul className="space-y-2 text-sm text-teal-800">
          <li className="flex items-start gap-2">
            <span className="text-teal-600 font-bold mt-0.5">1.</span>
            <span>
              <strong>Revenue distribution:</strong> Your {formatCurrency(data.revenueGoal)} goal
              will be spread across months using your selected method
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-600 font-bold mt-0.5">2.</span>
            <span>
              <strong>COGS calculation:</strong> Cost of sales will be calculated at{' '}
              {summary.cogsPercent.toFixed(1)}% of revenue each month
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-600 font-bold mt-0.5">3.</span>
            <span>
              <strong>OpEx allocation:</strong> Your operating expenses will be distributed
              based on the methods you selected
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-600 font-bold mt-0.5">4.</span>
            <span>
              <strong>P&L table:</strong> You'll be taken to the detailed P&L forecast where
              you can fine-tune individual line items
            </span>
          </li>
        </ul>
      </div>

      {/* Generate Button */}
      <div className="flex items-center justify-center pt-4">
        <button
          onClick={onGenerate}
          disabled={isGenerating || data.revenueGoal === 0}
          className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-xl hover:from-teal-700 hover:to-teal-800 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span className="text-lg font-semibold">Generating Forecast...</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              <span className="text-lg font-semibold">Generate FY{fiscalYear} Forecast</span>
            </>
          )}
        </button>
      </div>

      {data.revenueGoal === 0 && (
        <p className="text-center text-sm text-gray-500">
          Please set a revenue goal in Step 1 before generating
        </p>
      )}
    </div>
  )
}
