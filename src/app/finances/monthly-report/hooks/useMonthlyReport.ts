'use client'

/**
 * useMonthlyReport — powers the Actual-vs-Budget tab.
 *
 * MLTE-05 (Phase 34): when the resolved `businessId` matches a
 * multi-connection business (2+ active tenants), `generateReport()` routes to
 * `POST /api/monthly-report/consolidated` and adapts the response into the
 * `GeneratedReport` shape the existing Actual-vs-Budget UI (BudgetVsActualTable
 * + ReportSettingsPanel + template picker) already consumes. Single-entity
 * businesses continue to hit `/api/monthly-report/generate` unchanged.
 *
 * Why the adapter? CONTEXT.md locks: "Template system applies identically to
 * consolidated groups as to single-entity businesses." Without this wiring,
 * the Actual-vs-Budget tab on a consolidation parent would either show empty
 * data or (worse) wrong data from the parent's own xero_pl_lines (which is
 * a thin umbrella record, not the consolidated numbers).
 *
 * Budget is `0` on all lines in 34.0 — consolidated budgets are a follow-up
 * (requires combined forecast model, out of scope for this iteration).
 * BudgetVsActualTable already handles `has_budget: false` gracefully.
 */

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  GeneratedReport,
  VarianceCommentary,
  ReportCategory,
  ReportLine,
  ReportSection,
  ReportSummary,
  MonthlyReportSettings,
} from '../types'
import { mapTypeToCategory, buildSubtotal, calcVariance, getNextMonth, deriveProfitRows } from '@/lib/monthly-report/shared'
import {
  serializeReportSections,
  deserializeReportSections,
} from '../utils/snapshot-serializer'

// Five canonical categories — mirrors `/api/monthly-report/generate` output
// ordering so the adapted report lines up 1:1 with what single-entity shows.
const CATEGORY_ORDER: ReportCategory[] = [
  'Revenue',
  'Cost of Sales',
  'Operating Expenses',
  'Other Income',
  'Other Expenses',
]

/**
 * Adapter: ConsolidatedReport → GeneratedReport.
 *
 * Phase B (CFO-only clients): the consolidation engine has produced
 * `consolidated.budgetLines` (whole-business forecast aligned to the same
 * account universe as the actual lines) since Phase 34.3 — but this adapter
 * used to discard it and hard-code budget 0 / has_budget:false. It now wires
 * the budget through with the SAME variance semantics as the single-entity
 * `/api/monthly-report/generate` route (calcVariance sign conventions,
 * YTD windows, unspent/next-month/annual extras, budget-only rows,
 * Other Income folded into revenue totals, Other Expenses into opex totals).
 *
 * When the engine found no budget (zero-filled budgetLines universe),
 * `has_budget: false` preserves the pre-Phase-B rendering exactly.
 *
 * Exported for unit tests.
 */
