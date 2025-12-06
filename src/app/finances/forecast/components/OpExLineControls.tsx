'use client'

import React from 'react'
import type { ForecastMethod, ForecastMethodConfig } from '../types'

interface OpExLineControlsProps {
  forecastMethod?: ForecastMethodConfig
  onMethodChange: (method: ForecastMethod) => void
  onPercentageChange: (percentage: number) => void
}

export default function OpExLineControls({
  forecastMethod,
  onMethodChange,
  onPercentageChange
}: OpExLineControlsProps) {
  const currentMethod = forecastMethod?.method || 'seasonal_pattern'
  const currentPercentage = forecastMethod?.percentage_increase
    ? (forecastMethod.percentage_increase * 100).toFixed(1)
    : '0'

  const methodOptions: Array<{ value: ForecastMethod; label: string }> = [
    { value: 'none', label: "Don't Forecast" },
    { value: 'straight_line', label: 'Even Split' },
    { value: 'seasonal_pattern', label: 'Match FY25 Pattern' },
    { value: 'driver_based', label: '% of Revenue' },
    { value: 'manual', label: 'Custom' }
  ]

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:min-w-[280px]">
      {/* Method Dropdown */}
      <div className="flex-1 sm:min-w-[180px]">
        <select
          value={currentMethod}
          onChange={(e) => onMethodChange(e.target.value as ForecastMethod)}
          className="w-full px-3 py-2 text-sm font-medium border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 bg-white transition-all cursor-pointer hover:border-gray-400"
        >
          {methodOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* % Increase Input (only show for methods that support it) */}
      {(currentMethod === 'straight_line' || currentMethod === 'seasonal_pattern') && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            type="number"
            value={currentPercentage}
            onChange={(e) => onPercentageChange(parseFloat(e.target.value) || 0)}
            className="w-16 px-2 py-2 text-sm font-semibold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 text-right transition-all"
            placeholder="0"
            step="0.5"
            min="0"
            max="100"
          />
          <span className="text-sm font-medium text-gray-700">%</span>
        </div>
      )}

      {/* % of Revenue Input (for driver_based method) */}
      {currentMethod === 'driver_based' && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            type="number"
            value={forecastMethod?.driver_percentage ? (forecastMethod.driver_percentage * 100).toFixed(1) : '5'}
            onChange={(e) => {
              // This will need to be handled separately - for now just show the input
              console.log('Driver percentage:', e.target.value)
            }}
            className="w-16 px-2 py-2 text-sm font-semibold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 text-right transition-all"
            placeholder="5"
            step="0.5"
            min="0"
            max="100"
          />
          <span className="text-sm font-medium text-gray-700">% Rev</span>
        </div>
      )}
    </div>
  )
}
