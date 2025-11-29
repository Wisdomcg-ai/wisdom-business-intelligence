'use client'

import React, { useState } from 'react'
import { X, Save, Copy } from 'lucide-react'

interface SaveVersionModalProps {
  isOpen: boolean
  onClose: () => void
  currentVersionName: string
  onSaveAsNew: (versionName: string) => Promise<void>
  onOverwrite: () => Promise<void>
}

export default function SaveVersionModal({
  isOpen,
  onClose,
  currentVersionName,
  onSaveAsNew,
  onOverwrite
}: SaveVersionModalProps) {
  const [saveMode, setSaveMode] = useState<'overwrite' | 'new' | null>(null)
  const [newVersionName, setNewVersionName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSave = async () => {
    if (!saveMode) {
      setError('Please select an option')
      return
    }

    if (saveMode === 'new' && !newVersionName.trim()) {
      setError('Please enter a version name')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (saveMode === 'overwrite') {
        await onOverwrite()
      } else {
        await onSaveAsNew(newVersionName.trim())
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save version')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (!isSaving) {
      setSaveMode(null)
      setNewVersionName('')
      setError(null)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Save Forecast</h2>
            <p className="mt-1 text-sm text-gray-500">
              Current version: {currentVersionName}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="text-gray-400 hover:text-gray-500 disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Option 1: Overwrite existing */}
          <div
            onClick={() => !isSaving && setSaveMode('overwrite')}
            className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
              saveMode === 'overwrite'
                ? 'border-teal-600 bg-teal-50'
                : 'border-gray-300 hover:border-gray-400'
            } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-0.5">
                <input
                  type="radio"
                  checked={saveMode === 'overwrite'}
                  onChange={() => setSaveMode('overwrite')}
                  disabled={isSaving}
                  className="h-4 w-4 text-teal-600 cursor-pointer"
                />
              </div>
              <div className="ml-3 flex-1">
                <div className="flex items-center">
                  <Save className="w-4 h-4 text-gray-600 mr-2" />
                  <h3 className="text-sm font-medium text-gray-900">
                    Overwrite "{currentVersionName}"
                  </h3>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Save changes to the current version. This cannot be undone.
                </p>
              </div>
            </div>
          </div>

          {/* Option 2: Save as new version */}
          <div
            onClick={() => !isSaving && setSaveMode('new')}
            className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
              saveMode === 'new'
                ? 'border-teal-600 bg-teal-50'
                : 'border-gray-300 hover:border-gray-400'
            } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-0.5">
                <input
                  type="radio"
                  checked={saveMode === 'new'}
                  onChange={() => setSaveMode('new')}
                  disabled={isSaving}
                  className="h-4 w-4 text-teal-600 cursor-pointer"
                />
              </div>
              <div className="ml-3 flex-1">
                <div className="flex items-center">
                  <Copy className="w-4 h-4 text-gray-600 mr-2" />
                  <h3 className="text-sm font-medium text-gray-900">
                    Save as new version
                  </h3>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Create a new version and keep the current version unchanged.
                </p>

                {saveMode === 'new' && (
                  <div className="mt-3">
                    <label htmlFor="version-name" className="block text-sm font-medium text-gray-700 mb-1">
                      Version name
                    </label>
                    <input
                      id="version-name"
                      type="text"
                      value={newVersionName}
                      onChange={(e) => setNewVersionName(e.target.value)}
                      placeholder="e.g., Updated Revenue Goals"
                      disabled={isSaving}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!saveMode || isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
