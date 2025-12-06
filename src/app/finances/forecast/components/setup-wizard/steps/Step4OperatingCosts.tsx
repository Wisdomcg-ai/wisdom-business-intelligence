'use client'

import React, { useMemo, useState } from 'react'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  Calculator,
  Percent,
  DollarSign,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import type { SetupWizardData, OpExCategory, PriorYearAnalysis } from '../types'

interface Step4Props {
  data: SetupWizardData
  onUpdate: (updates: Partial<SetupWizardData>) => void
  fiscalYear: number
}

type OpExMethod = 'match_prior' | 'percentage_increase' | 'fixed' | 'percentage_of_revenue'

const METHOD_LABELS: Record<OpExMethod, string> = {
  match_prior: 'Match Prior Year',
  percentage_increase: '% Increase',
  fixed: 'Fixed Amount',
  percentage_of_revenue: '% of Revenue'
}

export default function Step4OperatingCosts({
  data,
  onUpdate,
  fiscalYear
}: Step4Props) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Initialize categories from prior year if available
  const categories = useMemo(() => {
    if (data.opexCategories.length > 0) {
      return data.opexCategories
    }

    // Initialize from prior year analysis
    if (data.priorYearAnalysis?.opexByCategory) {
      return data.priorYearAnalysis.opexByCategory.map(cat => ({
        id: `opex-${cat.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: cat.name,
        priorYearAmount: cat.amount,
        forecastAmount: cat.amount, // Default to match prior year
        method: 'match_prior' as OpExMethod,
        methodValue: 0,
        notes: ''
      }))
    }

    return []
  }, [data.opexCategories, data.priorYearAnalysis])

  // Update parent when categories change
  React.useEffect(() => {
    if (categories.length > 0 && data.opexCategories.length === 0) {
      onUpdate({ opexCategories: categories })
    }
  }, [categories, data.opexCategories.length, onUpdate])

  // Calculate totals
  const totals = useMemo(() => {
    const priorYear = categories.reduce((sum, cat) => sum + cat.priorYearAmount, 0)
    const forecast = categories.reduce((sum, cat) => sum + cat.forecastAmount, 0)
    const difference = forecast - priorYear
    const changePercent = priorYear > 0 ? (difference / priorYear) * 100 : 0

    return { priorYear, forecast, difference, changePercent }
  }, [categories])

  // Budget check
  const availableOpExBudget = data.grossProfitGoal - data.netProfitGoal
  const remainingBudget = availableOpExBudget - totals.forecast - data.totalWagesOpEx
  const isOverBudget = remainingBudget < 0

  const handleUpdateCategory = (id: string, updates: Partial<OpExCategory>) => {
    const updatedCategories = categories.map(cat => {
      if (cat.id !== id) return cat

      const updated = { ...cat, ...updates }

      // Recalculate forecast amount based on method
      if (updates.method !== undefined || updates.methodValue !== undefined) {
        switch (updated.method) {
          case 'match_prior':
            updated.forecastAmount = updated.priorYearAmount
            break
          case 'percentage_increase':
            updated.forecastAmount = updated.priorYearAmount * (1 + (updated.methodValue || 0) / 100)
            break
          case 'fixed':
            updated.forecastAmount = updated.methodValue || 0
            break
          case 'percentage_of_revenue':
            updated.forecastAmount = data.revenueGoal * ((updated.methodValue || 0) / 100)
            break
        }
      }

      return updated
    })

    onUpdate({
      opexCategories: updatedCategories,
      totalOpExForecast: updatedCategories.reduce((sum, cat) => sum + cat.forecastAmount, 0)
    })
  }

  const toggleCategory = (id: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedCategories(newExpanded)
  }

  const TrendIcon = ({ amount }: { amount: number }) => {
    if (amount > 0) return <TrendingUp className="w-4 h-4 text-red-500" />
    if (amount < 0) return <TrendingDown className="w-4 h-4 text-green-500" />
    return <Minus className="w-4 h-4 text-gray-400" />
  }

  return (
    <div className="space-y-6">
      {/* Teaching Banner */}
      <div className="bg-gradient-to-r from-brand-orange to-brand-orange-700 rounded-lg p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg mb-1">Step 4: Plan Your Operating Costs</h3>
            <p className="text-brand-orange-100 text-sm">
              Operating expenses eat into your gross profit. Let's be intentional about
              each cost category and ensure you have budget for what matters.
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
              Most business owners underestimate their operating costs, then wonder why profit
              never materialises. By budgeting each category against last year, you can
              <strong> spot cost creep before it kills your margins</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Budget Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-4 h-4 text-brand-orange" />
            <span className="text-xs font-medium text-gray-500 uppercase">OpEx Budget</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatCurrency(availableOpExBudget)}
          </div>
          <div className="text-xs text-gray-500">
            GP - Net Profit Goal
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-brand-orange" />
            <span className="text-xs font-medium text-gray-500 uppercase">Wages (OpEx)</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatCurrency(data.totalWagesOpEx)}
          </div>
          <div className="text-xs text-gray-500">
            From Step 3
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-brand-orange-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">Other OpEx</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatCurrency(totals.forecast)}
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <TrendIcon amount={totals.difference} />
            {totals.changePercent >= 0 ? '+' : ''}{totals.changePercent.toFixed(1)}% vs FY{fiscalYear - 1}
          </div>
        </div>

        <div className={`border rounded-xl p-4 ${isOverBudget
            ? 'bg-red-50 border-red-200'
            : 'bg-green-50 border-green-200'
          }`}>
          <div className="flex items-center gap-2 mb-2">
            <Percent className="w-4 h-4 text-gray-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">Remaining</span>
          </div>
          <div className={`text-xl font-bold ${isOverBudget ? 'text-red-700' : 'text-green-700'}`}>
            {formatCurrency(remainingBudget)}
          </div>
          <div className="text-xs text-gray-500">
            {isOverBudget ? 'Over budget!' : 'Available buffer'}
          </div>
        </div>
      </div>

      {/* Warning if over budget */}
      {isOverBudget && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-red-900 mb-1">Over Budget Warning</h4>
              <p className="text-sm text-red-800">
                Your planned operating costs exceed your budget by {formatCurrency(Math.abs(remainingBudget))}.
                Either reduce costs below or increase your revenue/gross profit goals.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cost Categories */}
      {categories.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase">
            <div className="col-span-4">Category</div>
            <div className="col-span-2 text-right">FY{fiscalYear - 1}</div>
            <div className="col-span-3">Forecast Method</div>
            <div className="col-span-2 text-right">FY{fiscalYear}</div>
            <div className="col-span-1 text-right">Change</div>
          </div>

          <div className="divide-y divide-gray-100">
            {categories.map((category) => {
              const isExpanded = expandedCategories.has(category.id)
              const difference = category.forecastAmount - category.priorYearAmount
              const changePercent = category.priorYearAmount > 0
                ? (difference / category.priorYearAmount) * 100
                : 0

              return (
                <div key={category.id}>
                  {/* Main Row */}
                  <div
                    className="px-5 py-4 grid grid-cols-12 gap-4 items-center hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleCategory(category.id)}
                  >
                    <div className="col-span-4 flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="font-medium text-gray-900">{category.name}</span>
                    </div>
                    <div className="col-span-2 text-right text-gray-600">
                      {formatCurrency(category.priorYearAmount)}
                    </div>
                    <div className="col-span-3">
                      <select
                        value={category.method}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleUpdateCategory(category.id, {
                          method: e.target.value as OpExMethod
                        })}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
                      >
                        {Object.entries(METHOD_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2 text-right font-semibold text-gray-900">
                      {formatCurrency(category.forecastAmount)}
                    </div>
                    <div className="col-span-1 text-right flex items-center justify-end gap-1">
                      <TrendIcon amount={difference} />
                      <span className={`text-sm ${difference > 0 ? 'text-red-600' : difference < 0 ? 'text-green-600' : 'text-gray-400'
                        }`}>
                        {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-4 max-w-md">
                        {category.method === 'percentage_increase' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Percentage Increase
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={category.methodValue || 0}
                                onChange={(e) => handleUpdateCategory(category.id, {
                                  methodValue: parseFloat(e.target.value) || 0
                                })}
                                className="w-24 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-brand-orange"
                              />
                              <span className="text-sm text-gray-500">%</span>
                            </div>
                          </div>
                        )}

                        {category.method === 'fixed' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Fixed Annual Amount
                            </label>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500">$</span>
                              <input
                                type="number"
                                value={category.methodValue || 0}
                                onChange={(e) => handleUpdateCategory(category.id, {
                                  methodValue: parseFloat(e.target.value) || 0
                                })}
                                className="w-32 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-brand-orange"
                              />
                            </div>
                          </div>
                        )}

                        {category.method === 'percentage_of_revenue' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Percentage of Revenue
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step="0.1"
                                value={category.methodValue || 0}
                                onChange={(e) => handleUpdateCategory(category.id, {
                                  methodValue: parseFloat(e.target.value) || 0
                                })}
                                className="w-24 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-brand-orange"
                              />
                              <span className="text-sm text-gray-500">% of {formatCurrency(data.revenueGoal)}</span>
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Notes
                          </label>
                          <input
                            type="text"
                            value={category.notes || ''}
                            onChange={(e) => handleUpdateCategory(category.id, {
                              notes: e.target.value
                            })}
                            placeholder="e.g., New office lease"
                            className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-brand-orange"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Totals Row */}
          <div className="px-5 py-4 bg-gray-100 border-t border-gray-200 grid grid-cols-12 gap-4 items-center font-semibold">
            <div className="col-span-4 text-gray-900">Total Operating Expenses</div>
            <div className="col-span-2 text-right text-gray-700">
              {formatCurrency(totals.priorYear)}
            </div>
            <div className="col-span-3"></div>
            <div className="col-span-2 text-right text-gray-900">
              {formatCurrency(totals.forecast)}
            </div>
            <div className="col-span-1 text-right flex items-center justify-end gap-1">
              <TrendIcon amount={totals.difference} />
              <span className={totals.difference > 0 ? 'text-red-600' : totals.difference < 0 ? 'text-green-600' : 'text-gray-400'}>
                {totals.changePercent >= 0 ? '+' : ''}{totals.changePercent.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Prior Year Data
          </h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Import your prior year P&L data in Step 2 to automatically populate your
            expense categories. Or you can manually add categories here.
          </p>
        </div>
      )}

      {/* How We'll Use This */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-brand-orange" />
          How We'll Use This Data
        </h4>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-brand-orange font-bold">•</span>
            <span>
              Each category will become a line in your P&L forecast
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-orange font-bold">•</span>
            <span>
              <strong>"Match Prior Year"</strong> uses seasonal patterns from FY{fiscalYear - 1}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-orange font-bold">•</span>
            <span>
              <strong>"% of Revenue"</strong> is great for variable costs that scale with sales
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
