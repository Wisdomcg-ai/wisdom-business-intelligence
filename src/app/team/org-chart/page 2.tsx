'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Network, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import PageHeader from '@/components/ui/PageHeader'
import { OrgChartData } from './types'
import OrgChartBuilder from './components/OrgChartBuilder'

const DEFAULT_DATA: OrgChartData = {
  version: 1,
  activeVersionId: 'current',
  versions: [
    {
      id: 'current',
      label: 'Current',
      date: null,
      people: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  settings: {
    showSalaries: false,
    showHeadcount: true,
    companyName: '',
    departmentColors: {},
    viewMode: 'detailed',
  },
}

export default function OrgChartPage() {
  const router = useRouter()
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadedData, setLoadedData] = useState<OrgChartData | null>(null)

  // Refs for auto-save (avoids stale closures)
  const dataRef = useRef<OrgChartData>(DEFAULT_DATA)
  const lastSavedDataRef = useRef<string>('')
  const saveTimeoutRef = useRef<NodeJS.Timeout>()
  const activeBusinessRef = useRef(activeBusiness)
  activeBusinessRef.current = activeBusiness

  // Load data
  useEffect(() => {
    if (!contextLoading) {
      loadData()
    }
  }, [contextLoading, activeBusiness?.id])

  const loadData = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      const biz = activeBusinessRef.current
      const targetUserId = biz?.ownerId || user.id

      const res = await fetch(`/api/team/org-chart?user_id=${targetUserId}`)
      const json = await res.json()

      if (res.ok && json.org_chart) {
        const loaded = json.org_chart as OrgChartData
        if (loaded.version === 1 && loaded.versions) {
          setLoadedData(loaded)
          dataRef.current = loaded
          lastSavedDataRef.current = JSON.stringify(loaded)
        }
      }

      setLoading(false)
    } catch (error) {
      console.error('Error loading org chart:', error)
      setLoading(false)
    }
  }

  const saveData = async () => {
    const dataToSave = dataRef.current
    const currentDataString = JSON.stringify(dataToSave)

    // Skip if nothing changed
    if (currentDataString === lastSavedDataRef.current) {
      setHasUnsavedChanges(false)
      return
    }

    // Skip if all versions empty
    if (dataToSave.versions.every((v) => v.people.length === 0)) {
      return
    }

    setSaving(true)
    setErrorMessage(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const biz = activeBusinessRef.current
      const targetUserId = biz?.ownerId || user.id

      const res = await fetch('/api/team/org-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_chart: dataToSave,
          user_id: targetUserId,
          business_id: biz?.id || null,
        }),
      })

      const json = await res.json()

      if (!res.ok) throw new Error(json.error || 'Failed to save')

      lastSavedDataRef.current = currentDataString
      setHasUnsavedChanges(false)
      setLastSaved(new Date())
    } catch (error: any) {
      console.error('Error saving org chart:', error)
      setErrorMessage(error?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const scheduleSave = useCallback(() => {
    setHasUnsavedChanges(true)
    setErrorMessage(null)

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveData()
    }, 2000)
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Handle data changes from the builder
  const handleDataChange = useCallback(
    (data: OrgChartData) => {
      dataRef.current = data
      scheduleSave()
    },
    [scheduleSave]
  )

  if (loading || contextLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading org chart...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <PageHeader
        variant="banner"
        title="Org Chart Builder"
        subtitle="Visualise your team structure and plan future growth"
        icon={Network}
        actions={
          <div className="flex flex-col items-end gap-1">
            {saving && (
              <span className="text-sm text-white/70 flex items-center gap-2">
                <Save className="h-4 w-4 animate-pulse" />
                Saving...
              </span>
            )}
            {!saving && lastSaved && (
              <span className="text-sm text-brand-orange">
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
            {hasUnsavedChanges && !saving && (
              <span className="text-sm text-amber-400">Unsaved changes</span>
            )}
            {errorMessage && (
              <span className="text-sm text-red-400">Error: {errorMessage}</span>
            )}
          </div>
        }
      />

      <div className="flex-1 min-h-0">
        <OrgChartBuilder
          initialData={loadedData}
          onDataChange={handleDataChange}
        />
      </div>
    </div>
  )
}
