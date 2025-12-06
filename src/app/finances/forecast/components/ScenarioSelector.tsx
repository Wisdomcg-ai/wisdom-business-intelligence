'use client'

import React, { useState } from 'react'
import { ChevronDown, Check, Plus, Copy, Trash2, Edit2, Archive } from 'lucide-react'
import type { ForecastScenario } from '../types'

interface ScenarioSelectorProps {
  scenarios: ForecastScenario[]
  activeScenario: ForecastScenario | null
  onSelectScenario: (scenario: ForecastScenario) => void
  onCreateScenario: () => void
  onDuplicateScenario: (scenario: ForecastScenario) => void
  onDeleteScenario: (scenario: ForecastScenario) => void
  onArchiveScenario: (scenario: ForecastScenario) => void
  className?: string
}

export default function ScenarioSelector({
  scenarios,
  activeScenario,
  onSelectScenario,
  onCreateScenario,
  onDuplicateScenario,
  onDeleteScenario,
  onArchiveScenario,
  className = ''
}: ScenarioSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleSelectScenario = (scenario: ForecastScenario) => {
    onSelectScenario(scenario)
    setIsOpen(false)
  }

  const getScenarioIcon = (scenario: ForecastScenario) => {
    if (scenario.is_baseline) {
      return (
        <div className="w-2 h-2 bg-gray-400 rounded-full" />
      )
    }

    // Determine color based on multipliers
    const isOptimistic = scenario.revenue_multiplier > 1.05
    const isPessimistic = scenario.revenue_multiplier < 0.95

    if (isOptimistic) {
      return <div className="w-2 h-2 bg-green-500 rounded-full" />
    } else if (isPessimistic) {
      return <div className="w-2 h-2 bg-red-500 rounded-full" />
    } else {
      return <div className="w-2 h-2 bg-brand-orange-500 rounded-full" />
    }
  }

  const getScenarioDescription = (scenario: ForecastScenario) => {
    if (scenario.is_baseline) return 'Original forecast'

    const parts: string[] = []
    if (scenario.revenue_multiplier !== 1.0) {
      const change = ((scenario.revenue_multiplier - 1) * 100).toFixed(0)
      parts.push(`Revenue ${change > '0' ? '+' : ''}${change}%`)
    }
    if (scenario.cogs_multiplier !== 1.0) {
      const change = ((scenario.cogs_multiplier - 1) * 100).toFixed(0)
      parts.push(`COGS ${change > '0' ? '+' : ''}${change}%`)
    }
    if (scenario.opex_multiplier !== 1.0) {
      const change = ((scenario.opex_multiplier - 1) * 100).toFixed(0)
      parts.push(`OpEx ${change > '0' ? '+' : ''}${change}%`)
    }

    return parts.length > 0 ? parts.join(', ') : scenario.description || 'Custom scenario'
  }

  return (
    <div className={`relative ${className}`}>
      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-orange transition-colors"
      >
        <div className="flex items-center gap-2">
          {activeScenario && getScenarioIcon(activeScenario)}
          <span className="font-semibold">
            {activeScenario ? activeScenario.name : 'Select Scenario'}
          </span>
          {activeScenario && activeScenario.is_active && (
            <span className="px-2 py-0.5 text-xs font-medium text-brand-orange-700 bg-brand-orange-100 rounded-full">
              Active
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
            {/* Create New Scenario */}
            <div className="p-2 border-b border-gray-200">
              <button
                onClick={() => {
                  onCreateScenario()
                  setIsOpen(false)
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create New Scenario
              </button>
            </div>

            {/* Scenario List */}
            <div className="p-2">
              {scenarios.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-gray-500">
                  No scenarios yet. Create one to get started.
                </div>
              ) : (
                scenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    className="group relative mb-1"
                  >
                    {/* Scenario Item */}
                    <button
                      onClick={() => handleSelectScenario(scenario)}
                      className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                        activeScenario?.id === scenario.id
                          ? 'bg-brand-orange-50 text-brand-navy'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {getScenarioIcon(scenario)}
                        <div className="text-left flex-1">
                          <div className="font-medium">{scenario.name}</div>
                          <div className="text-xs text-gray-500">
                            {getScenarioDescription(scenario)}
                          </div>
                        </div>
                        {activeScenario?.id === scenario.id && (
                          <Check className="w-4 h-4 text-brand-orange" />
                        )}
                      </div>
                    </button>

                    {/* Action Buttons (show on hover) */}
                    {!scenario.is_baseline && (
                      <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-sm p-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDuplicateScenario(scenario)
                          }}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Duplicate scenario"
                        >
                          <Copy className="w-3 h-3 text-gray-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onArchiveScenario(scenario)
                          }}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Archive scenario"
                        >
                          <Archive className="w-3 h-3 text-gray-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Delete scenario "${scenario.name}"? This cannot be undone.`)) {
                              onDeleteScenario(scenario)
                            }
                          }}
                          className="p-1 hover:bg-red-100 rounded transition-colors"
                          title="Delete scenario"
                        >
                          <Trash2 className="w-3 h-3 text-red-600" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Scenario Type Legend */}
            <div className="p-3 border-t border-gray-200 bg-gray-50">
              <div className="text-xs font-medium text-gray-700 mb-2">Legend</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full" />
                  <span className="text-gray-600">Baseline</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-brand-orange-500 rounded-full" />
                  <span className="text-gray-600">Realistic</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-gray-600">Optimistic</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                  <span className="text-gray-600">Conservative</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
