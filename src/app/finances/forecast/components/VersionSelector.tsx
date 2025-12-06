'use client'

import React, { useState } from 'react'
import { ChevronDown, Check, Clock, Lock } from 'lucide-react'
import type { FinancialForecast } from '../types'

interface VersionSelectorProps {
  versions: FinancialForecast[]
  currentVersion: FinancialForecast
  onSelectVersion: (version: FinancialForecast) => void
  className?: string
}

export default function VersionSelector({
  versions,
  currentVersion,
  onSelectVersion,
  className = ''
}: VersionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (versions.length === 0) {
    return null
  }

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
      year: 'numeric'
    })
  }

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-orange"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          <span>{currentVersion.name}</span>
          {currentVersion.is_active && (
            <span className="px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded">
              Active
            </span>
          )}
          {currentVersion.is_locked && (
            <Lock className="w-3 h-3 text-gray-400" />
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
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
          <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
            <div className="py-1">
              {sortedVersions.map((version) => {
                const isSelected = version.id === currentVersion.id

                return (
                  <button
                    key={version.id}
                    onClick={() => {
                      onSelectVersion(version)
                      setIsOpen(false)
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-brand-orange-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isSelected ? 'text-brand-navy' : 'text-gray-900'}`}>
                            {version.name}
                          </span>
                          {version.is_active && (
                            <span className="px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded">
                              Active
                            </span>
                          )}
                          {version.is_locked && (
                            <Lock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          )}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Version {version.version_number || 1} • {formatDate(version.updated_at || version.created_at)}
                        </div>
                        {version.version_notes && (
                          <div className="mt-1 text-xs text-gray-600 truncate">
                            {version.version_notes}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="w-5 h-5 text-brand-orange flex-shrink-0 ml-2" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {versions.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                No other versions available
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
