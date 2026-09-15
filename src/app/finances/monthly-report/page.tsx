'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { resolveBusinessId } from '@/lib/business/resolveBusinessId'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'
import { Loader2, BarChart3, Settings, Download, Save, LayoutGrid, StickyNote } from 'lucide-react'
// Phase 42 Plan 04: auto-save lifecycle (D-01..D-15) + visible save indicator (D-08, D-09).
import { useAutoSaveReport } from './hooks/useAutoSaveReport'
import SaveIndicator from './components/SaveIndicator'
import { toast } from 'sonner'
import * as Sentry from '@sentry/nextjs'
import { DataIntegrityBanner } from '@/components/data-integrity/DataIntegrityBanner'
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
import ExternalDataTab from './components/ExternalDataTab'
import UploadedPagesPanel from './components/UploadedPagesPanel'
import MemoModal from './components/MemoModal'
import PreflightPanel from './components/PreflightPanel'
import { runPreflight, type PreflightResult } from '@/lib/monthly-report/preflight'
import ForecastService from '@/app/finances/forecast/services/forecast-service'
// Phase 71 Plan 09 (S6) — one-time per-session toast on multi-currency redirect.
import {
  shouldShowMultiCurrencyToast,
  buildMultiCurrencyToastMessage,
} from './utils/multi-currency-toast'
import { getForecastFiscalYear } from '@/app/finances/forecast/utils/fiscal-year'
import { useMonthlyReport } from './hooks/useMonthlyReport'
import { useConsolidatedReport } from './hooks/useConsolidatedReport'
import { useFullYearReport } from './hooks/useFullYearReport'
import { useSubscriptionDetail } from './hooks/useSubscriptionDetail'
import { rollUpContractors, contractorLoadReason } from '@/lib/monthly-report/contractor-rollup'
import { contractorWindowForLayout } from '@/lib/monthly-report/contractor-page'
import { payrollWindowForLayout } from '@/lib/monthly-report/payroll-grid-config'
import { parseRatioAnalysisConfig, requiredWindow } from '@/lib/monthly-report/ratio-table'
import { buildPackCashflowForecast, packCashflowBasisFor, packCashflowPlLines } from '@/lib/monthly-report/pack-cashflow'
import type { OpeningBank } from '@/lib/monthly-report/opening-bank'
import { buildPackCashModel } from '@/lib/monthly-report/pack-cash-model'
import type { CashModelLoadResult } from '@/lib/monthly-report/pack-cash-model-load'
import { resolvePageCashModel } from '@/lib/monthly-report/cash-model-page-gate'
import { useWagesDetail } from './hooks/useWagesDetail'
import { useXeroConnection } from './hooks/useXeroConnection'
import { useAccountMappings } from './hooks/useAccountMappings'
import { useReconciliation } from './hooks/useReconciliation'
import { useReportTemplates } from './hooks/useReportTemplates'
import { useBalanceSheet } from './hooks/useBalanceSheet'
import { extractRatioContext } from '@/lib/monthly-report/commentary-clause'
import { applyCoachNote, reconcileCommentary } from '@/lib/monthly-report/commentary-reconcile'
import { collectCommentaryTriggers, type TriggerLine } from './utils/commentary-triggers'
import {
  commentaryCoverageFromLayout,
  commentaryPlacementProblems,
  describeCommentaryPlacementProblem,
} from './services/commentary-placement'
import { useConsolidatedBalanceSheet } from './hooks/useConsolidatedBalanceSheet'
import { useConsolidatedCashflow } from './hooks/useConsolidatedCashflow'
import BalanceSheetTab from './components/BalanceSheetTab'
import ConsolidatedPLTab from './components/ConsolidatedPLTab'
import ConsolidatedBSTab from './components/ConsolidatedBSTab'
import ConsolidatedCashflowTab from './components/ConsolidatedCashflowTab'
import FXRateMissingBanner from './components/FXRateMissingBanner'
import { loadSettings, getCurrentFiscalYear, getDefaultReportMonth, getFiscalYearForMonth, defaultMonthForFiscalYear } from './services/monthly-report-service'
import { buildPackPdf, preparePackInserts } from './services/pack-pdf'
import { fetchPackInsertSources, savePdfBytes } from './services/pack-inserts-fetch'
import type { PackInsertSources } from '@/lib/monthly-report/pack-inserts'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import { usePDFLayout } from './hooks/usePDFLayout'
import { loadPackEntityName } from '@/lib/monthly-report/pack-entity-name'
import { loadPackPreparedOn } from '@/lib/monthly-report/pack-prepared-on'
import {
  balanceSheetsForExport,
  freezeBalanceSheetsAtFinalise,
  loadSentBalanceSheets,
  waitForPendingFreeze,
} from '@/lib/monthly-report/balance-sheet-freeze'
import type { ReportTab, MonthlyReportSettings, VarianceCommentary, GeneratedReport } from './types'
// Phase 35 Plan 06: Approval + delivery controls for the monthly report.
import ReportStatusBar from './components/ReportStatusBar'
import { useReportStatus } from './hooks/useReportStatus'
import {
  approveAndSend,
  markReady,
  resendReport,
  revertToDraft,
} from './services/approve-and-send'

const PDFLayoutEditorModal = dynamic(
  () => import('./components/layout-editor/PDFLayoutEditorModal'),
  { ssr: false }
)

/**
 * Total Bank on the day before the report's fiscal year starts, from the synced
 * balance-sheet mirror. Never throws: a failed lookup is 'unavailable', which
 * the cashflow basis line prints, rather than a $0 opening passed off as real.
 */
async function loadOpeningBank(businessId: string, reportMonth: string): Promise<OpeningBank> {
  try {
    const res = await fetch(
      `/api/monthly-report/opening-bank?business_id=${encodeURIComponent(businessId)}&report_month=${encodeURIComponent(reportMonth)}`
    )
    if (res.ok) {
      const body = await res.json()
      if (body?.opening?.status === 'read' || body?.opening?.status === 'unavailable') {
        return body.opening as OpeningBank
      }
    }
    console.warn(`[MonthlyReport] opening bank lookup failed (${res.status}) — the cashflow will say so`)
    return { status: 'unavailable', asAt: null, reason: 'the balance sheet could not be reached' }
  } catch (err) {
    Sentry.captureException(err, { tags: { invariant: 'pack-opening-bank-load' } } as any)
    return { status: 'unavailable', asAt: null, reason: 'the balance sheet could not be reached' }
  }
}

/**
 * The cash model v2 switch and inputs (see pack-cash-model-load), asked for
 * only when the business's settings row carries a cash_model — see
 * resolvePageCashModel: a client that never turned v2 on does not depend on
 * this route at all. For one that did, a failed lookup is not "off" (that
 * would print v1 in v2's place); it is a refusal the page prints.
 */
