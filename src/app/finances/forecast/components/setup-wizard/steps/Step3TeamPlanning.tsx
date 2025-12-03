'use client'

import React, { useState, useMemo } from 'react'
import {
  Users,
  Plus,
  Trash2,
  DollarSign,
  Calendar,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  UserPlus,
  Briefcase,
  HardHat,
  Calculator
} from 'lucide-react'
import type { SetupWizardData, TeamMemberPlan } from '../types'

interface Step3Props {
  data: SetupWizardData
  onUpdate: (updates: Partial<SetupWizardData>) => void
  fiscalYear: number
}

export default function Step3TeamPlanning({
  data,
  onUpdate,
  fiscalYear
}: Step3Props) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newMember, setNewMember] = useState<Partial<TeamMemberPlan>>({
    classification: 'opex',
    isNew: false
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Calculate totals
  const totals = useMemo(() => {
    const opexWages = data.teamMembers
      .filter(m => m.classification === 'opex')
      .reduce((sum, m) => sum + (m.annualSalary || 0), 0)

    const cogsWages = data.teamMembers
      .filter(m => m.classification === 'cogs')
      .reduce((sum, m) => sum + (m.annualSalary || 0), 0)

    const superRate = 0.12 // 12% super
    const opexWithSuper = opexWages * (1 + superRate)
    const cogsWithSuper = cogsWages * (1 + superRate)

    return {
      opexWages,
      cogsWages,
      opexWithSuper,
      cogsWithSuper,
      totalWages: opexWages + cogsWages,
      totalWithSuper: opexWithSuper + cogsWithSuper
    }
  }, [data.teamMembers])

  // Update parent when totals change
  React.useEffect(() => {
    onUpdate({
      totalWagesCOGS: totals.cogsWithSuper,
      totalWagesOpEx: totals.opexWithSuper
    })
  }, [totals.cogsWithSuper, totals.opexWithSuper, onUpdate])

  const handleAddMember = () => {
    if (!newMember.name || !newMember.position || !newMember.annualSalary) return

    const member: TeamMemberPlan = {
      id: `team-${Date.now()}`,
      name: newMember.name,
      position: newMember.position,
      classification: newMember.classification || 'opex',
      annualSalary: newMember.annualSalary,
      startMonth: newMember.startMonth,
      isNew: newMember.isNew || false,
      notes: newMember.notes
    }

    onUpdate({
      teamMembers: [...data.teamMembers, member]
    })

    setNewMember({ classification: 'opex', isNew: false })
    setShowAddForm(false)
  }

  const handleRemoveMember = (id: string) => {
    onUpdate({
      teamMembers: data.teamMembers.filter(m => m.id !== id)
    })
  }

  const handleUpdateMember = (id: string, updates: Partial<TeamMemberPlan>) => {
    onUpdate({
      teamMembers: data.teamMembers.map(m =>
        m.id === id ? { ...m, ...updates } : m
      )
    })
  }

  // Available budget from goals
  const availableOpExBudget = data.grossProfitGoal - data.netProfitGoal
  const wagesAsPercentOfOpEx = availableOpExBudget > 0
    ? (totals.opexWithSuper / availableOpExBudget) * 100
    : 0

  return (
    <div className="space-y-6">
      {/* Teaching Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg mb-1">Step 3: Plan Your Team</h3>
            <p className="text-teal-100 text-sm">
              Your team is your biggest investment. Let's map out who you need to deliver
              your services and run your business.
            </p>
          </div>
        </div>
      </div>

      {/* Why This Matters */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-amber-900 mb-1">Why This Matters</h4>
            <p className="text-sm text-amber-800">
              Staff wages are typically 30-50% of revenue for service businesses. Getting this
              right ensures you have the team to deliver on your revenue goals – but not so many
              that you blow your profit target.
            </p>
          </div>
        </div>
      </div>

      {/* Budget Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">OpEx Wages Budget</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatCurrency(totals.opexWithSuper)}
          </div>
          <div className="text-xs text-gray-500">
            Incl. {formatCurrency(totals.opexWages * 0.12)} super
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <HardHat className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">COGS Wages Budget</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatCurrency(totals.cogsWithSuper)}
          </div>
          <div className="text-xs text-gray-500">
            Incl. {formatCurrency(totals.cogsWages * 0.12)} super
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-4 h-4 text-teal-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">% of OpEx Budget</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {wagesAsPercentOfOpEx.toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500">
            Budget: {formatCurrency(availableOpExBudget)}
          </div>
        </div>
      </div>

      {/* Warning if wages exceed budget */}
      {wagesAsPercentOfOpEx > 80 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-red-900 mb-1">High Wages Warning</h4>
              <p className="text-sm text-red-800">
                OpEx wages are {wagesAsPercentOfOpEx.toFixed(0)}% of your total operating expense budget.
                This leaves only {formatCurrency(availableOpExBudget - totals.opexWithSuper)} for
                rent, marketing, and other expenses. Consider reducing headcount or increasing revenue goals.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Team List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h4 className="font-semibold text-gray-900">
            Team Members ({data.teamMembers.length})
          </h4>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Team Member
          </button>
        </div>

        {data.teamMembers.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              No team members added yet. Add your current team and any planned hires.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.teamMembers.map((member) => (
              <div key={member.id} className="px-5 py-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${member.classification === 'cogs' ? 'bg-orange-100' : 'bg-blue-100'
                  }`}>
                  {member.classification === 'cogs' ? (
                    <HardHat className="w-5 h-5 text-orange-600" />
                  ) : (
                    <Briefcase className="w-5 h-5 text-blue-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{member.name}</span>
                    {member.isNew && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                        New Hire
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 flex items-center gap-3">
                    <span>{member.position}</span>
                    <span className="text-gray-300">•</span>
                    <span className={member.classification === 'cogs' ? 'text-orange-600' : 'text-blue-600'}>
                      {member.classification === 'cogs' ? 'COGS' : 'OpEx'}
                    </span>
                    {member.startMonth && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Starts {member.startMonth}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-semibold text-gray-900">
                    {formatCurrency(member.annualSalary)}
                  </div>
                  <div className="text-xs text-gray-500">
                    + {formatCurrency(member.annualSalary * 0.12)} super
                  </div>
                </div>

                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-teal-600" />
                Add Team Member
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newMember.name || ''}
                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="e.g., John Smith"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Position *
                  </label>
                  <input
                    type="text"
                    value={newMember.position || ''}
                    onChange={(e) => setNewMember({ ...newMember, position: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="e.g., Electrician"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Annual Salary (incl. allowances) *
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      value={newMember.annualSalary || ''}
                      onChange={(e) => setNewMember({ ...newMember, annualSalary: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="80000"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Super will be calculated at 12%
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Classification *
                  </label>
                  <select
                    value={newMember.classification || 'opex'}
                    onChange={(e) => setNewMember({ ...newMember, classification: e.target.value as 'opex' | 'cogs' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="opex">OpEx (Admin, Sales, etc.)</option>
                    <option value="cogs">COGS (Directly billable)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Month (if new hire)
                  </label>
                  <input
                    type="month"
                    value={newMember.startMonth || ''}
                    onChange={(e) => setNewMember({ ...newMember, startMonth: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    min={`${fiscalYear - 1}-07`}
                    max={`${fiscalYear}-06`}
                  />
                </div>

                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newMember.isNew || false}
                      onChange={(e) => setNewMember({ ...newMember, isNew: e.target.checked })}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700">This is a planned new hire</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setNewMember({ classification: 'opex', isNew: false })
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMember}
                disabled={!newMember.name || !newMember.position || !newMember.annualSalary}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Team Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How We'll Use This */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-teal-600" />
          How We'll Use This Data
        </h4>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-teal-600 font-bold">•</span>
            <span>
              <strong>COGS wages</strong> will be factored into your cost of sales calculations
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-600 font-bold">•</span>
            <span>
              <strong>OpEx wages</strong> will appear as a line item in your operating expenses
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-600 font-bold">•</span>
            <span>
              <strong>Start dates</strong> allow us to pro-rata salaries for new hires
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
