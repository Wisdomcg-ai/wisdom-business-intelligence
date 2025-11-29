'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import type { FinancialForecast } from '../types'

interface UseVersionManagerOptions {
  forecast: FinancialForecast | null
  businessId: string
}

interface UseVersionManagerReturn {
  versions: FinancialForecast[]
  showSaveVersionModal: boolean
  hasUnsavedChanges: boolean
  setShowSaveVersionModal: (show: boolean) => void
  setHasUnsavedChanges: (hasChanges: boolean) => void
  loadVersions: (businessId: string, fiscalYear: number) => Promise<void>
  handleSelectVersion: (version: FinancialForecast) => void
  handleSaveAsNewVersion: (versionName: string) => Promise<void>
  handleOverwriteVersion: () => Promise<void>
}

export function useVersionManager({
  forecast,
  businessId
}: UseVersionManagerOptions): UseVersionManagerReturn {
  const [versions, setVersions] = useState<FinancialForecast[]>([])
  const [showSaveVersionModal, setShowSaveVersionModal] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const loadVersions = useCallback(async (businessId: string, fiscalYear: number) => {
    try {
      const response = await fetch(`/api/forecasts/versions?business_id=${businessId}&fiscal_year=${fiscalYear}`)
      if (!response.ok) {
        console.error('Failed to load versions')
        return
      }
      const data = await response.json()
      setVersions(data.versions || [])
    } catch (error) {
      console.error('Error loading versions:', error)
    }
  }, [])

  const handleSelectVersion = useCallback((version: FinancialForecast) => {
    if (version.id === forecast?.id) return // Already on this version
    window.location.href = `/finances/forecast?id=${version.id}`
  }, [forecast?.id])

  const handleSaveAsNewVersion = useCallback(async (versionName: string) => {
    if (!forecast?.id || !businessId) {
      throw new Error('No forecast to save')
    }

    try {
      const response = await fetch('/api/forecasts/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forecastId: forecast.id,
          versionName,
          versionType: 'forecast'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create new version')
      }

      const { newForecast } = await response.json()

      // Reload versions list
      await loadVersions(businessId, forecast.fiscal_year)

      // Navigate to the new version
      window.location.href = `/finances/forecast?id=${newForecast.id}`
    } catch (error) {
      console.error('Error creating new version:', error)
      throw error
    }
  }, [forecast?.id, forecast?.fiscal_year, businessId, loadVersions])

  const handleOverwriteVersion = useCallback(async () => {
    // Overwriting is just saving normally - no new version created
    // The data is already being saved via the existing save handlers
    toast.success('Changes saved to current version')
    setShowSaveVersionModal(false)
  }, [])

  return {
    versions,
    showSaveVersionModal,
    hasUnsavedChanges,
    setShowSaveVersionModal,
    setHasUnsavedChanges,
    loadVersions,
    handleSelectVersion,
    handleSaveAsNewVersion,
    handleOverwriteVersion
  }
}
