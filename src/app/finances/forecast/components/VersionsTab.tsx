'use client'

import React, { useState } from 'react'
import { Clock, Lock, Check, ChevronRight, Plus, Save, Trash2, Edit2, Copy } from 'lucide-react'
import type { FinancialForecast } from '../types'

interface VersionsTabProps {
  versions: FinancialForecast[]
  currentVersion: FinancialForecast
  onSelectVersion: (version: FinancialForecast) => void
  onSaveAsNew: (versionName: string) => Promise<void>
  onOverwrite: () => Promise<void>
  className?: string
}

export default function VersionsTab({
  versions,
  currentVersion,
  onSelectVersion,
  onSaveAsNew,
  onOverwrite,
  className = ''
}: VersionsTabProps) {
  const [showNewVersionModal, setShowNewVersionModal] = useState(false)
  const [newVersionName, setNewVersionName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sort versions: active first, then by version number descending
  const sortedVersions = [...versions].sort((a, b) => {
    if (a.is_active && !b.is_active) return -1
    if (!a.is_active && b.is_active) return 1
    return (b.version_number || 0) - (a.version_number || 0)
  })

  const formatDate = (dateString?: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleSaveNewVersion = async () => {
    if (!newVersionName.trim()) {
      setError('Please enter a version name')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await onSaveAsNew(newVersionName.trim())
      setShowNewVersionModal(false)
      setNewVersionName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save version')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Forecast Versions</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage and switch between different versions of your forecast
            </p>
          </div>
          <button
            onClick={() => setShowNewVersionModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Save as New Version
          </button>
        </div>
      </div>

      {/* Versions List */}
      <div className="p-6">
        {sortedVersions.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No versions yet</h3>
            <p className="text-sm text-gray-500">
              Save your first version to start tracking changes
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedVersions.map((version) => {
              const isSelected = version.id === currentVersion.id

              return (
                <div
                  key={version.id}
                  className={`border-2 rounded-lg transition-all ${
                    isSelected
                      ? 'border-brand-orange-500 bg-brand-orange-50'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className={`text-lg font-semibold ${isSelected ? 'text-brand-navy' : 'text-gray-900'}`}>
                            {version.name}
                          </h3>
                          {version.is_active && (
                            <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded">
                              Active
                            </span>
                          )}
                          {version.is_locked && (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Lock className="w-3 h-3" />
                              <span>Locked</span>
                            </div>
                          )}
                          {isSelected && (
                            <div className="flex items-center gap-1 text-xs text-brand-orange font-medium">
                              <Check className="w-4 h-4" />
                              <span>Current</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>Version {version.version_number || 1}</span>
                          <span>•</span>
                          <span>Updated {formatDate(version.updated_at || version.created_at)}</span>
                        </div>

                        {version.version_notes && (
                          <p className="mt-2 text-sm text-gray-700">{version.version_notes}</p>
                        )}
                      </div>

                      {!isSelected && (
                        <button
                          onClick={() => onSelectVersion(version)}
                          className="ml-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-orange bg-white border border-brand-orange rounded-lg hover:bg-brand-orange-50 transition-colors"
                        >
                          <span>Switch to this version</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New Version Modal */}
      {showNewVersionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Save as New Version</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Create a copy of the current forecast
                </p>
              </div>
              <button
                onClick={() => {
                  setShowNewVersionModal(false)
                  setNewVersionName('')
                  setError(null)
                }}
                disabled={isSaving}
                className="text-gray-400 hover:text-gray-500 disabled:opacity-50"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <div>
                <label htmlFor="version-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Version name
                </label>
                <input
                  id="version-name"
                  type="text"
                  value={newVersionName}
                  onChange={(e) => setNewVersionName(e.target.value)}
                  placeholder="e.g., Updated Revenue Goals"
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-orange focus:border-brand-orange-500 disabled:opacity-50"
                  autoFocus
                />
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowNewVersionModal(false)
                  setNewVersionName('')
                  setError(null)
                }}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewVersion}
                disabled={isSaving || !newVersionName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-md hover:bg-brand-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Version
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
