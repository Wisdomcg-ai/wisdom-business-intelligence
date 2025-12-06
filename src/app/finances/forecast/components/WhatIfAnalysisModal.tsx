'use client'

import React, { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown, DollarSign, AlertCircle, Save } from 'lucide-react'
import type { FinancialForecast, WhatIfParameters, ForecastScenario } from '../types'
import { formatCurrency } from '../utils/currency'

interface WhatIfAnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  forecast: FinancialForecast
  baselineRevenue: number
  baselineCOGS: number
  baselineOpEx: number
  onSaveAsScenario?: (scenarioName: string, parameters: WhatIfParameters) => void
  onApplyToForecast?: (parameters: WhatIfParameters) => void
  onSaveAsNewVersion?: (versionName: string, parameters: WhatIfParameters) => void
}

export default function WhatIfAnalysisModal({
  isOpen,
  onClose,
  forecast,
  baselineRevenue,
  baselineCOGS,
  baselineOpEx,
  onSaveAsScenario,
  onApplyToForecast,
  onSaveAsNewVersion
}: WhatIfAnalysisModalProps) {
  const [parameters, setParameters] = useState<WhatIfParameters>({
    revenueChange: 0,
    cogsChange: 0,
    opexChange: 0
  })

  const [scenarioName, setScenarioName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [versionName, setVersionName] = useState('')

  // Calculate adjusted values
  const adjustedRevenue = baselineRevenue * (1 + parameters.revenueChange / 100)
  const adjustedCOGSPercentage = ((baselineCOGS / baselineRevenue) * 100) + parameters.cogsChange
  const adjustedCOGS = adjustedRevenue * (adjustedCOGSPercentage / 100)
  const adjustedOpEx = baselineOpEx * (1 + parameters.opexChange / 100)

  const baselineGrossProfit = baselineRevenue - baselineCOGS
  const adjustedGrossProfit = adjustedRevenue - adjustedCOGS

  const baselineNetProfit = baselineRevenue - baselineCOGS - baselineOpEx
  const adjustedNetProfit = adjustedRevenue - adjustedCOGS - adjustedOpEx

  const baselineGrossMargin = (baselineGrossProfit / baselineRevenue) * 100
  const adjustedGrossMargin = (adjustedGrossProfit / adjustedRevenue) * 100

  const baselineNetMargin = (baselineNetProfit / baselineRevenue) * 100
  const adjustedNetMargin = (adjustedNetProfit / adjustedRevenue) * 100

  // Calculate changes
  const revenueChange = adjustedRevenue - baselineRevenue
  const grossProfitChange = adjustedGrossProfit - baselineGrossProfit
  const netProfitChange = adjustedNetProfit - baselineNetProfit

  const handleReset = () => {
    setParameters({
      revenueChange: 0,
      cogsChange: 0,
      opexChange: 0
    })
  }

  const handleSaveScenario = () => {
    if (!scenarioName.trim()) {
      alert('Please enter a scenario name')
      return
    }
    if (onSaveAsScenario) {
      onSaveAsScenario(scenarioName, parameters)
      setShowSaveDialog(false)
      setScenarioName('')
      onClose()
    }
  }

  const handleApplyToForecast = () => {
    if (confirm('This will modify your current forecast with these changes. Continue?')) {
      if (onApplyToForecast) {
        onApplyToForecast(parameters)
        onClose()
      }
    }
  }

  const handleSaveAsNewVersion = () => {
    if (!versionName.trim()) {
      alert('Please enter a version name')
      return
    }
    if (onSaveAsNewVersion) {
      onSaveAsNewVersion(versionName, parameters)
      setShowActionMenu(false)
      setVersionName('')
      onClose()
    }
  }

  const hasChanges = parameters.revenueChange !== 0 || parameters.cogsChange !== 0 || parameters.opexChange !== 0

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-brand-orange-50 to-brand-orange-50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-brand-orange rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">What-If Analysis</h2>
                <p className="text-sm text-gray-600">Adjust key variables to see impact on profitability</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            <div className="grid grid-cols-2 gap-6">
              {/* Left: Controls */}
              <div className="space-y-6">
                <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-lg p-4">
                  <h3 className="text-sm font-bold text-brand-navy mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    How to Use
                  </h3>
                  <div className="text-xs text-brand-orange-800 space-y-2">
                    <p>1. Adjust the sliders below to model different scenarios</p>
                    <p>2. See the real-time impact on your profitability</p>
                    <p className="font-semibold mt-3">3. Then choose an action:</p>
                    <div className="ml-3 space-y-1">
                      <p>• <span className="font-semibold text-brand-teal-700">Apply to Forecast</span> - Update current forecast</p>
                      <p>• <span className="font-semibold text-brand-navy-700">Save as New Version</span> - Create new version</p>
                      <p>• <span className="font-semibold text-brand-orange-700">Save as Scenario</span> - Compare later</p>
                    </div>
                  </div>
                </div>

                {/* Revenue Adjustment */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <label className="block text-sm font-bold text-gray-900 mb-3">
                    Revenue Change
                  </label>
                  <div className="flex items-center gap-4 mb-3">
                    <input
                      type="range"
                      min="-50"
                      max="100"
                      step="5"
                      value={parameters.revenueChange}
                      onChange={(e) => setParameters({ ...parameters, revenueChange: parseFloat(e.target.value) })}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-blue"
                    />
                    <div className="w-20 text-right">
                      <span className={`text-lg font-bold ${
                        parameters.revenueChange > 0 ? 'text-green-600' : parameters.revenueChange < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {parameters.revenueChange > 0 ? '+' : ''}{parameters.revenueChange}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>-50% (Worst case)</span>
                    <span>+100% (Best case)</span>
                  </div>
                </div>

                {/* COGS % Adjustment */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <label className="block text-sm font-bold text-gray-900 mb-3">
                    COGS % Change (Percentage Points)
                  </label>
                  <div className="flex items-center gap-4 mb-3">
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="1"
                      value={parameters.cogsChange}
                      onChange={(e) => setParameters({ ...parameters, cogsChange: parseFloat(e.target.value) })}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-orange"
                    />
                    <div className="w-20 text-right">
                      <span className={`text-lg font-bold ${
                        parameters.cogsChange < 0 ? 'text-green-600' : parameters.cogsChange > 0 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {parameters.cogsChange > 0 ? '+' : ''}{parameters.cogsChange}pp
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>-20pp (Lower costs)</span>
                    <span>+20pp (Higher costs)</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-600">
                    Current COGS: {((baselineCOGS / baselineRevenue) * 100).toFixed(1)}% → Adjusted: {adjustedCOGSPercentage.toFixed(1)}%
                  </div>
                </div>

                {/* OpEx Adjustment */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <label className="block text-sm font-bold text-gray-900 mb-3">
                    Operating Expenses Change
                  </label>
                  <div className="flex items-center gap-4 mb-3">
                    <input
                      type="range"
                      min="-20"
                      max="50"
                      step="5"
                      value={parameters.opexChange}
                      onChange={(e) => setParameters({ ...parameters, opexChange: parseFloat(e.target.value) })}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-purple"
                    />
                    <div className="w-20 text-right">
                      <span className={`text-lg font-bold ${
                        parameters.opexChange < 0 ? 'text-green-600' : parameters.opexChange > 0 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {parameters.opexChange > 0 ? '+' : ''}{parameters.opexChange}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>-20% (Cost cutting)</span>
                    <span>+50% (Expansion)</span>
                  </div>
                </div>

                {/* Reset Button */}
                <button
                  onClick={handleReset}
                  className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Reset to Baseline
                </button>
              </div>

              {/* Right: Results */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Impact Analysis</h3>

                {/* Revenue Impact */}
                <div className="border-2 border-brand-orange-200 rounded-lg p-4 bg-brand-orange-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Revenue</span>
                    {revenueChange !== 0 && (
                      <div className="flex items-center gap-1">
                        {revenueChange > 0 ? (
                          <TrendingUp className="w-4 h-4 text-green-600" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-600" />
                        )}
                        <span className={`text-sm font-bold ${revenueChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(Math.abs(revenueChange), forecast.currency || 'AUD', { compact: true })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-brand-navy">
                    {formatCurrency(adjustedRevenue, forecast.currency || 'AUD')}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Baseline: {formatCurrency(baselineRevenue, forecast.currency || 'AUD')}
                  </div>
                </div>

                {/* Gross Profit Impact */}
                <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Gross Profit</span>
                    {grossProfitChange !== 0 && (
                      <div className="flex items-center gap-1">
                        {grossProfitChange > 0 ? (
                          <TrendingUp className="w-4 h-4 text-green-600" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-600" />
                        )}
                        <span className={`text-sm font-bold ${grossProfitChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(Math.abs(grossProfitChange), forecast.currency || 'AUD', { compact: true })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-green-900">
                    {formatCurrency(adjustedGrossProfit, forecast.currency || 'AUD')}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Margin: {adjustedGrossMargin.toFixed(1)}% (was {baselineGrossMargin.toFixed(1)}%)
                  </div>
                </div>

                {/* Net Profit Impact */}
                <div className="border-2 border-brand-navy-200 rounded-lg p-4 bg-brand-navy-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Net Profit</span>
                    {netProfitChange !== 0 && (
                      <div className="flex items-center gap-1">
                        {netProfitChange > 0 ? (
                          <TrendingUp className="w-4 h-4 text-green-600" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-600" />
                        )}
                        <span className={`text-sm font-bold ${netProfitChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(Math.abs(netProfitChange), forecast.currency || 'AUD', { compact: true })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className={`text-2xl font-bold ${adjustedNetProfit < 0 ? 'text-red-900' : 'text-brand-navy-900'}`}>
                    {formatCurrency(adjustedNetProfit, forecast.currency || 'AUD')}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Margin: {adjustedNetMargin.toFixed(1)}% (was {baselineNetMargin.toFixed(1)}%)
                  </div>
                </div>

                {/* Key Insights */}
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Key Insights</h4>
                  <ul className="space-y-2 text-xs text-gray-700">
                    {Math.abs(netProfitChange) > baselineNetProfit * 0.2 && (
                      <li className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-brand-orange mt-0.5 flex-shrink-0" />
                        <span>
                          Net profit changes by <strong>{((netProfitChange / baselineNetProfit) * 100).toFixed(0)}%</strong> with these adjustments
                        </span>
                      </li>
                    )}
                    {adjustedGrossMargin < 30 && (
                      <li className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>
                          Gross margin of {adjustedGrossMargin.toFixed(1)}% may be challenging for profitability
                        </span>
                      </li>
                    )}
                    {adjustedNetProfit < 0 && (
                      <li className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span className="font-bold text-red-600">
                          This scenario results in a loss. Consider adjusting assumptions.
                        </span>
                      </li>
                    )}
                    {parameters.revenueChange === 0 && parameters.cogsChange === 0 && parameters.opexChange === 0 && (
                      <li className="text-gray-500 italic">
                        Adjust the sliders to see how changes impact your profitability
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Close
            </button>

            <div className="flex items-center gap-3">
              {/* Apply to Current Forecast */}
              {onApplyToForecast && (
                <button
                  onClick={handleApplyToForecast}
                  disabled={!hasChanges}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Apply to Forecast
                </button>
              )}

              {/* Save as New Version */}
              {onSaveAsNewVersion && (
                <button
                  onClick={() => setShowActionMenu(true)}
                  disabled={!hasChanges}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Save as New Version
                </button>
              )}

              {/* Save as Scenario */}
              <button
                onClick={() => setShowSaveDialog(true)}
                disabled={!hasChanges}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                Save as Scenario
              </button>
            </div>
          </div>

          {/* Save Dialog */}
          {showSaveDialog && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="bg-white rounded-lg p-6 max-w-md w-full m-4">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Save as New Scenario</h3>
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder="e.g., Optimistic, Conservative, Best Case"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowSaveDialog(false)
                      setScenarioName('')
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveScenario}
                    className="px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors"
                  >
                    Save Scenario
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Save as New Version Dialog */}
          {showActionMenu && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="bg-white rounded-lg p-6 max-w-md w-full m-4">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Create New Forecast Version</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This will create a new forecast version with these changes applied.
                  Your current forecast will be preserved.
                </p>
                <input
                  type="text"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="e.g., Q2 Forecast Update, Mid-Year Revision"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-brand-orange focus:border-brand-navy-500"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowActionMenu(false)
                      setVersionName('')
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAsNewVersion}
                    className="px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy-700 transition-colors"
                  >
                    Create Version
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom slider styles */}
      <style jsx>{`
        .slider-blue::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: #2563eb;
          cursor: pointer;
          border-radius: 50%;
        }
        .slider-orange::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: #ea580c;
          cursor: pointer;
          border-radius: 50%;
        }
        .slider-purple::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: #172238;
          cursor: pointer;
          border-radius: 50%;
        }
      `}</style>
    </>
  )
}
