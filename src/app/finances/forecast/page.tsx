'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import ForecastService from './services/forecast-service'
import './forecast-styles.css'
import { ForecastGenerator } from './services/forecast-generator'
import { ForecastingEngine } from './services/forecasting-engine'
import type { FinancialForecast, PLLine, ForecastEmployee, XeroConnection, DistributionMethod, ForecastMethod } from './types'
import PLForecastTable from './components/PLForecastTable'
import PayrollTable from './components/PayrollTable'
import ForecastWizard from './components/ForecastWizard'
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
      if (savedTab && ['assumptions', 'pl', 'payroll', 'versions'].includes(savedTab)) {
        return savedTab as ForecastTab
      }
    }
    return 'assumptions'
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const [showCSVImport, setShowCSVImport] = useState(false)

  // Xero sync hook
  const {
    isSyncing,
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
        const { data: business } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', user.id)
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

  const handleImportGoalsFromAnnualPlan = async () => {
    if (!businessId || !forecast?.id || !userId) return

    setIsSaving(true)
    try {
      // Fetch annual plan data from API
      const response = await fetch(`/api/annual-plan?user_id=${userId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch annual plan data')
      }

      const annualPlanData = await response.json()

      // Check if we have data to import
      if (!annualPlanData.revenue_target && !annualPlanData.profit_target) {
        toast.warning('No annual plan targets found. Complete the Goals & Targets wizard first, or enter goals manually.')
        setIsSaving(false)
        return
      }

      // Show confirmation dialog with what will be imported
      const confirmMessage = `Import the following from your Goals & Targets wizard?\n\n` +
        `Revenue Target (Year 1): ${annualPlanData.revenue_target ? `$${annualPlanData.revenue_target.toLocaleString()}` : 'Not set'}\n` +
        `Gross Profit Target (Year 1): ${annualPlanData.gross_profit_target ? `$${annualPlanData.gross_profit_target.toLocaleString()}` : 'Not set'}\n` +
        `Net Profit Target (Year 1): ${annualPlanData.profit_target ? `$${annualPlanData.profit_target.toLocaleString()}` : 'Not set'}\n` +
        `Source: Goals & Targets Wizard\n` +
        (annualPlanData.goals_date ? `Last Updated: ${new Date(annualPlanData.goals_date).toLocaleDateString()}` : '') +
        `\n\nThis will update your current forecast goals.`

      if (!confirm(confirmMessage)) {
        setIsSaving(false)
        return
      }

      // Use imported goals
      const revenueGoal = annualPlanData.revenue_target || forecast.revenue_goal || 0
      const grossProfitGoal = annualPlanData.gross_profit_target || (revenueGoal * 0.6) // Default to 60% if not specified
      const netProfitGoal = annualPlanData.profit_target || 0

      // Update forecast with imported goals
      const { error } = await supabase
        .from('financial_forecasts')
        .update({
          revenue_goal: revenueGoal,
          gross_profit_goal: grossProfitGoal,
          net_profit_goal: netProfitGoal,
          goal_source: 'goals_wizard',
          annual_plan_id: annualPlanData.business_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', forecast.id)

      if (error) {
        console.error('[Forecast] Error importing goals:', error)
        toast.error('Error importing goals: ' + error.message)
      } else {
        // Update local state
        setForecast({
          ...forecast,
          revenue_goal: revenueGoal,
          gross_profit_goal: grossProfitGoal,
          net_profit_goal: netProfitGoal,
          goal_source: 'goals_wizard',
          annual_plan_id: annualPlanData.business_id
        })

        console.log('[Forecast] Goals imported successfully from annual plan')
      }
    } catch (err) {
      console.error('[Forecast] Error importing goals:', err)
      toast.error('Error importing goals from Annual Plan. Please try again or enter goals manually.')
    }
    setIsSaving(false)
  }

  const handleSaveAssumptions = async (
    data: {
      revenue_goal: number
      gross_profit_goal: number
      net_profit_goal: number
      revenue_distribution_method: DistributionMethod
      cogs_percentage: number
      opex_budget?: number
    },
    options?: { isAutoSave?: boolean }
  ) => {
    if (!forecast?.id) return

    const isAutoSave = options?.isAutoSave || false

    setIsSaving(true)
    try {
      // 1. Save assumptions to database
      const { error: saveError } = await supabase
        .from('financial_forecasts')
        .update({
          revenue_goal: data.revenue_goal,
          gross_profit_goal: data.gross_profit_goal,
          net_profit_goal: data.net_profit_goal,
          revenue_distribution_method: data.revenue_distribution_method,
          cogs_percentage: data.cogs_percentage,
          goal_source: 'manual',
          updated_at: new Date().toISOString()
        })
        .eq('id', forecast.id)

      if (saveError) {
        console.error('[Forecast] Error saving assumptions:', saveError)
        if (!isAutoSave) {
          toast.error('Error saving assumptions: ' + saveError.message)
        }
        setIsSaving(false)
        return
      }

      // Update local forecast state
      const updatedForecast: FinancialForecast = {
        ...forecast,
        revenue_goal: data.revenue_goal,
        gross_profit_goal: data.gross_profit_goal,
        net_profit_goal: data.net_profit_goal,
        revenue_distribution_method: data.revenue_distribution_method,
        cogs_percentage: data.cogs_percentage,
        goal_source: 'manual' as const
      }
      setForecast(updatedForecast)

      // If this is an auto-save, just save the assumptions without regenerating forecast
      if (isAutoSave) {
        console.log('[Forecast] Auto-saved assumptions')
        setIsSaving(false)
        return
      }

      // 2. Generate forecast P&L lines
      // This only happens on manual "Save & Generate Forecast" button click
      console.log('[Forecast] Generating forecast from assumptions...')

      // Use the OpEx budget from the wizard (which has intelligence built in)
      // Falls back to calculating from goals if not provided
      const opexBudget = data.opex_budget !== undefined
        ? data.opex_budget
        : (data.gross_profit_goal && data.net_profit_goal
          ? data.gross_profit_goal - data.net_profit_goal
          : 0)

      console.log('[Forecast] Using OpEx budget:', opexBudget)

      const { lines } = await ForecastGenerator.generateForecast({
        forecast: updatedForecast,
        revenueGoal: data.revenue_goal,
        cogsPercentage: data.cogs_percentage,
        opexBudget,
        distributionMethod: data.revenue_distribution_method,
        existingLines: plLines
      })

      console.log('[Forecast] Generated lines:', lines.length)

      // 3. Save generated P&L lines
      const saveResult = await ForecastService.savePLLines(forecast.id, lines)

      if (saveResult.success) {
        setPlLines(lines)
        console.log('[Forecast] Forecast generated and saved successfully')
        toast.success('Forecast generated! Revenue, COGS, and OpEx have been distributed.')

        // Switch to P&L tab
        setActiveTab('pl')
      } else {
        console.error('[Forecast] Error saving generated lines:', saveResult.error)
        toast.error('Error saving forecast: ' + saveResult.error)
      }
    } catch (err) {
      console.error('[Forecast] Error:', err)
      if (!isAutoSave) {
        toast.error('Error generating forecast')
      }
    }
    setIsSaving(false)
  }

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
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

  return (
    <>
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-[1600px] mx-auto">
        {/* Error Banner */}
        {error && !isLoading && (
          <div className="mb-6">
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

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Financial Forecast</h1>
              <p className="text-gray-600">{forecast.name}</p>
            </div>
            <div className="flex items-center space-x-3">
              {/* Save Button */}
              <button
                onClick={() => handleSavePLLines(plLines)}
                disabled={isSaving}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
                  hasUnsavedChanges
                    ? 'bg-orange-600 hover:bg-orange-700 animate-pulse'
                    : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Save'}
              </button>

              {/* Export Controls */}
              {forecast?.id && userId && <ExportControls forecastId={forecast.id} userId={userId} />}

              {/* Last Saved Indicator */}
              {!isSaving && forecast && forecast.updated_at && (
                <div className="text-xs text-gray-500">
                  Last saved {new Date(forecast.updated_at).toLocaleString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Xero Connection Status */}
          <div className="border-t pt-4">
            <XeroConnectionPanel
              xeroConnection={xeroConnection}
              isSaving={isSaving || isSyncing}
              onConnect={handleConnectXero}
              onDisconnect={handleDisconnectXero}
              onSync={handleSyncFromXero}
              onClearAndResync={handleClearAndResync}
              onOpenCSVImport={() => setShowCSVImport(true)}
            />
          </div>
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
            className="mb-6"
          />
        )}

        {/* Tabs */}
        <ForecastTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Content */}
        {activeTab === 'assumptions' && (
          <ForecastWizard
            forecast={forecast}
            plLines={plLines}
            onSave={handleSaveAssumptions}
            onImportFromAnnualPlan={handleImportGoalsFromAnnualPlan}
            onApplyBulkOpExIncrease={handleBulkOpExIncrease}
            isSaving={isSaving}
          />
        )}

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

      </div>
    </>
  )
}
