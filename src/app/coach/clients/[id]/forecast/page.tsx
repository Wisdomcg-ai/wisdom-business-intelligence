'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import CoachNavbar from '@/components/coach/CoachNavbar'
import ForecastService from '@/app/finances/forecast/services/forecast-service'
import '@/app/finances/forecast/forecast-styles.css'
import { ForecastGenerator } from '@/app/finances/forecast/services/forecast-generator'
import { ForecastingEngine } from '@/app/finances/forecast/services/forecasting-engine'
import type { FinancialForecast, PLLine, ForecastEmployee, XeroConnection, DistributionMethod, ForecastMethod } from '@/app/finances/forecast/types'
import PLForecastTable from '@/app/finances/forecast/components/PLForecastTable'
import PayrollTable from '@/app/finances/forecast/components/PayrollTable'
import ForecastWizard from '@/app/finances/forecast/components/ForecastWizard'
import CompletenessChecker from '@/app/finances/forecast/components/CompletenessChecker'
import ExportControls from '@/app/finances/forecast/components/ExportControls'
import { LoadingState } from '@/app/finances/forecast/components/LoadingState'
import ErrorState from '@/app/finances/forecast/components/ErrorState'
import KeyboardShortcutsHelp from '@/app/finances/forecast/components/KeyboardShortcutsHelp'
import CSVImportWizard from '@/app/finances/forecast/components/CSVImportWizard'
import SaveVersionModal from '@/app/finances/forecast/components/SaveVersionModal'
import VersionsTab from '@/app/finances/forecast/components/VersionsTab'
import XeroConnectionPanel from '@/app/finances/forecast/components/XeroConnectionPanel'
import ForecastTabs, { type ForecastTab } from '@/app/finances/forecast/components/ForecastTabs'
import { useKeyboardShortcuts } from '@/app/finances/forecast/hooks/useKeyboardShortcuts'
import { useXeroSync } from '@/app/finances/forecast/hooks/useXeroSync'
import { useVersionManager } from '@/app/finances/forecast/hooks/useVersionManager'
import { getForecastFiscalYear } from '@/app/finances/forecast/utils/fiscal-year'

