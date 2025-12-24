'use client'

import React, { useState } from 'react'
import {
  DollarSign,
  Plus,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react'
import { COST_CATEGORIES } from '../../types'

interface CostItem {
  id: string
  category: string
  name: string
  amount: number
  frequency: 'monthly' | 'annual'
  notes?: string
}

interface OperatingCostsStepProps {
  costs: CostItem[]
  onCostsChange: (costs: CostItem[]) => void
  revenueTarget?: number
  onAddDecision: (decision: any) => void
}

export default function OperatingCostsStep({
  costs,
  onCostsChange,
  revenueTarget,
  onAddDecision
}: OperatingCostsStepProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['technology', 'marketing'])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCost, setNewCost] = useState<Partial<CostItem>>({
    category: '',
    name: '',
    amount: undefined,
    frequency: 'monthly'
  })

  // Calculate totals
  const totalAnnualCosts = costs.reduce((sum, cost) => {
    return sum + (cost.frequency === 'monthly' ? cost.amount * 12 : cost.amount)
  }, 0)

  const costsByCategory = costs.reduce((acc, cost) => {
    const annualAmount = cost.frequency === 'monthly' ? cost.amount * 12 : cost.amount
    acc[cost.category] = (acc[cost.category] || 0) + annualAmount
    return acc
  }, {} as Record<string, number>)

  const costAsPercentOfRevenue = revenueTarget && revenueTarget > 0
    ? (totalAnnualCosts / revenueTarget) * 100
    : 0

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  // Add cost
  const handleAddCost = () => {
    if (!newCost.category || !newCost.name || !newCost.amount) return

    const cost: CostItem = {
      id: `cost-${Date.now()}`,
      category: newCost.category,
      name: newCost.name,
      amount: newCost.amount,
      frequency: newCost.frequency || 'monthly',
      notes: newCost.notes
    }

    onCostsChange([...costs, cost])
    onAddDecision({
      decision_type: 'cost_added',
      decision_data: cost
    })

    setNewCost({
      category: '',
      name: '',
      amount: undefined,
      frequency: 'monthly'
    })
    setShowAddForm(false)
  }

  // Update cost
  const handleUpdateCost = (id: string, updates: Partial<CostItem>) => {
    const updatedCosts = costs.map(cost =>
      cost.id === id ? { ...cost, ...updates } : cost
    )
    onCostsChange(updatedCosts)

    const originalCost = costs.find(c => c.id === id)
    if (originalCost) {
      onAddDecision({
        decision_type: 'cost_changed',
        decision_data: { id, original: originalCost, updates }
      })
    }
  }

  // Remove cost
  const handleRemoveCost = (id: string) => {
    const cost = costs.find(c => c.id === id)
    onCostsChange(costs.filter(c => c.id !== id))

    if (cost) {
      onAddDecision({
        decision_type: 'cost_removed',
        decision_data: cost
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Operating Costs Summary</h3>
            <p className="text-sm text-gray-600">{costs.length} cost items</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">${totalAnnualCosts.toLocaleString()}</p>
            <p className="text-sm text-gray-600">Annual total</p>
          </div>
        </div>

        {revenueTarget && revenueTarget > 0 && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
            costAsPercentOfRevenue > 40 ? 'bg-red-50 text-red-700' :
            costAsPercentOfRevenue > 25 ? 'bg-yellow-50 text-yellow-700' :
            'bg-green-50 text-green-700'
          }`}>
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">
              Operating costs are {costAsPercentOfRevenue.toFixed(1)}% of revenue target
              {costAsPercentOfRevenue > 40 && ' - Consider reducing costs'}
            </span>
          </div>
        )}
      </div>

      {/* Add Cost Button */}
      <button
        onClick={() => setShowAddForm(true)}
        className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Cost
      </button>

      {/* Add Cost Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Add Operating Cost</h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select
                value={newCost.category || ''}
                onChange={(e) => setNewCost({ ...newCost, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
              >
                <option value="">Select category...</option>
                {Object.entries(COST_CATEGORIES).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
              <input
                type="text"
                value={newCost.name || ''}
                onChange={(e) => setNewCost({ ...newCost, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                placeholder="e.g. AWS Hosting"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  value={newCost.amount || ''}
                  onChange={(e) => setNewCost({ ...newCost, amount: parseFloat(e.target.value) || undefined })}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                  placeholder="500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
              <select
                value={newCost.frequency || 'monthly'}
                onChange={(e) => setNewCost({ ...newCost, frequency: e.target.value as 'monthly' | 'annual' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={handleAddCost}
              disabled={!newCost.category || !newCost.name || !newCost.amount}
              className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50"
            >
              Add Cost
            </button>
          </div>
        </div>
      )}

      {/* Costs by Category */}
      <div className="space-y-4">
        {Object.entries(COST_CATEGORIES).map(([categoryKey, categoryInfo]) => {
          const categoryCosts = costs.filter(c => c.category === categoryKey)
          const isExpanded = expandedCategories.includes(categoryKey)
          const categoryTotal = costsByCategory[categoryKey] || 0

          return (
            <div key={categoryKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => toggleCategory(categoryKey)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-gray-500" />
                  <div className="text-left">
                    <h4 className="font-medium text-gray-900">{categoryInfo.label}</h4>
                    <p className="text-xs text-gray-500">{categoryInfo.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-gray-900">
                    ${categoryTotal.toLocaleString()}/yr
                  </span>
                  <span className="text-xs text-gray-500">
                    ({categoryCosts.length} items)
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="p-4 space-y-3">
                  {categoryCosts.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No costs in this category yet
                    </p>
                  ) : (
                    categoryCosts.map(cost => (
                      <div key={cost.id} className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={cost.name}
                            onChange={(e) => handleUpdateCost(cost.id, { name: e.target.value })}
                            className="text-sm font-medium text-gray-900 bg-transparent border-0 focus:ring-0 p-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm">$</span>
                          <input
                            type="number"
                            value={cost.amount}
                            onChange={(e) => handleUpdateCost(cost.id, { amount: parseFloat(e.target.value) || 0 })}
                            className="w-24 text-right text-sm border border-gray-300 rounded px-2 py-1"
                          />
                          <select
                            value={cost.frequency}
                            onChange={(e) => handleUpdateCost(cost.id, { frequency: e.target.value as 'monthly' | 'annual' })}
                            className="text-sm border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="monthly">/mo</option>
                            <option value="annual">/yr</option>
                          </select>
                          <button
                            onClick={() => handleRemoveCost(cost.id)}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  <button
                    onClick={() => {
                      setNewCost({ ...newCost, category: categoryKey })
                      setShowAddForm(true)
                    }}
                    className="flex items-center gap-2 text-sm text-brand-orange hover:text-brand-orange-600"
                  >
                    <Plus className="w-4 h-4" />
                    Add to {categoryInfo.label}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
