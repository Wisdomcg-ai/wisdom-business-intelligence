'use client'

import React, { useState, useEffect } from 'react'
import { Calendar, TrendingUp, Edit2, Check, X, BarChart3 } from 'lucide-react'
import type { FinancialForecast, DistributionMethod } from '../types'

interface DistributionPanelProps {
  forecast: FinancialForecast
  onUpdate: (data: {
    revenue_distribution_method: DistributionMethod
    revenue_distribution_data: { [monthKey: string]: number }
  }) => void
}

export default function DistributionPanel({
  forecast,
  onUpdate
}: DistributionPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<DistributionMethod>(
    forecast.revenue_distribution_method || 'even'
  )
  const [customDistribution, setCustomDistribution] = useState<{ [key: string]: number }>({})

  // Generate month keys for forecast period
  const forecastMonthKeys = React.useMemo(() => {
    if (!forecast.forecast_start_month || !forecast.forecast_end_month) return []

    const start = new Date(forecast.forecast_start_month + '-01')
    const end = new Date(forecast.forecast_end_month + '-01')
    const months: string[] = []

    const current = new Date(start)
    while (current <= end) {
      const year = current.getFullYear()
      const month = String(current.getMonth() + 1).padStart(2, '0')
      months.push(`${year}-${month}`)
      current.setMonth(current.getMonth() + 1)
    }

    return months
  }, [forecast.forecast_start_month, forecast.forecast_end_month])

  // Calculate distribution based on method
  const calculateDistribution = (method: DistributionMethod, revenueGoal: number): { [key: string]: number } => {
    const monthCount = forecastMonthKeys.length
    if (monthCount === 0 || !revenueGoal) return {}

    switch (method) {
      case 'even': {
        // Equal amount each month
        const monthlyAmount = revenueGoal / monthCount
        return forecastMonthKeys.reduce((acc, key) => {
          acc[key] = monthlyAmount
          return acc
        }, {} as { [key: string]: number })
      }

      case 'linear': {
        // Linear growth from lower to higher
        // First month = base, last month = base * 1.5
        // Creates a linear ramp
        const sum = (monthCount * (monthCount + 1)) / 2
        const firstMonthBase = (revenueGoal * 2) / (monthCount * (monthCount + 1))

        return forecastMonthKeys.reduce((acc, key, index) => {
          acc[key] = firstMonthBase * (index + 1)
          return acc
        }, {} as { [key: string]: number })
      }

      case 'seasonal_pattern': {
        // Seasonal pattern based on FY25 actual data
        // Use the proportion of each month from historical data
        // For now, default to even split (will be enhanced with actual historical pattern)
        const monthlyAmount = revenueGoal / monthCount
        return forecastMonthKeys.reduce((acc, key) => {
          acc[key] = monthlyAmount
          return acc
        }, {} as { [key: string]: number })
      }

      case 'custom': {
        // Use existing custom distribution or even split
        if (Object.keys(customDistribution).length > 0) {
          return customDistribution
        }
        const monthlyAmount = revenueGoal / monthCount
        return forecastMonthKeys.reduce((acc, key) => {
          acc[key] = monthlyAmount
          return acc
        }, {} as { [key: string]: number })
      }

      default:
        return {}
    }
  }

  // Initialize custom distribution when switching to custom mode
  useEffect(() => {
    if (selectedMethod === 'custom' && Object.keys(customDistribution).length === 0) {
      if (forecast.revenue_distribution_data && Object.keys(forecast.revenue_distribution_data).length > 0) {
        setCustomDistribution(forecast.revenue_distribution_data)
      } else {
        const revenueGoal = forecast.revenue_goal || 0
        const distribution = calculateDistribution('even', revenueGoal)
        setCustomDistribution(distribution)
      }
    }
  }, [selectedMethod, forecast.revenue_goal, forecast.revenue_distribution_data])

  const currentDistribution = selectedMethod === 'custom'
    ? customDistribution
    : calculateDistribution(selectedMethod, forecast.revenue_goal || 0)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }

  const handleSave = () => {
    const distributionData = selectedMethod === 'custom'
      ? customDistribution
      : calculateDistribution(selectedMethod, forecast.revenue_goal || 0)

    onUpdate({
      revenue_distribution_method: selectedMethod,
      revenue_distribution_data: distributionData
    })
    setIsEditing(false)
  }

  const handleCancel = () => {
    setSelectedMethod(forecast.revenue_distribution_method || 'even')
    setCustomDistribution({})
    setIsEditing(false)
  }

  const handleCustomAmountChange = (monthKey: string, value: string) => {
    const numValue = parseFloat(value) || 0
    setCustomDistribution(prev => ({
      ...prev,
      [monthKey]: numValue
    }))
  }

  const totalDistributed = Object.values(currentDistribution).reduce((sum, val) => sum + val, 0)
  const revenueGoal = forecast.revenue_goal || 0
  const distributionVariance = totalDistributed - revenueGoal

  if (!forecast.revenue_goal) {
    return null // Don't show distribution panel until goals are set
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Revenue Distribution Strategy</h2>
            <p className="text-sm text-gray-500">
              How should the ${formatCurrency(revenueGoal).slice(1)} revenue goal be distributed across FY{forecast.fiscal_year}?
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Edit Distribution
            </button>
          )}

          {isEditing && (
            <>
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                <Check className="w-4 h-4" />
                Save Distribution
              </button>
            </>
          )}
        </div>
      </div>

      {/* Distribution Method Selector */}
      {isEditing && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Select Distribution Method
          </label>
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={() => setSelectedMethod('even')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedMethod === 'even'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <BarChart3 className={`w-5 h-5 mx-auto mb-2 ${
                selectedMethod === 'even' ? 'text-green-600' : 'text-gray-400'
              }`} />
              <div className="text-sm font-medium text-gray-900">Even Split</div>
              <div className="text-xs text-gray-500 mt-1">Equal each month</div>
            </button>

            <button
              onClick={() => setSelectedMethod('linear')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedMethod === 'linear'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <TrendingUp className={`w-5 h-5 mx-auto mb-2 ${
                selectedMethod === 'linear' ? 'text-green-600' : 'text-gray-400'
              }`} />
              <div className="text-sm font-medium text-gray-900">Linear Growth</div>
              <div className="text-xs text-gray-500 mt-1">Gradual increase</div>
            </button>

            <button
              onClick={() => setSelectedMethod('seasonal_pattern')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedMethod === 'seasonal_pattern'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <Calendar className={`w-5 h-5 mx-auto mb-2 ${
                selectedMethod === 'seasonal_pattern' ? 'text-green-600' : 'text-gray-400'
              }`} />
              <div className="text-sm font-medium text-gray-900">Seasonal</div>
              <div className="text-xs text-gray-500 mt-1">Based on FY25</div>
            </button>

            <button
              onClick={() => setSelectedMethod('custom')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedMethod === 'custom'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <Edit2 className={`w-5 h-5 mx-auto mb-2 ${
                selectedMethod === 'custom' ? 'text-green-600' : 'text-gray-400'
              }`} />
              <div className="text-sm font-medium text-gray-900">Custom</div>
              <div className="text-xs text-gray-500 mt-1">Manual entry</div>
            </button>
          </div>
        </div>
      )}

      {/* Monthly Distribution Display/Edit */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-6 gap-3">
          {forecastMonthKeys.map(monthKey => {
            const amount = currentDistribution[monthKey] || 0
            const percentage = revenueGoal > 0 ? (amount / revenueGoal) * 100 : 0

            return (
              <div key={monthKey} className="border border-gray-200 rounded p-3">
                <div className="text-xs font-medium text-gray-500 mb-1">
                  {formatMonthLabel(monthKey)}
                </div>
                {isEditing && selectedMethod === 'custom' ? (
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => handleCustomAmountChange(monthKey, e.target.value)}
                    className="w-full px-2 py-1 text-sm font-bold text-gray-900 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                ) : (
                  <div className="text-sm font-bold text-gray-900">
                    {formatCurrency(amount)}
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  {percentage.toFixed(1)}%
                </div>
              </div>
            )
          })}
        </div>

        {/* Total and Variance */}
        <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-600">Total Distributed: </span>
            <span className="text-lg font-bold text-gray-900">{formatCurrency(totalDistributed)}</span>
          </div>
          {Math.abs(distributionVariance) > 0.01 && (
            <div className={`text-sm font-medium ${
              distributionVariance > 0 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {distributionVariance > 0 ? '+' : ''}{formatCurrency(distributionVariance)} variance
            </div>
          )}
          {Math.abs(distributionVariance) <= 0.01 && (
            <div className="text-sm font-medium text-green-600">
              ✓ Matches revenue goal
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