export default function CoachForecastPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params?.id as string

  const supabase = createClient()
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isCoach, setIsCoach] = useState<boolean | null>(null)

  const [businessId, setBusinessId] = useState('')
  const [userId, setUserId] = useState('')

  const [forecast, setForecast] = useState<FinancialForecast | null>(null)
  const [plLines, setPlLines] = useState<PLLine[]>([])
  const [employees, setEmployees] = useState<ForecastEmployee[]>([])
  const [xeroConnection, setXeroConnection] = useState<XeroConnection | null>(null)

  const [activeTab, setActiveTab] = useState<ForecastTab>(() => {
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
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    setMounted(true)
    verifyCoachAndLoadData()
  }, [clientId])

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 's',
      ctrl: true,
      meta: true,
      description: 'Save forecast',
      callback: (e) => {
        e.preventDefault()
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

  const verifyCoachAndLoadData = async () => {
    try {
      setIsLoading(true)

      // Get current user (should be coach)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/coach/login')
        return
      }

      // Verify this user is the assigned coach for this business
      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('id, owner_id, assigned_coach_id')
        .eq('id', clientId)
        .single()

      if (businessError || !business || business.assigned_coach_id !== user.id) {
        console.error('Coach access denied:', businessError)
        router.push('/coach/clients')
        return
      }

      setIsCoach(true)
      setUserId(user.id)
      setBusinessId(clientId)

      console.log(`[Coach Forecast] Loading data for client business: ${clientId}`)

      // Get or create forecast for current fiscal year
      const fiscalYear = getForecastFiscalYear()

      const { forecast: loadedForecast, error: forecastError } =
        await ForecastService.getOrCreateForecast(clientId, business.owner_id, fiscalYear)

      if (forecastError || !loadedForecast) {
        console.error('[Coach Forecast] Error loading forecast:', forecastError)
        setIsLoading(false)
        return
      }

      console.log('[Coach Forecast] Forecast dates:', {
        actual_start: loadedForecast.actual_start_month,
        actual_end: loadedForecast.actual_end_month,
        forecast_start: loadedForecast.forecast_start_month,
        forecast_end: loadedForecast.forecast_end_month
      })
      setForecast(loadedForecast)

      // Load P&L lines
      const lines = await ForecastService.loadPLLines(loadedForecast.id!)
      console.log('[Coach Forecast] Loaded P&L lines:', lines.length)
      setPlLines(lines)

      // Load employees
      const emps = await ForecastService.loadEmployees(loadedForecast.id!)
      setEmployees(emps)

      // Load Xero connection
      const xeroConn = await ForecastService.getXeroConnection(clientId)
      setXeroConnection(xeroConn)

      setIsLoading(false)

      // Load versions
      if (loadedForecast?.id) {
        loadVersions(clientId, loadedForecast.fiscal_year).catch(console.error)
      }
    } catch (err) {
      console.error('[Coach Forecast] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load forecast data')
      setIsLoading(false)
    }
  }

  const handleSavePLLines = async (updatedLines: PLLine[]) => {
    if (!forecast?.id) return

    try {
      setIsSaving(true)
      setError(null)
      const result = await ForecastService.savePLLines(forecast.id, updatedLines)

      if (result.success) {
        setPlLines(updatedLines)
        setHasUnsavedChanges(false)
        console.log('[Coach Forecast] P&L lines saved')
      } else {
        throw new Error(result.error || 'Failed to save P&L lines')
      }
    } catch (err) {
      console.error('[Coach Forecast] Error saving P&L lines:', err)
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
      console.log('[Coach Forecast] Employees saved')
    } else {
      console.error('[Coach Forecast] Error saving employees:', result.error)
      toast.error('Error saving employees: ' + result.error)
    }
  }

  const handleBulkOpExIncrease = async (percentageIncrease: number) => {
    if (!forecast?.id) return

    await new Promise(resolve => setTimeout(resolve, 100))

    const updatedLines = plLines.map(line => {
      if (line.category !== 'Operating Expenses') {
        return line
      }

      return {
        ...line,
        forecast_method: {
          method: 'seasonal_pattern' as ForecastMethod,
          percentage_increase: percentageIncrease / 100,
          base_amount: line.analysis?.fy_average_per_month || 0
        }
      }
    })

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

    await handleSavePLLines(recalculatedLines)

    toast.success('Applied annual increase to all Operating Expenses lines!')
  }

  const handleImportGoalsFromAnnualPlan = async () => {
    if (!businessId || !forecast?.id) return

    setIsSaving(true)
    try {
      // For coach view, we need to get the client's owner_id
      const { data: business } = await supabase
        .from('businesses')
        .select('owner_id')
        .eq('id', clientId)
        .single()

      if (!business?.owner_id) {
        toast.error('Could not find client user')
        setIsSaving(false)
        return
      }

      const response = await fetch(`/api/annual-plan?user_id=${business.owner_id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch annual plan data')
      }

      const annualPlanData = await response.json()

      if (!annualPlanData.revenue_target && !annualPlanData.profit_target) {
        toast.warning('No annual plan targets found for this client.')
        setIsSaving(false)
        return
      }

      const confirmMessage = `Import the following from client's Goals & Targets?\n\n` +
        `Revenue Target (Year 1): ${annualPlanData.revenue_target ? `$${annualPlanData.revenue_target.toLocaleString()}` : 'Not set'}\n` +
        `Gross Profit Target (Year 1): ${annualPlanData.gross_profit_target ? `$${annualPlanData.gross_profit_target.toLocaleString()}` : 'Not set'}\n` +
        `Net Profit Target (Year 1): ${annualPlanData.profit_target ? `$${annualPlanData.profit_target.toLocaleString()}` : 'Not set'}`

      if (!confirm(confirmMessage)) {
        setIsSaving(false)
        return
      }

      const revenueGoal = annualPlanData.revenue_target || forecast.revenue_goal || 0
      const grossProfitGoal = annualPlanData.gross_profit_target || (revenueGoal * 0.6)
      const netProfitGoal = annualPlanData.profit_target || 0

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
        console.error('[Coach Forecast] Error importing goals:', error)
        toast.error('Error importing goals: ' + error.message)
      } else {
        setForecast({
          ...forecast,
          revenue_goal: revenueGoal,
          gross_profit_goal: grossProfitGoal,
          net_profit_goal: netProfitGoal,
          goal_source: 'goals_wizard',
          annual_plan_id: annualPlanData.business_id
        })

        console.log('[Coach Forecast] Goals imported successfully')
        toast.success('Goals imported from client\'s annual plan')
      }
    } catch (err) {
      console.error('[Coach Forecast] Error importing goals:', err)
      toast.error('Error importing goals from Annual Plan.')
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
        console.error('[Coach Forecast] Error saving assumptions:', saveError)
        if (!isAutoSave) {
          toast.error('Error saving assumptions: ' + saveError.message)
        }
        setIsSaving(false)
        return
      }

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

      if (isAutoSave) {
        console.log('[Coach Forecast] Auto-saved assumptions')
        setIsSaving(false)
        return
      }

      console.log('[Coach Forecast] Generating forecast from assumptions...')

      const opexBudget = data.opex_budget !== undefined
        ? data.opex_budget
        : (data.gross_profit_goal && data.net_profit_goal
          ? data.gross_profit_goal - data.net_profit_goal
          : 0)

      const { lines } = await ForecastGenerator.generateForecast({
        forecast: updatedForecast,
        revenueGoal: data.revenue_goal,
        cogsPercentage: data.cogs_percentage,
        opexBudget,
        distributionMethod: data.revenue_distribution_method,
        existingLines: plLines
      })

      console.log('[Coach Forecast] Generated lines:', lines.length)

      const saveResult = await ForecastService.savePLLines(forecast.id, lines)

      if (saveResult.success) {
        setPlLines(lines)
        console.log('[Coach Forecast] Forecast generated and saved successfully')
        toast.success('Forecast generated!')
        setActiveTab('pl')
      } else {
        console.error('[Coach Forecast] Error saving generated lines:', saveResult.error)
        toast.error('Error saving forecast: ' + saveResult.error)
      }
    } catch (err) {
      console.error('[Coach Forecast] Error:', err)
      if (!isAutoSave) {
        toast.error('Error generating forecast')
      }
    }
    setIsSaving(false)
  }

  // Show loading while verifying coach access
  if (isCoach === null || !mounted || isLoading) {
    return (
      <>
        <CoachNavbar businessId={clientId} />
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading financial forecast...</p>
          </div>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <CoachNavbar businessId={clientId} />
        <ErrorState
          error={error}
          onRetry={() => {
            setError(null)
            verifyCoachAndLoadData()
          }}
          fullPage
          title="Failed to Load Forecast"
        />
      </>
    )
  }

  if (!forecast) {
    return (
      <>
        <CoachNavbar businessId={clientId} />
        <LoadingState message="Creating forecast..." />
      </>
    )
  }

  return (
    <>
      <CoachNavbar businessId={clientId} />
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-[1600px] mx-auto">
          {/* Error Banner */}
          {error && !isLoading && (
            <div className="mb-6">
              <ErrorState
                error={error}
                onRetry={() => {
                  setError(null)
                  verifyCoachAndLoadData()
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
                  console.error('[Coach Forecast] Error updating payroll settings:', error)
                } else {
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
              verifyCoachAndLoadData()
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
