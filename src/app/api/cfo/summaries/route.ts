import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
// Phase 67 deferred — route multi-currency businesses (e.g. IICT) through the
// FX engine so HKD tenant rows are translated to AUD before summing. Single-
// tenant and all-AUD businesses keep the bulk-query fast path.
import { needsFxConsolidation } from '@/lib/utils/needs-fx-consolidation'
import { buildConsolidation } from '@/lib/consolidation/engine'
import { loadFxRates, translatePLAtMonthlyAverage } from '@/lib/consolidation/fx'
import {
  generateFiscalMonthKeys,
  getFiscalYear,
  DEFAULT_YEAR_START_MONTH,
} from '@/lib/utils/fiscal-year-utils'
import { z } from 'zod'
import { withQuerySchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// GET searchParams: ?month=YYYY-MM (handler still enforces presence/format; this
// observe-mode schema just models the shape — permissive so reads never reject).
const QuerySchema = z
  .object({
    month: z.string().optional(),
  })
  .passthrough()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

type StatusBadge = 'on_track' | 'watch' | 'alert'
type ReportStatus = 'draft' | 'ready_for_review' | 'approved' | 'sent' | 'none'

interface ClientSummary {
  business_id: string
  business_name: string
  industry: string | null
  revenue: number
  revenue_budget: number
  revenue_vs_budget_pct: number | null   // null when no budget
  gross_profit: number
  gross_profit_pct: number | null
  net_profit: number
  net_profit_budget: number
  cash_balance: number
  unreconciled_count: number
  report_status: ReportStatus
  /** Phase D: true when the requested month is closed and the report is still none/draft. */
  report_overdue: boolean
  badge: StatusBadge
  manual_status_override: string | null
  /**
   * FX-01 (26 Aug 2026): months whose non-AUD member had NO fx_rates row, so
   * its native-currency values were summed into the AUD figures UNTRANSLATED.
   * fx.ts deliberately never fabricates a 1.0 rate (that would silently
   * mis-state the numbers) — it preserves the raw value and reports the gap
   * here. This route used to compute that gap and then DROP it, so /cfo showed
   * a ~5x overstated figure as fact. Non-empty => the money fields on this row
   * are NOT trustworthy and the UI must say so.
   */
  fx_missing_rates: { currency_pair: string; period: string }[]
}

interface StatsCards {
  on_track: number
  watch: number
  alert: number
  pending_approval: number
  /** Phase D (CFO-only clients): count of clients whose report for a CLOSED
   * month is still none/draft. Replaces the never-wired `next_due` (which
   * was hardcoded null, so the stat card permanently read "All clear"). */
  overdue: number
}

/** Compute the status badge from metrics using the 10% / 25% thresholds */
function computeBadge(
  netProfit: number,
  netProfitBudget: number,
  unreconciledCount: number,
  reportOverdue: boolean
): StatusBadge {
  // Phase D (CFO-only clients): the Phase 33 spec's "overdue reports → Alert
  // regardless" rule — previously an empty if-block that no caller
  // implemented. A report is overdue when the requested month has ended and
  // its cfo_report_status is still none/draft.
  if (reportOverdue) return 'alert'

  // Reconciliation alerts
  if (unreconciledCount > 10) return 'alert'

  // Net profit vs budget
  if (netProfitBudget > 0) {
    const variance = (netProfit - netProfitBudget) / Math.abs(netProfitBudget)
    if (variance < -0.25) return 'alert'
    if (variance < -0.10) return 'watch'
  } else {
    // No budget — use absolute: negative net profit = alert
    if (netProfit < 0) return 'alert'
  }

  // Minor reconciliation issues
  if (unreconciledCount > 0) return 'watch'

  return 'on_track'
}

/**
 * Sum a JSONB monthly_values map for a month key.
 * Handles string-or-number values defensively.
 */
function sumMonthlyValues(lines: any[], monthKey: string, key: 'monthly_values' | 'forecast_months' | 'actual_months'): number {
  return lines.reduce((s, l) => {
    const mv = l[key] as Record<string, any> | null | undefined
    if (!mv) return s
    const v = mv[monthKey]
    if (v === null || v === undefined) return s
    const n = typeof v === 'number' ? v : parseFloat(v)
    return s + (isNaN(n) ? 0 : n)
  }, 0)
}

/**
 * GET /api/cfo/summaries?month=YYYY-MM
 *
 * Returns per-client summaries for all CFO clients the caller has access to.
 * Coach: sees businesses where assigned_coach_id = them AND is_cfo_client = true
 * Super admin: sees all is_cfo_client = true
 *
 * Data sources (all DB, no live Xero calls):
 * - businesses, business_profiles (for industry)
 * - xero_pl_lines (actuals for P&L)
 * - forecast_pl_lines (budget for P&L)
 * - financial_metrics (cash + unreconciled)
 * - cfo_report_status (report state)
 */
async function getHandler(request: Request) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role — coach or super_admin only
    const { data: roleRow } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    const isSuperAdmin = roleRow?.role === 'super_admin'
    const isCoach = roleRow?.role === 'coach'

    if (!isSuperAdmin && !isCoach) {
      return NextResponse.json({ error: 'Access denied — coach or super_admin required' }, { status: 403 })
    }

    const monthParam = new URL(request.url).searchParams.get('month')
    if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
      return NextResponse.json({ error: 'month query param required (YYYY-MM)' }, { status: 400 })
    }

    const monthKey = monthParam
    const periodMonth = `${monthParam}-01`
    // Phase D: a month is "closed" once the server's calendar month has moved
    // past it — reports for closed months are expected to exist. Day-level
    // timezone skew at the month boundary (Vercel UTC vs AEST) is acceptable
    // for an overdue flag.
    const monthClosed = monthKey < new Date().toISOString().slice(0, 7)

    // Load CFO-flagged businesses the user has access to
    let bizQuery = supabase
      .from('businesses')
      .select('id, name, assigned_coach_id, is_cfo_client')
      .eq('is_cfo_client', true)
    if (!isSuperAdmin) {
      bizQuery = bizQuery.eq('assigned_coach_id', user.id)
    }
    const { data: businesses, error: bizError } = await bizQuery

    if (bizError) {
      Sentry.captureException(bizError, { tags: { route: 'cfo/summaries' }, extra: { context: "[CFO Summaries] business query error" } } as any)
      return NextResponse.json({ error: 'Failed to load businesses' }, { status: 500 })
    }

    if (!businesses || businesses.length === 0) {
      return NextResponse.json({
        month: monthKey,
        summaries: [],
        stats: { on_track: 0, watch: 0, alert: 0, pending_approval: 0, overdue: 0 },
      })
    }

    const bizIds = businesses.map(b => b.id)

    // Business profiles for industry (optional enrichment)
    const { data: profiles } = await supabase
      .from('business_profiles')
      .select('id, business_id, industry')
      .in('business_id', bizIds)
    const profileByBiz = new Map<string, any>()
    const profileIdByBiz = new Map<string, string>()
    for (const p of (profiles ?? [])) {
      profileByBiz.set(p.business_id, p)
      if (p.id) profileIdByBiz.set(p.business_id, p.id)
    }
    const profileIds = Array.from(profileIdByBiz.values())
    const allRelatedIds = [...bizIds, ...profileIds]

    // Xero P&L actuals for the requested month (keyed by businesses.id).
    // Multi-currency businesses (e.g. IICT — 2 AUD + 1 HKD tenant) hit the FX
    // engine path below instead of using these bulk rows directly.
    const { data: xeroLines } = await supabase
      .from('xero_pl_lines_wide_compat')
      .select('business_id, account_type, monthly_values')
      .in('business_id', allRelatedIds)

    // Phase 67 deferred — identify which businesses are multi-currency, then
    // call buildConsolidation once per such business to get AUD-translated
    // P&L lines for the requested month's fiscal year. Done in parallel; only
    // IICT-shaped businesses trigger any work, so the cost is negligible for
    // typical CFO portfolios.
    const fxYear = getFiscalYear(
      new Date(`${monthKey}-15T00:00:00.000Z`),
      DEFAULT_YEAR_START_MONTH,
    )
    const fxMonths = generateFiscalMonthKeys(fxYear, DEFAULT_YEAR_START_MONTH)
    const fxLinesByBiz = new Map<string, { account_type: string; monthly_values: Record<string, number> }[]>()
    // FX-01: the consolidation engine reports months it could NOT translate.
    // Capture it per business so the response can warn instead of presenting
    // untranslated foreign-currency values as AUD fact.
    const fxMissingByBiz = new Map<string, { currency_pair: string; period: string }[]>()
    await Promise.all(
      businesses.map(async (biz) => {
        try {
          const needsFx = await needsFxConsolidation(supabase, biz.id)
          if (!needsFx) return
          const translate = async (
            tenant: { functional_currency: string },
            lines: import('@/lib/consolidation/types').XeroPLLineLike[],
          ) => {
            const pair = `${tenant.functional_currency}/AUD`
            const rates = await loadFxRates(
              supabase as unknown as Parameters<typeof loadFxRates>[0],
              pair,
              'monthly_average',
              fxMonths,
            )
            const { translated, missing } = translatePLAtMonthlyAverage(lines, rates)
            const ratesUsed: Record<string, number> = {}
            for (const [m, r] of rates.entries()) {
              ratesUsed[`${pair}::${m}`] = r
            }
            return { translated, missing, ratesUsed }
          }
          const report = await buildConsolidation(supabase, {
            businessId: biz.id,
            reportMonth: monthKey,
            fiscalYear: fxYear,
            fyMonths: fxMonths,
            translate,
          })
          fxLinesByBiz.set(
            biz.id,
            report.consolidated.lines.map((l) => ({
              account_type: l.account_type,
              monthly_values: l.monthly_values,
            })),
          )
          if (report.fx_context?.missing_rates?.length) {
            fxMissingByBiz.set(biz.id, report.fx_context.missing_rates)
            // A missing rate means this client's headline numbers are wrong by
            // the FX factor (IICT: ~5.3x). That is an invariant breach worth
            // alerting on, not just rendering — it can persist for months
            // because rates are entered manually by design.
            Sentry.captureMessage('fx:missing-rate-on-cfo-summary', {
              level: 'warning',
              tags: { route: 'cfo/summaries', invariant: 'fx_missing_rate' },
              extra: {
                business_id: biz.id,
                month: monthKey,
                missing_rates: report.fx_context.missing_rates,
              },
            } as any)
          }
        } catch (err) {
          // Log and fall back to bulk-query path for this business so a single
          // FX failure doesn't black-hole the whole coach dashboard.
          Sentry.captureException(err, {
            tags: { route: 'cfo/summaries', subsystem: 'fx_engine' },
            extra: { business_id: biz.id, month: monthKey },
          } as any)
        }
      }),
    )

    // Forecast P&L budget for the requested month
    // forecast.business_id may be business_profiles.id; load forecasts for all related ids
    //
    // Phase A (CFO-only clients): only ACTIVE forecasts qualify, and a
    // forecast with zero materialized lines (empty-shell wizard trap) never
    // qualifies — previously the newest-updated forecast won regardless,
    // so an empty shell silently zeroed the dashboard's budget columns.
    const { data: forecasts } = await supabase
      .from('financial_forecasts')
      .select('id, business_id')
      .in('business_id', allRelatedIds)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })

    // Candidate forecasts per businesses.id, preserving updated_at desc order
    const candidatesByBiz = new Map<string, string[]>()
    for (const f of (forecasts ?? [])) {
      // Reverse-map: find which businesses.id this forecast belongs to
      for (const biz of businesses) {
        if (f.business_id === biz.id || f.business_id === profileIdByBiz.get(biz.id)) {
          const list = candidatesByBiz.get(biz.id) ?? []
          list.push(f.id)
          candidatesByBiz.set(biz.id, list)
        }
      }
    }
    const candidateIds = [...new Set([...candidatesByBiz.values()].flat())]

    const { data: allCandidateLines } = candidateIds.length > 0
      ? await supabase
          .from('forecast_pl_lines')
          .select('forecast_id, category, account_type, forecast_months')
          .in('forecast_id', candidateIds)
      : { data: [] }

    const lineCountByForecast = new Map<string, number>()
    for (const l of (allCandidateLines ?? [])) {
      lineCountByForecast.set(l.forecast_id, (lineCountByForecast.get(l.forecast_id) ?? 0) + 1)
    }

    // Map: businesses.id → newest active forecast that actually has lines
    const forecastIdByBiz = new Map<string, string>()
    for (const [bizId, candidates] of candidatesByBiz) {
      const withLines = candidates.find((id) => (lineCountByForecast.get(id) ?? 0) > 0)
      if (withLines) forecastIdByBiz.set(bizId, withLines)
    }
    const chosenIds = new Set(forecastIdByBiz.values())
    const forecastLines = (allCandidateLines ?? []).filter((l) => chosenIds.has(l.forecast_id))

    // Financial metrics (latest record per business for this month or most recent prior)
    const monthEnd = `${periodMonth.slice(0, 8)}${new Date(
      parseInt(monthParam.slice(0, 4)),
      parseInt(monthParam.slice(5, 7)),
      0
    ).getDate()}`
    const { data: metrics } = await supabase
      .from('financial_metrics')
      .select('business_id, total_cash, unreconciled_count, metric_date')
      .in('business_id', allRelatedIds)
      .lte('metric_date', monthEnd)
      .order('metric_date', { ascending: false })

    const metricsByBiz = new Map<string, any>()
    for (const m of (metrics ?? [])) {
      // Resolve to businesses.id
      for (const biz of businesses) {
        if (m.business_id === biz.id || m.business_id === profileIdByBiz.get(biz.id)) {
          if (!metricsByBiz.has(biz.id)) metricsByBiz.set(biz.id, m)
        }
      }
    }

    // CFO report status for this period
    const { data: statuses } = await supabase
      .from('cfo_report_status')
      .select('*')
      .in('business_id', bizIds)
      .eq('period_month', periodMonth)
    const statusByBiz = new Map<string, any>()
    for (const s of (statuses ?? [])) statusByBiz.set(s.business_id, s)

    // Build per-client summaries
    const summaries: ClientSummary[] = []
    for (const biz of businesses) {
      const bizProfile = profileByBiz.get(biz.id)
      const bizProfileId = profileIdByBiz.get(biz.id)
      const bizRelatedIds = bizProfileId ? [biz.id, bizProfileId] : [biz.id]

      // Filter P&L lines for this business. Multi-currency businesses get the
      // engine-translated lines; everyone else uses the bulk-query rows
      // unchanged (single-tenant or all-AUD multi-tenant — both safe to sum
      // directly).
      const bizXeroLines = fxLinesByBiz.has(biz.id)
        ? fxLinesByBiz.get(biz.id)!
        : (xeroLines ?? []).filter(l => bizRelatedIds.includes(l.business_id))

      const revenue = sumMonthlyValues(
        bizXeroLines.filter(l => l.account_type === 'revenue' || l.account_type === 'other_income'),
        monthKey,
        'monthly_values',
      )
      const cogs = Math.abs(sumMonthlyValues(
        bizXeroLines.filter(l => l.account_type === 'cogs'),
        monthKey,
        'monthly_values',
      ))
      const opex = Math.abs(sumMonthlyValues(
        bizXeroLines.filter(l => l.account_type === 'opex' || l.account_type === 'other_expense'),
        monthKey,
        'monthly_values',
      ))
      const grossProfit = revenue - cogs
      const netProfit = revenue - cogs - opex

      const forecastId = forecastIdByBiz.get(biz.id)
      const bizForecastLines = forecastId
        ? (forecastLines ?? []).filter(l => l.forecast_id === forecastId)
        : []

      // 'Other Income' is emitted by the wizard materializer and is
      // revenue-like — without it here it falls into the opex catch-all
      // below (which also Math.abs's it), making net profit wrong by 2×.
      const isRevCat = (c: string | null) =>
        c === 'Revenue' || c === 'revenue' || c === 'Trading Revenue' ||
        c === 'Other Revenue' || c === 'Other Income'
      const isCogsCat = (c: string | null) =>
        c === 'Cost of Sales' || c === 'COGS' || c === 'cogs' || c === 'Direct Costs'

      const revenueBudget = sumMonthlyValues(
        bizForecastLines.filter(l => isRevCat(l.category)),
        monthKey,
        'forecast_months',
      )
      const cogsBudget = Math.abs(sumMonthlyValues(
        bizForecastLines.filter(l => isCogsCat(l.category)),
        monthKey,
        'forecast_months',
      ))
      const opexBudget = Math.abs(sumMonthlyValues(
        bizForecastLines.filter(l => !isRevCat(l.category) && !isCogsCat(l.category)),
        monthKey,
        'forecast_months',
      ))
      const netProfitBudget = revenueBudget - cogsBudget - opexBudget

      const metric = metricsByBiz.get(biz.id)
      const cashBalance = metric?.total_cash ?? 0
      const unreconciledCount = metric?.unreconciled_count ?? 0

      const statusRow = statusByBiz.get(biz.id)
      const reportStatus: ReportStatus = statusRow?.status ?? 'none'
      const manualOverride: string | null = statusRow?.manual_status_override ?? null
      const reportOverdue =
        monthClosed && (reportStatus === 'none' || reportStatus === 'draft')

      const computedBadge = computeBadge(netProfit, netProfitBudget, unreconciledCount, reportOverdue)
      const badge: StatusBadge =
        manualOverride === 'on_track' || manualOverride === 'watch' || manualOverride === 'alert'
          ? manualOverride
          : computedBadge

      summaries.push({
        business_id: biz.id,
        business_name: biz.name ?? '(Unnamed)',
        industry: bizProfile?.industry ?? null,
        revenue: Math.round(revenue),
        revenue_budget: Math.round(revenueBudget),
        revenue_vs_budget_pct: revenueBudget > 0 ? Math.round((revenue / revenueBudget) * 1000) / 10 : null,
        gross_profit: Math.round(grossProfit),
        gross_profit_pct: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : null,
        net_profit: Math.round(netProfit),
        net_profit_budget: Math.round(netProfitBudget),
        cash_balance: Math.round(cashBalance),
        unreconciled_count: unreconciledCount,
        report_status: reportStatus,
        report_overdue: reportOverdue,
        badge,
        manual_status_override: manualOverride,
        fx_missing_rates: fxMissingByBiz.get(biz.id) ?? [],
      })
    }

    // Sort: alert first, then watch, then on_track (priority triage)
    const badgePriority: Record<StatusBadge, number> = { alert: 0, watch: 1, on_track: 2 }
    summaries.sort((a, b) => {
      const d = badgePriority[a.badge] - badgePriority[b.badge]
      if (d !== 0) return d
      return a.business_name.localeCompare(b.business_name)
    })

    // Stats
    const stats: StatsCards = {
      on_track: summaries.filter(s => s.badge === 'on_track').length,
      watch: summaries.filter(s => s.badge === 'watch').length,
      alert: summaries.filter(s => s.badge === 'alert').length,
      pending_approval: summaries.filter(s => s.report_status === 'ready_for_review').length,
      overdue: summaries.filter(s => s.report_overdue === true).length,
    }

    return NextResponse.json({ month: monthKey, summaries, stats })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'cfo/summaries' }, extra: { context: "[CFO Summaries] error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('cfo/summaries', QuerySchema, getHandler)
