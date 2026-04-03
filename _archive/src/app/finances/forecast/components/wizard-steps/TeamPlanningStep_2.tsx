'use client'

import React, { useState, useEffect } from 'react'
import {
  Users,
  Plus,
  Trash2,
  Download,
  Loader2,
  Check,
  AlertCircle,
  DollarSign,
  Calendar
} from 'lucide-react'
import type { XeroEmployee, WageClassification } from '../../types'

interface TeamPlanningStepProps {
  businessId: string
  xeroConnected: boolean
  team: XeroEmployee[]
  onTeamChange: (team: XeroEmployee[]) => void
  onAddDecision: (decision: any) => void
}

const CLASSIFICATION_OPTIONS: { value: WageClassification; label: string; description: string }[] = [
  { value: 'cogs', label: 'Revenue-generating (COGS)', description: 'Sales, delivery, production - directly tied to revenue' },
  { value: 'opex', label: 'Operations (OpEx)', description: 'Admin, HR, finance, marketing, support' }
]

const SUPER_RATE = 0.12 // 12% superannuation

export default function TeamPlanningStep({
  businessId,
  xeroConnected,
  team,
  onTeamChange,
  onAddDecision
}: TeamPlanningStepProps) {
  const [isLoadingXero, setIsLoadingXero] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEmployee, setNewEmployee] = useState<Partial<XeroEmployee>>({
    first_name: '',
    last_name: '',
    job_title: '',
    annual_salary: undefined,
    classification: undefined,
    start_date: undefined,
    is_active: true,
    from_xero: false
  })

  // Calculate totals
  const totalTeamCost = team.reduce((sum, emp) => {
    const salary = emp.annual_salary || 0
    const withSuper = salary * (1 + SUPER_RATE)
    return sum + withSuper
  }, 0)

  const costsByClassification = team.reduce((acc, emp) => {
    const classification = emp.classification || 'unclassified'
    const salary = (emp.annual_salary || 0) * (1 + SUPER_RATE)
    acc[classification] = (acc[classification] || 0) + salary
    return acc
  }, {} as Record<string, number>)

  const unclassifiedCount = team.filter(emp => !emp.classification).length

  // Import from Xero
  const handleImportFromXero = async () => {
    setIsLoadingXero(true)
    try {
      const res = await fetch(`/api/Xero/employees?business_id=${businessId}`)
      const data = await res.json()

      if (data.employees && data.employees.length > 0) {
        // Merge with existing team, avoiding duplicates
        const existingIds = new Set(team.map(e => e.employee_id))
        const newEmployees = data.employees.filter((e: XeroEmployee) => !existingIds.has(e.employee_id))

        if (newEmployees.length > 0) {
          onTeamChange([...team, ...newEmployees])
          onAddDecision({
            decision_type: 'import_team',
            decision_data: { imported_count: newEmployees.length, source: 'xero' }
          })
        }
      }
    } catch (error) {
      console.error('[TeamPlanning] Error importing from Xero:', error)
    } finally {
      setIsLoadingXero(false)
    }
  }

  // Update employee classification
  const handleClassificationChange = (employeeId: string, classification: WageClassification) => {
    const updatedTeam = team.map(emp =>
      emp.employee_id === employeeId ? { ...emp, classification } : emp
    )
    onTeamChange(updatedTeam)
    onAddDecision({
      decision_type: 'update_classification',
      decision_data: { employee_id: employeeId, classification }
    })
  }

  // Update employee salary
  const handleSalaryChange = (employeeId: string, salary: number) => {
    const employee = team.find(e => e.employee_id === employeeId)
    const updatedTeam = team.map(emp =>
      emp.employee_id === employeeId ? { ...emp, annual_salary: salary } : emp
    )
    onTeamChange(updatedTeam)

    if (employee && employee.annual_salary !== salary) {
      onAddDecision({
        decision_type: 'salary_change',
        decision_data: {
          employee_id: employeeId,
          old_salary: employee.annual_salary,
          new_salary: salary
        }
      })
    }
  }

  // Remove employee
  const handleRemoveEmployee = (employeeId: string) => {
    const employee = team.find(e => e.employee_id === employeeId)
    onTeamChange(team.filter(emp => emp.employee_id !== employeeId))

    if (employee) {
      onAddDecision({
        decision_type: 'remove_employee',
        decision_data: {
          employee_id: employeeId,
          employee_name: employee.full_name,
          annual_salary: employee.annual_salary
        }
      })
    }
  }

  // Add new employee
  const handleAddEmployee = () => {
    if (!newEmployee.first_name && !newEmployee.last_name) return

    const employee: XeroEmployee = {
      employee_id: `new-${Date.now()}`,
      first_name: newEmployee.first_name || '',
      last_name: newEmployee.last_name || '',
      full_name: `${newEmployee.first_name || ''} ${newEmployee.last_name || ''}`.trim(),
      job_title: newEmployee.job_title,
      annual_salary: newEmployee.annual_salary,
      classification: newEmployee.classification,
      start_date: newEmployee.start_date,
      is_active: true,
      from_xero: false
    }

    onTeamChange([...team, employee])
    onAddDecision({
      decision_type: 'new_hire',
      decision_data: {
        employee_name: employee.full_name,
        job_title: employee.job_title,
        annual_salary: employee.annual_salary,
        classification: employee.classification,
        start_date: employee.start_date
      }
    })

    // Reset form
    setNewEmployee({
      first_name: '',
      last_name: '',
      job_title: '',
      annual_salary: undefined,
      classification: undefined,
      start_date: undefined,
      is_active: true,
      from_xero: false
    })
    setShowAddForm(false)
  }

  // Generate start date options (next 12 months)
  const getStartDateOptions = () => {
    const options: { value: string; label: string }[] = []
    const now = new Date()

    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
      const label = date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
      options.push({ value, label })
    }

    return options
  }

  return (
    <div className="space-y-6">
      {/* Header with totals */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Team Summary</h3>
            <p className="text-sm text-gray-600">{team.length} team members</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">${totalTeamCost.toLocaleString()}</p>
            <p className="text-sm text-gray-600">Total annual cost (inc. super)</p>
          </div>
        </div>

        {/* Cost breakdown by classification */}
        <div className="grid grid-cols-3 gap-4">
          {CLASSIFICATION_OPTIONS.map(({ value, label }) => (
            <div key={value} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-600">{label}</p>
              <p className="text-lg font-semibold text-gray-900">
                ${(costsByClassification[value] || 0).toLocaleString()}
              </p>
            </div>
          ))}
        </div>

        {/* Warning for unclassified */}
        {unclassifiedCount > 0 && (
          <div className="mt-4 flex items-center gap-2 text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{unclassifiedCount} team member(s) need classification</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {xeroConnected && (
          <button
            onClick={handleImportFromXero}
            disabled={isLoadingXero}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isLoadingXero ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Import from Xero
          </button>
        )}

        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Team Member
        </button>
      </div>

      {/* Add employee form */}
      {showAddForm && (
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Add Planned Hire</h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                value={newEmployee.first_name || ''}
                onChange={(e) => setNewEmployee({ ...newEmployee, first_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                value={newEmployee.last_name || ''}
                onChange={(e) => setNewEmployee({ ...newEmployee, last_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position *</label>
              <input
                type="text"
                value={newEmployee.job_title || ''}
                onChange={(e) => setNewEmployee({ ...newEmployee, job_title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                placeholder="e.g. Senior Developer"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Annual Salary (ex super) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  value={newEmployee.annual_salary || ''}
                  onChange={(e) => setNewEmployee({ ...newEmployee, annual_salary: parseFloat(e.target.value) || undefined })}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                  placeholder="80000"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Classification *</label>
              <select
                value={newEmployee.classification || ''}
                onChange={(e) => setNewEmployee({ ...newEmployee, classification: e.target.value as WageClassification })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
              >
                <option value="">Select...</option>
                {CLASSIFICATION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <select
                value={newEmployee.start_date || ''}
                onChange={(e) => setNewEmployee({ ...newEmployee, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
              >
                <option value="">Select month...</option>
                {getStartDateOptions().map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
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
              onClick={handleAddEmployee}
              disabled={!newEmployee.job_title || !newEmployee.annual_salary || !newEmployee.classification}
              className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50"
            >
              Add Team Member
            </button>
          </div>
        </div>
      )}

      {/* Team list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Classification</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Salary</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Cost</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {team.map((employee) => {
              const totalCost = (employee.annual_salary || 0) * (1 + SUPER_RATE)

              return (
                <tr key={employee.employee_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium text-gray-600">
                        {employee.full_name.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{employee.full_name || 'Unnamed'}</p>
                        {employee.from_xero && (
                          <span className="text-xs text-blue-600">From Xero</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {employee.job_title || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={employee.classification || ''}
                      onChange={(e) => handleClassificationChange(employee.employee_id, e.target.value as WageClassification)}
                      className={`text-sm px-2 py-1 border rounded-lg ${
                        !employee.classification ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Select...</option>
                      {CLASSIFICATION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative inline-block">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        value={employee.annual_salary || ''}
                        onChange={(e) => handleSalaryChange(employee.employee_id, parseFloat(e.target.value) || 0)}
                        className="w-28 pl-6 pr-2 py-1 text-sm text-right border border-gray-300 rounded-lg"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                    ${totalCost.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleRemoveEmployee(employee.employee_id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )
            })}

            {team.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No team members yet. Import from Xero or add manually.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
