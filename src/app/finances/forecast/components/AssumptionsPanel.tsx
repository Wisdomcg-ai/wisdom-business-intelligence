'use client'

import React, { useState } from 'react'
import { Settings, Edit2, Check, X, TrendingUp, DollarSign, Calculator } from 'lucide-react'
import type { FinancialForecast, CategoryAssumptions, ForecastMethod } from '../types'

interface AssumptionsPanelProps {
  forecast: FinancialForecast
  onUpdate: (assumptions: CategoryAssumptions) => void
}

const FORECAST_CATEGORIES = [
  { key: 'Revenue', label: 'Revenue', icon: DollarSign, color: 'green' },
  { key: 'Cost of Sales', label: 'Cost of Sales (COGS)', icon: TrendingUp, color: 'orange' },
  { key: 'Operating Expenses', label: 'Operating Expenses', icon: Calculator, color: 'blue' },
  { key: 'Other Income', label: 'Other Income', icon: DollarSign, color: 'teal' },
  { key: 'Other Expenses', label: 'Other Expenses', icon: Calculator, color: 'red' }
]

const FORECAST_METHODS: { value: ForecastMethod; label: string; description: string }[] = [
  {
    value: 'straight_line',
    label: 'Straight Line',
    description: 'Same amount each month'
  },
  {
    value: 'growth_rate',
    label: 'Growth Rate',
    description: 'Percentage increase over time'
  },
  {
    value: 'seasonal_pattern',
    label: 'Seasonal Pattern',
    description: 'Repeat FY25 pattern'
  },
  {
    value: 'driver_based',
    label: 'Driver-Based',
    description: 'Percentage of revenue'
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'Custom per month'
  }
]

export default function AssumptionsPanel({
  forecast,
  onUpdate
}: AssumptionsPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedAssumptions, setEditedAssumptions] = useState<CategoryAssumptions>(
    forecast.category_assumptions || {}
  )

  const handleMethodChange = (category: string, method: ForecastMethod) => {
    setEditedAssumptions(prev => ({
      ...prev,
      [category]: {
        method,
        config: prev[category]?.config || {}
      }
    }))
  }

  const handleConfigChange = (category: string, key: string, value: any) => {
    setEditedAssumptions(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        config: {
          ...prev[category]?.config,
          [key]: value
        }
      }
    }))
  }

  const handleSave = () => {
    onUpdate(editedAssumptions)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedAssumptions(forecast.category_assumptions || {})
    setIsEditing(false)
  }

  const renderMethodConfig = (category: string, method: ForecastMethod) => {
    const config = editedAssumptions[category]?.config || {}

    switch (method) {
      case 'straight_line':
        return (
          <div className="mt-2">
            <label className="block text-xs text-gray-600 mb-1">Base Amount</label>
            <input
              type="number"
              value={config.base_amount || ''}
              onChange={(e) => handleConfigChange(category, 'base_amount', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500"
              placeholder="Enter amount per month"
            />
          </div>
        )

      case 'growth_rate':
        return (
          <div className="mt-2 space-y-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Growth Rate (%)</label>
              <input
                type="number"
                step="0.1"
                value={config.growth_rate ? config.growth_rate * 100 : ''}
                onChange={(e) => handleConfigChange(category, 'growth_rate', parseFloat(e.target.value) / 100 || 0)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500"
                placeholder="e.g., 5 for 5%"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Growth Type</label>
              <select
                value={config.growth_type || 'MoM'}
                onChange={(e) => handleConfigChange(category, 'growth_type', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500"
              >
                <option value="MoM">Month-over-Month (MoM)</option>
                <option value="YoY">Year-over-Year (YoY)</option>
              </select>
            </div>
          </div>
        )

      case 'seasonal_pattern':
        return (
          <div className="mt-2 text-xs text-gray-500">
            Will repeat the monthly pattern from FY25 actual data, scaled to match the target.
          </div>
        )

      case 'driver_based':
        return (
          <div className="mt-2">
            <label className="block text-xs text-gray-600 mb-1">Percentage of Revenue (%)</label>
            <input
              type="number"
              step="0.1"
              value={config.driver_percentage ? config.driver_percentage * 100 : ''}
              onChange={(e) => handleConfigChange(category, 'driver_percentage', parseFloat(e.target.value) / 100 || 0)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500"
              placeholder="e.g., 40 for 40% of revenue"
            />
          </div>
        )

      case 'manual':
        return (
          <div className="mt-2 text-xs text-gray-500">
            Each line item will use its own forecast method. Set methods in the P&L table below.
          </div>
        )

      default:
        return null
    }
  }

  if (!forecast.revenue_goal) {
    return null // Don't show until goals are set
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Category Assumptions</h2>
            <p className="text-sm text-gray-500">
              Set forecasting methods and parameters for each P&L category
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
              Edit Assumptions
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
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-600 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <Check className="w-4 h-4" />
                Save Assumptions
              </button>
            </>
          )}
        </div>
      </div>

      {/* Category Assumptions Grid */}
      <div className="grid grid-cols-2 gap-4">
        {FORECAST_CATEGORIES.map(category => {
          const Icon = category.icon
          const assumption = editedAssumptions[category.key]
          const currentMethod = assumption?.method || 'manual'

          return (
            <div
              key={category.key}
              className="border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <Icon className={`w-5 h-5 text-${category.color}-600`} />
                <h3 className="text-sm font-semibold text-gray-900">{category.label}</h3>
              </div>

              {isEditing ? (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Forecast Method</label>
                  <select
                    value={currentMethod}
                    onChange={(e) => handleMethodChange(category.key, e.target.value as ForecastMethod)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 mb-2"
                  >
                    {FORECAST_METHODS.map(method => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>

                  {renderMethodConfig(category.key, currentMethod)}
                </div>
              ) : (
                <div>
                  <div className="text-sm font-medium text-gray-900 mb-1">
                    {FORECAST_METHODS.find(m => m.value === currentMethod)?.label || 'Manual'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {FORECAST_METHODS.find(m => m.value === currentMethod)?.description || 'Custom per month'}
                  </div>

                  {/* Show config values */}
                  {currentMethod === 'growth_rate' && assumption?.config?.growth_rate && (
                    <div className="mt-2 text-xs text-gray-600">
                      Growth: {(assumption.config.growth_rate * 100).toFixed(1)}% {assumption.config.growth_type || 'MoM'}
                    </div>
                  )}
                  {currentMethod === 'driver_based' && assumption?.config?.driver_percentage && (
                    <div className="mt-2 text-xs text-gray-600">
                      {(assumption.config.driver_percentage * 100).toFixed(1)}% of Revenue
                    </div>
                  )}
                  {currentMethod === 'straight_line' && assumption?.config?.base_amount && (
                    <div className="mt-2 text-xs text-gray-600">
                      ${assumption.config.base_amount.toLocaleString()}/month
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Special Note for Revenue */}
      {isEditing && (
        <div className="mt-4 p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <p className="text-xs text-teal-800">
            <strong>Note:</strong> Revenue forecast will be based on the Distribution Strategy you've set above.
            The method selected here applies to subcategories and individual line items within Revenue.
          </p>
        </div>
      )}
    </div>
  )
}