async function fetchCashModel(businessId: string, reportMonth: string, settingsCashModel: unknown): Promise<CashModelLoadResult> {
  return resolvePageCashModel(settingsCashModel, async () => {
    try {
      const res = await fetch(
        `/api/monthly-report/cash-model?business_id=${encodeURIComponent(businessId)}&report_month=${encodeURIComponent(reportMonth)}`
      )
      if (res.ok) {
        const body = await res.json()
        const status = body?.cash_model?.status
        if (status === 'off' || status === 'refused' || status === 'ready') return body.cash_model as CashModelLoadResult
      }
      Sentry.captureMessage(`[MonthlyReport] cash model lookup failed (${res.status})`, { tags: { route: 'monthly-report/cash-model' } } as any)
    } catch (err) {
      Sentry.captureException(err, { tags: { route: 'monthly-report/cash-model' } } as any)
    }
    return null
  })
}

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
  // WA.4 — month and fiscal year are derived from the SAME anchor. They used
  // to come from two different clocks ("last completed month" vs "FY of
  // today"), which disagree for the whole of July: the page opened on June
  // against the NEW fiscal year, silently zeroing YTD and looking up a budget
  // year that contains no June.
  const [selectedMonth, setSelectedMonth] = useState(getDefaultReportMonth())
  const [fiscalYear, setFiscalYear] = useState(() => getFiscalYearForMonth(getDefaultReportMonth()))
  const [settings, setSettings] = useState<MonthlyReportSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showLayoutEditor, setShowLayoutEditor] = useState(false)

  // Commentary state
  const [commentary, setCommentary] = useState<VarianceCommentary | undefined>(undefined)
  const [commentaryLoading, setCommentaryLoading] = useState(false)
  // True when the last commentary check could not run (no Xero connection, or a
  // token refresh that failed). The rows on screen are then the previous
  // answer, and the panel says so rather than presenting them as current.
  const [commentaryUnverified, setCommentaryUnverified] = useState(false)

  // Phase 42 Plan 04: track loaded snapshot status to drive isLocked (D-06).
  // Plan 42-05 will give Finalise full lock UX; this plan only sets it up so
  // useAutoSaveReport receives a correct isLocked flag.
  const [loadedSnapshotStatus, setLoadedSnapshotStatus] = useState<'draft' | 'final' | null>(null)
  // Decision 19: the balance-sheet freeze a Finalise started and did not wait
  // for. Finalise → Export straight away is the normal flow, and an export that
  // read the snapshot before this landed would find the freeze still owed and
  // freeze a second time — reporting a late freeze that was merely in flight.
  const pendingBalanceSheetFreeze = useRef<{ month: string; done: Promise<boolean> } | null>(null)

  // Phase 35 Plan 06: owner_email + owner_name (recipient + greeting) are needed by
  // the approve-and-send flow but not part of the existing ActiveBusiness shape.
  // Fetched once after businessId resolves.
  const [ownerInfo, setOwnerInfo] = useState<{ email: string | null; name: string | null }>({ email: null, name: null })

  // Cashflow forecast state (shared between cashflow tab, charts tab, and PDF export)
  const [cashflowForecast, setCashflowForecast] = useState<CashflowForecastData | null>(null)
  const [cashflowLoading, setCashflowLoading] = useState(false)
  // PRES-10 — every failure exit in loadCashflowForecast returned null, which
  // renders the "Set up a financial forecast with P&L lines" empty state. That is
  // a confident, actionable instruction that is FALSE for a business which
  // already has a forecast: it sends them to rebuild something that exists.
  // CashflowTab already renders an `error` prop; nothing ever set it.
  const [cashflowError, setCashflowError] = useState<string | null>(null)
  // Why a cash-model-v2 business has no cashflow, for the PDF built in the
  // same pass (a setState is not visible to the pass that made it).
  const cashflowReasonRef = useRef<string | null>(null)

  // Viewer role. Hoisted ABOVE the tab effects below because they reference it
  // in their dependency arrays — leaving it at its old position (further down)
  // would be a use-before-declaration TDZ crash at render. 'client' is the
  // fallback, so it also covers the brief window before currentUser resolves.
  // Consolidation is a coach/admin-only view; clients never see it.
  const userRole: 'coach' | 'super_admin' | 'client' =
    currentUser?.role === 'coach'
      ? 'coach'
      : currentUser?.role === 'admin'
      ? 'super_admin'
      : 'client'

  const [activeTab, setActiveTab] = useState<ReportTab>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('monthly-report-active-tab')
      if (saved && ['report', 'full-year', 'trends', 'charts', 'subscriptions', 'wages', 'cashflow', 'balance-sheet', 'balance-sheet-consolidated', 'cashflow-consolidated', 'external-data', 'mapping', 'history', 'consolidated'].includes(saved)) {
        return saved as ReportTab
      }
    }
    return 'report'
  })

  // Phase 67 deferred — for multi-currency businesses (IICT today), the
  // non-consolidated P&L / BS / Cashflow tabs sum tenants without FX
  // translation and show mixed-currency rows. Auto-redirect those tabs to
  // their consolidated equivalents so the user never lands on a broken view.
  // Single-tenant and all-AUD multi-tenant businesses stay unchanged.
  const [isMultiCurrency, setIsMultiCurrency] = useState(false)
  // Phase 71 Plan 09 (S6) — list of unique currencies present across included
  // tenants. Drives the multi-currency redirect toast text so the operator
  // sees the actual currencies (e.g. "AUD + HKD") instead of a generic label.
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>([])
  useEffect(() => {
    if (!businessId) {
      setIsMultiCurrency(false)
      setActiveCurrencies([])
      return
    }
    let aborted = false
    fetch(`/api/Xero/active-tenants?business_id=${encodeURIComponent(businessId)}`)
      .then(async (res) => {
        if (!res.ok || aborted) return
        const data = await res.json()
        if (aborted) return
        const tenants = Array.isArray(data.tenants) ? data.tenants : []
        const includedCurrencies = tenants
          .filter(
            (t: { include_in_consolidation?: boolean }) => t.include_in_consolidation !== false,
          )
          .map((t: { functional_currency?: string }) =>
            (t.functional_currency || 'AUD').toUpperCase(),
          )
        const fx = includedCurrencies.some((c: string) => c !== 'AUD')
        setIsMultiCurrency(fx)
        setActiveCurrencies(includedCurrencies)
      })
      .catch(() => {
        if (!aborted) {
          setIsMultiCurrency(false)
          setActiveCurrencies([])
        }
      })
    return () => {
      aborted = true
    }
  }, [businessId])

  useEffect(() => {
    // Consolidation is coach/admin-only — never auto-route a client onto a
    // consolidated tab they're not allowed to see (they keep the standard tabs).
    if (!isMultiCurrency || userRole === 'client') return
    const consolEquivalent: Partial<Record<ReportTab, ReportTab>> = {
      report: 'consolidated',
      'balance-sheet': 'balance-sheet-consolidated',
      cashflow: 'cashflow-consolidated',
    }
    const target = consolEquivalent[activeTab]
    if (target) {
      setActiveTab(target)
      if (typeof window !== 'undefined') {
        localStorage.setItem('monthly-report-active-tab', target)
        // Phase 71 Plan 09 (S6) — one-time toast per session per business so
        // the silent mid-session tab switch is no longer mysterious.
        if (shouldShowMultiCurrencyToast(businessId, isMultiCurrency, window.localStorage)) {
          toast.info(buildMultiCurrencyToastMessage(activeCurrencies))
        }
      }
    }
  }, [isMultiCurrency, activeTab, businessId, activeCurrencies, userRole])

  // Hooks
  const {
    report,
    isLoading: reportLoading,
    error: reportError,
    isConsolidationGroup,
    generateReport,
    saveSnapshot,
    loadSnapshot,
    fetchSnapshot,
    dataQuality,
    perTenantQuality,
    qualityCheckFailed,
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
    clear: clearConsolidated,
  } = useConsolidatedReport(businessId)

  // Phase 34 Iteration 34.1 — consolidated Balance Sheet payload.
  // `isConsolidationGroup` in this hook agrees with the P&L hook above
  // (same detection query), so we don't duplicate that flag into page state.
  const {
    report: consolidatedBS,
    isLoading: consolidatedBSLoading,
    error: consolidatedBSError,
    generateBalanceSheet: generateConsolidatedBS,
    clear: clearConsolidatedBS,
  } = useConsolidatedBalanceSheet(businessId)

  // Phase 34 Iteration 34.2 — consolidated Cashflow payload. Same detection
  // query as the other two consolidation hooks; they will always agree.
  const {
    report: consolidatedCashflow,
    isLoading: consolidatedCashflowLoading,
    error: consolidatedCashflowError,
    generateCashflow: generateConsolidatedCashflow,
    clear: clearConsolidatedCashflow,
  } = useConsolidatedCashflow(businessId)

  // The consolidated (multi-entity rollup) tabs are a coach/admin-only view.
  // Gate = a real consolidation parent AND a non-client viewer. Used for both
  // tab visibility and content render below, so a client can't reach it via a
  // visible tab, a stale saved tab, or the auto-redirect.
  const canSeeConsolidated = isConsolidationGroup === true && userRole !== 'client'

  // Bounce a client off any consolidated tab they may have persisted (from
  // before this gate, or a multi-currency redirect). Wait for currentUser to
  // resolve (contextLoading) so a coach mid-load isn't mistaken for a client
  // and kicked off their own active tab.
  useEffect(() => {
    if (contextLoading) return
    if (
      userRole === 'client' &&
      (activeTab === 'consolidated' ||
        activeTab === 'balance-sheet-consolidated' ||
        activeTab === 'cashflow-consolidated')
    ) {
      setActiveTab('report')
    }
  }, [contextLoading, userRole, activeTab])

  const {
    fullYearReport,
    isLoading: fullYearLoading,
    error: fullYearError,
    loadFullYear,
    clearFullYear,
  } = useFullYearReport(businessId)

  const {
    subscriptionDetail,
    isLoading: subscriptionLoading,
    error: subscriptionError,
    loadSubscriptionDetail,
    clear: clearSubscription,
  } = useSubscriptionDetail(businessId)

  // Given the layout the page prints: the per-employee budgets read its Payroll
  // Report roster, and wages loaded for another roster are not handed back.
  const {
    wagesDetail,
    isLoading: wagesLoading,
    error: wagesError,
    loadWagesDetail,
    clear: clearWages,
  } = useWagesDetail(businessId, settings?.pdf_layout ?? null)

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
    checkFailed: xeroCheckFailed,
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
  } = usePDFLayout(
    businessId,
    settings,
    setSettings,
    selectedMonth,
    // Phase 42 D-17: every layout save triggers the pill auto-revert chain.
    () => { reportStatus.refresh() },
  )

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
  /**
   * @param fullYear when given, the cash page is built from ACTUALS to the end
   *   of the reporting period and the approved BUDGET thereafter, rather than
   *   projecting every month of the year from the forecast. See
   *   buildPackCashflowLines — the engine needs no change, only a truer input.
   */
  const loadCashflowForecast = useCallback(async (
    fullYear?: import('./types').FullYearReport | null,
    reportMonth?: string,
  ) => {
    // Not before the settings row: its cash_model decides v1 or v2, and a
    // load that ran first would build v1 for a business on v2.
    if (!businessId || !userId || !settings || cashflowLoading) return
    setCashflowLoading(true)
    setCashflowError(null)
    cashflowReasonRef.current = null
    try {
      // Cash model v2 first: a business that has turned it on never reaches
      // the clock-picked forecast below (nor its create-on-read), and one whose
      // model cannot be built says why rather than printing v1 in its place.
      const cmMonth = reportMonth ?? selectedMonth
      const cashModel = await fetchCashModel(businessId, cmMonth, settings.cash_model)
      if (cashModel.status !== 'off') {
        let reason: string
        if (cashModel.status === 'ready') {
          const model = buildPackCashModel({ fullYear, reportMonth: cmMonth, config: cashModel.config, inputs: cashModel.inputs })
          if (model.status === 'ready') {
            setCashflowForecast(model.cashflow)
            return model.cashflow
          }
          reason = model.reason
        } else {
          reason = cashModel.reason
        }
        cashflowReasonRef.current = reason
        setCashflowError(`The cashflow is not available: ${reason}`)
        return null
      }

      const forecastFY = getForecastFiscalYear()
      const { forecast, error: forecastErr } = await ForecastService.getOrCreateForecast(businessId, userId, forecastFY)
      if (forecastErr) {
        // A lookup failure is not "no forecast exists".
        setCashflowError('Could not load your cashflow forecast. This is a system error, not a missing forecast — your data is unchanged.')
        return null
      }
      if (forecast?.id) {
        const forecastLines = await ForecastService.loadPLLines(forecast.id)
        const month = reportMonth ?? selectedMonth
        // Actuals for the months already banked, the approved budget for the
        // rest. Falls back to the forecast's own lines when the Full Year
        // report is not to hand, which is what every caller did before.
        // The composition is shared with scripts/preview-pack.ts — see
        // lib/monthly-report/pack-cashflow.
        if (packCashflowPlLines(fullYear, month, forecastLines).length > 0) {
          const [assumptionsRes, opening] = await Promise.all([
            fetch(`/api/forecast/cashflow/assumptions?forecast_id=${forecast.id}`),
            loadOpeningBank(businessId, month),
          ])
          let savedAssumptions = null
          if (assumptionsRes.ok) {
            savedAssumptions = (await assumptionsRes.json()).data ?? null
          }
          const result = buildPackCashflowForecast({
            fullYear, reportMonth: month, forecast, forecastLines, savedAssumptions, opening,
          })
          if (result) {
            setCashflowForecast(result)
            return result
          }
        }
      }
    } catch (err) {
      console.error('[MonthlyReport] Failed to load cashflow forecast:', err)
      setCashflowError('Could not load your cashflow forecast. This is a system error, not a missing forecast — your data is unchanged.')
    } finally {
      setCashflowLoading(false)
    }
    return null
  }, [businessId, userId, settings, cashflowLoading, selectedMonth])

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

  // Phase 35 Plan 06: fetch owner_email + owner_name for the approve-and-send flow.
  // One-shot read once businessId is known.
  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('businesses')
        .select('owner_email, owner_name')
        .eq('id', businessId)
        .maybeSingle()
      if (cancelled) return
      setOwnerInfo({
        email: (data?.owner_email as string | null) ?? null,
        name: (data?.owner_name as string | null) ?? null,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [businessId, supabase])

  // Phase 35 Plan 06: status pill reads cfo_report_status(business_id, period_month).
  // period_month is derived from the currently-selected report (YYYY-MM → YYYY-MM-01).
  const periodMonthKey = report?.report_month ? `${report.report_month}-01` : null
  const reportStatus = useReportStatus(businessId || null, periodMonthKey)

  // Phase 42 Plan 04: mount the auto-save lifecycle. Watches commentary only
  // (Pitfall 6 / Phase 35 D-17) — typing fires schedule() (debounced 500ms,
  // D-01/D-02), blur fires flushImmediately(), and every 2xx triggers
  // reportStatus.refresh() (D-15) so the pill auto-reverts within ~500ms of a
  // save settling. isLocked is derived from loadedSnapshotStatus
  // (snapshot.status === 'final' → D-06) — Plan 42-05 will wire the full
  // Finalise lock UX (toast on completion + button disabled state).
  const isLocked = loadedSnapshotStatus === 'final'
  const autoSave = useAutoSaveReport({
    report,
    commentary,
    // The month on screen. `report` lags this across a month change (the
    // snapshot GET is awaited, and a month with no saved snapshot never
    // replaces it at all), so the hook refuses to write while the two
    // disagree — otherwise the POST lands on the month just navigated away
    // from, as a draft with its commentary blanked.
    selectedMonth,
    userId,
    isLocked,
    onSaveSuccess: () => {
      reportStatus.refresh()
    },
    saveSnapshot,
  })

  // (userRole is declared once near the top — hoisted above the tab effects.)

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
      loadFullYear(fiscalYear, selectedMonth)
    }
  }, [activeTab, fullYearReport, fullYearLoading, fullYearError, businessId, fiscalYear, selectedMonth, loadFullYear])

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
    // Not again after an error: a refused cash model answers null every time,
    // and without this each finished load would start the next one. A month
    // change clears the error, so the next month still loads.
    if ((activeTab === 'cashflow' || activeTab === 'charts') && !cashflowForecast && !cashflowLoading && !cashflowError && businessId && userId && settings) {
      // The Full Year report carries the actuals and the approved budget this
      // page is now built from, so it is loaded FIRST rather than left to
      // chance — a tab and a pack that disagree about the same month is the
      // defect this whole rebuild keeps running into.
      void (async () => {
        // One argument, so this compiles both before and after #509 adds the
        // report month to loadFullYear. The export path passes the month; this
        // tab path picks it up once #509 is in.
        const fy = fullYearReport ?? (await loadFullYear(fiscalYear)) ?? null
        await loadCashflowForecast(fy, selectedMonth)
      })()
    }
  }, [activeTab, cashflowForecast, cashflowLoading, cashflowError, businessId, userId, settings, fullYearReport, fiscalYear, selectedMonth, loadFullYear, loadCashflowForecast])

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

  // Fetch commentary after report generation.
  // Phase 71-04 (S1): triggers now cover 4 types — expense over-budget (existing),
  // revenue under-budget, large favourable expense swings, and BS movements.
  // The pure collector lives at utils/commentary-triggers.ts so it's unit-testable.
  const fetchCommentary = useCallback(async (reportData: GeneratedReport, existingCommentary?: VarianceCommentary) => {
    if (!businessId) return
    setCommentaryLoading(true)

    try {
      // Strip the trigger_reason from each line before POST — the route
      // consumes the reasons via the separate `trigger_reasons` map keyed
      // by account_name (avoids redundant payload + keeps line shape
      // backward-compatible with pre-71-04 callers).
      // The reason travels in the separate `trigger_reasons` map; the FIGURES
      // travel with the line, because the commentary's ratio has to be a share
      // of the same numbers the statement above it prints. Re-deriving them
      // server-side would be a second answer waiting to disagree with the first.
      const stripReason = (l: TriggerLine) => ({
        account_name: l.account_name,
        xero_account_name: l.xero_account_name,
        actual: l.actual,
        budget: l.budget,
      })

      // A pack whose commentary lists every account that moved in a section
      // (Calxa's COGS page) needs a draft for accounts no trigger fired on —
      // the layout the export renders says which sections. No layout, or none
      // asking: [] and the
      // triggers are exactly what they were.
      const triggers = collectCommentaryTriggers(reportData, balanceSheet, {
        allWithActivity: commentaryCoverageFromLayout(settings?.pdf_layout),
      })

      const isEmpty =
        triggers.expense_lines.length === 0 &&
        triggers.revenue_lines.length === 0 &&
        triggers.favourable_expense_lines.length === 0 &&
        triggers.bs_lines.length === 0 &&
        triggers.activity_lines.length === 0

      if (isEmpty) {
        // Nothing triggered, so nothing generated survives — but a note the
        // coach typed is not derived from the numbers and must not go with it.
        // This used to clear the map outright, and auto-save could persist
        // that; the non-empty path below has always kept notes the same way.
        const kept = reconcileCommentary({}, existingCommentary)
        setCommentary(Object.keys(kept).length > 0 ? kept : undefined)
        setCommentaryLoading(false)
        return
      }

      // Build accountName → trigger_reason map so the route can tag each
      // commentary row with WHY it appeared (revenue dollar vs percent, etc.).
      const trigger_reasons: Record<string, string> = {}
      for (const l of [
        ...triggers.expense_lines,
        ...triggers.revenue_lines,
        ...triggers.favourable_expense_lines,
        ...triggers.bs_lines,
        ...triggers.activity_lines,
      ]) {
        // First occurrence wins (matches route-side priority).
        if (!(l.account_name in trigger_reasons)) {
          trigger_reasons[l.account_name] = l.trigger_reason
        }
      }

      const res = await fetch('/api/monthly-report/commentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          report_month: reportData.report_month,
          expense_lines: triggers.expense_lines.map(stripReason),
          revenue_lines: triggers.revenue_lines.map(stripReason),
          favourable_expense_lines: triggers.favourable_expense_lines.map(stripReason),
          bs_lines: triggers.bs_lines.map(stripReason),
          activity_lines: triggers.activity_lines.map(stripReason),
          trigger_reasons,
          ratio_context: extractRatioContext(reportData),
        }),
      })

      const data = await res.json()
      if (!data.success) return

      // Three states, not two (fail-open house rule). `checked: false` means the
      // route could not look at all — no Xero connection, or a token refresh
      // that failed — and an empty answer from a check that never happened must
      // not be read as "nothing is over budget". Keep what is on screen and SAY
      // that it is unverified; the old code kept it and said nothing, which is
      // how a stale row survives indefinitely.
      if (data.checked === false) {
        setCommentaryUnverified(true)
        return
      }
      setCommentaryUnverified(false)

      // Rebuild, do not accumulate. An account that no longer triggers loses its
      // row; a coach note survives its trigger. See commentary-reconcile.ts.
      const reconciled = reconcileCommentary(data.commentary ?? {}, existingCommentary)
      setCommentary(Object.keys(reconciled).length > 0 ? reconciled : undefined)
    } catch (err) {
      console.error('[MonthlyReport] Commentary fetch error:', err)
    } finally {
      setCommentaryLoading(false)
    }
  }, [businessId, balanceSheet, settings?.pdf_layout])

  const handleGenerateReport = useCallback(async (forceDraft?: boolean) => {
    // FLEET-04: a report may only finalise on a reconciliation check that
    // actually COMPLETED. `is_clean` is already forced false when check_failed,
    // but state it explicitly — this is the gate that let a Dragon July report
    // get FINAL-stamped on an unconditional "all reconciled" for a business
    // whose orgs were never checked.
    // A NULL reconciliation (check never ran, or its fetch failed) is
    // fail-CLOSED: absence of a check must never authorise a FINAL stamp.
    const isDraft =
      forceDraft ||
      (reconciliation ? !reconciliation.is_clean || reconciliation.check_failed === true : true)
    const result = await generateReport(selectedMonth, fiscalYear, isDraft)

    if (result && 'needsMappings' in result && result.needsMappings) {
      setActiveTab('mapping')
      toast.info('Please set up account mappings first')
      return
    }

    if (result && !('needsMappings' in result)) {
      toast.success('Report generated')
      // Read the stored snapshot for its commentary and its draft/final status
      // ONLY. `fetchSnapshot`, never `loadSnapshot`: the hydrating one would put
      // the PREVIOUS report back on screen over the one just generated, which is
      // how Urban Road's 10 Sep regenerate flashed the new budget and then
      // reverted to the superseded forecast a second later — and how auto-save
      // then wrote that superseded report back over the fresh save.
      const snapshot = await fetchSnapshot(selectedMonth)
      const persistedCommentary = snapshot?.commentary || undefined
      // Phase 42 Plan 04: a freshly-generated report should reflect the loaded
      // snapshot status (or 'draft' if there's no snapshot yet). Without this,
      // a regenerate after a prior 'final' month would inherit stale lock state.
      setLoadedSnapshotStatus((snapshot?.status as 'draft' | 'final' | undefined) ?? 'draft')
      fetchCommentary(result, persistedCommentary)

      // WA.6 — a generated report is persisted, full stop. This used to run
      // only on the unreconciled "Generate Draft Report" path (Phase 71 B3),
      // so the clean happy path saved NOTHING: auto-save watches commentary
      // (empty on a fresh report), Report History stayed empty while its
      // empty-state promised "generated reports will appear here", and closing
      // the tab lost the report. One guard: never silently downgrade a month a
      // coach has finalised — regenerating a final month stays view-only under
      // the existing D-06 lock until they explicitly unfinalise.
      if ((snapshot?.status as string | undefined) !== 'final') {
        try {
          await saveSnapshot(result, {
            status: 'draft',
            generatedBy: userId,
            commentary: persistedCommentary,
          })
          setLoadedSnapshotStatus('draft')
          if (forceDraft) toast.success('Saved as draft')
        } catch (err) {
          console.error('[MonthlyReport] generate persistence failed', err)
          toast.error('Report generated but not saved — refresh to retry')
        }
      }
    }
  }, [selectedMonth, fiscalYear, reconciliation, generateReport, fetchCommentary, fetchSnapshot, saveSnapshot, userId])

  // WA.4 — switching fiscal year clears every FY-keyed cache (their lazy-load
  // effects guard on `!data`, so without the clears the Full Year / Trends /
  // Charts / consolidated tabs would keep showing the previous FY) and lands
  // on that FY's natural month via the same path a manual month change takes.
  // Current FY plus the two prior — matches the ~26 months of synced Xero
  // history. Derived from the clock (not selectedMonth) so the list is stable
  // while navigating.
  const fiscalYearOptions = (() => {
    const current = getCurrentFiscalYear()
    return [current, current - 1, current - 2]
  })()

  const handleFiscalYearChange = async (fy: number) => {
    if (fy === fiscalYear) return
    setFiscalYear(fy)
    clearFullYear()
    clearConsolidated()
    clearConsolidatedBS()
    clearConsolidatedCashflow()
    await handleMonthChange(defaultMonthForFiscalYear(fy))
  }

  const handleMonthChange = async (month: string) => {
    setSelectedMonth(month)
    setCommentary(undefined)
    clearSubscription()
    clearWages()
    // The cashflow is scoped to the report month too — its actual months end
    // there — and the export reuses whatever this state holds, so a month
    // change must not leave the last month's cashflow waiting to be printed.
    setCashflowForecast(null)
    setCashflowError(null)
    cashflowReasonRef.current = null
    // The Full Year page is scoped to the fiscal year, but WHICH months it
    // treats as actual is scoped to the report month — so a month change
    // invalidates it just as a fiscal-year change does.
    clearFullYear()
    // Restore persisted commentary from snapshot if one exists
    const snapshot = await loadSnapshot(month)
    if (snapshot?.commentary) {
      setCommentary(snapshot.commentary)
    }
    // Phase 42 Plan 04: track loaded snapshot status so isLocked reflects the
    // newly-loaded month (D-06 setup). Snapshot may be null (no save yet).
    setLoadedSnapshotStatus((snapshot?.status as 'draft' | 'final' | undefined) ?? null)
  }

  const handleCommentaryChange = (accountName: string, note: string) => {
    // The draft and everything else the generator wrote stay on the entry —
    // see applyCoachNote for what rebuilding it used to delete.
    setCommentary(prev => applyCoachNote(prev, accountName, note))
    // Phase 42 Plan 04 (D-01/D-02): schedule a debounced auto-save. The hook
    // reads the latest commentary via refs at fire-time, so no stale-closure risk.
    autoSave.schedule()
  }

  /** Whether this client's pack prints a balance sheet page at all. */
  const packWantsBalanceSheet = (): boolean =>
    !!settings?.sections.balance_sheet ||
    (settings?.pdf_layout?.pages ?? []).some(p =>
      (p.widgets ?? []).some(w => w.type === 'balance_sheet'),
    )

  const handleSaveSnapshot = async (status: 'draft' | 'final' = 'draft') => {
    if (!report) return
    try {
      await saveSnapshot(report, { status, generatedBy: userId, commentary })
      // Phase 42 D-06: when finalising, lock the report locally so auto-save no-ops
      // and the textareas flip to readOnly. Refresh the pill in parallel (parity
      // with auto-save's onSaveSuccess wiring).
      if (status === 'final') {
        setLoadedSnapshotStatus('final')
        // Decision 19: freeze the month's balance sheet into the snapshot so
        // its exports stop re-asking Xero. Not awaited, and it never throws:
        // the finalise above has already happened, a Xero round-trip must not
        // hold the button, and a freeze that fails is captured (invariant
        // balance-sheet-freeze) and leaves the export live.
        // If the tab closes first, the finalise has already marked the freeze
        // as owed, and the month's next export freezes it (and says so).
        if (businessId && packWantsBalanceSheet()) {
          pendingBalanceSheetFreeze.current = {
            month: report.report_month,
            done: freezeBalanceSheetsAtFinalise(businessId, report.report_month),
          }
        }
        await reportStatus.refresh()
        toast.success('Report finalised — auto-save locked')
      } else {
        toast.success('Draft saved')
      }
    } catch (err) {
      toast.error('Failed to save report')
    }
  }

  // Phase 42 D-06: companion to handleSaveSnapshot('final'). Saves the snapshot
  // back to status='draft', clears the local lock, and refreshes the pill so
  // auto-save resumes immediately.
  const handleUnfinalise = async () => {
    if (!report) return
    try {
      await saveSnapshot(report, { status: 'draft', generatedBy: userId, commentary })
      setLoadedSnapshotStatus('draft')
      await reportStatus.refresh()
      toast.success('Report unlocked for editing')
    } catch (err) {
      toast.error('Failed to unfinalise')
    }
  }

  // ------------------------------------------------------------------
  // Phase 35 Plan 06: Approve-and-send flow
  // ------------------------------------------------------------------

  const monthLabel = report?.report_month
    ? new Date(`${report.report_month}-01T00:00:00`).toLocaleDateString('en-AU', {
        month: 'long',
        year: 'numeric',
      })
    : ''

  const coachName =
    (currentUser?.firstName || currentUser?.lastName
      ? `${currentUser?.firstName ?? ''} ${currentUser?.lastName ?? ''}`.trim()
      : null) ||
    (currentUser?.email ? currentUser.email.split('@')[0] : '') ||
    'Your coach'
  const coachEmail = currentUser?.email ?? ''

  const clientGreetingName =
    (ownerInfo.name ? ownerInfo.name.trim().split(/\s+/)[0] : null) || 'there'

  // Phase C (CFO-only clients): single eager loader for every dataset the PDF
  // can contain. Previously only handleExportPDF eager-loaded these; the
  // Approve & Send / Resend path read whatever happened to be in React state,
  // so the EMAILED PDF silently dropped Full-Year/Wages/Subscriptions/Cashflow
  // sections unless the coach had visited those tabs first. Both flows now
  // load through here, restoring the D-07 "byte-identical PDF" contract.
  // Already-loaded state is reused — visiting the tabs first costs nothing.
  const loadPdfSections = async (): Promise<{
    fullYearReport?: import('./types').FullYearReport
    subscriptionDetail?: import('./types').SubscriptionDetailData
    contractorDetail?: import('@/lib/monthly-report/contractor-rollup').ContractorRollup
    contractorDetailReason?: string
    contractorDetailReport?: import('./types').SubscriptionDetailData
    cashflowBasis?: string | null
    payrollGrid?: import('@/lib/monthly-report/payroll-grid').PayrollGrid
    payrollGridReason?: string
    accountActuals?: { data: import('@/lib/monthly-report/ratio-table').AccountActuals | null; reason?: string }
    wagesDetail?: import('./types').WagesDetailData
    cashflowForecast?: CashflowForecastData
    cashflowReason?: string
    externalMetrics?: import('./types').ExternalMetricSeriesData[]
    memo?: string
    moneyFlow?: import('@/lib/monthly-report/money-flow').MoneyFlow
    consolidated?: import('./utils/consolidated-rows').ConsolidatedReportVM
    balanceSheets?: import('./utils/balance-sheet-pdf').BalanceSheetPdfSources
    budgetSuperRate?: number | null
    budgetActualEndMonth?: string | null
    budgetBackfilled?: boolean
    entityName?: string | null
    preparedOn?: import('@/lib/monthly-report/pack-prepared-on').PackPreparedOn | null
    packLogo?: import('@/lib/monthly-report/pack-logo-setting').PackLogoSetting | null
    insertSources?: PackInsertSources
  }> => {
    let fyReport = fullYearReport
    if (!fyReport && businessId) {
      fyReport = await loadFullYear(fiscalYear, selectedMonth)
    }

    let subDetail = subscriptionDetail
    if (!subDetail && settings?.sections.subscription_detail && businessId) {
      const codes = settings.subscription_account_codes || []
      if (codes.length > 0) {
        subDetail = await loadSubscriptionDetail(selectedMonth, codes)
      }
    }

    // Contractor Analysis (Calxa 14). Same vendor drill-down as Subscriptions,
    // pointed at the client's contractor accounts, then rolled up by department.
    // Loaded here rather than on a tab because the emailed PDF must carry the
    // page whether or not a coach happened to open it (D-07).
    let contractorRollup: import('@/lib/monthly-report/contractor-rollup').ContractorRollup | undefined
    // Said on the page when the load was asked for and produced no rows — a
    // placed page that prints nothing is a blank sheet in a client's pack.
    let contractorReason: string | undefined
    let contractorReport: import('./types').SubscriptionDetailData | undefined
    const contractorCodes = settings?.contractor_account_codes || []
    if (contractorCodes.length > 0 && businessId) {
      // Months across the page: three for a Contractors Payment Summary
      // placement (contractor-page), and no `months` at all otherwise, so every
      // other client's request — and its two Xero months — is unchanged.
      const contractorMonths = contractorWindowForLayout((settings?.pdf_layout?.pages ?? []).flatMap((p) => p.widgets ?? []))
      try {
        const res = await fetch('/api/monthly-report/subscription-detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            report_month: selectedMonth,
            account_codes: contractorCodes,
            ...(contractorMonths > 2 ? { months: contractorMonths } : {}),
          }),
        })
        if (res.ok) {
          const payload = await res.json()
          // Alphabetical: the reference pack's own department order is
          // alphabetical, so there is nothing here for a coach to state.
          const rolled = rollUpContractors(payload.data)
          if (rolled.contractors.length > 0) {
            contractorRollup = rolled
            contractorReport = payload.data
          }
          // From what the route says it read: "no contractor payments" only
          // after a complete crawl — an unconnected org or a lapsed token is
          // could-not-check, and a partial crawl says so under its rows.
          contractorReason = contractorLoadReason(payload.data, rolled.contractors.length)
        } else {
          throw new Error(`contractor detail ${res.status}`)
        }
      } catch (err) {
        // Never block the export, never drop the page silently.
        contractorReason = 'the contractor figures could not be loaded from Xero'
        Sentry.captureException(err, {
          tags: { invariant: 'contractor-detail-load' },
          extra: { businessId, selectedMonth },
        } as never)
      }
    }

    // The payroll grid (Calxa 15). Pure database read — payslips are already
    // synced — so it costs no Xero call and is loaded for every export rather
    // than only when a coach has opened the Wages tab. How many months is the
    // placement's to say (payroll-grid-config); two when nothing is placed or
    // configured, as it always was.
    let payroll: import('@/lib/monthly-report/payroll-grid').PayrollGrid | undefined
    let payrollReason: string | undefined
    if (settings?.sections.payroll_detail && businessId) {
      try {
        const payrollWidgets = (settings?.pdf_layout?.pages ?? []).flatMap((p) => p.widgets ?? [])
        const res = await fetch('/api/monthly-report/payroll-grid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            report_month: selectedMonth,
            fiscal_year: fiscalYear,
            months: payrollWindowForLayout(payrollWidgets, selectedMonth),
          }),
        })
        if (!res.ok) throw new Error(`payroll grid ${res.status}`)
        const payload = await res.json()
        payroll = payload.data ?? undefined
        // The route names its own absences ("no payslips synced for this
        // period", "no Xero connection"); they belong on the page.
        if (!payroll) payrollReason = typeof payload.reason === 'string' && payload.reason ? payload.reason : 'no payroll figures were returned'
      } catch (err) {
        payrollReason = 'the payroll figures could not be loaded'
        Sentry.captureException(err, {
          tags: { invariant: 'payroll-grid-load' },
          extra: { businessId, selectedMonth },
        } as never)
      }
    }

    // Ratio Analysis pages. There is no section toggle: a page exists because a
    // coach placed it, so the layout is the only thing to ask. Every placement
    // is served by ONE fetch — the union of their account codes over the
    // longest window any of them reads.
    //
    // end_month is the REPORT's month, not selectedMonth: the month picker can
    // have moved on from the report being exported, and a table headed August
    // must be August's figures (the #499 / #509 class). A config that does not
    // parse is left out of the window and prints its own reason on its page.
    let accountActuals: { data: import('@/lib/monthly-report/ratio-table').AccountActuals | null; reason?: string } | undefined
    const ratioWidgets = (settings?.pdf_layout?.pages ?? [])
      .flatMap((p) => p.widgets ?? [])
      .filter((w) => w.type === 'ratio_analysis')
    const ratioConfigs = ratioWidgets
      .map((w) => parseRatioAnalysisConfig(w.config))
      .flatMap((r) => (r.ok ? [r.config] : []))
    if (ratioWidgets.length > 0 && businessId && report?.report_month) {
      if (ratioConfigs.length === 0) {
        // Nothing to fetch — every placement is misconfigured and says so.
        accountActuals = { data: null, reason: 'no placement has a valid configuration' }
      } else {
        const window = requiredWindow(ratioConfigs)
        try {
          const res = await fetch(
            `/api/monthly-report/account-actuals?business_id=${encodeURIComponent(businessId)}` +
              `&end_month=${encodeURIComponent(report.report_month)}&months=${window.months}` +
              `&codes=${encodeURIComponent(window.codes.join(','))}`,
          )
          const body = await res.json().catch(() => ({} as any))
          if (!res.ok) throw new Error(`account actuals ${res.status}`)
          accountActuals = typeof body?.unavailable_reason === 'string'
            ? { data: null, reason: body.unavailable_reason }
            : { data: body }
        } catch (err) {
          accountActuals = { data: null, reason: 'the account figures could not be loaded' }
          Sentry.captureException(err, {
            tags: { invariant: 'pdf-account-actuals-load' },
            extra: { businessId, reportMonth: report.report_month },
          } as never)
        }
      }
    }

    let wDetail = wagesDetail
    if (!wDetail && settings?.sections.payroll_detail && businessId) {
      const names = settings.wages_account_names || []
      if (names.length > 0) {
        wDetail = await loadWagesDetail(selectedMonth, fiscalYear, names, settings.budget_forecast_id)
      }
    }

    let cfData: CashflowForecastData | undefined = cashflowForecast || undefined
    if (!cfData && businessId) {
      cfData = (await loadCashflowForecast(fyReport ?? null, selectedMonth)) || undefined
    }

    // WE.1b — the entered external-data inserts. A fetch failure must not
    // block the PDF, but silently dropping pages from an emailed report is
    // the exact D-07 bug class — so the failure is captured, never swallowed.
    let extMetrics: import('./types').ExternalMetricSeriesData[] | undefined
    if (businessId) {
      try {
        const res = await fetch(
          `/api/monthly-report/external-metrics?business_id=${encodeURIComponent(businessId)}&period_month=${encodeURIComponent(selectedMonth)}`
        )
        if (res.ok) {
          const data = await res.json()
          extMetrics = (data.series || []).filter(
            (s: import('./types').ExternalMetricSeriesData) => (s.values || []).length > 0
          )
        } else {
          Sentry.captureMessage(
            `[PDF] external-metrics load failed (${res.status}) — PDF will omit external-data pages`,
            'warning' as any
          )
        }
      } catch (err) {
        Sentry.captureException(err, { tags: { invariant: 'pdf-external-metrics-load' } } as any)
      }
    }

    // WD.8 — the month's memo lives on the snapshot (coach_notes); read it at
    // export time so the PDF always carries what was last saved. Same
    // fail-open posture as external metrics: never block the PDF, never
    // swallow the failure.
    let memoText: string | undefined
    // The same row, for the cover's "Prepared on": a finalised snapshot is
    // dated when it was finalised (see pack-prepared-on). Undefined when the
    // read failed — the cover then prints the export date.
    let monthSnapshot: { status?: string | null; generated_at?: string | null } | null | undefined
    if (businessId) {
      try {
        const res = await fetch(
          `/api/monthly-report/snapshot?business_id=${encodeURIComponent(businessId)}&report_month=${encodeURIComponent(selectedMonth)}`
        )
        if (res.ok) {
          const data = await res.json()
          const notes = data.snapshot?.coach_notes
          monthSnapshot = data.snapshot ? { status: data.snapshot.status, generated_at: data.snapshot.generated_at } : null
          if (typeof notes === 'string' && notes.trim() !== '') memoText = notes
        } else {
          Sentry.captureMessage(
            `[PDF] memo load failed (${res.status}) — PDF will omit the memo page`,
            'warning' as any
          )
        }
      } catch (err) {
        Sentry.captureException(err, { tags: { invariant: 'pdf-memo-load' } } as any)
      }
    }

    // WD.4 — the funds-flow page, derived server-side from the stored BS
    // mirror. Same fail-open posture: a load failure omits the page and is
    // captured, never swallowed.
    let moneyFlow: import('@/lib/monthly-report/money-flow').MoneyFlow | undefined
    if (businessId) {
      try {
        const res = await fetch(
          `/api/monthly-report/money-flow?business_id=${encodeURIComponent(businessId)}&period_month=${encodeURIComponent(selectedMonth)}`
        )
        if (res.ok) {
          const data = await res.json()
          moneyFlow = data.flow ?? undefined
        } else {
          Sentry.captureMessage(
            `[PDF] money-flow load failed (${res.status}) — PDF will omit the page`,
            'warning' as any
          )
        }
      } catch (err) {
        Sentry.captureException(err, { tags: { invariant: 'pdf-money-flow-load' } } as any)
      }
    }

    // WD.6 — per-entity consolidated report for consolidation parents. Reuses
    // the tab's cache; the generator returns the report directly so the PDF
    // never depends on the coach having opened the tab (the D-07 class).
    let consolidated: import('./utils/consolidated-rows').ConsolidatedReportVM | undefined
    if (isConsolidationGroup && userRole !== 'client') {
      try {
        consolidated =
          (consolidatedReport as any) ||
          ((await generateConsolidated(selectedMonth, fiscalYear)) as any) ||
          undefined
      } catch (err) {
        Sentry.captureException(err, { tags: { invariant: 'pdf-consolidated-load' } } as any)
      }
    }

    // WG.1 — the two balance-sheet pages (Calxa 19-22). Deliberately NOT read
    // from the Balance Sheet tab's state the way the blocks above reuse theirs:
    // that state holds whichever compare mode the coach last clicked, for
    // whichever month they last looked at, so reusing it would print July's
    // sheet under an August heading and nothing would say so.
    //
    // A FINALISED month prints the sheet frozen into its snapshot at Finalise
    // (decision 19) — read from the stored row, not from in-memory state — but
    // only while the report on screen is the stored one: a view-only regenerate
    // of a final month prints live, so its balance sheet agrees with the
    // regenerated P&L beside it. A final month whose freeze never landed (the
    // tab closed mid-freeze) is frozen now from the sheets this export prints.
    // A draft, and any month finalised before freezing existed, asks Xero, as
    // before. Ahead of all of it, a month that was Approved & Sent prints the
    // sheets that PDF printed (package B) — draft or final — while the report
    // on screen is the one that was sent and until Revert to Draft reopens it.
    // That is how a resend prints what the client already has: it builds its
    // PDF through here. balanceSheetsForExport has the rules. A failure never
    // blocks the export — it travels as a reason the page prints, and is
    // captured rather than swallowed.
    let balanceSheets: import('./utils/balance-sheet-pdf').BalanceSheetPdfSources | undefined
    if (businessId && packWantsBalanceSheet()) {
      let stored = null
      let freezeInFlight = false
      if (loadedSnapshotStatus === 'final') {
        // A freeze this tab started at Finalise lands first (it never throws)
        // — but only for so long: it is two Xero reads and a PATCH, and one
        // hung request must not hold the export. Past the wait this export
        // prints live, claims no freeze, and leaves that freeze running.
        const pending = pendingBalanceSheetFreeze.current
        if (pending?.month === selectedMonth) {
          freezeInFlight = (await waitForPendingFreeze(pending.done)) === 'still_running'
        }
        stored = await fetchSnapshot(selectedMonth)
      }
      const sent = await loadSentBalanceSheets(businessId, selectedMonth)
      balanceSheets = await balanceSheetsForExport({
        businessId,
        reportMonth: selectedMonth,
        report,
        stored,
        freezeInFlight,
        sent,
      })
    }

    // WF.2/WF.4 — budget metadata for the super-rate and provenance checks.
    // undefined = not threaded (checks skip); null rate = statutory default.
    let budgetSuperRate: number | null | undefined
    let budgetActualEndMonth: string | null | undefined
    if (settings?.budget_forecast_id) {
      try {
        const sb = createClient()
        const { data: fc } = await sb
          .from('financial_forecasts')
          .select('superannuation_rate, actual_end_month')
          .eq('id', settings.budget_forecast_id)
          .maybeSingle()
        if (fc) {
          budgetSuperRate = fc.superannuation_rate ?? null
          budgetActualEndMonth = fc.actual_end_month ?? null
        }
      } catch (err) {
        Sentry.captureException(err, { tags: { invariant: 'preflight-budget-meta' } } as any)
      }
    }
    const budgetBackfilled =
      !!report && !!budgetActualEndMonth && report.report_month <= budgetActualEndMonth

    // The legal entity for the cover and every title ("Urban Road Pty Ltd",
    // as Calxa prints it). Null on any failure, and the pack keeps the
    // display name — see pack-entity-name.
    const entityName = businessId ? await loadPackEntityName(createClient(), businessId) : null
    const preparedOn = businessId ? await loadPackPreparedOn(createClient(), businessId, selectedMonth, monthSnapshot) : null

    // Uploaded pages: the newest file for each placement the layout has, for
    // the REPORT's month — a card saying "August hasn't been uploaded" under
    // an August pack must be about August, wherever the month picker is. No
    // placement, no request.
    const insertSources = businessId
      ? await fetchPackInsertSources(businessId, report?.report_month ?? selectedMonth, settings?.pdf_layout ?? null)
      : undefined

    return {
      fullYearReport: fyReport || undefined,
      subscriptionDetail: subDetail || undefined,
      contractorDetail: contractorRollup,
      contractorDetailReason: contractorReason,
      contractorDetailReport: contractorReport,
      // Computed here, from the report this function already holds — NOT read
      // back off React state that `loadCashflowForecast` just set. A setState
      // is not visible to the pass that made it, and the pack would have
      // described the previous month's split. The opening is read off the
      // cashflow that will actually be printed, so the sentence and the
      // numbers beneath it cannot describe two different starting balances.
      cashflowBasis: packCashflowBasisFor(fyReport, selectedMonth, cfData),
      payrollGrid: payroll,
      payrollGridReason: payrollReason,
      accountActuals,
      wagesDetail: wDetail || undefined,
      cashflowForecast: cfData,
      // A cash-model-v2 business whose model could not be built: the cash
      // pages print this reason instead of disappearing from the pack.
      cashflowReason: cfData ? undefined : (cashflowReasonRef.current ?? undefined),
      externalMetrics: extMetrics,
      memo: memoText,
      moneyFlow,
      consolidated,
      balanceSheets,
      budgetSuperRate,
      budgetActualEndMonth,
      budgetBackfilled,
      entityName,
      preparedOn,
      // The mark is a setting, read off the settings this export already holds.
      packLogo: settings?.pack_logo ?? null,
      insertSources,
    }
  }

  // Reuse the same PDFOptions shape as handleExportPDF — both flows must produce
  // a byte-identical PDF (D-07 locks this). Async since Phase C: it eager-loads
  // every configured section instead of trusting React state.
  const buildPdfInput = async (): Promise<{
    report: GeneratedReport
    options: {
      commentary?: VarianceCommentary
      fullYearReport?: import('./types').FullYearReport
      subscriptionDetail?: import('./types').SubscriptionDetailData
      wagesDetail?: import('./types').WagesDetailData
      cashflowForecast?: CashflowForecastData
      externalMetrics?: import('./types').ExternalMetricSeriesData[]
      memo?: string
      moneyFlow?: import('@/lib/monthly-report/money-flow').MoneyFlow
      consolidated?: import('./utils/consolidated-rows').ConsolidatedReportVM
      balanceSheets?: import('./utils/balance-sheet-pdf').BalanceSheetPdfSources
      businessName?: string
      entityName?: string | null
      sections?: import('./types').ReportSections
      pdfLayout?: import('./types/pdf-layout').PDFLayout | null
    }
    inserts: import('./services/pack-pdf').PreparedPackInserts
  } | null> => {
    if (!report) return null
    const { insertSources, ...eager } = await loadPdfSections()
    return {
      report,
      options: {
        commentary,
        ...eager,
        businessName: activeBusiness?.name ?? undefined,
        sections: settings?.sections,
        pdfLayout: settings?.pdf_layout ?? null,
      },
      // Opened here, once: the pre-flight row below and the attachment read the same files.
      inserts: await preparePackInserts(settings?.pdf_layout ?? null, insertSources),
    }
  }

  // ReportSnapshotV1 payload assembler — matches the shape Plan 35-05's
  // ReportSnapshotView expects. Rendering-oriented (pre-computed values), not
  // raw Xero data (Pitfall 3).
  const buildSnapshotData = () => {
    if (!report || !businessId) return null
    return {
      schema_version: 1 as const,
      captured_at: new Date().toISOString(),
      business: {
        id: businessId,
        name: activeBusiness?.name ?? '',
        slug: null,
        industry: activeBusiness?.industry ?? null,
      },
      period: {
        month: `${report.report_month}-01`,
        fiscal_year: report.fiscal_year,
        label: monthLabel,
      },
      coach: {
        name: coachName,
        email: coachEmail,
      },
      report,
      commentary: commentary ?? null,
      settings_applied: {
        sections: settings?.sections,
        template_id: activeTemplateId ?? null,
      },
    }
  }

  const buildApproveParams = async () => {
    const pdfInput = await buildPdfInput()
    const snapshot = buildSnapshotData()
    if (!pdfInput || !snapshot || !businessId || !report) return null

    // WF.1 — Approve & Send persists a pre-flight run too (no panel: this
    // flow already confirms). The emailed pack gets the same proof-of-state
    // record as a download.
    try {
      const opts: any = pdfInput.options
      const t = collectCommentaryTriggers(report, balanceSheet, {
        allWithActivity: commentaryCoverageFromLayout(settings?.pdf_layout),
      })
      const results = runPreflight({
        report,
        reconciliation,
        wagesDetail: opts.wagesDetail ?? null,
        subscriptionDetail: opts.subscriptionDetail ?? null,
        externalMetrics: opts.externalMetrics ?? null,
        moneyFlow: opts.moneyFlow ?? null,
        cashflow: opts.cashflowForecast ?? null,
        cashflowReason: opts.cashflowReason ?? null,
        consolidated: opts.consolidated?.diagnostics ?? null,
        unmappedCount: unmapped.length,
        dataQualityLevel: dataQuality,
        qualityCheckFailed,
        budgetSuperRate: opts.budgetSuperRate,
        budgetActualEndMonth: opts.budgetActualEndMonth,
        commentary: commentary as any,
        triggeredAccounts: [...t.expense_lines, ...t.revenue_lines, ...t.favourable_expense_lines].map(l => l.account_name),
        activityAccounts: t.activity_lines.map(l => l.account_name),
        commentarySettingsProblems: commentaryPlacementProblems(settings?.pdf_layout).map(describeCommentaryPlacementProblem),
        // The pack's size is not measured here: approveAndSend builds it, and
        // refuses one too large to email before anything is posted.
        uploadedInserts: pdfInput.inserts.placements,
      })
      fetch('/api/monthly-report/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, report_month: report.report_month, context: 'approve_send', results }),
      }).catch(err => Sentry.captureException(err, { tags: { invariant: 'preflight-persist-client' } } as any))
    } catch (err) {
      Sentry.captureException(err, { tags: { invariant: 'preflight-approve-send' } } as any)
    }
    return {
      business_id: businessId,
      period_month: `${report.report_month}-01`,
      business_name: activeBusiness?.name ?? '',
      month_label: monthLabel,
      client_greeting_name: clientGreetingName,
      recipient_email: ownerInfo.email ?? '',
      coach_name: coachName,
      coach_email: coachEmail,
      portal_slug: null,
      pdf_input: pdfInput,
      snapshot_data: snapshot,
    }
  }

  const handleMarkReady = async () => {
    if (!businessId || !report) return
    const res = await markReady(businessId, `${report.report_month}-01`)
    if (!res.ok) throw res
    await reportStatus.refresh()
  }

  // WA.6 — stamp pdf_exported_at whenever a PDF of this month is actually
  // produced (browser export, or the PDF built for Approve & Send / Resend).
  // The column existed since the baseline schema and was read in three places
  // but written in none. Fire-and-forget: the stamp must never fail the export
  // itself, but a swallowed write failure still gets a Sentry capture
  // (house rule — no silent .catch on writes).
  const markPdfExported = (reportMonth: string) => {
    if (!businessId) return
    fetch('/api/monthly-report/snapshot', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        report_month: reportMonth,
        action: 'mark_pdf_exported',
      }),
    }).then((res) => {
      if (!res.ok) throw new Error(`mark_pdf_exported ${res.status}`)
    }).catch((err) => {
      Sentry.captureException(err, {
        tags: { invariant: 'pdf-exported-stamp' },
        extra: { businessId, reportMonth },
      } as any)
    })
  }

  const handleApproveAndSend = async () => {
    const params = await buildApproveParams()
    if (!params) {
      throw { body: { error: 'Report not ready' } }
    }
    if (!params.recipient_email) {
      throw { body: { error: 'No owner_email configured on this business' } }
    }
    if (!params.coach_email) {
      throw { body: { error: 'Coach email unavailable — cannot send' } }
    }
    const res = await approveAndSend(params)
    if (!res.ok) throw res
    if (report) markPdfExported(report.report_month)
    await reportStatus.refresh()
  }

  const handleResend = async () => {
    const params = await buildApproveParams()
    if (!params) {
      throw { body: { error: 'Report not ready' } }
    }
    if (!params.recipient_email) {
      throw { body: { error: 'No owner_email configured on this business' } }
    }
    const res = await resendReport(params)
    if (!res.ok) throw res
    if (report) markPdfExported(report.report_month)
    await reportStatus.refresh()
  }

  // Also the bar's "Reopen balance sheet" (package B). Refresh before a
  // failure is surfaced: the status revert can land while the balance-sheet
  // reopen does not, and the bar must show the month as it now is — Draft,
  // still offering the reopen.
  const handleRevertToDraft = async () => {
    if (!businessId || !report) return
    const res = await revertToDraft(businessId, `${report.report_month}-01`)
    await reportStatus.refresh()
    if (!res.ok) throw res
  }

  const [isExporting, setIsExporting] = useState(false)
  const [showMemo, setShowMemo] = useState(false)
  // WF.1 — pre-flight panel: results + the promise resolver for the export
  // that is waiting on the coach's decision.
  const [preflight, setPreflight] = useState<{ results: PreflightResult[]; resolve: (go: boolean) => void } | null>(null)

  const handleExportPDF = async () => {
    if (!report) return

    // The pack must not be built from a report measured against a budget the
    // client is no longer on.
    //
    // Switching budget_source regenerates nothing — the setting is read at
    // Generate time and nowhere else — and exporting only PATCHes the
    // snapshot's timestamp. So a coach who switches Urban Road onto its
    // approved budget and then exports gets a pack built against the FORECAST,
    // stamped with today's date, with no indication anywhere. It happened: the
    // August 2026 pack shipped with Budget = Actual on every line, because the
    // forecast's closed months carry actuals, and with Contractors and Wages at
    // $0 budget because those accounts do not exist in the forecast under those
    // names.
    //
    // Refusing is the only honest option. A warning would be read past, and
    // silently regenerating would discard whatever the coach has on screen.
    const settingsSource = settings?.budget_source ?? 'forecast'
    const reportSource = report.budget_source ?? null
    if (settingsSource === 'budget_version' && reportSource !== 'budget_version') {
      toast.error(
        'This report was measured against the forecast, not the approved budget. Regenerate before exporting.',
        { duration: 10000 },
      )
      return
    }

    setIsExporting(true)
    toast.info('Preparing PDF...')

    try {
      // WE.1b — load through the SAME eager loader as the Approve & Send path
      // (Phase C introduced it; this handler still carried a pre-Phase-C copy,
      // which is exactly the D-07 drift the shared loader exists to prevent —
      // it would have silently omitted the external-data pages here).
      const { insertSources, ...eager } = await loadPdfSections()
      // The uploaded pages, opened once for the pre-flight row and the pack.
      const inserts = await preparePackInserts(settings?.pdf_layout ?? null, insertSources)
      const packOptions = {
        commentary,
        ...eager,
        businessName: activeBusiness?.name ?? undefined,
        sections: settings?.sections,
        pdfLayout: settings?.pdf_layout ?? null,
      }
      // A pack with uploaded pages is built BEFORE the pre-flight: whether it
      // can still be emailed is a fact about the finished file, and the coach
      // should read it on this panel rather than meet it at Approve & Send.
      // A pack without them is built after the panel, as it always was.
      const builtEarly = inserts.placements.length > 0 ? await buildPackPdf(report, packOptions, inserts) : null

      // WF.1 — pre-flight over exactly the data going into this PDF. The
      // panel informs, never blocks; the run is persisted either way so the
      // pack can prove later what was true when it went out.
      const preflightResults = runPreflight({
        report,
        reconciliation,
        wagesDetail: eager.wagesDetail ?? null,
        subscriptionDetail: eager.subscriptionDetail ?? null,
        externalMetrics: eager.externalMetrics ?? null,
        moneyFlow: eager.moneyFlow ?? null,
        cashflow: eager.cashflowForecast ?? null,
        cashflowReason: eager.cashflowReason ?? null,
        consolidated: (eager.consolidated as any)?.diagnostics ?? null,
        unmappedCount: unmapped.length,
        dataQualityLevel: dataQuality,
        qualityCheckFailed,
        budgetSuperRate: eager.budgetSuperRate,
        budgetActualEndMonth: eager.budgetActualEndMonth,
        commentary: commentary as any,
        ...(() => {
          // The same coverage the export's layout asks the commentary route
          // for, so an account the COGS page lists because it moved is checked
          // for text too — no trigger fired on it, so the triggered list never
          // names it.
          const t = collectCommentaryTriggers(report, balanceSheet, {
            allWithActivity: commentaryCoverageFromLayout(settings?.pdf_layout),
          })
          return {
            triggeredAccounts: [...t.expense_lines, ...t.revenue_lines, ...t.favourable_expense_lines].map(l => l.account_name),
            activityAccounts: t.activity_lines.map(l => l.account_name),
          }
        })(),
        commentarySettingsProblems: commentaryPlacementProblems(settings?.pdf_layout).map(describeCommentaryPlacementProblem),
        // The built pack's placements: a file that would not merge says so here.
        uploadedInserts: builtEarly?.inserts ?? inserts.placements,
        uploadedPackBytes: builtEarly?.merged ? builtEarly.bytes.length : null,
      })
      fetch('/api/monthly-report/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, report_month: report.report_month, context: 'export', results: preflightResults }),
      }).catch(err => Sentry.captureException(err, { tags: { invariant: 'preflight-persist-client' } } as any))
      const proceed = await new Promise<boolean>(resolve => setPreflight({ results: preflightResults, resolve }))
      setPreflight(null)
      if (!proceed) {
        toast.info('Export cancelled')
        return
      }

      // The one pack builder — Approve & Send and the preview harness call it too.
      const pack = builtEarly ?? await buildPackPdf(report, packOptions, inserts)
      const monthLabel = new Date(report.report_month + '-01')
        .toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
        .replace(' ', '-')
      // A pack jsPDF wrote alone is saved exactly as it always was; one with
      // uploaded pages merged in is the merged file.
      if (pack.merged) savePdfBytes(pack.bytes, `Monthly-Report-${monthLabel}.pdf`)
      else pack.doc.save(`Monthly-Report-${monthLabel}.pdf`)
      markPdfExported(report.report_month)
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
      // Phase 42 Plan 04: track loaded snapshot status (D-06 setup).
      setLoadedSnapshotStatus((snapshot.status as 'draft' | 'final' | undefined) ?? null)
      setActiveTab('report')
      toast.success(`Loaded ${reportMonth} report`)
    } else {
      // No snapshot, generate fresh
      setCommentary(undefined)
      setLoadedSnapshotStatus(null)
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
      {/* D-44.2-02 — read-path data integrity banner. Renders nothing when verified. */}
      <div className="px-4 pt-4">
        <DataIntegrityBanner
          quality={dataQuality}
          perTenantQuality={perTenantQuality}
          lastSyncAt={perTenantQuality[0]?.last_sync_at ?? null}
          checkFailed={qualityCheckFailed}
        />
      </div>
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
                {/* Phase 42 D-05: the legacy draft-save button was removed — auto-save replaces it.
                    The visible reassurance lives in <SaveIndicator/> next to the pill.
                    Phase 42 D-06: Finalise toggles to "Unfinalise to edit" once the snapshot
                    is locked (loadedSnapshotStatus === 'final'). The Unfinalise button calls
                    handleUnfinalise which saves status='draft' + refreshes the pill. */}
                {!isLocked ? (
                  <button
                    onClick={() => handleSaveSnapshot('final')}
                    disabled={report.is_draft}
                    title={report.is_draft ? 'Reconcile all transactions before finalising' : 'Lock report and stop auto-save'}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    <span className="hidden sm:inline">Finalise</span>
                  </button>
                ) : (
                  <button
                    onClick={handleUnfinalise}
                    title="Unlock report for editing — auto-save will resume"
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    <span className="hidden sm:inline">Unfinalise to edit</span>
                  </button>
                )}
                <button
                  onClick={() => setShowMemo(true)}
                  title="Write this month's memo — it appears as its own page in the PDF"
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <StickyNote className="w-4 h-4" />
                  <span className="hidden sm:inline">Memo</span>
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
        {/* Phase 35 Plan 06: Approval + delivery status bar — above the Month Selector */}
        {/* Phase 42 Plan 04 (D-09): flex-row wrapper hosts both the pill and the SaveIndicator. */}
        {report && (
          <div className="mb-4 bg-white rounded-lg shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <ReportStatusBar
              status={reportStatus.status}
              sentAt={reportStatus.sentAt}
              sentBalanceSheetAt={reportStatus.sentBalanceSheetAt}
              role={userRole}
              onMarkReady={handleMarkReady}
              onApproveAndSend={handleApproveAndSend}
              onResend={handleResend}
              onRevertToDraft={handleRevertToDraft}
            />
            <SaveIndicator status={autoSave.status} onRetry={autoSave.retryNow} />
          </div>
        )}

        {/* Month Selector */}
        <MonthSelector
          selectedMonth={selectedMonth}
          fiscalYear={fiscalYear}
          onChange={handleMonthChange}
          fiscalYearOptions={fiscalYearOptions}
          onFiscalYearChange={handleFiscalYearChange}
        />

        {/* Xero Connection Banner */}
        <XeroConnectionBanner
          xeroConnection={xeroConnection}
          isExpired={xeroExpired}
          checkFailed={xeroCheckFailed}
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
          showConsolidated={canSeeConsolidated}
          showConsolidatedBS={canSeeConsolidated}
          showConsolidatedCashflow={canSeeConsolidated}
          showExternalData={userRole !== 'client'}
        />

        {/* Tab Content */}
        {activeTab === 'report' && report && (
          <BudgetVsActualDashboard
            report={report}
            commentary={commentary}
            commentaryLoading={commentaryLoading}
            commentaryUnverified={commentaryUnverified}
            onCommentaryChange={handleCommentaryChange}
            onCommitBlur={() => autoSave.flushImmediately()}
            onTabChange={setActiveTab}
            // Phase 42 D-06: when the snapshot is finalised, render commentary
            // textareas as readOnly so coaches can read but not edit. Pair with
            // the Unfinalise button above to resume editing.
            readOnly={isLocked}
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
              <FullYearProjectionTable
                report={fullYearReport}
                // The heading order the Actual vs Budget tab groups with, so
                // the two tabs list the expense groups identically.
                expenseGroupOrder={report?.settings?.expense_group_order ?? settings?.expense_group_order ?? null}
                budgetSource={report?.settings?.budget_source ?? settings?.budget_source ?? null}
              />
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
            error={cashflowError}
            // The same sentence the pack prints, so the tab also says when the
            // opening bank could not be read instead of showing $0-based
            // balances as if they were real.
            basis={cashflowForecast
              ? packCashflowBasisFor(fullYearReport, selectedMonth, cashflowForecast)
              : null}
            groupOrder={settings?.expense_group_order ?? fullYearReport?.expense_group_order ?? null}
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

        {/* Phase 34 — Consolidated P&L tab (consolidation parents, coach/admin only) */}
        {activeTab === 'consolidated' && canSeeConsolidated && (
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

        {/* Phase 34 Iteration 34.1 — Consolidated Balance Sheet tab (coach/admin only) */}
        {activeTab === 'balance-sheet-consolidated' && canSeeConsolidated && (
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

        {/* Phase 34 Iteration 34.2 — Consolidated Cashflow tab (coach/admin only) */}
        {activeTab === 'cashflow-consolidated' && canSeeConsolidated && (
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

        {activeTab === 'external-data' && businessId && (
          <>
            {/* Renders nothing unless the saved layout places an uploaded page. */}
            <UploadedPagesPanel
              businessId={businessId}
              reportMonth={selectedMonth}
              layout={settings?.pdf_layout ?? null}
              canManage={userRole !== 'client'}
            />
            <ExternalDataTab
              businessId={businessId}
              periodMonth={selectedMonth}
              canManage={userRole !== 'client'}
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
      {/* WF.1 — pre-flight panel awaiting the coach's export decision */}
      {preflight && (
        <PreflightPanel
          results={preflight.results}
          onCancel={() => preflight.resolve(false)}
          onProceed={() => preflight.resolve(true)}
        />
      )}

      {/* WD.8 — memo editor (stored on the month's snapshot, rendered in the PDF) */}
      {businessId && (
        <MemoModal
          isOpen={showMemo}
          onClose={() => setShowMemo(false)}
          businessId={businessId}
          reportMonth={selectedMonth}
          monthLabel={new Date(selectedMonth + '-01').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
        />
      )}

      {settings && (
        <ReportSettingsPanel
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          businessId={businessId}
          settings={settings}
          // Phase 35 D-16: passed so the settings save triggers auto-revert when
          // editing an approved/sent report.
          reportMonth={selectedMonth}
          // Phase 42 D-17: settings save → pill refresh (parity with auto-save
          // and PDF layout save). Closes the revert chain on every coach action.
          onSaveSuccess={() => reportStatus.refresh()}
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
        businessId={businessId || undefined}
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
