'use client'

/**
 * useMonthlyReport — powers the Actual-vs-Budget tab.
 *
 * MLTE-05 (Phase 34): when the resolved `businessId` matches a
 * `consolidation_groups.business_id` record, `generateReport()` routes to
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
import { mapTypeToCategory, buildSubtotal } from '@/lib/monthly-report/shared'

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
 * We populate the fields BudgetVsActualTable reads (account_name, actual,
 * ytd_actual, category) and leave budget/variance/prior_year at safe defaults
 * (0 / null). `has_budget: false` triggers BudgetVsActualTable's no-budget
 * code path, which hides variance columns and still renders actuals cleanly.
 */
function adaptConsolidatedToGeneratedReport(
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

  // Group lines by report category (Revenue, Cost of Sales, etc.)
  const byCategory = new Map<ReportCategory, ReportLine[]>()
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, [])

  for (const l of consolidatedLines) {
    const category = mapTypeToCategory(l.account_type) as ReportCategory
    const actual = l.monthly_values?.[reportMonth] ?? 0
    // YTD = sum of months in fiscal year up to and including reportMonth.
    // Since `monthly_values` is keyed by 'YYYY-MM', string ordering works for
    // the in-fiscal-year months the engine emits (fyMonths is monotonic).
    const ytdActual = Object.entries(l.monthly_values ?? {})
      .filter(([m]) => m <= reportMonth)
      .reduce((s, [, v]) => s + (v as number), 0)

    const line: ReportLine = {
      account_name: l.account_name,
      xero_account_name: l.account_name,
      is_budget_only: false,
      actual,
      budget: 0,
      variance_amount: 0,
      variance_percent: 0,
      ytd_actual: ytdActual,
      ytd_budget: 0,
      ytd_variance_amount: 0,
      ytd_variance_percent: 0,
      unspent_budget: 0,
      budget_next_month: 0,
      budget_annual_total: 0,
      prior_year: null,
    }
    byCategory.get(category)!.push(line)
  }

  const sections: ReportSection[] = CATEGORY_ORDER.map((category) => {
    const lines = byCategory.get(category)!
    return {
      category,
      lines,
      subtotal: buildSubtotal(lines, `Total ${category}`),
    }
  }).filter((s) => s.lines.length > 0)

  // Summary — totals per subtotal; gross_profit and net_profit derived below.
  const zeroTotal = { actual: 0, budget: 0, variance: 0, variance_percent: 0 }
  const revenueSection = sections.find((s) => s.category === 'Revenue')
  const cogsSection = sections.find((s) => s.category === 'Cost of Sales')
  const opexSection = sections.find((s) => s.category === 'Operating Expenses')

  const revenueTotal = revenueSection
    ? {
        actual: revenueSection.subtotal.actual,
        budget: 0,
        variance: 0,
        variance_percent: 0,
      }
    : zeroTotal
  const cogsTotal = cogsSection
    ? {
        actual: cogsSection.subtotal.actual,
        budget: 0,
        variance: 0,
        variance_percent: 0,
      }
    : zeroTotal
  const opexTotal = opexSection
    ? {
        actual: opexSection.subtotal.actual,
        budget: 0,
        variance: 0,
        variance_percent: 0,
      }
    : zeroTotal

  const grossProfit = revenueTotal.actual - cogsTotal.actual
  const netProfit = grossProfit - opexTotal.actual

  const summary: ReportSummary = {
    revenue: revenueTotal,
    cogs: cogsTotal,
    gross_profit: {
      actual: grossProfit,
      budget: 0,
      variance: 0,
      gp_percent:
        revenueTotal.actual !== 0
          ? (grossProfit / revenueTotal.actual) * 100
          : 0,
    },
    opex: opexTotal,
    net_profit: {
      actual: netProfit,
      budget: 0,
      variance: 0,
      np_percent:
        revenueTotal.actual !== 0
          ? (netProfit / revenueTotal.actual) * 100
          : 0,
    },
  }

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
    gross_profit_row: buildSubtotal(
      [
        ...(revenueSection?.lines ?? []),
        ...(cogsSection?.lines.map((l) => ({
          ...l,
          actual: -l.actual,
          ytd_actual: -l.ytd_actual,
        })) ?? []),
      ],
      'Gross Profit',
    ),
    net_profit_row: buildSubtotal(
      sections.flatMap((s) =>
        s.category === 'Revenue' || s.category === 'Other Income'
          ? s.lines
          : s.lines.map((l) => ({
              ...l,
              actual: -l.actual,
              ytd_actual: -l.ytd_actual,
            })),
      ),
      'Net Profit',
    ),
    is_draft: false,
    unreconciled_count: 0,
    has_budget: false,
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

  // MLTE-05: detect consolidation mode via the same one-query lookup
  // useConsolidatedReport uses — so both hooks agree on the mode.
  useEffect(() => {
    if (!businessId) {
      setIsConsolidationGroup(null)
      return
    }
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('consolidation_groups')
      .select('id')
      .eq('business_id', businessId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsConsolidationGroup(!!data)
      })
      // RLS-denied / network errors → treat as single-entity (safe default).
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
      // Consolidated snapshots are the Phase 35 hook (cfo_report_status.snapshot_data
      // column already exists). In 34.0 we refuse gracefully rather than posting
      // consolidated data to a single-entity snapshot path.
      if (reportData.is_consolidation) {
        throw new Error(
          'Consolidated snapshot is scheduled for Phase 35 — not yet available in 34.0',
        )
      }
      try {
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
            report_data: reportData,
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
          setReport(data.snapshot.report_data)
          return data.snapshot
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
  }
}
