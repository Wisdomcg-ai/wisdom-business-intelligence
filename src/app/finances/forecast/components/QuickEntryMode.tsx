'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  ChevronDown,
  ChevronUp,
  Users,
  Building2,
  TrendingUp,
  DollarSign,
  Check,
  AlertCircle,
  Loader2,
  Save
} from 'lucide-react'
import type {
  XeroEmployee,
  ForecastEmployee,
  ForecastInvestment,
  StrategicInitiative,
  BusinessGoals,
  WageClassification
} from '../types'
import { COST_CATEGORIES, INVESTMENT_ACCOUNT_CATEGORIES } from '../types'

interface OperatingCost {
  id: string
  category: string
  name: string
  annual_amount: number
  is_monthly: boolean
}

interface QuickEntryModeProps {
  businessId: string
  forecastId?: string
  goals: BusinessGoals | null
  onClose: () => void
  onComplete: (data: QuickEntryData) => void
}

interface QuickEntryData {
  team: ForecastEmployee[]
  costs: OperatingCost[]
  investments: ForecastInvestment[]
  yearsSelected: number[]
}

export default function QuickEntryMode({
  businessId,
  forecastId,
  goals,
  onClose,
  onComplete
}: QuickEntryModeProps) {
  // Section expand states
  const [expandedSections, setExpandedSections] = useState({
    settings: true,
    team: true,
    costs: true,
    investments: false
  })

  // Form data
  const [yearsSelected, setYearsSelected] = useState<number[]>([1])
  const [team, setTeam] = useState<ForecastEmployee[]>([])
  const [costs, setCosts] = useState<OperatingCost[]>([])
  const [investments, setInvestments] = useState<ForecastInvestment[]>([])
  const [initiatives, setInitiatives] = useState<StrategicInitiative[]>([])

  // Loading states
  const [isLoadingTeam, setIsLoadingTeam] = useState(false)
  const [isLoadingInitiatives, setIsLoadingInitiatives] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Load Xero employees on mount
  useEffect(() => {
    loadTeamFromXero()
    loadInitiatives()
  }, [businessId])

  const loadTeamFromXero = async () => {
    setIsLoadingTeam(true)
    try {
      const response = await fetch(`/api/Xero/employees?business_id=${businessId}`)
      if (response.ok) {
        const data = await response.json()
        const employees: ForecastEmployee[] = data.employees?.map((emp: XeroEmployee) => ({
          id: emp.employee_id,
          employee_name: emp.full_name,
          position: emp.job_title,
          annual_salary: emp.annual_salary || 0,
          classification: 'opex' as WageClassification,
          start_date: emp.start_date
        })) || []
        setTeam(employees)
      }
    } catch (error) {
      console.error('Failed to load team:', error)
    } finally {
      setIsLoadingTeam(false)
    }
  }

  const loadInitiatives = async () => {
    setIsLoadingInitiatives(true)
    try {
      const response = await fetch(`/api/strategic-initiatives?businessId=${businessId}`)
      if (response.ok) {
        const data = await response.json()
        setInitiatives(data.initiatives || [])
      }
    } catch (error) {
      console.error('Failed to load initiatives:', error)
    } finally {
      setIsLoadingInitiatives(false)
    }
  }

  // Toggle section
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  // Team management
  const updateTeamMember = (id: string, updates: Partial<ForecastEmployee>) => {
    setTeam(prev => prev.map(emp =>
      emp.id === id ? { ...emp, ...updates } : emp
    ))
  }

  const addTeamMember = () => {
    const newMember: ForecastEmployee = {
      id: `new-${Date.now()}`,
      employee_name: '',
      position: '',
      annual_salary: 0,
      classification: 'opex',
      start_date: new Date().toISOString().slice(0, 7)
    }
    setTeam(prev => [...prev, newMember])
  }

  const removeTeamMember = (id: string) => {
    setTeam(prev => prev.filter(emp => emp.id !== id))
  }

  // Cost management
  const addCost = () => {
    const newCost: OperatingCost = {
      id: `cost-${Date.now()}`,
      category: 'other',
      name: '',
      annual_amount: 0,
      is_monthly: true
    }
    setCosts(prev => [...prev, newCost])
  }

  const updateCost = (id: string, updates: Partial<OperatingCost>) => {
    setCosts(prev => prev.map(cost =>
      cost.id === id ? { ...cost, ...updates } : cost
    ))
  }

  const removeCost = (id: string) => {
    setCosts(prev => prev.filter(cost => cost.id !== id))
  }

  // Investment management
  const addInvestment = () => {
    const newInvestment: ForecastInvestment = {
      id: `inv-${Date.now()}`,
      forecast_id: forecastId || '',
      user_id: '',
      business_id: businessId,
      name: '',
      investment_type: 'opex',
      amount: 0,
      start_month: new Date().toISOString().slice(0, 7),
      is_recurring: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    setInvestments(prev => [...prev, newInvestment])
  }

  const updateInvestment = (id: string, updates: Partial<ForecastInvestment>) => {
    setInvestments(prev => prev.map(inv =>
      inv.id === id ? { ...inv, ...updates } : inv
    ))
  }

  const removeInvestment = (id: string) => {
    setInvestments(prev => prev.filter(inv => inv.id !== id))
  }

  // Calculate totals
  const totalTeamCost = team.reduce((sum, emp) => sum + (emp.annual_salary || 0) * 1.12, 0)
  const totalCOGS = team.filter(e => e.classification === 'cogs').reduce((sum, e) => sum + (e.annual_salary || 0) * 1.12, 0)
  const totalOpExWages = team.filter(e => e.classification === 'opex').reduce((sum, e) => sum + (e.annual_salary || 0) * 1.12, 0)
  const totalOperatingCosts = costs.reduce((sum, c) => sum + c.annual_amount, 0)
  const totalInvestments = investments.reduce((sum, i) => sum + i.amount, 0)

  const revenueTarget = goals?.revenue_target || 0
  const grossProfit = revenueTarget - totalCOGS
  const netProfit = grossProfit - totalOpExWages - totalOperatingCosts - totalInvestments
  const netMargin = revenueTarget > 0 ? (netProfit / revenueTarget) * 100 : 0

  // Handle save
  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onComplete({
        team,
        costs,
        investments,
        yearsSelected
      })
    } finally {
      setIsSaving(false)
    }
  }

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Quick Entry Mode</h2>
            <p className="text-sm text-gray-600">Fast, form-based forecast entry</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Live Summary Bar */}
          <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-5 gap-4 text-center sticky top-0 z-10">
            <div>
              <p className="text-xs text-gray-500">Revenue Target</p>
              <p className="text-lg font-bold text-gray-900">${(revenueTarget / 1000).toFixed(0)}K</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Team Cost</p>
              <p className="text-lg font-bold text-blue-600">${(totalTeamCost / 1000).toFixed(0)}K</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Operating Costs</p>
              <p className="text-lg font-bold text-purple-600">${(totalOperatingCosts / 1000).toFixed(0)}K</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Investments</p>
              <p className="text-lg font-bold text-orange-600">${(totalInvestments / 1000).toFixed(0)}K</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Net Profit</p>
              <p className={`text-lg font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${(netProfit / 1000).toFixed(0)}K ({netMargin.toFixed(1)}%)
              </p>
            </div>
          </div>

          {/* Settings Section */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('settings')}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-gray-600" />
                </div>
                <div className="text-left">
                  <h3 className="font-medium text-gray-900">Forecast Settings</h3>
                  <p className="text-sm text-gray-500">{yearsSelected.length} year(s) selected</p>
                </div>
              </div>
              {expandedSections.settings ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {expandedSections.settings && (
              <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-2">Years to Forecast</label>
                <div className="flex gap-2">
                  {[1, 2, 3].map(year => (
                    <button
                      key={year}
                      onClick={() => {
                        if (yearsSelected.includes(year)) {
                          setYearsSelected(prev => prev.filter(y => y !== year))
                        } else {
                          setYearsSelected(prev => [...prev, year].sort())
                        }
                      }}
                      className={`px-4 py-2 rounded-lg border ${
                        yearsSelected.includes(year)
                          ? 'bg-brand-orange text-white border-brand-orange'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Year {year}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Year 1: Monthly detail • Year 2: Quarterly • Year 3: Annual
                </p>
              </div>
            )}
          </div>

          {/* Team Section */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('team')}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-left">
                  <h3 className="font-medium text-gray-900">Team & Payroll</h3>
                  <p className="text-sm text-gray-500">{team.length} team members • ${(totalTeamCost / 1000).toFixed(0)}K/year</p>
                </div>
              </div>
              {expandedSections.team ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {expandedSections.team && (
              <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                {isLoadingTeam ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                    <span className="ml-2 text-gray-500">Loading team from Xero...</span>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="pb-2 font-medium">Name</th>
                            <th className="pb-2 font-medium">Role</th>
                            <th className="pb-2 font-medium">Classification</th>
                            <th className="pb-2 font-medium text-right">Salary</th>
                            <th className="pb-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {team.map(emp => (
                            <tr key={emp.id} className="hover:bg-gray-50">
                              <td className="py-2">
                                <input
                                  type="text"
                                  value={emp.employee_name}
                                  onChange={(e) => updateTeamMember(emp.id!, { employee_name: e.target.value })}
                                  className="w-full px-2 py-1 border border-gray-200 rounded"
                                  placeholder="Name"
                                />
                              </td>
                              <td className="py-2">
                                <input
                                  type="text"
                                  value={emp.position || ''}
                                  onChange={(e) => updateTeamMember(emp.id!, { position: e.target.value })}
                                  className="w-full px-2 py-1 border border-gray-200 rounded"
                                  placeholder="Role"
                                />
                              </td>
                              <td className="py-2">
                                <select
                                  value={emp.classification}
                                  onChange={(e) => updateTeamMember(emp.id!, { classification: e.target.value as WageClassification })}
                                  className="w-full px-2 py-1 border border-gray-200 rounded"
                                >
                                  <option value="opex">OpEx</option>
                                  <option value="cogs">COGS</option>
                                </select>
                              </td>
                              <td className="py-2">
                                <input
                                  type="number"
                                  value={emp.annual_salary || ''}
                                  onChange={(e) => updateTeamMember(emp.id!, { annual_salary: parseFloat(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 border border-gray-200 rounded text-right"
                                  placeholder="0"
                                />
                              </td>
                              <td className="py-2 text-center">
                                <button
                                  onClick={() => removeTeamMember(emp.id!)}
                                  className="p-1 text-gray-400 hover:text-red-600"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={addTeamMember}
                      className="mt-3 text-sm text-brand-orange hover:text-brand-orange-600"
                    >
                      + Add team member
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Operating Costs Section */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('costs')}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-purple-600" />
                </div>
                <div className="text-left">
                  <h3 className="font-medium text-gray-900">Operating Costs</h3>
                  <p className="text-sm text-gray-500">{costs.length} cost items • ${(totalOperatingCosts / 1000).toFixed(0)}K/year</p>
                </div>
              </div>
              {expandedSections.costs ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {expandedSections.costs && (
              <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                <div className="space-y-2">
                  {costs.map(cost => (
                    <div key={cost.id} className="flex items-center gap-2">
                      <select
                        value={cost.category}
                        onChange={(e) => updateCost(cost.id, { category: e.target.value })}
                        className="w-40 px-2 py-1.5 border border-gray-200 rounded text-sm"
                      >
                        {Object.entries(COST_CATEGORIES).map(([key, value]) => (
                          <option key={key} value={key}>{value.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={cost.name}
                        onChange={(e) => updateCost(cost.id, { name: e.target.value })}
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm"
                        placeholder="Cost name"
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          value={cost.annual_amount || ''}
                          onChange={(e) => updateCost(cost.id, { annual_amount: parseFloat(e.target.value) || 0 })}
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded text-sm text-right"
                          placeholder="0"
                        />
                        <span className="text-gray-400 text-sm">/year</span>
                      </div>
                      <button
                        onClick={() => removeCost(cost.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addCost}
                  className="mt-3 text-sm text-brand-orange hover:text-brand-orange-600"
                >
                  + Add operating cost
                </button>
              </div>
            )}
          </div>

          {/* Investments Section */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('investments')}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-orange-600" />
                </div>
                <div className="text-left">
                  <h3 className="font-medium text-gray-900">Strategic Investments</h3>
                  <p className="text-sm text-gray-500">{investments.length} investments • ${(totalInvestments / 1000).toFixed(0)}K</p>
                </div>
              </div>
              {expandedSections.investments ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {expandedSections.investments && (
              <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                <div className="space-y-3">
                  {investments.map(inv => (
                    <div key={inv.id} className="p-3 bg-gray-50 rounded-lg space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={inv.name}
                          onChange={(e) => updateInvestment(inv.id, { name: e.target.value })}
                          className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="Investment name"
                        />
                        <select
                          value={inv.investment_type}
                          onChange={(e) => updateInvestment(inv.id, { investment_type: e.target.value as 'capex' | 'opex' })}
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded text-sm"
                        >
                          <option value="opex">OpEx</option>
                          <option value="capex">CapEx</option>
                        </select>
                        <button
                          onClick={() => removeInvestment(inv.id)}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-sm">$</span>
                          <input
                            type="number"
                            value={inv.amount || ''}
                            onChange={(e) => updateInvestment(inv.id, { amount: parseFloat(e.target.value) || 0 })}
                            className="w-28 px-2 py-1.5 border border-gray-200 rounded text-sm text-right"
                            placeholder="0"
                          />
                        </div>
                        <select
                          value={inv.start_month}
                          onChange={(e) => updateInvestment(inv.id, { start_month: e.target.value })}
                          className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm"
                        >
                          {getMonthOptions().map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        {initiatives.length > 0 && (
                          <select
                            value={inv.initiative_id || ''}
                            onChange={(e) => updateInvestment(inv.id, { initiative_id: e.target.value || undefined })}
                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm"
                          >
                            <option value="">Link to initiative...</option>
                            {initiatives.map(init => (
                              <option key={init.id} value={init.id}>{init.title}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addInvestment}
                  className="mt-3 text-sm text-brand-orange hover:text-brand-orange-600"
                >
                  + Add investment
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            {netMargin < (goals?.net_profit_percent || 10) && (
              <div className="flex items-center gap-1 text-yellow-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Net margin below target ({(goals?.net_profit_percent || 10)}%)</span>
              </div>
            )}
            {netMargin >= (goals?.net_profit_percent || 10) && (
              <div className="flex items-center gap-1 text-green-600 text-sm">
                <Check className="w-4 h-4" />
                <span>Meeting profit targets</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || team.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Forecast
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