export function adaptConsolidatedToGeneratedReport(
  consolidated: any, // ConsolidatedReport — loose typing to avoid coupling
  reportMonth: string,
  fiscalYear: number,
  businessId: string,
): GeneratedReport {
  const consolidatedLines: Array<{
    account_type: string
    account_name: string
    monthly_values: Record<string, number>
  }> = consolidated?.consolidated?.lines ?? []

  const budgetLines: Array<{
    account_type: string
    account_name: string
    monthly_values: Record<string, number>
  }> = consolidated?.consolidated?.budgetLines ?? []

  // Budget lines are aligned to the same (account_type, account_name)
  // universe as the actual lines, zero-filled when no forecast exists.
  const lineKey = (l: { account_type: string; account_name: string }) =>
    `${l.account_type}::${l.account_name}`
  const budgetByKey = new Map(budgetLines.map((b) => [lineKey(b), b]))
  const hasBudget = budgetLines.some((b) =>
    Object.values(b.monthly_values ?? {}).some((v) => v !== 0),
  )

  // FY month keys — union across actual + budget lines (both aligned to
  // fyMonths by the engine; the union guards against partial payloads).
  const fyMonthSet = new Set<string>()
  for (const l of [...consolidatedLines, ...budgetLines]) {
    for (const m of Object.keys(l.monthly_values ?? {})) fyMonthSet.add(m)
  }
  const fyMonths = [...fyMonthSet].sort()
  const ytdMonths = fyMonths.filter((m) => m <= reportMonth)
  const nextMonth = getNextMonth(reportMonth)

  // Group lines by report category (Revenue, Cost of Sales, etc.)
  const byCategory = new Map<ReportCategory, ReportLine[]>()
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, [])

  for (const l of consolidatedLines) {
    const category = mapTypeToCategory(l.account_type) as ReportCategory
    const isRevenue = category === 'Revenue' || category === 'Other Income'
    const monthlyValues = l.monthly_values ?? {}
    const actual = monthlyValues[reportMonth] ?? 0
    // YTD = sum of months in fiscal year up to and including reportMonth.
    // Since `monthly_values` is keyed by 'YYYY-MM', string ordering works for
    // the in-fiscal-year months the engine emits (fyMonths is monotonic).
    const ytdActual = ytdMonths.reduce((s, m) => s + (monthlyValues[m] ?? 0), 0)

    const budgetMonths = hasBudget
      ? budgetByKey.get(lineKey(l))?.monthly_values ?? {}
      : {}
    const budget = budgetMonths[reportMonth] ?? 0
    const ytdBudget = ytdMonths.reduce((s, m) => s + (budgetMonths[m] ?? 0), 0)
    const budgetAnnualTotal = fyMonths.reduce((s, m) => s + (budgetMonths[m] ?? 0), 0)
    const { amount: varAmt, percent: varPct } = calcVariance(actual, budget, isRevenue)
    const { amount: ytdVarAmt, percent: ytdVarPct } = calcVariance(ytdActual, ytdBudget, isRevenue)

    // Budget-only rows: the engine's universe includes accounts that exist
    // only in the forecast; their actual column is zero-filled. Mirror the
    // single-entity `is_budget_only` flag so the table styles them the same.
    const actualAnnual = fyMonths.reduce((s, m) => s + (monthlyValues[m] ?? 0), 0)
    const isBudgetOnly = hasBudget && actualAnnual === 0 && budgetAnnualTotal !== 0

    const line: ReportLine = {
      account_name: l.account_name,
      xero_account_name: isBudgetOnly ? null : l.account_name,
      is_budget_only: isBudgetOnly,
      actual,
      budget,
      variance_amount: hasBudget ? varAmt : 0,
      variance_percent: hasBudget ? varPct : 0,
      ytd_actual: ytdActual,
      ytd_budget: ytdBudget,
      ytd_variance_amount: hasBudget ? ytdVarAmt : 0,
      ytd_variance_percent: hasBudget ? ytdVarPct : 0,
      unspent_budget: hasBudget ? budgetAnnualTotal - ytdActual : 0,
      budget_next_month: budgetMonths[nextMonth] ?? 0,
      budget_annual_total: budgetAnnualTotal,
      prior_year: null,
    }
    byCategory.get(category)!.push(line)
  }

  const sections: ReportSection[] = CATEGORY_ORDER.map((category) => {
    const lines = byCategory.get(category)!
    const subtotal = buildSubtotal(lines, `Total ${category}`)
    // Subtotal variance percent — recomputed from aggregates, mirroring
    // /api/monthly-report/generate.
    subtotal.variance_percent = subtotal.budget !== 0
      ? (subtotal.variance_amount / Math.abs(subtotal.budget)) * 100 : 0
    subtotal.ytd_variance_percent = subtotal.ytd_budget !== 0
      ? (subtotal.ytd_variance_amount / Math.abs(subtotal.ytd_budget)) * 100 : 0
    return { category, lines, subtotal }
  }).filter((s) => s.lines.length > 0)

  // Summary + profit rows — WA.1: same canonical derivation as the
  // single-entity route (Gross Profit is trading only; Other Income/Expenses
  // enter once, at Net Profit). Both entity types MUST agree on this shape or
  // a consolidation parent and its children would report different GP% for the
  // same underlying numbers.
  const revenueSection = sections.find((s) => s.category === 'Revenue')
  const cogsSection = sections.find((s) => s.category === 'Cost of Sales')
  const opexSection = sections.find((s) => s.category === 'Operating Expenses')
  const otherIncSection = sections.find((s) => s.category === 'Other Income')
  const otherExpSection = sections.find((s) => s.category === 'Other Expenses')

  const derived = deriveProfitRows({
    revenue: revenueSection?.subtotal,
    cogs: cogsSection?.subtotal,
    opex: opexSection?.subtotal,
    otherIncome: otherIncSection?.subtotal,
    otherExpenses: otherExpSection?.subtotal,
    hasBudget,
  })
  const summary: ReportSummary = derived.summary
  const grossProfitRow = derived.gross_profit_row
  const operatingProfitRow = derived.operating_profit_row
  const netProfitRow = derived.net_profit_row

  // Minimal settings stub — the page keeps the real settings state and
  // passes them to BudgetVsActualDashboard; this field exists on GeneratedReport
  // but BudgetVsActualTable reads `settings` from props, not `report.settings`.
  const settings: MonthlyReportSettings = {
    business_id: businessId,
    sections: {
      revenue_detail: true,
      cogs_detail: true,
      opex_detail: true,
      payroll_detail: false,
      subscription_detail: false,
      balance_sheet: false,
      cashflow: false,
      trend_charts: false,
      chart_cash_runway: false,
      chart_cumulative_net_cash: false,
      chart_working_capital_gap: false,
      chart_revenue_vs_expenses: false,
      chart_revenue_breakdown: false,
      chart_variance_heatmap: false,
      chart_budget_burn_rate: false,
      chart_break_even: false,
      chart_team_cost_pct: false,
      chart_cost_per_employee: false,
      chart_subscription_creep: false,
    },
    show_prior_year: false,
    show_ytd: true,
    show_unspent_budget: false,
    show_budget_next_month: false,
    show_budget_annual_total: false,
    budget_forecast_id: null,
  }

  return {
    business_id: businessId,
    report_month: reportMonth,
    fiscal_year: fiscalYear,
    settings,
    sections,
    summary,
    gross_profit_row: grossProfitRow,
    operating_profit_row: operatingProfitRow,
    net_profit_row: netProfitRow,
    is_draft: false,
    unreconciled_count: 0,
    has_budget: hasBudget,
    is_consolidation: true,
  }
}

