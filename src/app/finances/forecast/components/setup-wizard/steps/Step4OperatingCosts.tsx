'use client'

import React, { useMemo, useState, useEffect } from 'react'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  AlertTriangle,
  DollarSign,
  MessageSquare,
  CheckCircle,
  Info,
  Edit3,
  RotateCcw
} from 'lucide-react'
import type { SetupWizardData, OpExCategory } from '../types'

interface Step4Props {
  data: SetupWizardData
  onUpdate: (updates: Partial<SetupWizardData>) => void
  fiscalYear: number
}

const DEFAULT_INFLATION = 5 // 5% default increase

export default function Step4OperatingCosts({
  data,
  onUpdate,
  fiscalYear
}: Step4Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<number>(0)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Initialize categories from prior year with +5% inflation
  const categories = useMemo(() => {
    if (data.opexCategories.length > 0) {
      return data.opexCategories
    }

    if (data.priorYearAnalysis?.opexByCategory) {
      return data.priorYearAnalysis.opexByCategory.map(cat => ({
        id: `opex-${cat.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: cat.name,
        priorYearAmount: cat.amount,
        forecastAmount: Math.round(cat.amount * (1 + DEFAULT_INFLATION / 100)),
        method: 'percentage_increase' as const,
        methodValue: DEFAULT_INFLATION,
        notes: ''
      }))
    }

    return []
  }, [data.opexCategories, data.priorYearAnalysis])

  // Initialize on first render
  useEffect(() => {
    if (categories.length > 0 && data.opexCategories.length === 0) {
      onUpdate({
        opexCategories: categories,
        totalOpExForecast: categories.reduce((sum, cat) => sum + cat.forecastAmount, 0)
      })
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

  // Budget calculations
  const availableOpExBudget = data.grossProfitGoal - data.netProfitGoal
  const totalOpEx = totals.forecast + data.totalWagesOpEx
  const remainingBudget = availableOpExBudget - totalOpEx
  const isOverBudget = remainingBudget < 0

  const handleUpdateAmount = (id: string, newAmount: number) => {
    const updatedCategories = categories.map(cat => {
      if (cat.id !== id) return cat
      const changePercent = cat.priorYearAmount > 0
        ? ((newAmount - cat.priorYearAmount) / cat.priorYearAmount) * 100
        : 0
      return {
        ...cat,
        forecastAmount: newAmount,
        method: 'fixed' as const,
        methodValue: changePercent
      }
    })

    onUpdate({
      opexCategories: updatedCategories,
      totalOpExForecast: updatedCategories.reduce((sum, cat) => sum + cat.forecastAmount, 0)
    })
  }

  const handleResetCategory = (id: string) => {
    const updatedCategories = categories.map(cat => {
      if (cat.id !== id) return cat
      return {
        ...cat,
        forecastAmount: Math.round(cat.priorYearAmount * (1 + DEFAULT_INFLATION / 100)),
        method: 'percentage_increase' as const,
        methodValue: DEFAULT_INFLATION
      }
    })

    onUpdate({
      opexCategories: updatedCategories,
      totalOpExForecast: updatedCategories.reduce((sum, cat) => sum + cat.forecastAmount, 0)
    })
  }

  const startEditing = (cat: OpExCategory) => {
    setEditingId(cat.id)
    setEditValue(cat.forecastAmount)
  }

  const saveEdit = () => {
    if (editingId) {
      handleUpdateAmount(editingId, editValue)
      setEditingId(null)
    }
  }

  const TrendIcon = ({ amount }: { amount: number }) => {
    if (amount > 0) return <TrendingUp className="w-3 h-3 text-red-500" />
    if (amount < 0) return <TrendingDown className="w-3 h-3 text-green-500" />
    return <Minus className="w-3 h-3 text-gray-400" />
  }

  // CFO Insight
  const getCFOInsight = () => {
    if (categories.length === 0) {
      return {
        type: 'info' as const,
        message: "Connect your prior year data in the previous step so I can pre-fill your expense categories with smart defaults."
      }
    }

    if (isOverBudget) {
      return {
        type: 'warning' as const,
        message: `Your running costs are ${formatCurrency(Math.abs(remainingBudget))} over budget. You'll need to either cut costs or increase revenue to hit your profit goal.`
      }
    }

    const opexAsPercentOfGP = totals.forecast > 0 && data.grossProfitGoal > 0
      ? (totalOpEx / data.grossProfitGoal) * 100
      : 0

    if (opexAsPercentOfGP > 85) {
      return {
        type: 'warning' as const,
        message: `Running costs are ${opexAsPercentOfGP.toFixed(0)}% of what you make, leaving only ${formatCurrency(remainingBudget)} to keep. That's a tight margin.`
      }
    }

    return {
      type: 'success' as const,
      message: `Your running costs total ${formatCurrency(totalOpEx)} (${opexAsPercentOfGP.toFixed(0)}% of what you make), leaving ${formatCurrency(remainingBudget)} for you to keep. That looks sustainable.`
    }
  }

  const cfoInsight = getCFOInsight()

  return (
    <div className="space-y-6">
      {/* CFO Header */}
      <div className="bg-gradient-to-r from-brand-navy to-brand-navy-800 rounded-xl p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-xl mb-2">Your Running Costs</h3>
            <p className="text-white/80">
              I've pre-filled your expenses from last year with a {DEFAULT_INFLATION}% inflation adjustment.
              Review each category and adjust where you expect changes.
            </p>
          </div>
        </div>
      </div>

      {/* CFO Insight */}
      <div className={`rounded-xl p-5 flex items-start gap-4 ${
        cfoInsight.type === 'success' ? 'bg-green-50 border border-green-200' :
        cfoInsight.type === 'warning' ? 'bg-amber-50 border border-amber-200' :
        'bg-blue-50 border border-blue-200'
      }`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          cfoInsight.type === 'success' ? 'bg-green-100' :
          cfoInsight.type === 'warning' ? 'bg-amber-100' :
          'bg-blue-100'
        }`}>
          {cfoInsight.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : cfoInsight.type === 'warning' ? (
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          ) : (
            <Info className="w-5 h-5 text-blue-600" />
          )}
        </div>
        <div>
          <h4 className={`font-semibold mb-1 ${
            cfoInsight.type === 'success' ? 'text-green-900' :
            cfoInsight.type === 'warning' ? 'text-amber-900' :
            'text-blue-900'
          }`}>
            CFO Insight
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

      {/* Budget Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 uppercase mb-1">Budget</div>
          <div className="text-lg font-bold text-gray-900">{formatCurrency(availableOpExBudget)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 uppercase mb-1">Team Wages</div>
          <div className="text-lg font-bold text-gray-900">{formatCurrency(data.totalWagesOpEx)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 uppercase mb-1">Other Costs</div>
          <div className="text-lg font-bold text-gray-900">{formatCurrency(totals.forecast)}</div>
        </div>
        <div className={`rounded-lg p-3 text-center ${
          isOverBudget ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
        }`}>
          <div className="text-xs text-gray-500 uppercase mb-1">Remaining</div>
          <div className={`text-lg font-bold ${isOverBudget ? 'text-red-700' : 'text-green-700'}`}>
            {formatCurrency(remainingBudget)}
          </div>
        </div>
      </div>

      {/* Expense Categories - Simplified Table */}
      {categories.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 grid grid-cols-12 gap-3 text-xs font-medium text-gray-500 uppercase">
            <div className="col-span-5">Category</div>
            <div className="col-span-2 text-right">FY{fiscalYear - 1}</div>
            <div className="col-span-3 text-right">FY{fiscalYear}</div>
            <div className="col-span-2 text-right">Change</div>
          </div>

          <div className="divide-y divide-gray-100">
            {categories.map((cat) => {
              const difference = cat.forecastAmount - cat.priorYearAmount
              const changePercent = cat.priorYearAmount > 0
                ? (difference / cat.priorYearAmount) * 100
                : 0
              const isEditing = editingId === cat.id

              return (
                <div
                  key={cat.id}
                  className="px-4 py-3 grid grid-cols-12 gap-3 items-center hover:bg-gray-50"
                >
                  <div className="col-span-5 font-medium text-gray-900 truncate">
                    {cat.name}
                  </div>
                  <div className="col-span-2 text-right text-gray-500 text-sm">
                    {formatCurrency(cat.priorYearAmount)}
                  </div>
                  <div className="col-span-3 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(Number(e.target.value))}
                          onBlur={saveEdit}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                          autoFocus
                          className="w-24 px-2 py-1 text-sm text-right border border-brand-orange rounded focus:outline-none focus:ring-1 focus:ring-brand-orange"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(cat.forecastAmount)}
                        </span>
                        <button
                          onClick={() => startEditing(cat)}
                          className="p-1 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded transition-colors"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        {cat.method === 'fixed' && (
                          <button
                            onClick={() => handleResetCategory(cat.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Reset to +5%"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-right flex items-center justify-end gap-1">
                    <TrendIcon amount={difference} />
                    <span className={`text-sm ${
                      difference > 0 ? 'text-red-600' : difference < 0 ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(0)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Totals */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 grid grid-cols-12 gap-3 items-center font-semibold">
            <div className="col-span-5 text-gray-900">Total (excl. team wages)</div>
            <div className="col-span-2 text-right text-gray-600">
              {formatCurrency(totals.priorYear)}
            </div>
            <div className="col-span-3 text-right text-gray-900">
              {formatCurrency(totals.forecast)}
            </div>
            <div className="col-span-2 text-right flex items-center justify-end gap-1">
              <TrendIcon amount={totals.difference} />
              <span className={totals.difference > 0 ? 'text-red-600' : totals.difference < 0 ? 'text-green-600' : 'text-gray-400'}>
                {totals.changePercent >= 0 ? '+' : ''}{totals.changePercent.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-300">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Prior Year Data
          </h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Go back to the History step and connect your accounting data.
            I'll use your FY{fiscalYear - 1} expenses as a starting point.
          </p>
        </div>
      )}

      {/* How Costs Flow */}
      <div className="bg-gray-50 rounded-xl p-5">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-brand-orange" />
          Quick Tips
        </h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <DollarSign className="w-4 h-4 text-brand-orange mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">
              <strong>Click the pencil</strong> to edit any amount directly
            </span>
          </div>
          <div className="flex items-start gap-2">
            <RotateCcw className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">
              <strong>Reset icon</strong> returns to +5% default
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
