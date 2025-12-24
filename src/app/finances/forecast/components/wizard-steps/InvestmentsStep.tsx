'use client'

import React, { useState } from 'react'
import {
  TrendingUp,
  Plus,
  Trash2,
  Link2,
  AlertCircle,
  DollarSign
} from 'lucide-react'
import type { StrategicInitiative, ForecastInvestment } from '../../types'
import { INVESTMENT_ACCOUNT_CATEGORIES } from '../../types'

interface InvestmentsStepProps {
  investments: ForecastInvestment[]
  initiatives: StrategicInitiative[]
  onInvestmentsChange: (investments: ForecastInvestment[]) => void
  onAddDecision: (decision: any) => void
  forecastId?: string
  businessId: string
}

export default function InvestmentsStep({
  investments,
  initiatives,
  onInvestmentsChange,
  onAddDecision,
  forecastId,
  businessId
}: InvestmentsStepProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newInvestment, setNewInvestment] = useState<Partial<ForecastInvestment>>({
    name: '',
    investment_type: 'opex',
    amount: undefined,
    start_month: '',
    is_recurring: false,
    initiative_id: undefined,
    pl_account_category: undefined
  })

  // Calculate totals
  const totalCapex = investments
    .filter(i => i.investment_type === 'capex')
    .reduce((sum, i) => sum + (i.amount || 0), 0)

  const totalOpex = investments
    .filter(i => i.investment_type === 'opex')
    .reduce((sum, i) => sum + (i.amount || 0), 0)

  const initiativesWithInvestments = new Set(investments.map(i => i.initiative_id).filter(Boolean))
  const initiativesWithoutInvestments = initiatives.filter(i => !initiativesWithInvestments.has(i.id))

  // Generate month options
  const getMonthOptions = () => {
    const options: { value: string; label: string }[] = []
    const now = new Date()

    for (let i = 0; i < 24; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const label = date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
      options.push({ value, label })
    }

    return options
  }

  // Add investment
  const handleAddInvestment = async () => {
    if (!newInvestment.name || !newInvestment.amount || !newInvestment.start_month) return

    const investment: ForecastInvestment = {
      id: `inv-${Date.now()}`,
      forecast_id: forecastId || '',
      user_id: '',
      business_id: businessId,
      name: newInvestment.name,
      description: newInvestment.description,
      investment_type: newInvestment.investment_type || 'opex',
      amount: newInvestment.amount,
      start_month: newInvestment.start_month,
      is_recurring: newInvestment.is_recurring || false,
      recurrence: newInvestment.recurrence,
      end_month: newInvestment.end_month,
      initiative_id: newInvestment.initiative_id,
      pl_account_category: newInvestment.pl_account_category,
      depreciation_years: newInvestment.depreciation_years,
      reasoning: newInvestment.reasoning,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    onInvestmentsChange([...investments, investment])
    onAddDecision({
      decision_type: 'investment',
      decision_data: investment,
      linked_initiative_id: investment.initiative_id
    })

    // Reset form
    setNewInvestment({
      name: '',
      investment_type: 'opex',
      amount: undefined,
      start_month: '',
      is_recurring: false,
      initiative_id: undefined,
      pl_account_category: undefined
    })
    setShowAddForm(false)
  }

  // Remove investment
  const handleRemoveInvestment = (id: string) => {
    const investment = investments.find(i => i.id === id)
    onInvestmentsChange(investments.filter(i => i.id !== id))

    if (investment) {
      onAddDecision({
        decision_type: 'investment_removed',
        decision_data: investment
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Investment Summary</h3>
            <p className="text-sm text-gray-600">{investments.length} planned investments</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-700">Capital Expenditure (CapEx)</p>
            <p className="text-2xl font-bold text-blue-900">${totalCapex.toLocaleString()}</p>
            <p className="text-xs text-blue-600">Assets, equipment, major purchases</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-700">Operating Expenditure (OpEx)</p>
            <p className="text-2xl font-bold text-green-900">${totalOpex.toLocaleString()}</p>
            <p className="text-xs text-green-600">Services, subscriptions, consulting</p>
          </div>
        </div>

        {/* Initiatives without investments */}
        {initiativesWithoutInvestments.length > 0 && (
          <div className="mt-4 flex items-start gap-2 text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">{initiativesWithoutInvestments.length} initiative(s) have no planned investments:</p>
              <ul className="mt-1 text-xs">
                {initiativesWithoutInvestments.slice(0, 3).map(init => (
                  <li key={init.id}>• {init.title}</li>
                ))}
                {initiativesWithoutInvestments.length > 3 && (
                  <li>• +{initiativesWithoutInvestments.length - 3} more</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Add Investment Button */}
      <button
        onClick={() => setShowAddForm(true)}
        className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Investment
      </button>

      {/* Add Investment Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Add Strategic Investment</h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={newInvestment.name || ''}
                onChange={(e) => setNewInvestment({ ...newInvestment, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                placeholder="e.g. New CRM System"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select
                value={newInvestment.investment_type || 'opex'}
                onChange={(e) => setNewInvestment({ ...newInvestment, investment_type: e.target.value as 'capex' | 'opex' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
              >
                <option value="opex">OpEx (Expense)</option>
                <option value="capex">CapEx (Asset)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  value={newInvestment.amount || ''}
                  onChange={(e) => setNewInvestment({ ...newInvestment, amount: parseFloat(e.target.value) || undefined })}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                  placeholder="10000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Month *</label>
              <select
                value={newInvestment.start_month || ''}
                onChange={(e) => setNewInvestment({ ...newInvestment, start_month: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
              >
                <option value="">Select month...</option>
                {getMonthOptions().map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">P&L Category</label>
              <select
                value={newInvestment.pl_account_category || ''}
                onChange={(e) => setNewInvestment({ ...newInvestment, pl_account_category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
              >
                <option value="">Select category...</option>
                {Object.entries(INVESTMENT_ACCOUNT_CATEGORIES).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </div>

            {initiatives.length > 0 && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Link to Initiative</label>
                <select
                  value={newInvestment.initiative_id || ''}
                  onChange={(e) => setNewInvestment({ ...newInvestment, initiative_id: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                >
                  <option value="">None</option>
                  {initiatives.map(init => (
                    <option key={init.id} value={init.id}>{init.title}</option>
                  ))}
                </select>
              </div>
            )}

            {newInvestment.investment_type === 'capex' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Depreciation (years)</label>
                <input
                  type="number"
                  value={newInvestment.depreciation_years || ''}
                  onChange={(e) => setNewInvestment({ ...newInvestment, depreciation_years: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                  placeholder="3"
                  min="1"
                  max="20"
                />
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={newInvestment.reasoning || ''}
                onChange={(e) => setNewInvestment({ ...newInvestment, reasoning: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                rows={2}
                placeholder="Why is this investment needed?"
              />
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
              onClick={handleAddInvestment}
              disabled={!newInvestment.name || !newInvestment.amount || !newInvestment.start_month}
              className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50"
            >
              Add Investment
            </button>
          </div>
        </div>
      )}

      {/* Investments List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Investment</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Initiative</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {investments.map((investment) => {
              const linkedInitiative = initiatives.find(i => i.id === investment.initiative_id)

              return (
                <tr key={investment.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{investment.name}</p>
                    {investment.description && (
                      <p className="text-xs text-gray-500">{investment.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      investment.investment_type === 'capex'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {investment.investment_type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {linkedInitiative ? (
                      <div className="flex items-center gap-1 text-sm text-brand-orange">
                        <Link2 className="w-3 h-3" />
                        {linkedInitiative.title}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {investment.start_month}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                    ${(investment.amount || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleRemoveInvestment(investment.id!)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )
            })}

            {investments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No investments planned yet. Add investments to support your strategic initiatives.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
