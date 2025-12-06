'use client'

import React from 'react'
import { AlertTriangle, TrendingUp, DollarSign, X } from 'lucide-react'
import type { GoalValidationResult } from '../utils/goal-validator'

interface GoalValidationModalProps {
  isOpen: boolean
  onClose: () => void
  validationResult: GoalValidationResult
  onAutoAdjust: (adjustments: any) => void
  onGenerateAnyway: () => void
}

export default function GoalValidationModal({
  isOpen,
  onClose,
  validationResult,
  onAutoAdjust,
  onGenerateAnyway
}: GoalValidationModalProps) {
  if (!isOpen) return null

  const { warnings, suggestions, scenarios } = validationResult
  const hasErrors = warnings.some(w => w.severity === 'error')

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {hasErrors ? 'Goals Not Achievable' : 'Goal Recommendations'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Based on your year-to-date performance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900">Issues Detected</h3>
              {warnings.map((warning, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    warning.severity === 'error'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}
                >
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertTriangle
                        className={`h-5 w-5 ${
                          warning.severity === 'error' ? 'text-red-400' : 'text-amber-400'
                        }`}
                      />
                    </div>
                    <div className="ml-3">
                      <p className={`text-sm font-medium ${
                        warning.severity === 'error' ? 'text-red-800' : 'text-amber-800'
                      }`}>
                        {warning.message}
                      </p>
                      {warning.details && (
                        <div className="mt-2 text-xs text-gray-600">
                          <div className="grid grid-cols-3 gap-2">
                            {warning.details.ytd !== undefined && (
                              <div>
                                <span className="font-medium">YTD:</span>{' '}
                                {formatCurrency(warning.details.ytd)}
                              </div>
                            )}
                            {warning.details.goal !== undefined && (
                              <div>
                                <span className="font-medium">Goal:</span>{' '}
                                {formatCurrency(warning.details.goal)}
                              </div>
                            )}
                            {warning.details.difference !== undefined && (
                              <div>
                                <span className="font-medium">Difference:</span>{' '}
                                {formatCurrency(warning.details.difference)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Scenarios */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              <TrendingUp className="inline h-4 w-4 mr-1" />
              Scenario Comparison
            </h3>
            <div className="overflow-hidden border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Scenario
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Gross Profit
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      OpEx
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Net Profit
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {scenarios.map((scenario, idx) => (
                    <tr key={idx} className={idx === 0 && !scenario.isAchievable ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {scenario.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {scenario.description}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                        {formatCurrency(scenario.revenue)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                        {formatCurrency(scenario.grossProfit)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                        {formatCurrency(scenario.opex)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                        {formatCurrency(scenario.netProfit)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {scenario.isAchievable ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Achievable
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                            Not Achievable
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                <DollarSign className="inline h-4 w-4 mr-1" />
                Recommended Adjustments
              </h3>
              <div className="space-y-2">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => onAutoAdjust(suggestion.adjustments)}
                    className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-brand-orange-500 hover:bg-brand-orange-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900">
                          {suggestion.title}
                        </h4>
                        <p className="mt-1 text-sm text-gray-500">
                          {suggestion.description}
                        </p>
                        <div className="mt-2 text-xs text-gray-600">
                          {Object.entries(suggestion.adjustments).map(([key, value]) => (
                            <div key={key}>
                              <span className="font-medium capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim()}:
                              </span>{' '}
                              {formatCurrency(value as number)}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="ml-4">
                        <span className="text-xs text-brand-orange font-medium">
                          Apply →
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          {!hasErrors && (
            <button
              onClick={onGenerateAnyway}
              className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded-md hover:bg-amber-200"
            >
              Generate Anyway
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
