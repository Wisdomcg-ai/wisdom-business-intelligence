'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { Loader2, Save, Sparkles, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/ui/PageHeader'
import ForecastService from './services/forecast-service'
import './forecast-styles.css'
import { ForecastingEngine } from './services/forecasting-engine'
import type { FinancialForecast, PLLine, ForecastEmployee, XeroConnection, ForecastMethod } from './types'
import PLForecastTable from './components/PLForecastTable'
import PayrollTable from './components/PayrollTable'
import ForecastWizardV2 from './components/ForecastWizardV2'
import { ForecastWizardV3 } from './components/wizard-v3'
import CompletenessChecker from './components/CompletenessChecker'
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
import { getForecastFiscalYear } from './utils/fiscal-year'
// Note: Coach view is at /coach/clients/[id]/forecast

export default function FinancialForecastPage() {
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [businessId, setBusinessId] = useState('')
  const [userId, setUserId] = useState('')

  const [forecast, setForecast] = useState<FinancialForecast | null>(null)
  const [plLines, setPlLines] = useState<PLLine[]>([])
  const [employees, setEmployees] = useState<ForecastEmployee[]>([])
  const [xeroConnection, setXeroConnection] = useState<XeroConnection | null>(null)

  const [activeTab, setActiveTab] = useState<ForecastTab>(() => {
    // Remember last active tab from localStorage
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('forecast-active-tab')
      if (savedTab && ['pl', 'payroll', 'versions'].includes(savedTab)) {
        return savedTab as ForecastTab
      }
    }
    return 'pl'
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [showWizardV2, setShowWizardV2] = useState(false)
  const [showWizardV3, setShowWizardV3] = useState(false)
  const [skipWelcome, setSkipWelcome] = useState(false)

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
      setEmployees([])
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

      // Load employees
      const emps = await ForecastService.loadEmployees(loadedForecast.id!)
      setEmployees(emps)

      // Load Xero connection
      const xeroConn = await ForecastService.getXeroConnection(bizId)
      setXeroConnection(xeroConn)

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

  const handleSaveEmployees = async (updatedEmployees: ForecastEmployee[]) => {
    if (!forecast?.id) return

    setIsSaving(true)
    const result = await ForecastService.saveEmployees(forecast.id, updatedEmployees)
    setIsSaving(false)

    if (result.success) {
      setEmployees(updatedEmployees)
      console.log('[Forecast] Employees saved')
    } else {
      console.error('[Forecast] Error saving employees:', result.error)
      toast.error('Error saving employees: ' + result.error)
    }
  }

  const handleBulkOpExIncrease = async (percentageIncrease: number) => {
    if (!forecast?.id) return

    // Give a moment for auto-save to complete (if it was triggered)
    await new Promise(resolve => setTimeout(resolve, 100))

    // Update all Operating Expenses lines with seasonal_pattern and the specified increase
    const updatedLines = plLines.map(line => {
      // Only apply to Operating Expenses lines
      if (line.category !== 'Operating Expenses') {
        return line
      }

      // Set to seasonal_pattern with the specified percentage increase
      return {
        ...line,
        forecast_method: {
          method: 'seasonal_pattern' as ForecastMethod,
          percentage_increase: percentageIncrease / 100, // Convert from 5 to 0.05
          base_amount: line.analysis?.fy_average_per_month || 0
        }
      }
    })

    // Recalculate forecasts
    const columns = ForecastService.generateMonthColumns(
      forecast.actual_start_month,
      forecast.actual_end_month,
      forecast.forecast_start_month,
      forecast.forecast_end_month,
      forecast.baseline_start_month,
      forecast.baseline_end_month
    )
    const baselineMonthKeys = columns.filter(c => c.isBaseline === true).map(c => c.key)
    const forecastMonthKeys = columns.filter(c => c.isForecast).map(c => c.key)

    const recalculatedLines = ForecastingEngine.recalculateAllForecasts(
      updatedLines,
      baselineMonthKeys,
      forecastMonthKeys
    )

    // Save and update state
    await handleSavePLLines(recalculatedLines)

    // Show success message but don't auto-switch tabs
    toast.success('Applied annual increase to all Operating Expenses lines! Review and adjust in the P&L Forecast tab.')
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

  // Show welcome screen for new forecasts
  if (isNewForecast && !showWizardV2 && !skipWelcome) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto pt-8 sm:pt-12">
          <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-brand-navy-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-brand-navy" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">
              Build Your FY{forecast.fiscal_year} Forecast
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8 max-w-md mx-auto">
              Your AI CFO will guide you through building a comprehensive financial forecast for your business.
            </p>

            <div className="space-y-3 sm:space-y-4">
              <button
                onClick={() => setShowWizardV3(true)}
                className="w-full flex items-center justify-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-brand-navy text-white rounded-xl hover:bg-brand-navy-800 transition-colors font-semibold text-base sm:text-lg"
              >
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                Start AI CFO Wizard
              </button>

              <button
                onClick={() => setShowWizardV2(true)}
                className="w-full px-4 sm:px-6 py-2.5 sm:py-3 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors font-medium text-sm sm:text-base border border-gray-200"
              >
                Use Classic Wizard
              </button>

              <button
                onClick={() => setSkipWelcome(true)}
                className="w-full px-4 sm:px-6 py-2.5 sm:py-3 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors font-medium text-sm sm:text-base"
              >
                Build manually
              </button>
            </div>

            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-100">
              <p className="text-xs sm:text-sm text-gray-500">
                The AI CFO will help you set revenue goals, plan your team costs, review operating expenses, and generate a complete forecast.
              </p>
            </div>
          </div>
        </div>

        {/* AI CFO Wizard V2 (Classic) */}
        {forecast && (
          <ForecastWizardV2
            isOpen={showWizardV2}
            onClose={() => setShowWizardV2(false)}
            forecast={forecast}
            plLines={plLines}
            xeroConnection={xeroConnection}
            businessId={businessId}
            businessName={activeBusiness?.name}
            onComplete={(forecastId) => {
              setShowWizardV2(false)
              loadInitialData()
              toast.success('Forecast completed! Your coach has been notified.')
            }}
          />
        )}

        {/* AI CFO Wizard V3 (New 3-Panel Layout) */}
        {showWizardV3 && (
          <ForecastWizardV3
            businessId={businessId}
            businessName={activeBusiness?.name}
            fiscalYear={forecast.fiscal_year}
            onComplete={(forecastId) => {
              setShowWizardV3(false)
              loadInitialData()
              toast.success('Forecast completed! Your coach has been notified.')
            }}
            onClose={() => setShowWizardV3(false)}
          />
        )}
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
              {/* AI CFO Wizard Button */}
              <button
                onClick={() => setShowWizardV3(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg transition-all shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">AI CFO Wizard</span>
                <span className="sm:hidden">AI CFO</span>
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

        {/* Xero Connection Panel */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-4 sm:mb-6">
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

        {/* Completeness Checker */}
        {forecast && (
          <CompletenessChecker
            forecast={forecast}
            plLines={plLines}
            forecastMonthKeys={ForecastService.generateMonthColumns(
              forecast.actual_start_month,
              forecast.actual_end_month,
              forecast.forecast_start_month,
              forecast.forecast_end_month,
              forecast.baseline_start_month,
              forecast.baseline_end_month
            ).filter(c => c.isForecast).map(c => c.key)}
            className="mb-4 sm:mb-6"
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
          />
        )}

        {activeTab === 'payroll' && (
          <PayrollTable
            forecast={forecast}
            employees={employees}
            plLines={plLines}
            onSave={handleSaveEmployees}
            onSavePLLines={handleSavePLLines}
            onUpdateForecast={async (updates) => {
              if (!forecast?.id) return

              const { error } = await supabase
                .from('financial_forecasts')
                .update({
                  ...updates,
                  updated_at: new Date().toISOString()
                })
                .eq('id', forecast.id)

              if (error) {
                console.error('[Forecast] Error updating payroll settings:', error)
              } else {
                // Update local state
                setForecast({ ...forecast, ...updates })
              }
            }}
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

      {/* AI CFO Wizard V2 (Classic) */}
      {forecast && (
        <ForecastWizardV2
          isOpen={showWizardV2}
          onClose={() => setShowWizardV2(false)}
          forecast={forecast}
          plLines={plLines}
          xeroConnection={xeroConnection}
          businessId={businessId}
          businessName={activeBusiness?.name}
          onComplete={(forecastId) => {
            setShowWizardV2(false)
            loadInitialData()
            toast.success('Forecast completed! Your coach has been notified.')
          }}
        />
      )}

      {/* AI CFO Wizard V3 (New 3-Panel Layout) */}
      {showWizardV3 && forecast && (
        <ForecastWizardV3
          businessId={businessId}
          businessName={activeBusiness?.name}
          fiscalYear={forecast.fiscal_year}
          onComplete={(forecastId) => {
            setShowWizardV3(false)
            loadInitialData()
            toast.success('Forecast completed! Your coach has been notified.')
          }}
          onClose={() => setShowWizardV3(false)}
        />
      )}

      </div>
    </>
  )
}
