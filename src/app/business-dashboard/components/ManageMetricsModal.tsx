'use client'

import React, { useState, useRef, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import type { DashboardPreferences } from '../services/dashboard-preferences-service'
import type { KPIData } from '@/app/goals/types'
import { KPIService } from '@/app/goals/services/kpi-service'

interface ManageMetricsModalProps {
  isOpen: boolean
  onClose: () => void
  preferences: DashboardPreferences
  kpis: KPIData[]
  onSave: (preferences: DashboardPreferences) => void
  businessId: string
  userId: string
  onKpiCreated: () => void
}

// Core metrics that can be toggled
const CORE_METRICS = [
  { id: 'leads', name: 'Leads per Month' },
  { id: 'conversion_rate', name: 'Conversion Rate' },
  { id: 'avg_transaction', name: 'Avg Transaction Value' },
  { id: 'team_headcount', name: 'Team Headcount' },
  { id: 'owner_hours', name: 'Owner Hours per Week' },
]

export default function ManageMetricsModal({
  isOpen,
  onClose,
  preferences,
  kpis,
  onSave,
  businessId,
  userId,
  onKpiCreated
}: ManageMetricsModalProps) {
  const [localPreferences, setLocalPreferences] = useState<DashboardPreferences>(preferences)
  const [isCreatingKPI, setIsCreatingKPI] = useState(false)
  const [newKpiName, setNewKpiName] = useState('')
  const [newKpiUnit, setNewKpiUnit] = useState<'currency' | 'percentage' | 'number'>('number')
  const [newKpiYear1Target, setNewKpiYear1Target] = useState('')
  const [newKpiQuarterlyTarget, setNewKpiQuarterlyTarget] = useState('')
  const [isSavingKPI, setIsSavingKPI] = useState(false)
  const [kpiError, setKpiError] = useState('')

  // Ref for auto-scrolling to form
  const createFormRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to form when it appears
  useEffect(() => {
    if (isCreatingKPI && createFormRef.current) {
      setTimeout(() => {
        createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    }
  }, [isCreatingKPI])

  if (!isOpen) return null

  const toggleCoreMetric = (metricId: string) => {
    const isVisible = localPreferences.visible_core_metrics.includes(metricId)

    setLocalPreferences({
      ...localPreferences,
      visible_core_metrics: isVisible
        ? localPreferences.visible_core_metrics.filter(id => id !== metricId)
        : [...localPreferences.visible_core_metrics, metricId]
    })
  }

  const toggleCustomKpi = (kpiId: string) => {
    const isHidden = localPreferences.hidden_custom_kpis.includes(kpiId)

    setLocalPreferences({
      ...localPreferences,
      hidden_custom_kpis: isHidden
        ? localPreferences.hidden_custom_kpis.filter(id => id !== kpiId)
        : [...localPreferences.hidden_custom_kpis, kpiId]
    })
  }

  const handleSave = () => {
    onSave(localPreferences)
    onClose()
  }

  const handleCancel = () => {
    setLocalPreferences(preferences) // Reset to original
    resetCreateKpiForm()
    onClose()
  }

  const resetCreateKpiForm = () => {
    setIsCreatingKPI(false)
    setNewKpiName('')
    setNewKpiUnit('number')
    setNewKpiYear1Target('')
    setNewKpiQuarterlyTarget('')
    setKpiError('')
  }

  const handleCreateKpi = async () => {
    // Validation
    if (!newKpiName.trim()) {
      setKpiError('KPI name is required')
      return
    }

    if (!newKpiYear1Target || parseFloat(newKpiYear1Target) < 0) {
      setKpiError('Valid annual target is required')
      return
    }

    if (!newKpiQuarterlyTarget || parseFloat(newKpiQuarterlyTarget) < 0) {
      setKpiError('Valid quarterly target is required')
      return
    }

    setIsSavingKPI(true)
    setKpiError('')

    try {
      // Create new KPI object
      const newKpi: KPIData = {
        id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        name: newKpiName.trim(),
        friendlyName: newKpiName.trim(),
        category: 'CUSTOM',
        currentValue: 0,
        year1Target: parseFloat(newKpiYear1Target),
        year2Target: 0,
        year3Target: 0,
        unit: newKpiUnit,
        frequency: 'monthly',
        description: `Custom KPI created from dashboard. Quarterly target: ${newKpiQuarterlyTarget}`,
        isCustom: true
      }

      // Get all current KPIs and add the new one
      const allKpis = [...kpis, newKpi]

      // Save to database
      const result = await KPIService.saveUserKPIs(businessId, userId, allKpis)

      if (result.success) {
        console.log('[ManageMetricsModal] KPI created successfully')
        resetCreateKpiForm()
        onKpiCreated() // Trigger parent to reload KPIs
      } else {
        setKpiError(result.error || 'Failed to create KPI')
      }
    } catch (err) {
      console.error('[ManageMetricsModal] Error creating KPI:', err)
      setKpiError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSavingKPI(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Manage Dashboard Metrics</h2>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Financial Goals Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Financial Goals
                <span className="text-sm font-normal text-gray-500 ml-2">(always visible)</span>
              </h3>
              <div className="space-y-2">
                <label className="flex items-center p-3 bg-gray-50 rounded-lg cursor-not-allowed opacity-60">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled
                    className="w-4 h-4 text-brand-orange rounded border-gray-300 cursor-not-allowed"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-700">Revenue</span>
                </label>
                <label className="flex items-center p-3 bg-gray-50 rounded-lg cursor-not-allowed opacity-60">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled
                    className="w-4 h-4 text-brand-orange rounded border-gray-300 cursor-not-allowed"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-700">Gross Profit</span>
                </label>
                <label className="flex items-center p-3 bg-gray-50 rounded-lg cursor-not-allowed opacity-60">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled
                    className="w-4 h-4 text-brand-orange rounded border-gray-300 cursor-not-allowed"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-700">Net Profit</span>
                </label>
              </div>
            </div>

            {/* Core Business Metrics Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Core Business Metrics</h3>
              <div className="space-y-2">
                {CORE_METRICS.map((metric) => {
                  const isVisible = localPreferences.visible_core_metrics.includes(metric.id)
                  return (
                    <label
                      key={metric.id}
                      className="flex items-center p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => toggleCoreMetric(metric.id)}
                        className="w-4 h-4 text-brand-orange rounded border-gray-300 focus:ring-2 focus:ring-brand-orange"
                      />
                      <span className="ml-3 text-sm font-medium text-gray-700">{metric.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Custom KPIs Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Custom KPIs</h3>

              <div className="space-y-2">
                {/* Existing KPIs */}
                {kpis.map((kpi) => {
                  const isVisible = !localPreferences.hidden_custom_kpis.includes(kpi.id)
                  return (
                    <label
                      key={kpi.id}
                      className="flex items-center p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => toggleCustomKpi(kpi.id)}
                        className="w-4 h-4 text-brand-orange rounded border-gray-300 focus:ring-2 focus:ring-brand-orange"
                      />
                      <span className="ml-3 text-sm font-medium text-gray-700">{kpi.name}</span>
                    </label>
                  )
                })}

                {/* Create KPI Form - Appears after KPIs list */}
                {isCreatingKPI && (
                  <div ref={createFormRef} className="p-4 bg-brand-orange-50 border-2 border-brand-orange-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900">Create Custom KPI</h4>
                      <button
                        onClick={resetCreateKpiForm}
                        className="text-gray-400 hover:text-gray-600"
                        disabled={isSavingKPI}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Error Message */}
                    {kpiError && (
                      <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        {kpiError}
                      </div>
                    )}

                    {/* KPI Name */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        KPI Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newKpiName}
                        onChange={(e) => setNewKpiName(e.target.value)}
                        placeholder="e.g., Customer Satisfaction Score"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
                        disabled={isSavingKPI}
                      />
                    </div>

                    {/* Unit Type */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Unit Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={newKpiUnit}
                        onChange={(e) => setNewKpiUnit(e.target.value as 'currency' | 'percentage' | 'number')}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
                        disabled={isSavingKPI}
                      >
                        <option value="number">Number</option>
                        <option value="currency">Currency ($)</option>
                        <option value="percentage">Percentage (%)</option>
                      </select>
                    </div>

                    {/* Annual Target */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Annual Target (Year 1) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={newKpiYear1Target}
                        onChange={(e) => setNewKpiYear1Target(e.target.value)}
                        placeholder="e.g., 40 for 40 hours/week"
                        min="0"
                        step="any"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
                        disabled={isSavingKPI}
                      />
                      <p className="text-xs text-gray-500 mt-1">For cumulative metrics (revenue, leads), enter the annual total. For rates/averages (hours per week), enter the target value.</p>
                    </div>

                    {/* Quarterly Target */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Quarterly Target <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={newKpiQuarterlyTarget}
                        onChange={(e) => setNewKpiQuarterlyTarget(e.target.value)}
                        placeholder="e.g., 40 (same as annual for rates)"
                        min="0"
                        step="any"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
                        disabled={isSavingKPI}
                      />
                      <p className="text-xs text-gray-500 mt-1">For cumulative metrics, divide annual by 4. For rates/averages, use the same value as annual.</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={handleCreateKpi}
                        disabled={isSavingKPI}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSavingKPI ? 'Creating...' : 'Create KPI'}
                      </button>
                      <button
                        onClick={resetCreateKpiForm}
                        disabled={isSavingKPI}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* No KPIs Message */}
                {kpis.length === 0 && !isCreatingKPI && (
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-600 text-center">
                      No custom KPIs yet. Click "Create New KPI" to add one.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
            <div>
              {!isCreatingKPI && (
                <button
                  onClick={() => setIsCreatingKPI(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-orange bg-brand-orange-50 rounded-lg hover:bg-brand-orange-100 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create New KPI
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
