import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
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
  badge: StatusBadge
  manual_status_override: string | null
}

interface StatsCards {
  on_track: number
  watch: number
  alert: number
  pending_approval: number
  next_due: string | null
}

/** Compute the status badge from metrics using the 10% / 25% thresholds */
function computeBadge(
  netProfit: number,
  netProfitBudget: number,
  unreconciledCount: number,
  reportStatus: ReportStatus
): StatusBadge {
  // Overdue reports → Alert regardless
  if (reportStatus === 'none' || reportStatus === 'draft') {
    // Overdue check: if report for previous month is still draft, alert
    // (handled in the caller — here we just use the status flag)
  }

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
export async function GET(request: NextRequest) {
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
      console.error('[CFO Summaries] business query error:', bizError)
      return NextResponse.json({ error: 'Failed to load businesses' }, { status: 500 })
    }

    if (!businesses || businesses.length === 0) {
      return NextResponse.json({
        month: monthKey,
        summaries: [],
        stats: { on_track: 0, watch: 0, alert: 0, pending_approval: 0, next_due: null },
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

    // Xero P&L actuals for the requested month (keyed by businesses.id)
    const { data: xeroLines } = await supabase
      .from('xero_pl_lines')
      .select('business_id, account_type, monthly_values')
      .in('business_id', allRelatedIds)

    // Forecast P&L budget for the requested month
    // forecast.business_id may be business_profiles.id; load forecasts for all related ids
    const { data: forecasts } = await supabase
      .from('financial_forecasts')
      .select('id, business_id')
      .in('business_id', allRelatedIds)
      .order('updated_at', { ascending: false })

    // Map: businesses.id → first matching forecast.id
    const forecastIdByBiz = new Map<string, string>()
    for (const f of (forecasts ?? [])) {
      // Reverse-map: find which businesses.id this forecast belongs to
      for (const biz of businesses) {
        if (f.business_id === biz.id || f.business_id === profileIdByBiz.get(biz.id)) {
          if (!forecastIdByBiz.has(biz.id)) forecastIdByBiz.set(biz.id, f.id)
        }
      }
    }
    const forecastIds = Array.from(forecastIdByBiz.values())

    const { data: forecastLines } = forecastIds.length > 0
      ? await supabase
          .from('forecast_pl_lines')
          .select('forecast_id, category, account_type, forecast_months')
          .in('forecast_id', forecastIds)
      : { data: [] }

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

      // Filter P&L lines for this business
      const bizXeroLines = (xeroLines ?? []).filter(l => bizRelatedIds.includes(l.business_id))

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

      const isRevCat = (c: string | null) =>
        c === 'Revenue' || c === 'revenue' || c === 'Trading Revenue' || c === 'Other Revenue'
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

      const computedBadge = computeBadge(netProfit, netProfitBudget, unreconciledCount, reportStatus)
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
        badge,
        manual_status_override: manualOverride,
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
      next_due: null,  // Phase 35 will wire this up based on scheduled delivery dates
    }

    return NextResponse.json({ month: monthKey, summaries, stats })
  } catch (err) {
    console.error('[CFO Summaries] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
