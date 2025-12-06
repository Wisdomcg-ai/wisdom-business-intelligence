'use client'

import React from 'react'
import {
  Target,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Sparkles,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Percent
} from 'lucide-react'
import type { SetupWizardData } from '../types'

interface Step1Props {
  data: SetupWizardData
  onUpdate: (updates: Partial<SetupWizardData>) => void
  onImportFromGoalsWizard: () => Promise<void>
  isImporting: boolean
  fiscalYear: number
}

export default function Step1ReviewGoals({
  data,
  onUpdate,
  onImportFromGoalsWizard,
  isImporting,
  fiscalYear
}: Step1Props) {
  const hasGoals = data.revenueGoal > 0

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const grossMargin = data.revenueGoal > 0
    ? ((data.grossProfitGoal / data.revenueGoal) * 100).toFixed(1)
    : '0'

  const netMargin = data.revenueGoal > 0
    ? ((data.netProfitGoal / data.revenueGoal) * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-6">
      {/* Teaching Banner */}
      <div className="bg-gradient-to-r from-brand-orange to-brand-orange-700 rounded-lg p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg mb-1">Step 1: Confirm Your Financial Goals</h3>
            <p className="text-brand-orange-100 text-sm">
              Your forecast starts with the goals you set in your business plan. Let's make sure
              we're building towards the right targets.
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
              Every number in your forecast ties back to these goals. Your revenue goal determines
              how much you need to sell. Your profit goals determine how much you can spend.
              <strong> Get these right, and the rest falls into place.</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Goals Display */}
      {hasGoals ? (
        <div className="space-y-4">
          {/* Source Indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-700">
                Goals imported from{' '}
                <span className="text-brand-orange">Goals & Targets Wizard</span>
              </span>
              {data.goalsLastUpdated && (
                <span className="text-xs text-gray-500">
                  (updated {new Date(data.goalsLastUpdated).toLocaleDateString()})
                </span>
              )}
            </div>
            <button
              onClick={onImportFromGoalsWizard}
              disabled={isImporting}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isImporting ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Goals Cards */}
          <div className="grid grid-cols-3 gap-4">
            {/* Revenue Goal */}
            <div className="bg-white border-2 border-brand-orange-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-brand-orange-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-brand-orange" />
                </div>
                <span className="text-sm font-medium text-gray-600">Revenue Goal</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {formatCurrency(data.revenueGoal)}
              </div>
              <div className="text-xs text-gray-500">
                FY{fiscalYear} annual target
              </div>
            </div>

            {/* Gross Profit Goal */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-sm font-medium text-gray-600">Gross Profit Goal</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {formatCurrency(data.grossProfitGoal)}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Percent className="w-3 h-3 text-green-600" />
                <span className="text-green-600 font-medium">{grossMargin}% margin</span>
              </div>
            </div>

            {/* Net Profit Goal */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-brand-orange-100 rounded-lg flex items-center justify-center">
                  <Target className="w-4 h-4 text-brand-orange" />
                </div>
                <span className="text-sm font-medium text-gray-600">Net Profit Goal</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {formatCurrency(data.netProfitGoal)}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Percent className="w-3 h-3 text-brand-orange" />
                <span className="text-brand-orange font-medium">{netMargin}% margin</span>
              </div>
            </div>
          </div>

          {/* What This Means */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-brand-orange" />
              What This Means for Your Forecast
            </h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-brand-orange font-bold">•</span>
                <span>
                  You need to generate <strong>{formatCurrency(data.revenueGoal / 12)}/month</strong> in revenue
                  (if evenly distributed)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-orange font-bold">•</span>
                <span>
                  Your cost of sales budget is <strong>{formatCurrency(data.revenueGoal - data.grossProfitGoal)}</strong> for the year
                  ({(100 - parseFloat(grossMargin)).toFixed(1)}% of revenue)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-orange font-bold">•</span>
                <span>
                  You can spend up to <strong>{formatCurrency(data.grossProfitGoal - data.netProfitGoal)}</strong> on
                  operating expenses to hit your profit target
                </span>
              </li>
            </ul>
          </div>

          {/* Warning if margins look off */}
          {parseFloat(grossMargin) < 25 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-amber-900 mb-1">Low Gross Margin Alert</h4>
                  <p className="text-sm text-amber-800">
                    Your target gross margin of {grossMargin}% is below the recommended 30%+ for most businesses.
                    Consider reviewing your pricing or cost structure in the Goals wizard.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No Goals State */
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Goals Found
          </h3>
          <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
            Your financial forecast needs goals to work towards.
            Set your revenue and profit targets in the Goals wizard first.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={onImportFromGoalsWizard}
              disabled={isImporting}
              className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isImporting ? 'animate-spin' : ''}`} />
              Import from Goals Wizard
            </button>
            <a
              href="/goals"
              className="flex items-center gap-2 px-4 py-2 text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Go to Goals Wizard
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
