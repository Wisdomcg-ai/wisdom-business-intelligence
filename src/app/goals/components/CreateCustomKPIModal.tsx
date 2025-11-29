// /app/goals/components/CreateCustomKPIModal.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Plus, Info, AlertTriangle } from 'lucide-react'
import { CustomKPIService, CustomKPI } from '../services/custom-kpi-service'
import { KPIData } from '../types'

interface CreateCustomKPIModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (kpi: CustomKPI) => void
  userId: string
  businessId: string
  existingCategories: string[]
  allAvailableKPIs?: KPIData[] // For duplicate detection
}

export default function CreateCustomKPIModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  businessId,
  existingCategories,
  allAvailableKPIs = []
}: CreateCustomKPIModalProps) {
  const [category, setCategory] = useState('')
  const [isNewCategory, setIsNewCategory] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<'currency' | 'percentage' | 'number'>('number')
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'>('monthly')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  // Find similar KPIs to prevent duplicates
  const similarKPIs = useMemo(() => {
    if (!name.trim() || name.trim().length < 3) return []

    const searchTerm = name.toLowerCase().trim()

    return allAvailableKPIs.filter(kpi => {
      const kpiName = kpi.name.toLowerCase()
      const kpiFriendlyName = kpi.friendlyName?.toLowerCase() || ''
      const kpiDescription = kpi.description?.toLowerCase() || ''

      return (
        kpiName.includes(searchTerm) ||
        kpiFriendlyName.includes(searchTerm) ||
        kpiDescription.includes(searchTerm) ||
        searchTerm.includes(kpiName)
      )
    }).slice(0, 5) // Limit to 5 suggestions
  }, [name, allAvailableKPIs])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!category.trim() || !name.trim()) {
      setError('Category and Name are required')
      return
    }

    setIsSaving(true)

    const result = await CustomKPIService.createCustomKPI(userId, businessId, {
      category: category.trim(),
      name: name.trim(),
      friendlyName: name.trim(),
      unit,
      frequency,
      description: description.trim()
    })

    setIsSaving(false)

    if (result.success && result.data) {
      // Reset form
      setCategory('')
      setIsNewCategory(false)
      setName('')
      setUnit('number')
      setFrequency('monthly')
      setDescription('')

      onSuccess(result.data)
      onClose()
    } else {
      setError(result.error || 'Failed to create custom KPI')
    }
  }

  const handleClose = () => {
    setError('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Create Custom KPI</h2>
            <p className="text-sm text-gray-600 mt-1">
              Add a unique metric to track your business
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="mx-6 mt-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-teal-900">
              <p className="font-semibold mb-1">Growing the KPI Library</p>
              <p>Your custom KPI will be immediately available to your business. After admin approval, it will become available to all users on the platform!</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Category Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Category *
            </label>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewCategory(false)}
                  className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                    !isNewCategory
                      ? 'border-teal-500 bg-teal-50 text-teal-900'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Existing Category
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewCategory(true)}
                  className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                    isNewCategory
                      ? 'border-teal-500 bg-teal-50 text-teal-900'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <Plus className="w-4 h-4 inline mr-2" />
                  New Category
                </button>
              </div>

              {!isNewCategory ? (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                >
                  <option value="">Select a category...</option>
                  {existingCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Customer Success, Innovation, Quality"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                />
              )}
            </div>
          </div>

          {/* KPI Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              KPI Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Net Promoter Score, Time to Resolution"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              required
            />

            {/* Similar KPIs Warning */}
            {similarKPIs.length > 0 && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-yellow-900 mb-1">
                      Similar KPIs Found
                    </p>
                    <p className="text-xs text-yellow-800 mb-2">
                      Before creating a new KPI, check if one of these existing KPIs works for you:
                    </p>
                    <div className="space-y-1.5">
                      {similarKPIs.map((kpi) => (
                        <div
                          key={kpi.id}
                          className="text-xs bg-white border border-yellow-300 rounded p-2 hover:bg-yellow-50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{kpi.name}</span>
                            {kpi.isCustom && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-teal-600 text-white rounded font-bold">
                                CUSTOM
                              </span>
                            )}
                          </div>
                          {kpi.friendlyName && (
                            <p className="text-gray-600 mt-0.5">{kpi.friendlyName}</p>
                          )}
                          {kpi.category && (
                            <span className="inline-block text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded mt-1">
                              {kpi.category}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-yellow-700 mt-2 italic">
                      💡 If none of these match, continue creating your custom KPI below.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Unit */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Unit *
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['number', 'currency', 'percentage'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                    unit === u
                      ? 'border-teal-500 bg-teal-50 text-teal-900 font-semibold'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {u === 'currency' && '$ Dollar'}
                  {u === 'percentage' && '% Percent'}
                  {u === 'number' && '# Number'}
                </button>
              ))}
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Frequency *
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as any)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              required
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what this KPI measures and why it matters..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Creating...' : 'Create Custom KPI'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
