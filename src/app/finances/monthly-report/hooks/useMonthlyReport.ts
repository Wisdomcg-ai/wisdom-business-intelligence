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
 * The consolidated route serves the business's settings row beside the
 * report, and the adapted report carries it — the same row the single-entity
 * route puts on its report.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
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
 * `draft` is the reconciliation state the page computed at Generate. It used
 * to be hard-coded final and clean, so a consolidated report could never
 * print the cover's draft or unreconciled line, pre-flight passed "Final, with
 * a clean reconciliation gate", and Finalise was enabled — for IICT while one
 * of its three Xero organisations had refused every sync since 10 Sep
 * (IICT-04, DRG-02). Absent is fail-closed: a draft.
 *
 * `consolidation_fx` is the response's own missing-rate list, so pre-flight
 * checks the rates of these figures rather than of whichever per-entity report
 * the page holds. A response without fx_context records nothing — never a
 * clean list it did not see.
 *
 * Exported for unit tests.
 */
export function adaptConsolidatedToGeneratedReport(
  consolidated: any, // ConsolidatedReport — loose typing to avoid coupling
  reportMonth: string,
  fiscalYear: number,
  businessId: string,
  context: {
    /**
     * The business's settings row, as POST /api/monthly-report/consolidated
     * serves it beside the report. Every page that prints the report reads its
     * columns from here — Budget vs Actual on screen, and the summary, detail
     * and YTD pages of the PDF.
     */
    settings: MonthlyReportSettings
  },
  draft: { isDraft: boolean; unreconciledCount: number } = { isDraft: true, unreconciledCount: 0 },
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
      // The engine consolidates the fiscal year's months only. With the
      // prior-year column switched on, every row prints the dash that says the
      // figure is not there — never a $0 that says it was nothing.
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

  // Where the budget came from, when the route was asked for the approved
  // budget. Without it the page's export guard saw a report "measured against
  // the forecast" on a client switched to the budget store and refused every
  // export (page.tsx handleExportPDF; DRG-03). Absent on the forecast path,
  // which leaves these fields exactly as they were: unset.
  const provenance = consolidated?.budget_provenance
  const budgetProvenance = provenance && (provenance.source === 'budget_version' || provenance.source === 'none')
    ? {
        budget_source: provenance.source as 'budget_version' | 'none',
        budget_version_id: provenance.version_id ?? null,
        budget_version_ids: Array.isArray(provenance.version_ids) ? provenance.version_ids : [],
        ...(provenance.label ? { budget_forecast_name: provenance.label as string } : {}),
        no_budget_reason: provenance.no_budget_reason ?? null,
        no_budget_detail: provenance.no_budget_detail ?? null,
      }
    : undefined

  const missingRates = consolidated?.fx_context?.missing_rates
  const consolidationFx = Array.isArray(missingRates)
    ? {
        missing_rates: missingRates
          .filter((r: any) => r && typeof r.currency_pair === 'string' && typeof r.period === 'string')
          .map((r: any) => ({ currency_pair: r.currency_pair, period: r.period })),
      }
    : undefined

  return {
    business_id: businessId,
    report_month: reportMonth,
    fiscal_year: fiscalYear,
    // The business's own settings, not a stub. A stub here switched off the
    // Unspent, Next Month and Annual columns (and the prior year) on every page
    // of every consolidated pack, whatever the coach had set (IICT-12, DRG-05).
    settings: context.settings,
    sections,
    summary,
    gross_profit_row: grossProfitRow,
    operating_profit_row: operatingProfitRow,
    net_profit_row: netProfitRow,
    is_draft: draft.isDraft,
    unreconciled_count: Math.max(0, Math.round(draft.unreconciledCount || 0)),
    has_budget: hasBudget,
    ...(budgetProvenance ?? {}),
    is_consolidation: true,
    ...(consolidationFx ? { consolidation_fx: consolidationFx } : {}),
  }
}

/**
 * Whether the business has 2+ active, consolidation-included Xero
 * connections. A failed count reads as single-entity, as it always has.
 */
function detectConsolidationGroup(businessId: string): Promise<boolean> {
  const supabase = createClient()
  return Promise.resolve(
    supabase
      .from('xero_connections')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_active', true)
      .eq('include_in_consolidation', true),
  ).then(({ count }) => (count ?? 0) >= 2, () => false)
}

export interface UseMonthlyReportOptions {
  /**
   * Receives the consolidated response a Generate adapted, with the month and
   * fiscal year it was built for. The page primes its per-entity cache with it
   * (useConsolidatedReport.prime), so the export prints that page from the
   * same generation as the statements — and does not refuse on, or pass on,
   * a report the cache held from an earlier month or an earlier Generate.
   */
  onConsolidatedReport?: (report: any, reportMonth: string, fiscalYear: number) => void
}

