'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { resolveBusinessId } from '@/lib/business/resolveBusinessId'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'
import { Loader2, BarChart3, Settings, Download, Save, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/ui/PageHeader'
import MonthlyReportTabs from './components/MonthlyReportTabs'
import MonthSelector from './components/MonthSelector'
import ReconciliationGate from './components/ReconciliationGate'
import BudgetVsActualDashboard from './components/BudgetVsActualDashboard'
import AccountMappingEditor from './components/AccountMappingEditor'
import ReportHistory from './components/ReportHistory'
import ReportSettingsPanel from './components/ReportSettingsPanel'
import FullYearProjectionTable from './components/FullYearProjectionTable'
import TrendCharts from './components/TrendCharts'
import XeroConnectionBanner from './components/XeroConnectionBanner'
import SubscriptionAnalysisTab from './components/SubscriptionAnalysisTab'
import WagesAnalysisTab from './components/WagesAnalysisTab'
import ChartsTab from './components/ChartsTab'
import CashflowTab from './components/CashflowTab'
import ForecastService from '@/app/finances/forecast/services/forecast-service'
import { generateCashflowForecast, getDefaultCashflowAssumptions } from '@/lib/cashflow/engine'
import { getForecastFiscalYear } from '@/app/finances/forecast/utils/fiscal-year'
import { useMonthlyReport } from './hooks/useMonthlyReport'
import { useConsolidatedReport } from './hooks/useConsolidatedReport'
import { useFullYearReport } from './hooks/useFullYearReport'
import { useSubscriptionDetail } from './hooks/useSubscriptionDetail'
import { useWagesDetail } from './hooks/useWagesDetail'
import { useXeroConnection } from './hooks/useXeroConnection'
import { useAccountMappings } from './hooks/useAccountMappings'
import { useReconciliation } from './hooks/useReconciliation'
import { useReportTemplates } from './hooks/useReportTemplates'
import { useBalanceSheet } from './hooks/useBalanceSheet'
import { useConsolidatedBalanceSheet } from './hooks/useConsolidatedBalanceSheet'
import { useConsolidatedCashflow } from './hooks/useConsolidatedCashflow'
import BalanceSheetTab from './components/BalanceSheetTab'
import ConsolidatedPLTab from './components/ConsolidatedPLTab'
import ConsolidatedBSTab from './components/ConsolidatedBSTab'
import ConsolidatedCashflowTab from './components/ConsolidatedCashflowTab'
import FXRateMissingBanner from './components/FXRateMissingBanner'
import { loadSettings, getCurrentFiscalYear, getDefaultReportMonth } from './services/monthly-report-service'
import { MonthlyReportPDFService } from './services/monthly-report-pdf-service'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import { usePDFLayout } from './hooks/usePDFLayout'
import type { ReportTab, MonthlyReportSettings, VarianceCommentary, GeneratedReport } from './types'

const PDFLayoutEditorModal = dynamic(
  () => import('./components/layout-editor/PDFLayoutEditorModal'),
  { ssr: false }
)

export default function MonthlyReportPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { activeBusiness, currentUser, isLoading: contextLoading } = useBusinessContext()
  const [mounted, setMounted] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const hasTriggeredOAuthSync = useRef(false)

  const [businessId, setBusinessId] = useState('')
  const [userId, setUserId] = useState('')
  const [fiscalYear, setFiscalYear] = useState(getCurrentFiscalYear())
  const [selectedMonth, setSelectedMonth] = useState(getDefaultReportMonth())
  const [settings, setSettings] = useState<MonthlyReportSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showLayoutEditor, setShowLayoutEditor] = useState(false)

  // Commentary state
  const [commentary, setCommentary] = useState<VarianceCommentary | undefined>(undefined)
  const [commentaryLoading, setCommentaryLoading] = useState(false)

  // Cashflow forecast state (shared between cashflow tab, charts tab, and PDF export)
  const [cashflowForecast, setCashflowForecast] = useState<CashflowForecastData | null>(null)
  const [cashflowLoading, setCashflowLoading] = useState(false)

  const [activeTab, setActiveTab] = useState<ReportTab>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('monthly-report-active-tab')
      if (saved && ['report', 'full-year', 'trends', 'charts', 'subscriptions', 'wages', 'cashflow', 'balance-sheet', 'balance-sheet-consolidated', 'cashflow-consolidated', 'mapping', 'history', 'consolidated'].includes(saved)) {
        return saved as ReportTab
      }
    }
    return 'report'
  })

  // Hooks
  const {
    report,
    isLoading: reportLoading,
    error: reportError,
    isConsolidationGroup,
    generateReport,
    saveSnapshot,
    loadSnapshot,
  } = useMonthlyReport(businessId)

  // Phase 34: consolidated-specific payload (per-entity columns + FX context).
  // `isConsolidationGroup` is the single source of truth — useMonthlyReport
  // and useConsolidatedReport both query `consolidation_groups.business_id`
  // from the browser and agree on the value.
  const {
    report: consolidatedReport,
    isLoading: consolidatedLoading,
    error: consolidatedError,
    generateConsolidated,
  } = useConsolidatedReport(businessId)

  // Phase 34 Iteration 34.1 — consolidated Balance Sheet payload.
  // `isConsolidationGroup` in this hook agrees with the P&L hook above
  // (same detection query), so we don't duplicate that flag into page state.
  const {
    report: consolidatedBS,
    isLoading: consolidatedBSLoading,
    error: consolidatedBSError,
    generateBalanceSheet: generateConsolidatedBS,
  } = useConsolidatedBalanceSheet(businessId)

  // Phase 34 Iteration 34.2 — consolidated Cashflow payload. Same detection
  // query as the other two consolidation hooks; they will always agree.
  const {
    report: consolidatedCashflow,
    isLoading: consolidatedCashflowLoading,
    error: consolidatedCashflowError,
    generateCashflow: generateConsolidatedCashflow,
  } = useConsolidatedCashflow(businessId)

  const {
    fullYearReport,
    isLoading: fullYearLoading,
    error: fullYearError,
    loadFullYear,
  } = useFullYearReport(businessId)

  const {
    subscriptionDetail,
    isLoading: subscriptionLoading,
    error: subscriptionError,
    loadSubscriptionDetail,
    clear: clearSubscription,
  } = useSubscriptionDetail(businessId)

  const {
    wagesDetail,
    isLoading: wagesLoading,
    error: wagesError,
    loadWagesDetail,
    clear: clearWages,
  } = useWagesDetail(businessId)

  const {
    mappings,
    unmapped,
    isLoading: mappingsLoading,
    loadMappings,
    saveMapping,
    confirmAll,
    autoMap,
  } = useAccountMappings(businessId)

  const {
    reconciliation,
    isLoading: reconLoading,
    checkReconciliation,
  } = useReconciliation(businessId)

  const {
    xeroConnection,
    isExpired: xeroExpired,
    isLoading: xeroLoading,
    isSyncing: xeroSyncing,
    handleConnect: xeroConnect,
    handleSync: xeroSync,
    handleManage: xeroManage,
  } = useXeroConnection(businessId)

  const {
    layout: pdfLayout,
    isSaving: layoutSaving,
    saveLayout,
  } = usePDFLayout(businessId, settings, setSettings)

  const {
    templates,
    isLoading: templatesLoading,
    activeTemplateId,
    loadTemplates,
    saveTemplate,
    updateTemplate,
    deleteTemplate,
    applyTemplate,
    setActiveTemplateId,
  } = useReportTemplates(businessId)

  const {
    balanceSheet,
    isLoading: balanceSheetLoading,
    error: balanceSheetError,
    compare: balanceSheetCompare,
    setCompare: setBalanceSheetCompare,
    load: loadBalanceSheet,
  } = useBalanceSheet(businessId)

  // Load cashflow forecast (reusable for tab, charts, and PDF)
  const loadCashflowForecast = useCallback(async () => {
    if (!businessId || !userId || cashflowLoading) return
    setCashflowLoading(true)
    try {
      const forecastFY = getForecastFiscalYear()
      const { forecast } = await ForecastService.getOrCreateForecast(businessId, userId, forecastFY)
      if (forecast?.id) {
        const plLines = await ForecastService.loadPLLines(forecast.id)
        if (plLines.length > 0) {
          let assumptions = getDefaultCashflowAssumptions()
          const assumptionsRes = await fetch(`/api/forecast/cashflow/assumptions?forecast_id=${forecast.id}`)
          if (assumptionsRes.ok) {
            const { data: savedAssumptions } = await assumptionsRes.json()
            if (savedAssumptions) {
              assumptions = {
                ...assumptions,
                ...savedAssumptions,
                loans: savedAssumptions.loans || [],
                planned_stock_changes: savedAssumptions.planned_stock_changes || {},
              }
            }
          }
          const result = generateCashflowForecast(plLines, null, assumptions, forecast)
          setCashflowForecast(result)
          return result
        }
      }
    } catch (err) {
      console.error('[MonthlyReport] Failed to load cashflow forecast:', err)
    } finally {
      setCashflowLoading(false)
    }
    return null
  }, [businessId, userId, cashflowLoading])

  // Save active tab
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('monthly-report-active-tab', activeTab)
    }
  }, [activeTab, mounted])

  // Initialize
  useEffect(() => {
    setMounted(true)
    if (!contextLoading) {
      initializePage()
    }
  }, [contextLoading, activeBusiness?.id])

  const initializePage = async () => {
    try {
      setIsInitializing(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsInitializing(false)
        return
      }
      setUserId(user.id)

      // Business resolution via the shared role-aware helper. See
      // src/lib/business/resolveBusinessId.ts — returns null for coach/admin
      // without an active client (no silent fallback to owner_id).
      const { businessId: bizId } = await resolveBusinessId(supabase, {
        userId: user.id,
        role: currentUser?.role ?? null,
        activeBusinessId: activeBusiness?.id ?? null,
      })
      if (!bizId) {
        setIsInitializing(false)
        return
      }
      setBusinessId(bizId)

      // Load settings
      const s = await loadSettings(bizId)
      setSettings(s)

      setIsInitializing(false)
    } catch (err) {
      console.error('[MonthlyReport] Init error:', err)
      setIsInitializing(false)
    }
  }

  // Load mappings when businessId is set
  useEffect(() => {
    if (businessId) {
      loadMappings()
    }
  }, [businessId, loadMappings])

  // Load templates when businessId is set; auto-apply default on first load
  const hasAppliedDefaultTemplate = useRef(false)
  useEffect(() => {
    if (!businessId) return
    loadTemplates().then(loaded => {
      if (!hasAppliedDefaultTemplate.current && loaded.length > 0) {
        const defaultTemplate = loaded.find(t => t.is_default)
        if (defaultTemplate) {
          hasAppliedDefaultTemplate.current = true
          setActiveTemplateId(defaultTemplate.id)
          setSettings(prev => prev ? applyTemplate(defaultTemplate, prev) : prev)
        }
      }
    })
  }, [businessId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Check reconciliation when month changes
  useEffect(() => {
    if (businessId && selectedMonth) {
      checkReconciliation(selectedMonth)
    }
  }, [businessId, selectedMonth, checkReconciliation])

  // Auto-redirect to mapping tab if no mappings
  useEffect(() => {
    if (!mappingsLoading && businessId && mappings.length === 0 && unmapped.length > 0) {
      setActiveTab('mapping')
    }
  }, [mappingsLoading, mappings.length, unmapped.length, businessId])

  // Auto-sync P&L data after returning from Xero OAuth
  useEffect(() => {
    if (
      !hasTriggeredOAuthSync.current &&
      searchParams.get('success') === 'connected' &&
      businessId &&
      xeroConnection &&
      !xeroSyncing
    ) {
      hasTriggeredOAuthSync.current = true
      toast.info('Syncing P&L data from Xero...')

      const runSync = async () => {
        const success = await xeroSync()
        if (success) {
          await loadMappings()
          // Auto-map if no mappings exist yet
          if (mappings.length === 0) {
            try {
              await autoMap()
              toast.success('Accounts auto-mapped from Xero data')
            } catch {
              // Auto-map failure is non-critical
            }
          }
        }
      }
      runSync()

      // Clean up URL params
      window.history.replaceState({}, '', '/finances/monthly-report')
    }
  }, [searchParams, businessId, xeroConnection, xeroSyncing, xeroSync, loadMappings, mappings.length, autoMap])

  // Lazy load full year data when tab is active
  useEffect(() => {
    if ((activeTab === 'full-year' || activeTab === 'trends' || activeTab === 'charts') && !fullYearReport && !fullYearLoading && !fullYearError && businessId) {
      loadFullYear(fiscalYear)
    }
  }, [activeTab, fullYearReport, fullYearLoading, fullYearError, businessId, fiscalYear, loadFullYear])

  // Lazy load subscription detail when tab is active
  useEffect(() => {
    if ((activeTab === 'subscriptions' || activeTab === 'charts') && !subscriptionDetail && !subscriptionLoading && !subscriptionError && businessId && settings) {
      const codes = settings.subscription_account_codes || []
      if (codes.length > 0) {
        loadSubscriptionDetail(selectedMonth, codes)
      }
    }
  }, [activeTab, subscriptionDetail, subscriptionLoading, subscriptionError, businessId, selectedMonth, settings, loadSubscriptionDetail])

  // Lazy load wages detail when tab is active
  useEffect(() => {
    if ((activeTab === 'wages' || activeTab === 'charts') && !wagesDetail && !wagesLoading && !wagesError && businessId && settings) {
      const names = settings.wages_account_names || []
      if (names.length > 0) {
        loadWagesDetail(selectedMonth, fiscalYear, names, settings.budget_forecast_id)
      }
    }
  }, [activeTab, wagesDetail, wagesLoading, wagesError, businessId, selectedMonth, fiscalYear, settings, loadWagesDetail])

  // Lazy load cashflow forecast when cashflow tab or charts tab is active
  useEffect(() => {
    if ((activeTab === 'cashflow' || activeTab === 'charts') && !cashflowForecast && !cashflowLoading && businessId && userId) {
      loadCashflowForecast()
    }
  }, [activeTab, cashflowForecast, cashflowLoading, businessId, userId, loadCashflowForecast])

  // Phase 34 (MLTE-04): when the consolidated tab is active and this business
  // is a consolidation parent, fetch the consolidated report. The tab + banner
  // rendering is wired in the tab content section below.
  useEffect(() => {
    if (
      activeTab === 'consolidated' &&
      isConsolidationGroup === true &&
      !consolidatedReport &&
      !consolidatedLoading &&
      !consolidatedError &&
      businessId &&
      selectedMonth &&
      fiscalYear
    ) {
      generateConsolidated(selectedMonth, fiscalYear)
    }
  }, [activeTab, isConsolidationGroup, consolidatedReport, consolidatedLoading, consolidatedError, businessId, selectedMonth, fiscalYear, generateConsolidated])

  // Phase 34 Iteration 34.1 — mirror the P&L auto-load for the Consolidated BS
  // tab. Fire when the user switches to balance-sheet-consolidated AND this
  // business is a consolidation parent AND no report has been loaded yet.
  useEffect(() => {
    if (
      activeTab === 'balance-sheet-consolidated' &&
      isConsolidationGroup === true &&
      !consolidatedBS &&
      !consolidatedBSLoading &&
      !consolidatedBSError &&
      businessId &&
      selectedMonth &&
      fiscalYear
    ) {
      generateConsolidatedBS(selectedMonth, fiscalYear)
    }
  }, [activeTab, isConsolidationGroup, consolidatedBS, consolidatedBSLoading, consolidatedBSError, businessId, selectedMonth, fiscalYear, generateConsolidatedBS])

  // Phase 34 Iteration 34.2 — auto-load consolidated cashflow when the user
  // switches to the cashflow-consolidated tab. Unlike P&L / BS, cashflow only
  // depends on fiscalYear (not selectedMonth) — it's a 12-month forward view.
  useEffect(() => {
    if (
      activeTab === 'cashflow-consolidated' &&
      isConsolidationGroup === true &&
      !consolidatedCashflow &&
      !consolidatedCashflowLoading &&
      !consolidatedCashflowError &&
      businessId &&
      fiscalYear
    ) {
      generateConsolidatedCashflow(fiscalYear)
    }
  }, [activeTab, isConsolidationGroup, consolidatedCashflow, consolidatedCashflowLoading, consolidatedCashflowError, businessId, fiscalYear, generateConsolidatedCashflow])

  // Fetch commentary after report generation — expenses over budget only
  const fetchCommentary = useCallback(async (reportData: GeneratedReport, existingCommentary?: VarianceCommentary) => {
    if (!businessId) return
    setCommentaryLoading(true)

    try {
      // Only expense sections (COGS, OpEx, Other Expenses) where actual >= $500 over budget
      const expenseSections = ['Cost of Sales', 'Operating Expenses', 'Other Expenses']
      const expenseLines: { account_name: string; xero_account_name: string }[] = []

      for (const section of reportData.sections) {
        if (!expenseSections.includes(section.category)) continue
        for (const line of section.lines) {
          // variance_amount <= -500 means actual is $500+ over budget for expenses
          if (line.variance_amount <= -500 && !line.is_budget_only) {
            expenseLines.push({
              account_name: line.account_name,
              xero_account_name: line.xero_account_name || line.account_name,
            })
          }
        }
      }

      if (expenseLines.length === 0) {
        setCommentary(undefined)
        setCommentaryLoading(false)
        return
      }

      const res = await fetch('/api/monthly-report/commentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          report_month: reportData.report_month,
          expense_lines: expenseLines,
        }),
      })

      const data = await res.json()
      if (data.success && data.commentary && Object.keys(data.commentary).length > 0) {
        // Merge persisted coach notes from existing commentary
        if (existingCommentary) {
          for (const [acctName, entry] of Object.entries(existingCommentary)) {
            if (entry.coach_note && data.commentary[acctName]) {
              data.commentary[acctName].coach_note = entry.coach_note
              data.commentary[acctName].is_edited = true
            }
          }
        }
        setCommentary(data.commentary)
      }
    } catch (err) {
      console.error('[MonthlyReport] Commentary fetch error:', err)
    } finally {
      setCommentaryLoading(false)
    }
  }, [businessId])

  const handleGenerateReport = useCallback(async (forceDraft?: boolean) => {
    const isDraft = forceDraft || (reconciliation ? !reconciliation.is_clean : false)
    const result = await generateReport(selectedMonth, fiscalYear, isDraft)

    if (result && 'needsMappings' in result && result.needsMappings) {
      setActiveTab('mapping')
      toast.info('Please set up account mappings first')
      return
    }

    if (result) {
      toast.success('Report generated')
      // Load persisted commentary to merge with fresh vendor data
      const snapshot = await loadSnapshot(selectedMonth)
      const persistedCommentary = snapshot?.commentary || undefined
      fetchCommentary(result, persistedCommentary)
    }
  }, [selectedMonth, fiscalYear, reconciliation, generateReport, fetchCommentary, loadSnapshot])

  const handleMonthChange = async (month: string) => {
    setSelectedMonth(month)
    setCommentary(undefined)
    clearSubscription()
    clearWages()
    // Restore persisted commentary from snapshot if one exists
    const snapshot = await loadSnapshot(month)
    if (snapshot?.commentary) {
      setCommentary(snapshot.commentary)
    }
  }

  const handleCommentaryChange = (accountName: string, note: string) => {
    setCommentary(prev => {
      const existing = prev?.[accountName]
      return {
        ...(prev || {}),
        [accountName]: {
          vendor_summary: existing?.vendor_summary || [],
          coach_note: note,
          is_edited: true,
        },
      }
    })
  }

  const handleSaveSnapshot = async (status: 'draft' | 'final' = 'draft') => {
    if (!report) return
    try {
      await saveSnapshot(report, { status, generatedBy: userId, commentary })
      toast.success(status === 'final' ? 'Report finalised' : 'Draft saved')
    } catch (err) {
      toast.error('Failed to save report')
    }
  }

  const [isExporting, setIsExporting] = useState(false)

  const handleExportPDF = async () => {
    if (!report) return
    setIsExporting(true)
    toast.info('Preparing PDF...')

    try {
      // Eagerly load full year data if not yet loaded
      let fyReport = fullYearReport
      if (!fyReport && businessId) {
        fyReport = await loadFullYear(fiscalYear)
      }

      // Eagerly load subscription detail if configured but not yet loaded
      let subDetail = subscriptionDetail
      if (!subDetail && settings?.sections.subscription_detail && businessId) {
        const codes = settings.subscription_account_codes || []
        if (codes.length > 0) {
          subDetail = await loadSubscriptionDetail(selectedMonth, codes)
        }
      }

      // Eagerly load wages detail if configured but not yet loaded
      let wDetail = wagesDetail
      if (!wDetail && settings?.sections.payroll_detail && businessId) {
        const names = settings.wages_account_names || []
        if (names.length > 0) {
          wDetail = await loadWagesDetail(selectedMonth, fiscalYear, names, settings.budget_forecast_id)
        }
      }

      // Load cashflow forecast data for PDF (reuse cached if available)
      let cfData: CashflowForecastData | undefined = cashflowForecast || undefined
      if (!cfData && businessId) {
        cfData = (await loadCashflowForecast()) || undefined
      }

      const pdf = new MonthlyReportPDFService(report, {
        commentary,
        fullYearReport: fyReport || undefined,
        subscriptionDetail: subDetail || undefined,
        wagesDetail: wDetail || undefined,
        cashflowForecast: cfData || undefined,
        sections: settings?.sections,
        pdfLayout: settings?.pdf_layout ?? null,
      })
      const doc = pdf.generate()
      const monthLabel = new Date(report.report_month + '-01')
        .toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
        .replace(' ', '-')
      doc.save(`Monthly-Report-${monthLabel}.pdf`)
      toast.success('PDF exported')
    } catch (err) {
      console.error('[MonthlyReport] PDF export error:', err)
      toast.error('Failed to export PDF')
    } finally {
      setIsExporting(false)
    }
  }

  const handleLoadHistorySnapshot = async (reportMonth: string) => {
    setSelectedMonth(reportMonth)
    const snapshot = await loadSnapshot(reportMonth)
    if (snapshot) {
      // Restore commentary from snapshot if available
      if (snapshot.commentary) {
        setCommentary(snapshot.commentary)
      } else {
        setCommentary(undefined)
      }
      setActiveTab('report')
      toast.success(`Loaded ${reportMonth} report`)
    } else {
      // No snapshot, generate fresh
      setCommentary(undefined)
      setActiveTab('report')
      handleGenerateReport()
    }
  }

  // Loading state
  if (!mounted || isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading monthly report...</p>
        </div>
      </div>
    )
  }

  // Empty state for coach/admin without an active client selection.
  if (!businessId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md text-center px-6">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No client selected</h2>
          <p className="text-gray-600 mb-4">
            Open a client from the coach portal to view their monthly report.
          </p>
          <a
            href="/coach/clients"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
          >
            Go to Clients
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <PageHeader
        variant="banner"
        title="Monthly Report"
        subtitle={report ? `FY${fiscalYear}` : undefined}
        icon={BarChart3}
        actions={
          <>
            <button
              onClick={() => setShowLayoutEditor(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg transition-colors"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Layout</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>

            {report && (
              <>
                <button
                  onClick={() => handleSaveSnapshot('draft')}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span className="hidden sm:inline">Save Draft</span>
                </button>
                <button
                  onClick={() => handleSaveSnapshot('final')}
                  disabled={report.is_draft}
                  title={report.is_draft ? 'Reconcile all transactions before finalising' : 'Save as final report'}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  <span className="hidden sm:inline">Finalise</span>
                </button>
                <button
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export PDF'}</span>
                </button>
              </>
            )}
          </>
        }
      />

      <div className="max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8">
        {/* Month Selector */}
        <MonthSelector
          selectedMonth={selectedMonth}
          fiscalYear={fiscalYear}
          onChange={handleMonthChange}
        />

        {/* Xero Connection Banner */}
        <XeroConnectionBanner
          xeroConnection={xeroConnection}
          isExpired={xeroExpired}
          isLoading={xeroLoading}
          isSyncing={xeroSyncing}
          onConnect={xeroConnect}
          onSync={async () => {
            const success = await xeroSync()
            if (success) {
              // Reload account mappings after sync
              loadMappings()
            }
          }}
          onManage={xeroManage}
        />

        {/* Reconciliation Gate (only on report tab) */}
        {activeTab === 'report' && (
          <ReconciliationGate
            reconciliation={reconciliation}
            isLoading={reconLoading}
            selectedMonth={selectedMonth}
            onProceedDraft={() => handleGenerateReport(true)}
          />
        )}

        {/* Generate Report Button */}
        {activeTab === 'report' && !report && mappings.length > 0 && (
          <div className="mb-6 text-center">
            <button
              onClick={() => handleGenerateReport()}
              disabled={reportLoading}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {reportLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
              ) : (
                <><BarChart3 className="w-4 h-4" /> Generate Report</>
              )}
            </button>
          </div>
        )}

        {/* Error */}
        {reportError && activeTab === 'report' && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-red-800">{reportError}</p>
          </div>
        )}

        {/* Tabs */}
        <MonthlyReportTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasUnmapped={unmapped.length > 0}
          showSubscriptions={!!(settings?.sections.subscription_detail && (settings?.subscription_account_codes || []).length > 0)}
          showWages={!!(settings?.sections.payroll_detail && (settings?.wages_account_names || []).length > 0)}
          showCashflow={!!(settings?.sections.cashflow)}
          showCharts={!!(settings?.sections && Object.entries(settings.sections).some(([k, v]) => k.startsWith('chart_') && v))}
          showBalanceSheet={!!(settings?.sections.balance_sheet)}
          showConsolidated={isConsolidationGroup === true}
          showConsolidatedBS={isConsolidationGroup === true}
          showConsolidatedCashflow={isConsolidationGroup === true}
        />

        {/* Tab Content */}
        {activeTab === 'report' && report && (
          <BudgetVsActualDashboard
            report={report}
            commentary={commentary}
            commentaryLoading={commentaryLoading}
            onCommentaryChange={handleCommentaryChange}
            onTabChange={setActiveTab}
          />
        )}

        {activeTab === 'report' && !report && mappings.length === 0 && !mappingsLoading && (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900">Set Up Account Mappings</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              Before generating a report, you need to map your Xero accounts to report categories.
            </p>
            <button
              onClick={() => setActiveTab('mapping')}
              className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg transition-colors"
            >
              Set Up Mappings
            </button>
          </div>
        )}

        {activeTab === 'full-year' && (
          <>
            {fullYearLoading && (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-3" />
                <p className="text-sm text-gray-600">Loading full year projection...</p>
              </div>
            )}
            {fullYearError && (
              <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-800">{fullYearError}</p>
              </div>
            )}
            {fullYearReport && !fullYearLoading && (
              <FullYearProjectionTable report={fullYearReport} />
            )}
          </>
        )}

        {activeTab === 'trends' && (
          <>
            {fullYearLoading && (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-3" />
                <p className="text-sm text-gray-600">Loading trend data...</p>
              </div>
            )}
            {fullYearError && (
              <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-800">{fullYearError}</p>
              </div>
            )}
            {fullYearReport && !fullYearLoading && (
              <TrendCharts report={fullYearReport} />
            )}
          </>
        )}

        {activeTab === 'subscriptions' && (
          <SubscriptionAnalysisTab
            data={subscriptionDetail}
            isLoading={subscriptionLoading}
            error={subscriptionError}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}

        {activeTab === 'wages' && (
          <WagesAnalysisTab
            data={wagesDetail}
            isLoading={wagesLoading}
            error={wagesError}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}

        {activeTab === 'charts' && settings && (
          <ChartsTab
            sections={settings.sections}
            report={report}
            fullYearReport={fullYearReport}
            fullYearLoading={fullYearLoading}
            cashflowForecast={cashflowForecast}
            cashflowLoading={cashflowLoading}
            wagesDetail={wagesDetail}
            wagesLoading={wagesLoading}
            subscriptionDetail={subscriptionDetail}
            subscriptionLoading={subscriptionLoading}
            wagesAccountNames={settings.wages_account_names || []}
          />
        )}

        {activeTab === 'cashflow' && (
          <CashflowTab
            data={cashflowForecast}
            isLoading={cashflowLoading}
          />
        )}

        {activeTab === 'balance-sheet' && (
          <BalanceSheetTab
            businessId={businessId}
            month={selectedMonth}
            balanceSheet={balanceSheet}
            isLoading={balanceSheetLoading}
            error={balanceSheetError}
            compare={balanceSheetCompare}
            onCompareChange={setBalanceSheetCompare}
            onLoad={loadBalanceSheet}
          />
        )}

        {/* Phase 34 — Consolidated P&L tab (only rendered for consolidation parents) */}
        {activeTab === 'consolidated' && isConsolidationGroup === true && (
          <>
            <FXRateMissingBanner
              missingRates={consolidatedReport?.fx_context?.missing_rates ?? []}
              onAddRate={() => router.push(`/admin/consolidation/${businessId}?from=${encodeURIComponent(pathname)}`)}
            />
            <ConsolidatedPLTab
              report={consolidatedReport}
              reportMonth={selectedMonth}
              isLoading={consolidatedLoading}
              error={consolidatedError}
            />
          </>
        )}

        {/* Phase 34 Iteration 34.1 — Consolidated Balance Sheet tab */}
        {activeTab === 'balance-sheet-consolidated' && isConsolidationGroup === true && (
          <>
            <FXRateMissingBanner
              missingRates={consolidatedBS?.fx_context?.missing_rates ?? []}
              onAddRate={() => router.push(`/admin/consolidation/${businessId}?from=${encodeURIComponent(pathname)}`)}
            />
            <ConsolidatedBSTab
              report={consolidatedBS}
              isLoading={consolidatedBSLoading}
              error={consolidatedBSError}
            />
          </>
        )}

        {/* Phase 34 Iteration 34.2 — Consolidated Cashflow tab */}
        {activeTab === 'cashflow-consolidated' && isConsolidationGroup === true && (
          <>
            <FXRateMissingBanner
              missingRates={consolidatedCashflow?.fx_context?.missing_rates ?? []}
              onAddRate={() => router.push(`/admin/consolidation/${businessId}?from=${encodeURIComponent(pathname)}`)}
            />
            <ConsolidatedCashflowTab
              report={consolidatedCashflow}
              isLoading={consolidatedCashflowLoading}
              error={consolidatedCashflowError}
            />
          </>
        )}

        {activeTab === 'mapping' && (
          <AccountMappingEditor
            businessId={businessId}
            mappings={mappings}
            unmapped={unmapped}
            isLoading={mappingsLoading}
            onAutoMap={autoMap}
            onSaveMapping={saveMapping}
            onConfirmAll={confirmAll}
            onRefresh={loadMappings}
          />
        )}

        {activeTab === 'history' && (
          <ReportHistory
            businessId={businessId}
            onLoadSnapshot={handleLoadHistorySnapshot}
          />
        )}
      </div>

      {/* Settings Panel */}
      {settings && (
        <ReportSettingsPanel
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          businessId={businessId}
          settings={settings}
          onSettingsChange={(newSettings) => {
            setSettings(newSettings)
            // Re-generate report if it was already generated
            if (report) {
              handleGenerateReport()
            }
          }}
          templates={templates}
          activeTemplateId={activeTemplateId}
          templatesLoading={templatesLoading}
          onApplyTemplate={(template) => {
            const newSettings = applyTemplate(template, settings)
            setSettings(newSettings)
            toast.success(`Template "${template.name}" applied`)
            if (report) handleGenerateReport()
          }}
          onDeleteTemplate={async (template) => {
            const ok = await deleteTemplate(template.id)
            if (ok) toast.success(`Template "${template.name}" deleted`)
            else toast.error('Failed to delete template')
          }}
          onSetDefaultTemplate={async (template) => {
            const updated = await updateTemplate(template.id, { is_default: true })
            if (updated) toast.success(`"${template.name}" is now the default template`)
            else toast.error('Failed to set default')
          }}
          onSaveTemplate={async (name, isDefault) => {
            const saved = await saveTemplate(name, settings, isDefault)
            if (!saved) throw new Error('Save failed')
          }}
        />
      )}

      {/* PDF Layout Editor Modal */}
      <PDFLayoutEditorModal
        isOpen={showLayoutEditor}
        onClose={() => setShowLayoutEditor(false)}
        initialLayout={pdfLayout}
        sections={settings?.sections}
        onSave={saveLayout}
        isSaving={layoutSaving}
        availableData={{
          report: !!report,
          fullYear: !!fullYearReport,
          cashflow: !!cashflowForecast,
          subscriptions: !!subscriptionDetail,
          wages: !!wagesDetail,
        }}
      />
    </div>
  )
}
