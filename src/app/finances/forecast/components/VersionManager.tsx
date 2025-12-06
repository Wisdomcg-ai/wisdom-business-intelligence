'use client'

import React, { useState, useEffect } from 'react'
import { GitBranch, Lock, Check, ChevronDown, Plus } from 'lucide-react'
import type { FinancialForecast } from '../types'

interface VersionManagerProps {
  forecast: FinancialForecast
  onVersionChange: (forecastId: string) => void
  className?: string
}

export default function VersionManager({ forecast, onVersionChange, className = '' }: VersionManagerProps) {
  const [versions, setVersions] = useState<FinancialForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    if (forecast?.business_id && forecast?.fiscal_year) {
      fetchVersions()
    }
  }, [forecast?.business_id, forecast?.fiscal_year])

  const fetchVersions = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/forecasts/versions?business_id=${forecast.business_id}&fiscal_year=${forecast.fiscal_year}`
      )

      if (response.ok) {
        const data = await response.json()
        setVersions(data.versions || [])
      } else {
        console.error('Failed to fetch versions:', response.status, response.statusText)
        // Don't show error to user - just show current forecast
        setVersions([forecast])
      }
    } catch (error) {
      console.error('Error fetching versions:', error)
      // Graceful fallback - show current forecast only
      setVersions([forecast])
    } finally {
      setLoading(false)
    }
  }

  const handleVersionSelect = (versionId: string) => {
    setShowDropdown(false)
    if (versionId !== forecast.id) {
      onVersionChange(versionId)
    }
  }

  const getVersionLabel = (version: FinancialForecast) => {
    const type = version.forecast_type || 'forecast'
    const typeLabel = type === 'budget' ? 'Budget' : 'Forecast'
    const versionNum = version.version_number || 1
    return `${typeLabel} v${versionNum}`
  }

  const budgets = versions.filter(v => v.forecast_type === 'budget')
  const forecasts = versions.filter(v => v.forecast_type === 'forecast')

  if (loading || !forecast) {
    return null
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          {/* Current Version Display */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-orange-500 to-brand-orange-700 rounded-lg flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">{forecast.name}</h3>
                {forecast.is_locked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    <Lock className="w-3 h-3" />
                    Locked
                  </span>
                )}
                {forecast.is_active && !forecast.is_locked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <Check className="w-3 h-3" />
                    Active
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">
                {getVersionLabel(forecast)} • FY{forecast.fiscal_year}
              </p>
            </div>
          </div>

          {/* Version Selector */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <GitBranch className="w-4 h-4" />
              Switch Version
              <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowDropdown(false)}
                />
                <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
                  {/* Budgets Section */}
                  {budgets.length > 0 && (
                    <div className="p-2 border-b border-gray-200">
                      <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">
                        Budgets
                      </div>
                      {budgets.map((version) => (
                        <button
                          key={version.id}
                          onClick={() => version.id && handleVersionSelect(version.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                            version.id === forecast.id
                              ? 'bg-brand-orange-50 text-brand-orange-700'
                              : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{version.name}</div>
                              <div className="text-xs text-gray-500">{getVersionLabel(version)}</div>
                            </div>
                            <div className="flex items-center gap-1">
                              {version.is_locked && <Lock className="w-3 h-3 text-yellow-600" />}
                              {version.id === forecast.id && <Check className="w-4 h-4 text-brand-orange" />}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Forecasts Section */}
                  <div className="p-2">
                    <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">
                      Forecasts
                    </div>
                    {forecasts.length > 0 ? (
                      forecasts.map((version) => (
                        <button
                          key={version.id}
                          onClick={() => version.id && handleVersionSelect(version.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                            version.id === forecast.id
                              ? 'bg-brand-orange-50 text-brand-orange-700'
                              : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{version.name}</div>
                              <div className="text-xs text-gray-500">
                                {getVersionLabel(version)}
                                {version.is_active && ' • Active'}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {version.is_locked && <Lock className="w-3 h-3 text-yellow-600" />}
                              {version.is_active && <Check className="w-3 h-3 text-green-600" />}
                              {version.id === forecast.id && <Check className="w-4 h-4 text-brand-orange" />}
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-500 italic">
                        No forecast versions yet
                      </div>
                    )}
                  </div>

                  {/* Info Footer */}
                  <div className="p-3 bg-gray-50 border-t border-gray-200 rounded-b-lg">
                    <p className="text-xs text-gray-600">
                      Use <strong>What-If Analysis → Save as New Version</strong> to create forecast versions
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
