'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { Loader2, Save, Pencil, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/ui/PageHeader'
import ForecastService from './services/forecast-service'
import './forecast-styles.css'
import type { FinancialForecast, PLLine, XeroConnection } from './types'
import PLForecastTable from './components/PLForecastTable'
import AssumptionsTab from './components/AssumptionsTab'
import { ForecastWizardV4 } from './components/wizard-v4'
import { ForecastSelector } from './components/ForecastSelector'
import ForecastKPISummary from './components/ForecastKPISummary'
import ForecastMultiYearSummary from './components/ForecastMultiYearSummary'
import type { ForecastAssumptions } from './components/wizard-v4/types/assumptions'
import ExportControls from './components/ExportControls'
import { LoadingState } from './components/LoadingState'
import ErrorState from './components/ErrorState'
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp'
import CSVImportWizard from './components/CSVImportWizard'
import SaveVersionModal from './components/SaveVersionModal'
import VersionsTab from './components/VersionsTab'
import XeroConnectionPanel from './components/XeroConnectionPanel'
import ForecastTabs, { type ForecastTab } from './components/ForecastTabs'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useXeroSync } from './hooks/useXeroSync'
import { useVersionManager } from './hooks/useVersionManager'
import { useXeroKeepalive } from '@/hooks/useXeroKeepalive'
import { getForecastFiscalYear } from './utils/fiscal-year'
// Note: Coach view is at /coach/clients/[id]/forecast