export function useMonthlyReport(businessId: string) {
  const [report, setReport] = useState<GeneratedReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConsolidationGroup, setIsConsolidationGroup] = useState<
    boolean | null
  >(null)
  // D-44.2-03 — read-path quality from /api/monthly-report/generate response.
  // Consolidated path doesn't surface data_quality yet (no top-level wrapper);
  // single-business reports always populate via 44.2-08 propagation.
  const [dataQuality, setDataQuality] = useState<import('@/lib/services/forecast-read-service').DataQuality>('verified')
  // PRES-07 — `dataQuality` seeds to 'verified' and the banner renders nothing
  // for 'verified', so any path that never sets it shows a clean bill of health.
  // Start unverified and let a real verdict clear it.
  const [qualityCheckFailed, setQualityCheckFailed] = useState(true)
  const [perTenantQuality, setPerTenantQuality] = useState<import('@/lib/services/forecast-read-service').PerTenantQuality[]>([])

  // MLTE-05: detect consolidation mode = business has 2+ active,
  // consolidation-included xero_connections. Mirrors useConsolidatedReport.
  useEffect(() => {
    if (!businessId) {
      setIsConsolidationGroup(null)
      return
    }
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('xero_connections')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_active', true)
      .eq('include_in_consolidation', true)
      .then(({ count }) => {
        if (!cancelled) setIsConsolidationGroup((count ?? 0) >= 2)
      })
      .then(undefined, () => {
        if (!cancelled) setIsConsolidationGroup(false)
      })
    return () => {
      cancelled = true
    }
  }, [businessId])

  const generateReport = useCallback(
    async (reportMonth: string, fiscalYear: number, forceDraft?: boolean) => {
      if (!businessId) return
      setIsLoading(true)
      setError(null)

      try {
        // MLTE-05 branching: route to consolidated API when the resolved
        // businessId is a consolidation parent. Adapter maps the response
        // into GeneratedReport so the existing UI renders unchanged.
        const isGroup = isConsolidationGroup === true
        const endpoint = isGroup
          ? '/api/monthly-report/consolidated'
          : '/api/monthly-report/generate'

        const payload = isGroup
          ? {
              business_id: businessId,
              report_month: reportMonth,
              fiscal_year: fiscalYear,
            }
          : {
              business_id: businessId,
              report_month: reportMonth,
              fiscal_year: fiscalYear,
              force_draft: forceDraft,
            }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Failed to generate report')
          if (data.code === 'NO_MAPPINGS') {
            return { needsMappings: true }
          }
          return null
        }

        // D-44.2-03 — surface read-path quality. PRES-07: this used to sit AFTER
        // the isGroup early return, so consolidation parents (Dragon Roofing,
        // IICT Group) never got a quality verdict and their banner stayed on the
        // optimistic 'verified' seed. Applied to BOTH branches now — the
        // consolidated route returns the same two fields as of this change.
        if (data.data_quality) {
          setDataQuality(data.data_quality)
          setPerTenantQuality(Array.isArray(data.per_tenant_quality) ? data.per_tenant_quality : [])
          setQualityCheckFailed(false)
        }

        if (isGroup) {
          // Adapt ConsolidatedReport → GeneratedReport so the Actual-vs-Budget
          // tab renders using the same template system (MLTE-05).
          const adapted = adaptConsolidatedToGeneratedReport(
            data.report,
            reportMonth,
            fiscalYear,
            businessId,
          )
          setReport(adapted)
          return adapted
        }

        setReport(data.report)
        return data.report
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate report')
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [businessId, isConsolidationGroup],
  )

  const saveSnapshot = useCallback(
    async (
      reportData: GeneratedReport,
      options?: {
        status?: 'draft' | 'final'
        coachNotes?: string
        generatedBy?: string
        commentary?: VarianceCommentary
      },
    ) => {
      // Phase B (CFO-only clients): consolidated snapshots now flow through
      // the same /api/monthly-report/snapshot upsert as single-entity reports.
      // monthly_report_snapshots keys on (businesses.id, report_month) — the
      // adapted consolidated GeneratedReport carries exactly that id — so the
      // 34.0-era refusal ("scheduled for Phase 35") was the only thing keeping
      // consolidation parents' commentary from persisting.
      try {
        // Phase 71-10 (D4): serialize `sections` from ReportSection[] → named-key map
        // before persisting. The in-memory shape stays an array (so BudgetVsActualTable,
        // pdf-service, etc. keep working unchanged); ONLY the JSONB shape on disk
        // changes. See src/app/finances/monthly-report/utils/snapshot-serializer.ts.
        const serializedReportData = {
          ...reportData,
          sections: serializeReportSections(reportData.sections),
        }
        const res = await fetch('/api/monthly-report/snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: reportData.business_id,
            report_month: reportData.report_month,
            fiscal_year: reportData.fiscal_year,
            status: options?.status || (reportData.is_draft ? 'draft' : 'final'),
            is_draft: options?.status === 'final' ? false : reportData.is_draft,
            unreconciled_count: reportData.unreconciled_count,
            report_data: serializedReportData,
            summary: reportData.summary,
            coach_notes: options?.coachNotes,
            generated_by: options?.generatedBy,
            commentary: options?.commentary || null,
          }),
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        return data.snapshot
      } catch (err) {
        console.error('[useMonthlyReport] Save snapshot error:', err)
        throw err
      }
    },
    [],
  )

  const loadSnapshot = useCallback(
    async (reportMonth: string) => {
      try {
        const res = await fetch(
          `/api/monthly-report/snapshot?business_id=${businessId}&report_month=${reportMonth}`,
        )
        const data = await res.json()
        if (data.snapshot) {
          // Phase 71-10 (D4): hydrate persisted `sections` back to ReportSection[].
          // Handles three shapes (named map / legacy numeric-keyed object / passthrough
          // array) so pre-71-10 snapshots still load. Downstream consumers
          // (BudgetVsActualTable, pdf-service) continue to receive the array shape.
          const persisted = data.snapshot.report_data
          const hydratedReportData = persisted
            ? {
                ...persisted,
                sections: deserializeReportSections(persisted.sections ?? []),
              }
            : persisted
          if (hydratedReportData) setReport(hydratedReportData)
          return { ...data.snapshot, report_data: hydratedReportData }
        }
        return null
      } catch (err) {
        console.error('[useMonthlyReport] Load snapshot error:', err)
        return null
      }
    },
    [businessId],
  )

  return {
    report,
    setReport,
    isLoading,
    error,
    isConsolidationGroup,
    generateReport,
    saveSnapshot,
    loadSnapshot,
    dataQuality,
    perTenantQuality,
    qualityCheckFailed,
  }
}