export function useMonthlyReport(businessId: string, options?: UseMonthlyReportOptions) {
  // A ref, so a caller's inline callback does not give generateReport a new
  // identity every render.
  const onConsolidatedReportRef = useRef(options?.onConsolidatedReport)
  onConsolidatedReportRef.current = options?.onConsolidatedReport
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
  //
  // The answer is kept as a PROMISE as well as state, for generateReport
  // (DRG-52): state is null until the count comes back, and choosing the route
  // on `=== true` sent a Generate clicked in that window to the single-entity
  // route — one org's figures under a two-org group's name.
  const detection = useRef<{ businessId: string; answer: Promise<boolean> } | null>(null)
  useEffect(() => {
    setIsConsolidationGroup(null)
    if (!businessId) {
      detection.current = null
      return
    }
    let cancelled = false
    const answer = detectConsolidationGroup(businessId)
    detection.current = { businessId, answer }
    answer.then((isGroup) => {
      if (!cancelled) setIsConsolidationGroup(isGroup)
    })
    return () => {
      cancelled = true
    }
  }, [businessId])

  const generateReport = useCallback(
    /**
     * @param unreconciledCount the reconciliation gate's count, when the check
     *   completed. The consolidated report carries it to the cover; the
     *   single-entity route takes only force_draft, as before.
     */
    async (reportMonth: string, fiscalYear: number, forceDraft?: boolean, unreconciledCount?: number) => {
      if (!businessId) return
      setIsLoading(true)
      setError(null)

      try {
        // MLTE-05 branching: route to consolidated API when the resolved
        // businessId is a consolidation parent. Adapter maps the response
        // into GeneratedReport so the existing UI renders unchanged.
        //
        // Never on an unresolved detection (DRG-52): wait for the count. The
        // page disables its Generate button until then, but Continue as
        // draft, Report History and a settings change generate through here too.
        const isGroup =
          isConsolidationGroup ??
          (await (detection.current?.businessId === businessId
            ? detection.current.answer
            : detectConsolidationGroup(businessId)))
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
          // The route serves the business's settings row beside the report.
          // Without it there is no telling which columns this pack prints, and
          // the stub that used to stand in for it hid three of them.
          if (!data.settings) {
            setError('The report settings could not be loaded. Try generating again.')
            return null
          }
          // Adapt ConsolidatedReport → GeneratedReport so the Actual-vs-Budget
          // tab renders using the same template system (MLTE-05).
          const adapted = adaptConsolidatedToGeneratedReport(
            data.report,
            reportMonth,
            fiscalYear,
            businessId,
            { settings: data.settings },
            // The same state the single-entity route stamps from force_draft
            // — and a missing answer is a draft, never a clean final.
            { isDraft: forceDraft !== false, unreconciledCount: unreconciledCount ?? 0 },
          )
          setReport(adapted)
          onConsolidatedReportRef.current?.(data.report, reportMonth, fiscalYear)
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
        // `commentary` is sent ONLY when the caller actually has one. It used
        // to go as `options?.commentary || null`, so a save made while
        // commentary was undefined (mid month-change, or a load that had not
        // landed) told the route to blank the month's notes. Absent now means
        // "don't touch it"; clearing is expressed as an explicit `{}`.
        const payload: Record<string, unknown> = {
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
        }
        if (options?.commentary !== undefined) {
          payload.commentary = options.commentary
        }
        const res = await fetch('/api/monthly-report/snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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

  /**
   * Read a month's stored snapshot. Reads only — the caller decides what, if
   * anything, to put on screen.
   *
   * This is split out from `loadSnapshot` because the combined version was a
   * reader that wrote. `handleGenerateReport` called it for one thing — the
   * persisted commentary and the draft/final status — and got the stored
   * report_data pushed into state as a side effect, on top of the report it
   * had just generated. Urban Road, 10 Sep 2026: a regenerate flashed the new
   * budget ($450k, the locked Xero budget version) and then reverted to the old
   * one ($533k, a superseded forecast) about a second later. The generate was
   * never wrong; the line after it undid the generate.
   */
  const fetchSnapshot = useCallback(
    async (reportMonth: string) => {
      try {
        const res = await fetch(
          `/api/monthly-report/snapshot?business_id=${businessId}&report_month=${reportMonth}`,
        )
        const data = await res.json()
        if (!data.snapshot) return null
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
        return { ...data.snapshot, report_data: hydratedReportData }
      } catch (err) {
        console.error('[useMonthlyReport] Load snapshot error:', err)
        return null
      }
    },
    [businessId],
  )

  /**
   * Read a month's snapshot AND show it — for the paths whose whole purpose is
   * to put a stored report on screen (changing month, opening one from Report
   * History). Anything else wants `fetchSnapshot`.
   */
  const loadSnapshot = useCallback(
    async (reportMonth: string) => {
      const snapshot = await fetchSnapshot(reportMonth)
      if (snapshot?.report_data) setReport(snapshot.report_data)
      return snapshot
    },
    [fetchSnapshot],
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
    fetchSnapshot,
    dataQuality,
    perTenantQuality,
    qualityCheckFailed,
  }
}