export default function FinancialForecastPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const hasAutoSyncedRef = useRef(false)

  const [businessId, setBusinessId] = useState('')
  const [userId, setUserId] = useState('')

  const [forecast, setForecast] = useState<FinancialForecast | null>(null)
  const [plLines, setPlLines] = useState<PLLine[]>([])
  const [xeroConnection, setXeroConnection] = useState<XeroConnection | null>(null)

  const [activeTab, setActiveTab] = useState<ForecastTab>(() => {
    // Remember last active tab from localStorage
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('forecast-active-tab')
      if (savedTab && ['pl', 'assumptions', 'versions'].includes(savedTab)) {
        return savedTab as ForecastTab
      }
    }
    return 'pl'
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [showWizardV4, setShowWizardV4] = useState(false)
  const [showForecastSelector, setShowForecastSelector] = useState(false)
  const [selectedForecastId, setSelectedForecastId] = useState<string | null>(null)
  const [selectedForecastName, setSelectedForecastName] = useState<string | null>(null)
  const [skipWelcome, setSkipWelcome] = useState(false)
  const [wizardStartStep, setWizardStartStep] = useState<number | undefined>(undefined)
  const [wizardStartFresh, setWizardStartFresh] = useState(false)

  // Xero sync hook
  const {
    isSyncing,
    isConnectionExpired,
    handleConnectXero,
    handleDisconnectXero,
    handleSyncFromXero,
    handleClearAndResync
  } = useXeroSync({
    forecastId: forecast?.id,
    businessId,
    onPlLinesUpdate: setPlLines,
    onXeroConnectionUpdate: setXeroConnection,
    onForecastClear: () => {
      setForecast(null)
      setPlLines([])
    }
  })

  // Version management hook
  const {
    versions,
    showSaveVersionModal,
    hasUnsavedChanges,
    setShowSaveVersionModal,
    setHasUnsavedChanges,
    loadVersions,
    handleSelectVersion,
    handleSaveAsNewVersion,
    handleOverwriteVersion
  } = useVersionManager({
    forecast,
    businessId
  })

  // Keep Xero tokens fresh while user is on this page
  useXeroKeepalive(businessId || null, !!xeroConnection)

  // Save active tab to localStorage whenever it changes
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('forecast-active-tab', activeTab)
    }
  }, [activeTab, mounted])

  // Warn user about unsaved changes when leaving page
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = '' // Required for Chrome
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    setMounted(true)
    if (!contextLoading) {
      loadInitialData()
    }
  }, [contextLoading, activeBusiness?.id])

  // Auto-sync from Xero when returning from OAuth with syncing=true
  useEffect(() => {
    const shouldSync = searchParams.get('syncing') === 'true'
    const justConnected = searchParams.get('success') === 'connected'

    // Only auto-sync once per page load, when we have a forecast and connection
    if (shouldSync && justConnected && forecast?.id && xeroConnection && !hasAutoSyncedRef.current && !isSyncing) {
      hasAutoSyncedRef.current = true
      console.log('[Forecast] Auto-syncing after Xero connection...')
      toast.info('Syncing your Xero data...')

      // Trigger the full P&L sync
      handleSyncFromXero().then(() => {
        // Clean up URL params after sync
        const url = new URL(window.location.href)
        url.searchParams.delete('syncing')
        url.searchParams.delete('success')
        window.history.replaceState({}, '', url.toString())
      })
    }
  }, [searchParams, forecast?.id, xeroConnection, isSyncing, handleSyncFromXero])

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 's',
      ctrl: true,
      meta: true,
      description: 'Save forecast',
      callback: (e) => {
        e.preventDefault()
        // Trigger save based on current tab
        if (activeTab === 'pl' && plLines.length > 0) {
          handleSavePLLines(plLines)
        }
      }
    },
    {
      key: '?',
      description: 'Show keyboard shortcuts',
      callback: () => {
        setShowKeyboardHelp(true)
      }
    }
  ])

  const loadInitialData = async () => {
    try {
      setIsLoading(true)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.log('[Forecast] No user logged in')
        setIsLoading(false)
        return
      }

      const uid = user.id
      setUserId(uid)

      // Use activeBusiness if available (supports coach view)
      // Otherwise fall back to querying user's own business
      let bizId: string
      if (activeBusiness?.id) {
        bizId = activeBusiness.id
      } else {
        // Get business using owner_id (to match xero_connections table)
        const targetOwnerId = activeBusiness?.ownerId || user.id
        const { data: business } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', targetOwnerId)
          .maybeSingle()
        bizId = business?.id || user.id
      }
      setBusinessId(bizId)

      console.log(`[Forecast] Loading data for business: ${bizId}`)

      // Get or create forecast for current fiscal year
      // Fiscal year runs Jul 1 - Jun 30
      // Dynamically calculated based on current date
      const fiscalYear = getForecastFiscalYear()

      const { forecast: loadedForecast, error: forecastError } =
        await ForecastService.getOrCreateForecast(bizId, uid, fiscalYear)

      if (forecastError || !loadedForecast) {
        console.error('[Forecast] Error loading forecast:', forecastError)
        setIsLoading(false)
        return
      }

      console.log('[Forecast Page] Forecast dates:', {
        actual_start: loadedForecast.actual_start_month,
        actual_end: loadedForecast.actual_end_month,
        forecast_start: loadedForecast.forecast_start_month,
        forecast_end: loadedForecast.forecast_end_month
      })
      setForecast(loadedForecast)

      // Load P&L lines
      const lines = await ForecastService.loadPLLines(loadedForecast.id!)
      console.log('[Forecast Page] Loaded P&L lines:', lines.length)
      if (lines.length > 0) {
        console.log('[Forecast Page] Sample line:', {
          name: lines[0].account_name,
          actual_months: lines[0].actual_months,
          monthKeys: Object.keys(lines[0].actual_months || {})
        })
      }
      setPlLines(lines)

      // Load Xero connection via API (bypasses RLS timing issues)
      try {
        const statusRes = await fetch(`/api/Xero/status?business_id=${bizId}`)
        const statusData = await statusRes.json()
        if (statusData.connected && statusData.connection) {
          setXeroConnection(statusData.connection)
        } else {
          setXeroConnection(null)
        }
      } catch (err) {
        console.error('[Forecast] Error loading Xero connection:', err)
        // Fall back to direct query if API fails
        const xeroConn = await ForecastService.getXeroConnection(bizId)
        setXeroConnection(xeroConn)
      }

      setIsLoading(false)

      // Load versions
      if (loadedForecast?.id) {
        loadVersions(bizId, loadedForecast.fiscal_year).catch(console.error)
      }
    } catch (err) {
      console.error('[Forecast] Error in loadInitialData:', err)
      setError(err instanceof Error ? err.message : 'Failed to load forecast data')
      setIsLoading(false)
    }
  }

  // Parse assumptions from forecast record for assumption cards
  const parsedAssumptions = useMemo(() => {
    if (!forecast?.assumptions) {
      // No assumptions saved yet - wizard hasn't been completed
      return null
    }
    try {
      const parsed = (typeof forecast.assumptions === 'string'
        ? JSON.parse(forecast.assumptions)
        : forecast.assumptions) as ForecastAssumptions
      console.log('[Forecast Page] Parsed assumptions:', {
        hasRevenue: !!parsed?.revenue?.lines?.length,
        hasTeam: !!parsed?.team?.existingTeam?.length,
        hasOpex: !!parsed?.opex?.lines?.length,
        hasSubs: !!parsed?.subscriptions,
        hasCapex: !!parsed?.capex?.items?.length,
      })
      return parsed
    } catch (e) {
      console.error('[Forecast Page] Failed to parse assumptions:', e)
      return null
    }
  }, [forecast?.assumptions])

  // NOTE: Scenario/What-If functionality is disabled for launch.
  // Code has been removed - see git history for implementation when needed.

  const handleSavePLLines = async (updatedLines: PLLine[]) => {
    if (!forecast?.id) return

    try {
      setIsSaving(true)
      setError(null)
      const result = await ForecastService.savePLLines(forecast.id, updatedLines)

      if (result.success) {
        setPlLines(updatedLines)
        setHasUnsavedChanges(false) // Clear unsaved changes flag
        console.log('[Forecast] P&L lines saved')
      } else {
        throw new Error(result.error || 'Failed to save P&L lines')
      }
    } catch (err) {
      console.error('[Forecast] Error saving P&L lines:', err)
      setError(err instanceof Error ? err.message : 'Failed to save P&L lines')
    } finally {
      setIsSaving(false)
    }
  }

  // Xero handlers are now provided by useXeroSync hook

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading financial forecast...</p>
        </div>
      </div>
    )
  }

  if (!forecast) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">Error loading forecast. Please refresh the page.</p>
        </div>
      </div>
    )
  }

  // Loading state
  if (!mounted || isLoading) {
    return <LoadingState message="Loading your financial forecast..." />
  }

  // Error state
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          setError(null)
          loadInitialData()
        }}
        fullPage
        title="Failed to Load Forecast"
      />
    )
  }

  // No forecast state
  if (!forecast) {
    return (
      <LoadingState message="Creating your forecast..." />
    )
  }

  // Check if this is a new/empty forecast (no forecast values set)
  const isNewForecast = plLines.length === 0 || plLines.every(line => {
    const forecastMonths = Object.keys(line.forecast_months || {})
    return forecastMonths.length === 0 || forecastMonths.every(key => !line.forecast_months[key])
  })

  // Skip welcome screen — go straight to forecast selector/wizard
  if (isNewForecast && !showWizardV4 && !skipWelcome) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        {/* Auto-show forecast selector — no welcome/start screen */}
        <ForecastSelector
          businessId={businessId}
          businessName={activeBusiness?.name}
          fiscalYear={forecast.fiscal_year}
          onSelectForecast={(id, name) => {
            setSelectedForecastId(id)
            setSelectedForecastName(name)
            setWizardStartFresh(false)
            setShowWizardV4(true)
          }}
          onCreateNew={() => {
            setSelectedForecastId(null)
            setSelectedForecastName(null)
            setWizardStartFresh(true)
            setShowWizardV4(true)
          }}
          onClose={() => setSkipWelcome(true)}
        />
      </div>
    )
  }

  // Show wizard when selected from selector
  if (isNewForecast && showWizardV4) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <ForecastWizardV4
          businessId={businessId}
          businessName={activeBusiness?.name}
          fiscalYear={forecast.fiscal_year}
          existingForecastId={selectedForecastId}
          existingForecastName={selectedForecastName}
          initialStep={wizardStartStep}
          startFresh={wizardStartFresh}
          onComplete={(forecastId) => {
            setShowWizardV4(false)
            setSelectedForecastId(null)
            setSelectedForecastName(null)
            setWizardStartStep(undefined)
            setWizardStartFresh(false)
            loadInitialData()
            toast.success('Forecast generated successfully!')
          }}
          onClose={() => {
            setShowWizardV4(false)
            setSelectedForecastId(null)
            setSelectedForecastName(null)
            setWizardStartStep(undefined)
            setWizardStartFresh(false)
          }}
        />
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Page Header */}
        <PageHeader
          variant="banner"
          title="Financial Forecast"
          subtitle={forecast.name}
          icon={TrendingUp}
          actions={
            <>
              {/* Forecast Builder Button */}
              <button
                onClick={() => setShowForecastSelector(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg transition-all shadow-sm"
              >
                <Pencil className="w-4 h-4" />
                <span className="hidden sm:inline">Forecast Builder</span>
                <span className="sm:hidden">Build</span>
              </button>

              {/* Save Button */}
              <button
                onClick={() => handleSavePLLines(plLines)}
                disabled={isSaving}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
                  hasUnsavedChanges
                    ? 'bg-brand-orange-600 hover:bg-brand-orange-600 animate-pulse'
                    : 'bg-brand-orange hover:bg-brand-orange-600'
                }`}
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Save'}
              </button>

              {/* Export Controls */}
              {forecast?.id && userId && <ExportControls forecastId={forecast.id} userId={userId} />}
            </>
          }
        />

        <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
          {/* Error Banner */}
          {error && !isLoading && (
            <div className="mb-4 sm:mb-6">
              <ErrorState
                error={error}
                onRetry={() => {
                  setError(null)
                  loadInitialData()
                }}
                title="Error"
              />
            </div>
          )}

        {/* Last Saved Indicator */}
        {!isSaving && forecast && forecast.updated_at && (
          <div className="text-xs sm:text-sm text-gray-500 mb-4 text-right">
            Last saved {new Date(forecast.updated_at).toLocaleString('en-AU', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        )}

        {/* Xero Status Bar */}
        <div className="mb-3 sm:mb-4 px-1">
          <XeroConnectionPanel
            xeroConnection={xeroConnection}
            isSaving={isSaving || isSyncing}
            isExpired={isConnectionExpired}
            onConnect={handleConnectXero}
            onDisconnect={handleDisconnectXero}
            onSync={handleSyncFromXero}
            onClearAndResync={handleClearAndResync}
            onOpenCSVImport={() => setShowCSVImport(true)}
          />
        </div>

        {/* KPI Summary */}
        <ForecastKPISummary
          assumptions={parsedAssumptions}
          forecast={forecast}
          plLines={plLines}
        />

        {/* Multi-Year Summary (Year 2/3) */}
        {parsedAssumptions && (
          <ForecastMultiYearSummary
            assumptions={parsedAssumptions}
            fiscalYear={forecast.fiscal_year}
          />
        )}

        {/* Tabs */}
        <ForecastTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Content */}
        {activeTab === 'pl' && (
          <PLForecastTable
            forecast={forecast}
            plLines={plLines}
            onSave={handleSavePLLines}
            onChange={() => setHasUnsavedChanges(true)}
            defaultViewMode="view"
          />
        )}

        {activeTab === 'assumptions' && (
          <AssumptionsTab
            assumptions={parsedAssumptions}
            onEditStep={(step) => {
              setWizardStartStep(step)
              setSelectedForecastId(forecast.id || null)
              setSelectedForecastName(forecast.name || null)
              setShowForecastSelector(false)
              setShowWizardV4(true)
            }}
            fiscalYear={forecast.fiscal_year}
          />
        )}

        {activeTab === 'versions' && forecast && (
          <VersionsTab
            versions={versions}
            currentVersion={forecast}
            onSelectVersion={handleSelectVersion}
            onSaveAsNew={handleSaveAsNewVersion}
            onOverwrite={handleOverwriteVersion}
          />
        )}
      </div>

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsHelp
        isOpen={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
      />

      {/* CSV Import Wizard */}
      {forecast && (
        <CSVImportWizard
          isOpen={showCSVImport}
          onClose={() => setShowCSVImport(false)}
          forecast={forecast}
          onImportComplete={() => {
            loadInitialData()
          }}
        />
      )}

      {/* Save Version Modal */}
      {forecast && (
        <SaveVersionModal
          isOpen={showSaveVersionModal}
          onClose={() => setShowSaveVersionModal(false)}
          currentVersionName={forecast.name}
          onSaveAsNew={handleSaveAsNewVersion}
          onOverwrite={handleOverwriteVersion}
        />
      )}

      {/* Forecast Wizard V4 */}
      {showWizardV4 && forecast && (
        <ForecastWizardV4
          businessId={businessId}
          businessName={activeBusiness?.name}
          fiscalYear={forecast.fiscal_year}
          existingForecastId={selectedForecastId}
          existingForecastName={selectedForecastName}
          initialStep={wizardStartStep}
          startFresh={wizardStartFresh}
          onComplete={(forecastId) => {
            setShowWizardV4(false)
            setSelectedForecastId(null)
            setSelectedForecastName(null)
            setWizardStartStep(undefined)
            setWizardStartFresh(false)
            loadInitialData()
            toast.success('Forecast generated successfully!')
          }}
          onClose={() => {
            setShowWizardV4(false)
            setSelectedForecastId(null)
            setSelectedForecastName(null)
            setWizardStartStep(undefined)
            setWizardStartFresh(false)
          }}
        />
      )}

      {/* Forecast Selector Modal */}
      {showForecastSelector && forecast && (
        <ForecastSelector
          businessId={businessId}
          businessName={activeBusiness?.name}
          fiscalYear={forecast.fiscal_year}
          onSelectForecast={(id, name) => {
            setSelectedForecastId(id)
            setSelectedForecastName(name)
            setWizardStartFresh(false)
            setShowForecastSelector(false)
            setShowWizardV4(true)
          }}
          onCreateNew={() => {
            setSelectedForecastId(null)
            setSelectedForecastName(null)
            setWizardStartFresh(true)
            setShowForecastSelector(false)
            setShowWizardV4(true)
          }}
          onClose={() => setShowForecastSelector(false)}
        />
      )}

      </div>
    </>
  )
}
