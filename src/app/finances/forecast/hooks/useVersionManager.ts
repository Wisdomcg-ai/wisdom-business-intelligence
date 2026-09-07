'use client'

import { useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { setActiveForecastVersion } from '../services/set-active-version'
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
  /** Make a version the active one (what reports read), then view it. */
  handleSetActiveVersion: (version: FinancialForecast) => Promise<void>
  handleSaveAsNewVersion: (versionName: string) => Promise<void>
  handleOverwriteVersion: () => Promise<void>
}

export function useVersionManager({
  forecast,
  businessId
}: UseVersionManagerOptions): UseVersionManagerReturn {
  const pathname = usePathname()
  // Get base path without query params for version navigation
  const basePath = pathname.split('?')[0]
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
    window.location.href = `${basePath}?id=${version.id}`
  }, [forecast?.id, basePath])

  // "View this version" only changes what is on screen; THIS changes which
  // version the reports, dashboard and monthly report read. The two used to
  // share one label ("Switch to this version") and be confused for each other.
  const handleSetActiveVersion = useCallback(async (version: FinancialForecast) => {
    if (!businessId || !version.fiscal_year) return
    const supabase = createClient()
    const { error } = await setActiveForecastVersion(supabase, {
      businessId,
      fiscalYear: version.fiscal_year,
      forecastId: version.id as string,
    })
    if (error) {
      console.error('Error setting active forecast version:', error)
      toast.error('Failed to set the active version')
      return
    }
    toast.success(`"${version.name}" is now the active forecast`)
    await loadVersions(businessId, version.fiscal_year)
    if (version.id !== forecast?.id) {
      window.location.href = `${basePath}?id=${version.id}`
    }
  }, [businessId, forecast?.id, basePath, loadVersions])

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

      // Navigate to the new version — use current path to preserve coach context
      window.location.href = `${basePath}?id=${newForecast.id}`
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
    handleSetActiveVersion,
    handleSaveAsNewVersion,
    handleOverwriteVersion
  }
}
