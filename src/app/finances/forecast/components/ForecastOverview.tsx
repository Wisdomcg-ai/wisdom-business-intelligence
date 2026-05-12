'use client'

/**
 * ForecastOverview — production Overview tab for /finances/forecast
 *
 * Wires the prototype layout (src/app/preview/forecast-v2/page.tsx) to live data:
 *   1. KPI strip       → Revenue / Gross Profit / Net Profit derived from forecast_pl_lines
 *                        + Cash placeholder ("Coming soon" — wired in Phase 58.3)
 *   2. Trajectory      → /api/forecast/dashboard-actuals (Revenue / GP / NP toggle)
 *   3. Monthly trend   → forecast_pl_lines grouped by category (12 cols, forecast cols highlighted)
 *   4. Scorecard       → Coming soon (Phase 58.2)
 *   5. Insights        → Coming soon (Phase 58.2)
 *   6. Footer          → Real navigation (Edit Plan, Full P&L, Versions, Export)
 *
 * Owns NO data fetching for plLines/forecast — those flow in as props from the
 * parent page. The trajectory chart fetches its own actuals/forecast series
 * because that endpoint already pre-aggregates Revenue/GP/NP per month.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { FinancialForecast, PLLine } from '../types'
import type { ForecastAssumptions } from './wizard-v4/types/assumptions'
import {
  generateFiscalMonthKeys,
  getExpectedLastActualIndex,
  getFiscalMonthLabels,
  getFiscalMonthLabelsWithYear,
  getFiscalYearEndDate,
} from '@/lib/utils/fiscal-year-utils'
import { getCurrentFiscalYear } from '../utils/fiscal-year'

// ─────────────────────────────────────────────────────────────────────────────
// FY mode — determines copy / visuals per selected FY tab
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `prior`   — selected FY ended before current FY → show finals / retrospective copy
 * `current` — selected FY === current FY          → today's logic (variance vs plan)
 * `future`  — selected FY > current FY            → show plan-only copy, no judgment
 */
type FYMode = 'prior' | 'current' | 'future'

function resolveFYMode(selectedFY: number, yearStartMonth: number): FYMode {
  const currentFY = getCurrentFiscalYear(yearStartMonth)
  if (selectedFY < currentFY) return 'prior'
  if (selectedFY > currentFY) return 'future'
  return 'current'
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ForecastOverviewProps {
  forecast: FinancialForecast
  plLines: PLLine[]
  assumptions: ForecastAssumptions | null
  /** Selected fiscal year (defaults to forecast.fiscal_year). */
  fiscalYear: number
  /** Year-start month (1–12), defaults to 7 (AU FY). */
  yearStartMonth?: number
  /** business_id used by dashboard-actuals API (dual-ID safe upstream). */
  businessId: string
  /** Switch to a different forecast tab — provided by parent page. */
  onSwitchTab: (tab: 'pl' | 'assumptions' | 'versions') => void
  /** Open the wizard / forecast selector. */
  onEditPlan: () => void
  /**
   * True when plLines are YTD actuals + per-line projections (no user-built
   * forecast saved). Used to switch labels from "Plan / Variance" to
   * "Estimated" semantics and suppress vs-plan widgets that have no plan
   * to compare against.
   */
  isEstimatedMode?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Category classification (mirrors /api/forecast/dashboard-actuals)
// ─────────────────────────────────────────────────────────────────────────────

const REVENUE_CATEGORIES = ['revenue', 'trading revenue', 'other revenue']
const COGS_CATEGORIES = ['cost of sales', 'cogs', 'direct costs', 'cost of goods sold']
// Team / wages haystack — drives both the Monthly P&L "Team" row and the
// Wages % scorecard card. Includes the full team-cost taxonomy: wages/salary,
// statutory on-costs (super, payroll tax, workcover), and variable comp
// (bonus, commission, contractor) so "team cost ratio" lines up with what
// Matt thinks of as people-cost.
const TEAM_HINTS = [
  'wages', 'salary', 'salaries', 'payroll', 'super', 'superannuation',
  'team', 'employee', 'workcover', "worker's comp", 'workers comp',
  'bonus', 'commission', 'contractor',
]
const SUBS_HINTS = ['subscription', 'software', 'saas', 'licence', 'license']

function isRevenue(line: Pick<PLLine, 'category' | 'account_type'>): boolean {
  const t = line.account_type?.toLowerCase()
  // Phase 65: prior-FY actuals from xero_pl_lines carry account_type but no
  // category. 'other_income' belongs above the bottom line (Total Income in
  // Xero) so it joins the revenue bucket here — otherwise it leaks into
  // OpEx and silently *reduces* Net Profit.
  if (t === 'revenue' || t === 'other_income') return true
  if (!line.category) return false
  return REVENUE_CATEGORIES.includes(line.category.toLowerCase())
}

function isCOGS(line: Pick<PLLine, 'category' | 'account_type'>): boolean {
  // Phase 65: same root cause as isRevenue — actuals-only rows lack
  // category. Fall back to account_type so COGS doesn't leak into OpEx
  // (which collapses Gross Profit to Revenue).
  if (line.account_type?.toLowerCase() === 'cogs') return true
  if (!line.category) return false
  return COGS_CATEGORIES.includes(line.category.toLowerCase())
}

function isOpEx(line: Pick<PLLine, 'category' | 'account_type'>): boolean {
  if (isRevenue(line) || isCOGS(line)) return false
  const cat = (line.category || '').toLowerCase()
  // Treat anything that isn't classed as revenue/COGS as OpEx for this tab
  if (cat.includes('other income')) return false
  return true
}

type RowGroup = 'team' | 'opex' | 'subs' | 'other'

function classifyOpExLine(line: PLLine): RowGroup {
  const haystack = `${line.account_name || ''} ${line.category || ''} ${line.subcategory || ''}`.toLowerCase()
  if (TEAM_HINTS.some((h) => haystack.includes(h))) return 'team'
  if (SUBS_HINTS.some((h) => haystack.includes(h))) return 'subs'
  if (isOpEx(line)) return 'opex'
  return 'other'
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation helpers
// ─────────────────────────────────────────────────────────────────────────────

interface MonthlyTotals {
  revenue: number[]
  cogs: number[]
  grossProfit: number[]
  team: number[]
  opex: number[]
  subs: number[]
  netProfit: number[]
  /**
   * Per-category monthly plan = sum of forecast_months across each line in
   * that category. Used for variance highlighting on the monthly trend table.
   */
  planCogs: number[]
  planTeam: number[]
  planOpex: number[]
  planSubs: number[]
  /**
   * Index of the last month treated as actual on the dashboard.
   *
   * This is the MAX of:
   *   - dataLastActualIndex — last month with non-zero actual_months data
   *   - expectedLastActualIndex — last month whose calendar month-end has passed
   *
   * Using the calendar floor means April shows as actual on May 10 even if
   * Xero hasn't synced yet (the row will read $0 and `staleSyncMonths` lists
   * the gap so the footer can prompt the user to re-sync).
   */
  lastActualIndex: number
  /** Months between dataLastActualIndex+1 and expectedLastActualIndex (i.e. expected-actual but missing data). */
  staleSyncMonths: number[]
  /** Last month-with-data index — kept for consumers that need the data-only signal (KPI strip "this month"). */
  dataLastActualIndex: number
}

function buildMonthlyTotals(
  plLines: PLLine[],
  monthKeys: readonly string[],
  expectedLastActualIndex: number = -1,
): MonthlyTotals {
  const blank = () => Array<number>(monthKeys.length).fill(0)
  const revenue = blank()
  const cogs = blank()
  const team = blank()
  const opex = blank()
  const subs = blank()
  const planCogs = blank()
  const planTeam = blank()
  const planOpex = blank()
  const planSubs = blank()
  const hasActuals = Array<boolean>(monthKeys.length).fill(false)

  for (const line of plLines) {
    const actualMonths = (line.actual_months || {}) as Record<string, number>
    const forecastMonths = (line.forecast_months || {}) as Record<string, number>
    const opexGroup = isOpEx(line) ? classifyOpExLine(line) : null

    monthKeys.forEach((key, i) => {
      const a = Number(actualMonths[key]) || 0
      const f = Number(forecastMonths[key]) || 0
      // Prefer actual when present; fall back to forecast for the projection bucket
      const value = a !== 0 ? a : f
      if (a !== 0) hasActuals[i] = true

      // Per-category monthly plan (forecast_months only — that's the plan)
      if (f !== 0) {
        if (isCOGS(line)) {
          planCogs[i] += f
        } else if (opexGroup === 'team') {
          planTeam[i] += f
        } else if (opexGroup === 'subs') {
          planSubs[i] += f
        } else if (opexGroup === 'opex') {
          planOpex[i] += f
        }
      }

      if (value === 0) return

      if (isRevenue(line)) {
        revenue[i] += value
      } else if (isCOGS(line)) {
        cogs[i] += value
      } else if (isOpEx(line)) {
        if (opexGroup === 'team') team[i] += value
        else if (opexGroup === 'subs') subs[i] += value
        else opex[i] += value
      }
    })
  }

  const grossProfit = revenue.map((r, i) => r - cogs[i])
  const netProfit = grossProfit.map((gp, i) => gp - team[i] - opex[i] - subs[i])

  // The data-driven last-actual index is the highest index that had any actuals
  let dataLastActualIndex = -1
  for (let i = hasActuals.length - 1; i >= 0; i -= 1) {
    if (hasActuals[i]) {
      dataLastActualIndex = i
      break
    }
  }

  // Effective cutoff = max(data, calendar). On May 10 with no April sync,
  // dataLastActualIndex=8 (Mar) but expectedLastActualIndex=9 (Apr) → 9.
  // The April column will render zeros (matching the missing data) but the
  // footer surfaces "Apr 26 expected but not yet synced" to the operator.
  const lastActualIndex = Math.max(dataLastActualIndex, expectedLastActualIndex)

  // Months that should be actual by calendar but lack any data → sync gap.
  const staleSyncMonths: number[] = []
  if (expectedLastActualIndex > dataLastActualIndex) {
    for (let i = dataLastActualIndex + 1; i <= expectedLastActualIndex; i += 1) {
      staleSyncMonths.push(i)
    }
  }

  return {
    revenue,
    cogs,
    grossProfit,
    team,
    opex,
    subs,
    netProfit,
    planCogs,
    planTeam,
    planOpex,
    planSubs,
    lastActualIndex,
    staleSyncMonths,
    dataLastActualIndex,
  }
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers (kept compatible with the prototype look)
// ─────────────────────────────────────────────────────────────────────────────

function fmtMoney(n: number, opts: { compact?: boolean; signed?: boolean } = {}): string {
  const { compact = false, signed = false } = opts
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  let body: string
  if (compact && abs >= 1000) {
    if (abs >= 1_000_000) {
      body = `$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
    } else {
      body = `$${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`
    }
  } else {
    body = `$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }
  if (signed) return n >= 0 ? `+${body}` : `−${body}`
  return n < 0 ? `−${body}` : body
}

function fmtCellMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) {
    return `${n < 0 ? '−' : ''}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  }
  if (abs >= 1000) {
    return `${n < 0 ? '−' : ''}$${(abs / 1000).toFixed(abs < 10_000 ? 1 : 0)}k`
  }
  return `${n < 0 ? '−' : ''}$${Math.round(abs)}`
}

type Status = 'ok' | 'watch' | 'behind'
function statusFromVariance(actualPct: number): Status {
  if (!Number.isFinite(actualPct)) return 'watch'
  if (actualPct >= 0.98) return 'ok'
  if (actualPct >= 0.92) return 'watch'
  return 'behind'
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ForecastOverview({
  forecast,
  plLines,
  assumptions,
  fiscalYear,
  yearStartMonth = 7,
  businessId,
  onSwitchTab,
  onEditPlan,
  isEstimatedMode = false,
}: ForecastOverviewProps) {
  const monthKeys = useMemo(
    () => generateFiscalMonthKeys(fiscalYear, yearStartMonth),
    [fiscalYear, yearStartMonth],
  )
  const monthLabels = useMemo(
    () => getFiscalMonthLabels(yearStartMonth),
    [yearStartMonth],
  )
  // Year-suffixed labels (e.g. "Jul 25" / "Jun 26") for the monthly trend
  // headers and the trajectory chart x-axis. Bare-month labels are kept for
  // the Insights card where the surrounding sentence already implies the year.
  const monthLabelsWithYear = useMemo(
    () => getFiscalMonthLabelsWithYear(fiscalYear, yearStartMonth),
    [fiscalYear, yearStartMonth],
  )
  // Calendar floor: April 2026 should show as actual on May 10 even if Xero
  // hasn't synced yet — we surface the gap via `staleSyncMonths` instead of
  // misclassifying an already-closed month as forecast.
  const expectedLastActualIndex = useMemo(
    () => getExpectedLastActualIndex(fiscalYear, yearStartMonth),
    [fiscalYear, yearStartMonth],
  )

  const totals = useMemo(
    () => buildMonthlyTotals(plLines, monthKeys, expectedLastActualIndex),
    [plLines, monthKeys, expectedLastActualIndex],
  )

  // Per-FY mode — drives copy / traffic-light visibility for KPI strip,
  // scorecard, and insights. Computed once per fiscalYear/yearStartMonth pair.
  const fyMode = useMemo<FYMode>(
    () => resolveFYMode(fiscalYear, yearStartMonth),
    [fiscalYear, yearStartMonth],
  )

  // Last-edit timestamp surfaces in the future-FY insights message
  // ("Forecast based on assumptions set in {date}.").
  const lastEditedAt = forecast.updated_at ?? null

  // Plan targets — pull from wizard assumptions if available, fall back to forecast
  const revenuePlan =
    assumptions?.goals?.year1?.revenue ?? forecast.revenue_goal ?? sum(totals.revenue)
  const grossPlan =
    assumptions?.goals?.year1?.grossProfitPct != null && revenuePlan > 0
      ? Math.round((assumptions.goals.year1.grossProfitPct / 100) * revenuePlan)
      : forecast.gross_profit_goal ?? sum(totals.grossProfit)
  const netPlan =
    assumptions?.goals?.year1?.netProfitPct != null && revenuePlan > 0
      ? Math.round((assumptions.goals.year1.netProfitPct / 100) * revenuePlan)
      : forecast.net_profit_goal ?? sum(totals.netProfit)

  // Phase 58.3 — pull live cash balance from Xero. The Cash KPI card renders
  // a "—" placeholder until this resolves (or stays placeholder if the tenant
  // has no bank accounts / no Xero connection). Errors are intentionally
  // swallowed → cash card simply stays in placeholder state, never blocks
  // the rest of the dashboard.
  const [cashPosition, setCashPosition] = useState<number | null>(null)
  const [cashAsOf, setCashAsOf] = useState<string | null>(null)
  const [cashLoading, setCashLoading] = useState(true)
  const [cashUnavailable, setCashUnavailable] = useState(false)

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    setCashLoading(true)
    setCashUnavailable(false)

    // Past-FY view → ask for cash AS OF the last day of that FY (30 June
    // for an AU FY25, etc.). Current and future FY keep today's balance.
    const url = new URL('/api/Xero/balance-sheet', window.location.origin)
    url.searchParams.set('business_id', businessId)
    url.searchParams.set('cash_only', 'true')
    if (fyMode === 'prior') {
      const fyEnd = getFiscalYearEndDate(fiscalYear, yearStartMonth)
      const asOf = `${fyEnd.getFullYear()}-${String(fyEnd.getMonth() + 1).padStart(2, '0')}-${String(fyEnd.getDate()).padStart(2, '0')}`
      url.searchParams.set('as_of', asOf)
    }
    fetch(url.toString())
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as { cash: number | null; currency: string; as_of: string }
      })
      .then((json) => {
        if (cancelled) return
        setCashPosition(json.cash)
        setCashAsOf(json.as_of ?? null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.warn('[ForecastOverview] cash position fetch failed', err)
        setCashUnavailable(true)
      })
      .finally(() => {
        if (!cancelled) setCashLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [businessId, fyMode, fiscalYear, yearStartMonth])

  return (
    <div className="space-y-6">
      {/* Estimated-mode banner — visible reminder that the totals/charts
          below are YTD actuals + per-line projections (prior-FY seasonality),
          not a confirmed plan. CTA opens the wizard so the operator can
          replace the estimate with a real forecast. */}
      {isEstimatedMode && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900">
              Showing estimated FY{fiscalYear.toString().slice(-2)} — YTD actuals + projected remaining months
            </p>
            <p className="text-xs text-blue-800 mt-0.5">
              No forecast saved for this year yet. Remaining months are estimated per line using prior-FY seasonality (or last-3-month average for new lines). Build a forecast to plan precisely.
            </p>
          </div>
          <button
            type="button"
            onClick={onEditPlan}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            Build forecast
          </button>
        </div>
      )}
      <KpiStrip
        totals={totals}
        revenuePlan={revenuePlan}
        grossPlan={grossPlan}
        netPlan={netPlan}
        cashPosition={cashPosition}
        cashAsOf={cashAsOf}
        cashLoading={cashLoading}
        cashUnavailable={cashUnavailable}
        fyMode={fyMode}
      />
      <TrajectoryCard
        businessId={businessId}
        fiscalYear={fiscalYear}
        yearStartMonth={yearStartMonth}
        monthLabels={monthLabelsWithYear}
        revenuePlan={revenuePlan}
        grossPlan={grossPlan}
        netPlan={netPlan}
      />
      <MonthlyTrendCard
        totals={totals}
        monthLabels={monthLabelsWithYear}
        revenuePlan={revenuePlan}
        grossPlan={grossPlan}
        netPlan={netPlan}
        onOpenPL={() => onSwitchTab('pl')}
      />
      <ScorecardCard
        plLines={plLines}
        totals={totals}
        fiscalYear={fiscalYear}
        yearStartMonth={yearStartMonth}
        assumptions={assumptions}
        fyMode={fyMode}
      />
      <InsightsCard
        plLines={plLines}
        totals={totals}
        monthLabels={monthLabels}
        fiscalYear={fiscalYear}
        yearStartMonth={yearStartMonth}
        revenuePlan={revenuePlan}
        grossPlan={grossPlan}
        netPlan={netPlan}
        assumptions={assumptions}
        fyMode={fyMode}
        lastEditedAt={lastEditedAt}
      />
      <FooterLinks
        onEditPlan={onEditPlan}
        onOpenPL={() => onSwitchTab('pl')}
        onOpenVersions={() => onSwitchTab('versions')}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — KPI strip
// ─────────────────────────────────────────────────────────────────────────────

interface KpiStripProps {
  totals: MonthlyTotals
  revenuePlan: number
  grossPlan: number
  netPlan: number
  /** Live Xero bank balance, null when unavailable / no bank accounts. */
  cashPosition: number | null
  cashAsOf: string | null
  cashLoading: boolean
  /** True when the BS endpoint errored (auth, no connection, etc). */
  cashUnavailable: boolean
  /** Selected FY relationship to today — drives copy & status pill visibility. */
  fyMode: FYMode
}

function KpiStrip({
  totals,
  revenuePlan,
  grossPlan,
  netPlan,
  cashPosition,
  cashAsOf,
  cashLoading,
  cashUnavailable,
  fyMode,
}: KpiStripProps) {
  // KPI strip uses the data-driven cutoff (NOT the calendar floor) for YTD and
  // "this month" — including stale-sync months would show $0 as "this month"
  // and understate YTD totals. The calendar-floor lastActualIndex is reserved
  // for the monthly trend table / trajectory chart where the column label
  // ("Apr 26") needs to read as actual even when data hasn't synced yet.
  const dataIdx = totals.dataLastActualIndex
  const monthsElapsed = dataIdx + 1 // number of months with actuals so far
  const ytdProrate = (annualPlan: number) =>
    monthsElapsed > 0 ? Math.round((annualPlan / 12) * monthsElapsed) : 0

  // YTD = sum of actual months only (slice up to dataIdx inclusive)
  const ytdSlice = (xs: number[]) =>
    monthsElapsed > 0 ? sum(xs.slice(0, monthsElapsed)) : 0

  // Full-year forecast = actuals YTD + forecast for remaining months
  const yearTotal = (xs: number[]) => sum(xs)

  // Sparkline = trailing 6 months ending at the latest known month
  const sparkline = (xs: number[]) => {
    const end = monthsElapsed > 0 ? monthsElapsed : xs.length
    return xs.slice(Math.max(0, end - 6), Math.max(end, 1))
  }

  // "This month" = latest actual month, or first forecast month if no actuals yet
  const thisMonthIdx = dataIdx >= 0 ? dataIdx : 0
  const thisMonth = (xs: number[]) => xs[thisMonthIdx] || 0

  // Last 6 actual months for prior-FY sparklines (use full series since the
  // year is closed; sparkline() above clips to thisMonthIdx which collapses
  // to the year-end for prior FY).
  const sparklinePriorFY = (xs: number[]) => xs.slice(Math.max(0, xs.length - 6))

  // Future-FY sparklines = the plan trajectory across the 12 months. Useful
  // to show whether the plan is flat / front-loaded / ramping.
  const sparklineFuture = (xs: number[]) => xs.slice(0, 12)

  /**
   * Build a KPI card for Revenue / GP / NP, adapted per fyMode:
   *   - prior   → "Final" pill, year-end actual is the big number
   *   - current → today's logic (this-month big number, YTD vs prorated plan)
   *   - future  → "Plan" pill, monthly plan big number, plan-only sub-rows
   */
  const buildKpiCard = (
    label: string,
    series: number[],
    annualPlan: number,
    accent: 'navy' | 'teal' | 'orange',
  ): KpiCardProps => {
    const yearEnd = yearTotal(series)
    if (fyMode === 'prior') {
      return {
        label,
        accent,
        kind: 'prior',
        bigNumber: yearEnd,
        sparkline: sparklinePriorFY(series),
        actualFinal: yearEnd,
        plannedFinal: annualPlan,
      }
    }
    if (fyMode === 'future') {
      // Annualised plan: the most reliable signal is annualPlan / 12.
      const monthlyPlan = annualPlan > 0 ? annualPlan / 12 : 0
      return {
        label,
        accent,
        kind: 'future',
        bigNumber: monthlyPlan,
        sparkline: sparklineFuture(series),
        annualPlan,
      }
    }
    // current
    return {
      label,
      accent,
      kind: 'current',
      thisMonth: thisMonth(series),
      sparkline: sparkline(series),
      ytd: ytdSlice(series),
      ytdPlanProrated: ytdProrate(annualPlan),
      yearEnd,
      yearEndPlan: annualPlan,
    }
  }

  const cards: KpiCardProps[] = [
    buildKpiCard('Revenue', totals.revenue, revenuePlan, 'navy'),
    buildKpiCard('Gross Profit', totals.grossProfit, grossPlan, 'teal'),
    buildKpiCard('Net Profit', totals.netProfit, netPlan, 'orange'),
    {
      label: 'Cash Position',
      kind: 'cash',
      accent: 'navy',
      cashPosition,
      cashAsOf,
      cashLoading,
      cashUnavailable,
      fyMode,
    },
  ]

  return (
    <section
      aria-label="Key performance indicators"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {cards.map((c) => <KpiCard key={c.label} {...c} />)}
    </section>
  )
}

type KpiCardProps =
  | {
      kind: 'current'
      label: string
      thisMonth: number
      sparkline: number[]
      ytd: number
      ytdPlanProrated: number
      yearEnd: number
      yearEndPlan: number
      accent: 'navy' | 'teal' | 'orange'
    }
  | {
      kind: 'prior'
      label: string
      bigNumber: number
      sparkline: number[]
      actualFinal: number
      plannedFinal: number
      accent: 'navy' | 'teal' | 'orange'
    }
  | {
      kind: 'future'
      label: string
      bigNumber: number
      sparkline: number[]
      annualPlan: number
      accent: 'navy' | 'teal' | 'orange'
    }
  | {
      kind: 'cash'
      label: string
      accent: 'navy' | 'teal' | 'orange'
      cashPosition: number | null
      cashAsOf: string | null
      cashLoading: boolean
      cashUnavailable: boolean
      fyMode: FYMode
    }

const ACCENT_STROKE: Record<'navy' | 'teal' | 'orange', string> = {
  navy: '#1e3a8a',
  teal: '#0f766e',
  orange: '#c2410c',
}
const ACCENT_FILL: Record<'navy' | 'teal' | 'orange', string> = {
  navy: 'rgba(30, 58, 138, 0.10)',
  teal: 'rgba(15, 118, 110, 0.10)',
  orange: 'rgba(194, 65, 12, 0.10)',
}

function KpiCard(props: KpiCardProps) {
  if (props.kind === 'cash') return <KpiCashCard {...props} />
  if (props.kind === 'prior') return <KpiPriorCard {...props} />
  if (props.kind === 'future') return <KpiFutureCard {...props} />
  return <KpiCurrentCard {...props} />
}

/** Shared neutral "Final" pill for prior FY (the year is closed; no judgment). */
function FinalPill() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
      Final
    </span>
  )
}

/** Shared neutral "Plan" pill for future FY (no actuals yet). */
function PlanPill() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
      Plan
    </span>
  )
}

function KpiCurrentCard(props: Extract<KpiCardProps, { kind: 'current' }>) {
  const { label, thisMonth, sparkline, ytd, ytdPlanProrated, yearEnd, yearEndPlan, accent } = props
  const ytdPct = ytdPlanProrated > 0 ? ytd / ytdPlanProrated : 1
  const yearEndDelta = yearEnd - yearEndPlan
  const status = statusFromVariance(ytdPct)
  const Pill = STATUS_PILL[status]

  return (
    <article className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3.5">
      <header className="flex items-start justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
          {label}
        </span>
        <Pill />
      </header>

      <div>
        <div className="text-3xl font-semibold text-gray-900 tabular-nums leading-none">
          {fmtMoney(thisMonth, { compact: true })}
        </div>
        <div className="mt-1 text-xs text-gray-500">this month</div>
      </div>

      <Sparkline values={sparkline} stroke={ACCENT_STROKE[accent]} fill={ACCENT_FILL[accent]} />

      <dl className="text-xs space-y-1.5 pt-1 border-t border-gray-100 mt-1">
        <div className="flex items-baseline justify-between gap-2 pt-2">
          <dt className="text-gray-500">YTD</dt>
          <dd className="text-gray-700 tabular-nums">
            {fmtMoney(ytd, { compact: true })}
            {ytdPlanProrated > 0 && (
              <>
                <span className="text-gray-400"> of {fmtMoney(ytdPlanProrated, { compact: true })} plan</span>
                <span
                  className={`ml-1 font-medium ${
                    ytdPct >= 1 ? 'text-emerald-600' : ytdPct >= 0.95 ? 'text-amber-600' : 'text-red-600'
                  }`}
                >
                  ({Math.round(ytdPct * 100)}%)
                </span>
              </>
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-gray-500 flex items-center gap-1">
            {yearEndDelta >= 0 ? (
              <TrendingUp className="w-3 h-3 text-emerald-600" />
            ) : (
              <TrendingDown className="w-3 h-3 text-red-600" />
            )}
            Year-end
          </dt>
          <dd className="text-gray-700 tabular-nums">
            {fmtMoney(yearEnd, { compact: true })}
            {yearEndPlan > 0 && (
              <span
                className={`ml-1 font-medium ${
                  yearEndDelta >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                ({fmtMoney(yearEndDelta, { compact: true, signed: true })})
              </span>
            )}
          </dd>
        </div>
      </dl>
    </article>
  )
}

function KpiPriorCard(props: Extract<KpiCardProps, { kind: 'prior' }>) {
  const { label, bigNumber, sparkline, actualFinal, plannedFinal, accent } = props
  const delta = actualFinal - plannedFinal
  const hasPlan = plannedFinal > 0

  return (
    <article className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3.5">
      <header className="flex items-start justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
          {label}
        </span>
        <FinalPill />
      </header>

      <div>
        <div className="text-3xl font-semibold text-gray-900 tabular-nums leading-none">
          {fmtMoney(bigNumber, { compact: true })}
        </div>
        <div className="mt-1 text-xs text-gray-500">Final</div>
      </div>

      <Sparkline values={sparkline} stroke={ACCENT_STROKE[accent]} fill={ACCENT_FILL[accent]} />

      <dl className="text-xs space-y-1.5 pt-1 border-t border-gray-100 mt-1">
        <div className="flex items-baseline justify-between gap-2 pt-2">
          <dt className="text-gray-500">Final vs plan</dt>
          <dd className="text-gray-700 tabular-nums">
            {fmtMoney(actualFinal, { compact: true })}
            {hasPlan && (
              <>
                <span className="text-gray-400"> vs {fmtMoney(plannedFinal, { compact: true })}</span>
                <span
                  className={`ml-1 font-medium ${
                    delta >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  ({fmtMoney(delta, { compact: true, signed: true })})
                </span>
              </>
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-gray-500 flex items-center gap-1">Year-end actual</dt>
          <dd className="text-gray-700 tabular-nums">{fmtMoney(actualFinal, { compact: true })}</dd>
        </div>
      </dl>
    </article>
  )
}

function KpiFutureCard(props: Extract<KpiCardProps, { kind: 'future' }>) {
  const { label, bigNumber, sparkline, annualPlan, accent } = props

  return (
    <article className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3.5">
      <header className="flex items-start justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
          {label}
        </span>
        <PlanPill />
      </header>

      <div>
        <div className="text-3xl font-semibold text-gray-900 tabular-nums leading-none">
          {fmtMoney(bigNumber, { compact: true })}
        </div>
        <div className="mt-1 text-xs text-gray-500">monthly plan</div>
      </div>

      <Sparkline values={sparkline} stroke={ACCENT_STROKE[accent]} fill={ACCENT_FILL[accent]} />

      <dl className="text-xs space-y-1.5 pt-1 border-t border-gray-100 mt-1">
        <div className="flex items-baseline justify-between gap-2 pt-2">
          <dt className="text-gray-500">Annual plan</dt>
          <dd className="text-gray-700 tabular-nums">
            {annualPlan > 0 ? fmtMoney(annualPlan, { compact: true }) : '—'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-gray-500">Year-end target</dt>
          <dd className="text-gray-700 tabular-nums">
            {annualPlan > 0 ? fmtMoney(annualPlan, { compact: true }) : '—'}
          </dd>
        </div>
      </dl>
    </article>
  )
}

function KpiCashCard(props: Extract<KpiCardProps, { kind: 'cash' }>) {
  const { cashPosition, cashAsOf, cashLoading, cashUnavailable, fyMode } = props
  const hasCash = cashPosition != null && Number.isFinite(cashPosition)

  // Future FY: no cash forecast available — render explicit "—" with note.
  // Prior FY: still show the live balance with retrospective copy. The Xero
  // BS endpoint returns "as of today" which is correct context regardless of
  // which FY tab is selected (cash is a balance, not an FY-bound flow).
  const isFuture = fyMode === 'future'

  // Format the as-of date as "as of 7 May 2026" — falls back gracefully
  // when no date string is present.
  const asOfLabel = (() => {
    if (!cashAsOf) return null
    const d = new Date(cashAsOf)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  })()

  const subline =
    fyMode === 'prior' ? 'Cash at year-end' : isFuture ? 'Cash forecast unavailable' : 'Available cash'

  const helperText = isFuture
    ? "Cash position depends on cashflow timing and isn't projected by this model."
    : cashUnavailable
    ? 'Connect Xero to see your live cash position.'
    : !hasCash && !cashLoading
    ? 'No bank accounts found in Xero.'
    : asOfLabel
    ? `Live bank balance from Xero · as of ${asOfLabel}`
    : 'Live bank balance from Xero'

  const showLivePill = !isFuture
  const bigDisplay = isFuture
    ? '—'
    : cashLoading && !hasCash
    ? '…'
    : hasCash
    ? fmtMoney(cashPosition!, { compact: true })
    : '—'

  return (
    <article className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3.5">
      <header className="flex items-start justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
          {props.label}
        </span>
        {showLivePill ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
            <DollarSign className="w-3 h-3" strokeWidth={2.5} />
            Live
          </span>
        ) : (
          <PlanPill />
        )}
      </header>
      <div>
        <div
          className={`text-3xl font-semibold tabular-nums leading-none ${
            hasCash && !isFuture ? 'text-gray-900' : 'text-gray-300'
          }`}
        >
          {bigDisplay}
        </div>
        <div className="mt-1 text-xs text-gray-500">{subline}</div>
      </div>
      <div className="h-9" />
      <p className="text-xs text-gray-500 pt-1 border-t border-gray-100 mt-1 pt-3">
        {helperText}
      </p>
    </article>
  )
}

const STATUS_PILL: Record<Status, () => JSX.Element> = {
  ok: () => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
      <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
      On track
    </span>
  ),
  watch: () => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
      <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
      Watch
    </span>
  ),
  behind: () => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-100">
      <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
      Behind
    </span>
  ),
}

function Sparkline({
  values,
  stroke,
  fill,
  width = 200,
  height = 36,
}: {
  values: number[]
  stroke: string
  fill: string
  width?: number
  height?: number
}) {
  const { path, area } = useMemo(() => {
    const safe = values.length >= 2 ? values : [...values, ...values]
    const min = Math.min(...safe)
    const max = Math.max(...safe)
    const range = max - min || 1
    const stepX = width / (safe.length - 1)
    const points = safe.map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / range) * (height - 4) - 2
      return [x, y] as const
    })
    const path = points
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ')
    const area = `${path} L${width},${height} L0,${height} Z`
    return { path, area }
  }, [values, width, height])

  if (values.length === 0) return <div className="h-9" />

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-9"
      role="img"
      aria-label="Six-month trend"
    >
      <path d={area} fill={fill} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Trajectory chart (wired to /api/forecast/dashboard-actuals)
// ─────────────────────────────────────────────────────────────────────────────

type Metric = 'revenue' | 'gp' | 'np'

const METRIC_STYLE: Record<Metric, { label: string; barColor: string; forecastColor: string; forecastStroke: string }> = {
  revenue: { label: 'Revenue', barColor: '#1e3a8a', forecastColor: '#c7d2fe', forecastStroke: '#6366f1' },
  gp:      { label: 'Gross Profit', barColor: '#0f766e', forecastColor: '#a7f3d0', forecastStroke: '#34d399' },
  np:      { label: 'Net Profit', barColor: '#c2410c', forecastColor: '#fed7aa', forecastStroke: '#fb923c' },
}

interface DashboardActualsMonth {
  month: string
  label: string
  revenueActual: number | null
  revenueForecast: number | null
  gpActual: number | null
  gpForecast: number | null
  npActual: number | null
  npForecast: number | null
}

interface DashboardActualsResponse {
  data: { months: DashboardActualsMonth[]; lastSyncedAt: string | null } | null
  hasData: boolean
}

interface TrajectoryProps {
  businessId: string
  fiscalYear: number
  yearStartMonth: number
  monthLabels: string[]
  revenuePlan: number
  grossPlan: number
  netPlan: number
}

function TrajectoryCard({
  businessId,
  fiscalYear,
  yearStartMonth,
  monthLabels,
  revenuePlan,
  grossPlan,
  netPlan,
}: TrajectoryProps) {
  const [metric, setMetric] = useState<Metric>('revenue')
  const [months, setMonths] = useState<DashboardActualsMonth[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    const url = `/api/forecast/dashboard-actuals?businessId=${encodeURIComponent(
      businessId,
    )}&fiscalYear=${fiscalYear}&yearStartMonth=${yearStartMonth}`

    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as DashboardActualsResponse
      })
      .then((json) => {
        if (cancelled) return
        setMonths(json.data?.months ?? [])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('[ForecastOverview] dashboard-actuals fetch failed', err)
        setError(err instanceof Error ? err.message : 'Failed to load trajectory data')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [businessId, fiscalYear, yearStartMonth])

  const annualPlan = metric === 'revenue' ? revenuePlan : metric === 'gp' ? grossPlan : netPlan
  const planMonthly = annualPlan > 0 ? annualPlan / 12 : 0
  const style = METRIC_STYLE[metric]

  const chartData = useMemo(() => {
    const safeMonths = months ?? []
    return monthLabels.map((label, i) => {
      const row = safeMonths[i]
      const actualVal =
        metric === 'revenue' ? row?.revenueActual : metric === 'gp' ? row?.gpActual : row?.npActual
      const forecastVal =
        metric === 'revenue'
          ? row?.revenueForecast
          : metric === 'gp'
          ? row?.gpForecast
          : row?.npForecast
      const actualNum = actualVal == null ? 0 : actualVal
      const forecastNum = forecastVal == null ? 0 : forecastVal
      // Display value: prefer actual when present
      const isForecast = actualVal == null && forecastVal != null
      return {
        month: label,
        value: actualVal != null ? actualNum : forecastNum,
        isForecast,
      }
    })
  }, [months, monthLabels, metric])

  const yearEnd = sum(chartData.map((r) => r.value))
  const variance = yearEnd - annualPlan
  const summary = annualPlan
    ? variance >= 0
      ? `On current trajectory you'll exceed plan by ${fmtMoney(variance, { compact: true })} for ${style.label.toLowerCase()}.`
      : `On current trajectory you'll miss plan by ${fmtMoney(Math.abs(variance), { compact: true })} for ${style.label.toLowerCase()}.`
    : `Current ${style.label.toLowerCase()} forecast totals ${fmtMoney(yearEnd, { compact: true })}.`

  // Find the "year-end" cell index — last bar with a value
  const yearEndIdx = (() => {
    for (let i = chartData.length - 1; i >= 0; i -= 1) {
      if (chartData[i].value !== 0) return i
    }
    return -1
  })()

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <header className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-navy" />
            Trajectory
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Monthly {style.label.toLowerCase()}{planMonthly > 0 ? ` vs plan (${fmtMoney(planMonthly, { compact: true })}/mo)` : ''}
          </p>
        </div>

        <div role="tablist" aria-label="Metric" className="inline-flex items-center bg-gray-100 rounded-lg p-1">
          {(['revenue', 'gp', 'np'] as Metric[]).map((m) => {
            const active = m === metric
            return (
              <button
                key={m}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {METRIC_STYLE[m].label}
              </button>
            )
          })}
        </div>
      </header>

      {error ? (
        <div className="h-[260px] sm:h-[300px] flex items-center justify-center text-sm text-gray-500">
          Couldn&apos;t load trajectory data — {error}
        </div>
      ) : isLoading && !months ? (
        <div className="h-[260px] sm:h-[300px] flex items-center justify-center text-sm text-gray-400">
          Loading trajectory…
        </div>
      ) : chartData.every((row) => row.value === 0) ? (
        <div className="h-[260px] sm:h-[300px] flex flex-col items-center justify-center text-sm text-gray-500 gap-1">
          <span>No {style.label.toLowerCase()} data for this fiscal year.</span>
          <span className="text-xs text-gray-400">
            Connect Xero or build a forecast for this year to populate the chart.
          </span>
        </div>
      ) : (
        <div className="w-full h-[260px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 28, right: 24, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => fmtMoney(v, { compact: true })}
                width={56}
              />
              <Tooltip
                cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  fontSize: 12,
                  padding: '8px 10px',
                }}
                formatter={(value: number, _n, item) => {
                  const row = item.payload as { isForecast: boolean }
                  return [fmtMoney(value, { compact: true }), row.isForecast ? 'Forecast' : 'Actual']
                }}
              />
              {planMonthly > 0 && (
                <ReferenceLine y={planMonthly} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5}>
                  <Label
                    value={`Plan ${fmtMoney(planMonthly, { compact: true })}/mo`}
                    position="insideTopRight"
                    fill="#64748b"
                    fontSize={11}
                  />
                </ReferenceLine>
              )}
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={42}>
                {chartData.map((row, idx) => (
                  <Cell
                    key={row.month}
                    fill={row.isForecast ? style.forecastColor : style.barColor}
                    stroke={row.isForecast ? style.forecastStroke : 'transparent'}
                    strokeDasharray={row.isForecast ? '3 3' : undefined}
                    strokeWidth={row.isForecast ? 1.5 : 0}
                  >
                    {idx === yearEndIdx && yearEnd !== 0 && (
                      <Label
                        value={`${fmtMoney(yearEnd, { compact: true })} forecast`}
                        position="top"
                        fill={style.forecastStroke}
                        fontSize={11}
                        fontWeight={600}
                      />
                    )}
                  </Cell>
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-4 text-sm sm:text-base text-gray-700 font-medium">{summary}</p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Monthly trend P&L table (wired to forecast_pl_lines via totals)
// ─────────────────────────────────────────────────────────────────────────────

const VARIANCE_TOL_PCT = 0.05

type TableRow = {
  kind: 'header' | 'detail' | 'sub' | 'rule'
  label: string
  values: number[]
  isPct?: boolean
  plan?: number[]
  invertVariance?: boolean
}

interface MonthlyTrendCardProps {
  totals: MonthlyTotals
  monthLabels: string[]
  revenuePlan: number
  grossPlan: number
  netPlan: number
  onOpenPL: () => void
}

function MonthlyTrendCard({
  totals,
  monthLabels,
  revenuePlan,
  grossPlan,
  netPlan,
  onOpenPL,
}: MonthlyTrendCardProps) {
  const lastActualIndex = totals.lastActualIndex
  // Per-month plan = annual plan / 12 (flat), used purely for variance highlighting
  const evenPlan = (annual: number) => Array<number>(12).fill(annual / 12)

  const planRevenueMonthly = revenuePlan > 0 ? evenPlan(revenuePlan) : undefined
  const planGPMonthly = grossPlan > 0 ? evenPlan(grossPlan) : undefined
  const planNPMonthly = netPlan > 0 ? evenPlan(netPlan) : undefined

  const grossMargin = totals.revenue.map((r, i) =>
    r > 0 ? (totals.grossProfit[i] / r) * 100 : 0,
  )
  const netMargin = totals.revenue.map((r, i) =>
    r > 0 ? (totals.netProfit[i] / r) * 100 : 0,
  )

  const rows: TableRow[] = [
    { kind: 'header', label: 'Revenue', values: totals.revenue, plan: planRevenueMonthly },
    { kind: 'sub',    label: 'COGS',    values: totals.cogs, plan: totals.planCogs, invertVariance: true },
    { kind: 'header', label: 'Gross Profit', values: totals.grossProfit, plan: planGPMonthly },
    { kind: 'sub',    label: 'Margin', values: grossMargin, isPct: true },
    { kind: 'rule',   label: '', values: [] },
    { kind: 'detail', label: 'Team',          values: totals.team, plan: totals.planTeam, invertVariance: true },
    { kind: 'detail', label: 'OpEx',          values: totals.opex, plan: totals.planOpex, invertVariance: true },
    { kind: 'detail', label: 'Subscriptions', values: totals.subs, plan: totals.planSubs, invertVariance: true },
    { kind: 'rule',   label: '', values: [] },
    { kind: 'header', label: 'Net Profit',    values: totals.netProfit, plan: planNPMonthly },
    { kind: 'sub',    label: 'Margin',        values: netMargin, isPct: true },
  ]

  return (
    <section className="bg-white border border-gray-200 rounded-xl">
      <header className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 sm:pt-6 pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-brand-navy" />
            Monthly P&amp;L
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Twelve-month trend · cells coloured when variance vs plan exceeds 5%
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
          <LegendDot color="bg-emerald-500" label="Above plan" />
          <LegendDot color="bg-amber-500" label="Under plan" />
          <LegendDot color="bg-gray-300" label="Forecast" outline />
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-y border-gray-200 bg-gray-50/60">
              <th
                scope="col"
                className="text-left font-semibold py-2.5 pl-5 sm:pl-6 pr-3 sticky left-0 bg-gray-50/95 backdrop-blur z-10 min-w-[140px]"
              >
                &nbsp;
              </th>
              {monthLabels.map((m, i) => {
                const isForecastCol = i > lastActualIndex
                return (
                  <th
                    key={`${m}-${i}`}
                    scope="col"
                    className={`text-right font-semibold py-2.5 px-3 tabular-nums whitespace-nowrap ${
                      isForecastCol ? 'bg-indigo-50/40 text-indigo-700' : ''
                    }`}
                  >
                    {m}
                    {isForecastCol ? <span aria-hidden>*</span> : null}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              if (row.kind === 'rule') {
                return (
                  <tr key={`rule-${ri}`}>
                    <td colSpan={13} className="p-0">
                      <div className="border-t border-dashed border-gray-200" />
                    </td>
                  </tr>
                )
              }
              const isHeader = row.kind === 'header'
              const isSub = row.kind === 'sub'
              return (
                <tr
                  key={row.label + ri}
                  className={`border-b border-gray-100 last:border-b-0 ${isHeader ? 'bg-white' : ''}`}
                >
                  <th
                    scope="row"
                    className={`text-left py-2 pl-5 sm:pl-6 pr-3 sticky left-0 bg-white z-10 whitespace-nowrap ${
                      isHeader
                        ? 'font-semibold text-gray-900'
                        : isSub
                        ? 'pl-8 sm:pl-9 text-xs italic text-gray-500 font-normal'
                        : 'pl-7 sm:pl-8 text-gray-700 font-normal'
                    }`}
                  >
                    {row.label}
                  </th>
                  {row.values.map((v, ci) => {
                    const isForecastCol = ci > lastActualIndex
                    const planV = row.plan?.[ci]
                    let varianceClass = ''
                    if (planV !== undefined && !isForecastCol && planV !== 0) {
                      const delta = (v - planV) / planV
                      const above = delta > VARIANCE_TOL_PCT
                      const below = delta < -VARIANCE_TOL_PCT
                      if (row.invertVariance) {
                        // Cost row: actual below plan = good (green), above = bad (amber)
                        if (above) varianceClass = 'text-amber-700 font-medium'
                        else if (below) varianceClass = 'text-emerald-700 font-medium'
                      } else {
                        if (above) varianceClass = 'text-emerald-700 font-medium'
                        else if (below) varianceClass = 'text-amber-700 font-medium'
                      }
                    }
                    return (
                      <td
                        key={ci}
                        className={`text-right tabular-nums py-2 px-3 whitespace-nowrap ${
                          isHeader
                            ? 'font-semibold text-gray-900'
                            : isSub
                            ? 'text-xs italic text-gray-500'
                            : 'text-gray-800'
                        } ${isForecastCol ? 'bg-indigo-50/40 text-indigo-900' : ''} ${varianceClass}`}
                      >
                        {row.isPct ? (v ? `${v.toFixed(0)}%` : '—') : fmtCellMoney(v)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <footer className="px-5 sm:px-6 py-3 text-xs text-gray-500 border-t border-gray-100 flex items-center justify-between gap-3">
        <span>
          {totals.staleSyncMonths.length > 0 ? (
            <span className="text-amber-700">
              ⚠ {totals.staleSyncMonths.map((i) => monthLabels[i]).join(', ')} closed but not yet synced from Xero — sync to populate actuals.
            </span>
          ) : lastActualIndex >= 0 ? (
            `* Months after ${monthLabels[lastActualIndex]} are forecast — earlier columns are actuals from Xero`
          ) : (
            '* All months are forecast — connect Xero to load actuals'
          )}
        </span>
        <button
          type="button"
          onClick={onOpenPL}
          className="hidden sm:inline-flex items-center gap-0.5 text-brand-navy hover:underline font-medium"
        >
          Full P&amp;L
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </footer>
    </section>
  )
}

function LegendDot({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${color} ${outline ? 'ring-1 ring-gray-400 ring-inset bg-transparent' : ''}`}
      />
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — KPI scorecard (Phase 58.2)
//
// Five traffic-light cards computed YTD from forecast_pl_lines:
//   1. YoY Revenue Growth — current FY YTD vs prior FY same-period (target 10%)
//   2. Gross Margin       — current FY YTD GP / Revenue          (target 60%)
//   3. Net Margin         — current FY YTD NP / Revenue          (target 15%)
//   4. OpEx Ratio         — current FY YTD OpEx / Revenue        (target ≤ 18%)
//   5. Wages %            — current FY YTD Team / Revenue        (target ≤ 35%)
//
// Targets default to the values above and are overridable via wizard
// assumptions.goals.year1 (revenue + grossProfitPct + netProfitPct only — no
// dedicated growth / OpEx / wages target lives in the schema yet).
// ─────────────────────────────────────────────────────────────────────────────

const SCORECARD_DEFAULTS = {
  revenueGrowthPct: 10, // %
  grossMarginPct: 60, // %
  netMarginPct: 15, // %
  opexRatioPct: 18, // %  (max — lower is better)
  wagesPct: 35, // %  (max — industry avg, lower is better)
} as const

type ScoreStatus = 'green' | 'amber' | 'red'

interface ScorecardCardProps {
  plLines: PLLine[]
  totals: MonthlyTotals
  fiscalYear: number
  yearStartMonth: number
  assumptions: ForecastAssumptions | null
  fyMode: FYMode
}

/**
 * Build prior-FY same-period revenue from the same plLines, by re-keying the
 * actual_months map with the previous-year keys (e.g. "2024-07" → "2023-07")
 * and summing the months that were "actual" in the current FY (i.e. up to
 * `monthsElapsed`). Returns null if no data exists for the prior period.
 */
function computePriorYearRevenueYTD(
  plLines: PLLine[],
  fiscalYear: number,
  yearStartMonth: number,
  monthsElapsed: number,
): number | null {
  if (monthsElapsed <= 0) return null
  const priorYear = fiscalYear - 1
  const priorKeys = generateFiscalMonthKeys(priorYear, yearStartMonth).slice(0, monthsElapsed)
  let total = 0
  let foundAny = false
  for (const line of plLines) {
    if (!isRevenue(line)) continue
    const am = (line.actual_months || {}) as Record<string, number>
    for (const k of priorKeys) {
      const v = Number(am[k])
      if (Number.isFinite(v) && v !== 0) {
        total += v
        foundAny = true
      }
    }
  }
  return foundAny ? total : null
}

function statusForGrowth(actualPct: number, targetPct: number): ScoreStatus {
  // Green: >= target. Amber: 0% to target-3pt. Red: < 0%.
  if (actualPct >= targetPct) return 'green'
  if (actualPct >= 0) return 'amber'
  return 'red'
}

function statusForMargin(actualPct: number, targetPct: number): ScoreStatus {
  // Green: >= target. Amber: target-2pt..target. Red: < target-2pt.
  if (actualPct >= targetPct) return 'green'
  if (actualPct >= targetPct - 2) return 'amber'
  return 'red'
}

function statusForOpExRatio(actualPct: number, targetPct: number): ScoreStatus {
  // Green: <= target. Amber: target..target+2pt. Red: > target+2pt.
  if (actualPct <= targetPct) return 'green'
  if (actualPct <= targetPct + 2) return 'amber'
  return 'red'
}

function statusForWagesRatio(actualPct: number, targetPct: number): ScoreStatus {
  // Wages tolerance is wider than generic OpEx — payroll moves slowly and
  // industry benchmarks vary. Spec: green ≤target, amber target+1..target+5,
  // red >target+5. Equality at target = green.
  if (actualPct <= targetPct) return 'green'
  if (actualPct <= targetPct + 5) return 'amber'
  return 'red'
}

const STATUS_DOT: Record<ScoreStatus, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

const STATUS_TEXT: Record<ScoreStatus, string> = {
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  red: 'text-red-600',
}

function fmtPct(n: number, opts: { signed?: boolean; digits?: number } = {}): string {
  const { signed = false, digits = 0 } = opts
  if (!Number.isFinite(n)) return '—'
  const body = `${Math.abs(n).toFixed(digits)}%`
  if (signed) return n >= 0 ? `+${body}` : `−${body}`
  return n < 0 ? `−${body}` : body
}

function ScorecardCard({
  plLines,
  totals,
  fiscalYear,
  yearStartMonth,
  assumptions,
  fyMode,
}: ScorecardCardProps) {
  // Window for slicing actuals: prior FY uses the FULL year (final results);
  // current FY uses YTD up to the data cutoff so margins aren't distorted by
  // empty stale-sync months. Future FY ignores actuals entirely (plan only).
  const monthsForActuals =
    fyMode === 'prior' ? totals.revenue.length : totals.dataLastActualIndex + 1

  const sliceActuals = (xs: number[]) =>
    monthsForActuals > 0 ? sum(xs.slice(0, monthsForActuals)) : 0

  const actualRevenue = sliceActuals(totals.revenue)
  const actualGP = sliceActuals(totals.grossProfit)
  const actualNP = sliceActuals(totals.netProfit)
  const actualTeam = sliceActuals(totals.team)
  // OpEx Ratio is a separate KPI from Wages %. Team cost is already shown via
  // Wages % — including it here would double-count it across the two cards
  // (e.g. JDS would read 46% OpEx Ratio when the true non-team operating cost
  // ratio is ~16%). Keep `actualTeam` separate for the Wages % card below.
  const actualOpEx =
    sliceActuals(totals.opex) + sliceActuals(totals.subs)

  // Targets — wizard assumptions override defaults where available
  const grossMarginTarget =
    assumptions?.goals?.year1?.grossProfitPct ?? SCORECARD_DEFAULTS.grossMarginPct
  const netMarginTarget =
    assumptions?.goals?.year1?.netProfitPct ?? SCORECARD_DEFAULTS.netMarginPct
  const opexRatioTarget = SCORECARD_DEFAULTS.opexRatioPct
  const revenueGrowthTarget = SCORECARD_DEFAULTS.revenueGrowthPct
  const wagesTarget = SCORECARD_DEFAULTS.wagesPct

  // Prior-year revenue: for current FY this is "same period last year" (YTD);
  // for prior FY it's full prior year. Future FY skips growth comparison.
  const priorRevForGrowth = useMemo(
    () => computePriorYearRevenueYTD(plLines, fiscalYear, yearStartMonth, monthsForActuals),
    [plLines, fiscalYear, yearStartMonth, monthsForActuals],
  )

  // Current/prior FY use actual numerators; future FY uses plan targets.
  const isFuture = fyMode === 'future'
  const isPrior = fyMode === 'prior'

  const growthPct =
    !isFuture && priorRevForGrowth != null && priorRevForGrowth > 0
      ? ((actualRevenue / priorRevForGrowth) - 1) * 100
      : null

  const grossMarginPct = !isFuture && actualRevenue > 0 ? (actualGP / actualRevenue) * 100 : null
  const netMarginPct = !isFuture && actualRevenue > 0 ? (actualNP / actualRevenue) * 100 : null
  const opexRatioPct = !isFuture && actualRevenue > 0 ? (actualOpEx / actualRevenue) * 100 : null
  // Wages % — same numerator as the Monthly P&L "Team" row; reconciles by
  // construction. Future FY uses plan-only and falls through to the helper text.
  const wagesPct = !isFuture && actualRevenue > 0 ? (actualTeam / actualRevenue) * 100 : null

  // Helper copy adapts to mode. Future FY shows the target as the headline value.
  const periodHelper = (currentText: string, priorText: string) =>
    isPrior ? priorText : currentText

  const cards: ScorecardItem[] = [
    {
      label: 'Revenue Growth',
      // Future FY: show target growth as the value (no actual comparison).
      value: isFuture ? revenueGrowthTarget : growthPct,
      status: isFuture
        ? null
        : growthPct != null
        ? statusForGrowth(growthPct, revenueGrowthTarget)
        : null,
      target: `${revenueGrowthTarget}%`,
      helper: isFuture
        ? 'Plan target'
        : growthPct != null
        ? periodHelper('vs prior year YTD', 'vs prior year final')
        : 'Need prior year data',
      formatter: (v) => fmtPct(v, { signed: !isFuture }),
      hideStatusDot: isFuture,
    },
    {
      label: 'Gross Margin',
      value: isFuture ? grossMarginTarget : grossMarginPct,
      status: isFuture
        ? null
        : grossMarginPct != null
        ? statusForMargin(grossMarginPct, grossMarginTarget)
        : null,
      target: `${grossMarginTarget}%`,
      helper: isFuture
        ? 'Plan target'
        : periodHelper('GP / Revenue YTD', 'GP / Revenue · final'),
      formatter: (v) => fmtPct(v, { digits: isFuture ? 0 : 1 }),
      hideStatusDot: isFuture,
    },
    {
      label: 'Net Margin',
      value: isFuture ? netMarginTarget : netMarginPct,
      status: isFuture
        ? null
        : netMarginPct != null
        ? statusForMargin(netMarginPct, netMarginTarget)
        : null,
      target: `${netMarginTarget}%`,
      helper: isFuture
        ? 'Plan target'
        : periodHelper('NP / Revenue YTD', 'NP / Revenue · final'),
      formatter: (v) => fmtPct(v, { digits: isFuture ? 0 : 1 }),
      hideStatusDot: isFuture,
    },
    {
      label: 'OpEx Ratio',
      value: isFuture ? opexRatioTarget : opexRatioPct,
      status: isFuture
        ? null
        : opexRatioPct != null
        ? statusForOpExRatio(opexRatioPct, opexRatioTarget)
        : null,
      target: `≤ ${opexRatioTarget}%`,
      helper: isFuture
        ? 'Plan target'
        : periodHelper('OpEx / Revenue YTD', 'OpEx / Revenue · final'),
      formatter: (v) => fmtPct(v, { digits: isFuture ? 0 : 1 }),
      hideStatusDot: isFuture,
    },
    {
      label: 'Wages %',
      value: isFuture ? wagesTarget : wagesPct,
      status: isFuture
        ? null
        : wagesPct != null
        ? statusForWagesRatio(wagesPct, wagesTarget)
        : null,
      target: `≤ ${wagesTarget}%`,
      helper: isFuture
        ? 'Plan target (industry avg ~35%)'
        : periodHelper(
            'Total team cost / Revenue (industry avg ~35%)',
            'Total team cost / Revenue · final (industry avg ~35%)',
          ),
      formatter: (v) => fmtPct(v, { digits: 0 }),
      hideStatusDot: isFuture,
    },
  ]

  const subtitle = isFuture
    ? 'Plan targets · no actuals to score yet'
    : isPrior
    ? 'Final results vs your targets · year complete'
    : 'Health check vs your targets · year-to-date'

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-brand-navy" />
            KPI scorecard
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => <ScorecardItemCard key={c.label} {...c} />)}
      </div>
    </section>
  )
}

interface ScorecardItem {
  label: string
  value: number | null
  status: ScoreStatus | null
  target: string
  helper: string
  formatter: (v: number) => string
  /**
   * When true, suppress the traffic-light dot AND render the value in neutral
   * gray. Used for future FY where no judgment can be made yet (the value is
   * the plan target itself, not a measured outcome).
   */
  hideStatusDot?: boolean
}

function ScorecardItemCard({
  label,
  value,
  status,
  target,
  helper,
  formatter,
  hideStatusDot,
}: ScorecardItem) {
  const valueDisplay = value == null ? '—' : formatter(value)
  // Future FY: explicitly neutral so the card reads as informational, not graded.
  const valueColor =
    hideStatusDot || status == null ? 'text-gray-700' : STATUS_TEXT[status]
  return (
    <article className="relative bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2">
      {!hideStatusDot && status != null && (
        <span
          className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`}
          aria-label={`Status: ${status}`}
        />
      )}
      {hideStatusDot && (
        <span
          className="absolute top-3 right-3 inline-flex items-center px-1.5 py-0 rounded-full text-[9px] uppercase tracking-wide font-medium bg-gray-100 text-gray-500 border border-gray-200"
          aria-label="Plan target"
        >
          Plan
        </span>
      )}
      <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
        {label}
      </span>
      <div className={`text-3xl font-semibold tabular-nums leading-none ${valueColor}`}>
        {valueDisplay}
      </div>
      <div className="text-xs text-gray-500">Target: {target}</div>
      <div className="text-[11px] text-gray-400 pt-1 border-t border-gray-100 mt-1">
        {helper}
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Heuristic insights (Phase 58.2)
//
// Evaluates 8 rules against current data and surfaces the top 3 by urgency
// (HIGH > MED > LOW; tie-break by absolute variance). Pure heuristics — no AI.
// ─────────────────────────────────────────────────────────────────────────────

const INSIGHT_VARIANCE_THRESHOLD = 0.05 // 5%

type InsightSeverity = 'positive' | 'warning' | 'neutral'
type InsightUrgency = 'HIGH' | 'MED' | 'LOW'

interface Insight {
  id: string
  text: string
  severity: InsightSeverity
  urgency: InsightUrgency
  /** Absolute variance magnitude — used for tie-breaking within urgency tier. */
  magnitude: number
}

const URGENCY_RANK: Record<InsightUrgency, number> = { HIGH: 3, MED: 2, LOW: 1 }

interface InsightsCardProps {
  plLines: PLLine[]
  totals: MonthlyTotals
  monthLabels: string[]
  fiscalYear: number
  yearStartMonth: number
  revenuePlan: number
  grossPlan: number
  netPlan: number
  assumptions: ForecastAssumptions | null
  fyMode: FYMode
  /** Forecast.updated_at — surfaced in the future-FY informational message. */
  lastEditedAt: string | null
}

/**
 * Determine the strongest revenue month in the actual window.
 * Returns the month label, or null if no actuals.
 */
function strongestActualMonth(values: number[], labels: string[], lastActualIndex: number): string | null {
  if (lastActualIndex < 0) return null
  let best = -Infinity
  let idx = -1
  for (let i = 0; i <= lastActualIndex; i += 1) {
    if (values[i] > best) {
      best = values[i]
      idx = i
    }
  }
  return idx >= 0 ? labels[idx] : null
}

/**
 * Find the largest OpEx variance contributor across team/opex/subs YTD.
 * Returns a friendly category name.
 */
function largestOpExCategory(
  totals: MonthlyTotals,
  monthsElapsed: number,
  opexPlan: number,
): string {
  if (monthsElapsed <= 0) return 'operating costs'
  const slice = (xs: number[]) => sum(xs.slice(0, monthsElapsed))
  const teamYTD = slice(totals.team)
  const opexYTD = slice(totals.opex)
  const subsYTD = slice(totals.subs)
  // Prorated even-split per category isn't reliably known; just pick the
  // largest absolute YTD bucket as the contributor signal.
  const items: Array<{ label: string; value: number }> = [
    { label: 'team costs', value: teamYTD },
    { label: 'general opex', value: opexYTD },
    { label: 'subscriptions', value: subsYTD },
  ]
  items.sort((a, b) => b.value - a.value)
  return items[0]?.label ?? 'operating costs'
}

/**
 * Compute monthly gross-margin pct only for months with revenue, restricted
 * to actual months. Returns the array of margin pcts (0..100).
 */
function actualMonthlyGrossMargins(totals: MonthlyTotals, monthsWindow?: number): number[] {
  const out: number[] = []
  // Use the data cutoff by default: stale-sync months have $0 revenue and
  // would falsely appear as a 0% margin month. Callers (e.g. prior FY
  // insights) can override the window to include the full closed year.
  const last =
    monthsWindow != null ? monthsWindow - 1 : totals.dataLastActualIndex
  for (let i = 0; i <= last; i += 1) {
    const r = totals.revenue[i]
    if (r > 0) out.push((totals.grossProfit[i] / r) * 100)
  }
  return out
}

/**
 * Find a single line item running >20% over its own forecast YTD.
 * Returns { name, actualYTD, plannedYTD, variancePct } or null.
 */
function findCategoryOverBudget(
  plLines: PLLine[],
  fiscalYear: number,
  yearStartMonth: number,
  monthsElapsed: number,
): { name: string; actual: number; planned: number; variancePct: number } | null {
  if (monthsElapsed <= 0) return null
  const monthKeys = generateFiscalMonthKeys(fiscalYear, yearStartMonth).slice(0, monthsElapsed)
  let worst: { name: string; actual: number; planned: number; variancePct: number } | null = null
  for (const line of plLines) {
    // Only consider expense-side lines
    if (isRevenue(line) || isCOGS(line)) continue
    if (!isOpEx(line)) continue
    const am = (line.actual_months || {}) as Record<string, number>
    const fm = (line.forecast_months || {}) as Record<string, number>
    let actual = 0
    let planned = 0
    for (const k of monthKeys) {
      actual += Number(am[k]) || 0
      planned += Number(fm[k]) || 0
    }
    if (planned <= 0 || actual <= 0) continue
    const variancePct = ((actual - planned) / planned) * 100
    if (variancePct <= 20) continue
    if (!worst || variancePct > worst.variancePct) {
      worst = {
        name: line.account_name || line.subcategory || line.category || 'a category',
        actual,
        planned,
        variancePct,
      }
    }
  }
  return worst
}

function generateInsights({
  plLines,
  totals,
  monthLabels,
  fiscalYear,
  yearStartMonth,
  revenuePlan,
  grossPlan,
  netPlan,
  assumptions,
  fyMode,
}: InsightsCardProps): Insight[] {
  const insights: Insight[] = []
  // Window: prior FY uses the full year (final results); current FY uses the
  // data cutoff so we don't warn "rev below plan" just because Apr hasn't
  // synced yet. Future FY is handled separately by the calling component.
  const monthsElapsed =
    fyMode === 'prior' ? totals.revenue.length : totals.dataLastActualIndex + 1
  if (monthsElapsed <= 0) return insights // no actuals → no insights
  const isPrior = fyMode === 'prior'

  const ytdSlice = (xs: number[]) => sum(xs.slice(0, monthsElapsed))
  const proratedPlan = (annual: number) =>
    annual > 0 ? (annual / 12) * monthsElapsed : 0

  const ytdRevenue = ytdSlice(totals.revenue)
  const ytdNP = ytdSlice(totals.netProfit)
  const ytdOpEx =
    ytdSlice(totals.team) + ytdSlice(totals.opex) + ytdSlice(totals.subs)

  const planRevYTD = proratedPlan(revenuePlan)
  const opexAnnualPlan =
    revenuePlan > 0 && grossPlan > 0 && netPlan != null
      ? Math.max(0, grossPlan - netPlan) // GP − NP = OpEx (excludes COGS)
      : 0
  const planOpExYTD = proratedPlan(opexAnnualPlan)

  // For prior FY, the "prorated plan" is just the full annual plan (year is done).
  const planRevWindow = isPrior ? Math.max(planRevYTD, revenuePlan) : planRevYTD
  const planOpExWindow = isPrior ? Math.max(planOpExYTD, opexAnnualPlan) : planOpExYTD

  // ── Rule 1 / 2 — Revenue vs plan (YTD or full-year if prior) ───────────────
  if (planRevWindow > 0) {
    const variance = ytdRevenue - planRevWindow
    const variancePct = variance / planRevWindow
    if (variancePct > INSIGHT_VARIANCE_THRESHOLD) {
      const strongest = strongestActualMonth(totals.revenue, monthLabels, monthsElapsed - 1)
      insights.push({
        id: 'rev-above',
        text: isPrior
          ? `Year ended ${fmtMoney(variance, { compact: true })} above plan${strongest ? `, driven by strong ${strongest} performance` : ''}.`
          : `Revenue is ${fmtMoney(variance, { compact: true })} above plan YTD${strongest ? `, driven by ${strongest} performance` : ''}.`,
        severity: 'positive',
        urgency: 'LOW',
        magnitude: Math.abs(variance),
      })
    } else if (variancePct < -INSIGHT_VARIANCE_THRESHOLD) {
      const gap = Math.abs(variance)
      insights.push({
        id: 'rev-below',
        text: isPrior
          ? `Year ended ${fmtMoney(gap, { compact: true })} below plan.`
          : `Revenue is ${fmtMoney(gap, { compact: true })} below plan — focus on closing the ${fmtMoney(gap, { compact: true })} gap by year-end.`,
        severity: 'warning',
        urgency: 'HIGH',
        magnitude: gap,
      })
    }
  }

  // ── Rule 3 — OpEx over budget (YTD or full-year if prior) ──────────────────
  if (planOpExWindow > 0) {
    const variance = ytdOpEx - planOpExWindow
    const variancePct = variance / planOpExWindow
    if (variancePct > INSIGHT_VARIANCE_THRESHOLD) {
      const contributor = largestOpExCategory(totals, monthsElapsed, planOpExWindow)
      insights.push({
        id: 'opex-over',
        text: isPrior
          ? `Operating costs ended ${fmtMoney(variance, { compact: true })} over budget — ${contributor} was the biggest contributor.`
          : `Operating costs are ${fmtMoney(variance, { compact: true })} over budget — ${contributor} is the biggest contributor.`,
        severity: 'warning',
        urgency: 'MED',
        magnitude: Math.abs(variance),
      })
    }
  }

  // ── Rule 4 / 5 — Gross margin trend (last 3mo vs prior 6mo avg) ───────────
  // For prior FY this is the trend of the closed year ("ended strong" signal).
  const margins = actualMonthlyGrossMargins(totals, monthsElapsed)
  if (margins.length >= 4) {
    const last3 = margins.slice(-3)
    const prior6 = margins.slice(Math.max(0, margins.length - 9), margins.length - 3)
    if (prior6.length > 0) {
      const last3Avg = sum(last3) / last3.length
      const prior6Avg = sum(prior6) / prior6.length
      const delta = last3Avg - prior6Avg
      if (delta < -1) {
        insights.push({
          id: 'gm-down',
          text: isPrior
            ? `Gross margin slipped ${Math.abs(delta).toFixed(1)}pt over the final 3 months of the year.`
            : `Gross margin has slipped ${Math.abs(delta).toFixed(1)}pt over the last 3 months — review pricing or COGS.`,
          severity: 'warning',
          urgency: 'MED',
          magnitude: Math.abs(delta),
        })
      } else if (delta > 1) {
        insights.push({
          id: 'gm-up',
          text: isPrior
            ? `Gross margin improved ${delta.toFixed(1)}pt over the final 3 months — strong finish.`
            : `Gross margin has improved ${delta.toFixed(1)}pt over the last 3 months — keep doing what's working.`,
          severity: 'positive',
          urgency: 'LOW',
          magnitude: delta,
        })
      }
    }
  }

  // ── Rule 6 — Net margin (above target) ─────────────────────────────────────
  if (ytdRevenue > 0) {
    const target = assumptions?.goals?.year1?.netProfitPct ?? SCORECARD_DEFAULTS.netMarginPct
    const current = (ytdNP / ytdRevenue) * 100
    if (current > target) {
      insights.push({
        id: 'np-above',
        text: isPrior
          ? `Final net margin: ${current.toFixed(1)}% (above ${target}% target) — strong profitability.`
          : `Net margin is ${current.toFixed(1)}% (above ${target}% target) — strong profitability.`,
        severity: 'positive',
        urgency: 'LOW',
        magnitude: current - target,
      })
    }
  }

  // ── Rule 7 — Year-end forecast vs plan (current FY only) ──────────────────
  // Skip for prior FY — Rule 1/2 already covered the final-vs-plan story.
  if (!isPrior && revenuePlan > 0) {
    const yearEndForecast = sum(totals.revenue) // actuals + forecasted
    const variance = yearEndForecast - revenuePlan
    const variancePct = variance / revenuePlan
    if (Math.abs(variancePct) > INSIGHT_VARIANCE_THRESHOLD) {
      const direction = variance >= 0 ? 'above' : 'below'
      insights.push({
        id: 'fy-forecast',
        text: `Forecast year-end revenue is ${fmtMoney(Math.abs(variance), { compact: true })} ${direction} plan (${fmtMoney(yearEndForecast, { compact: true })} vs ${fmtMoney(revenuePlan, { compact: true })}).`,
        severity: variance >= 0 ? 'neutral' : 'warning',
        urgency: variance < 0 ? 'HIGH' : 'LOW',
        magnitude: Math.abs(variance),
      })
    }
  }

  // ── Rule 8 — Single category over budget ──────────────────────────────────
  const overBudgetLine = findCategoryOverBudget(plLines, fiscalYear, yearStartMonth, monthsElapsed)
  if (overBudgetLine) {
    insights.push({
      id: `cat-over-${overBudgetLine.name}`,
      text: isPrior
        ? `${overBudgetLine.name} ended ${overBudgetLine.variancePct.toFixed(0)}% over budget (${fmtMoney(overBudgetLine.actual, { compact: true })} vs ${fmtMoney(overBudgetLine.planned, { compact: true })}).`
        : `${overBudgetLine.name} is running ${overBudgetLine.variancePct.toFixed(0)}% over budget (${fmtMoney(overBudgetLine.actual, { compact: true })} vs ${fmtMoney(overBudgetLine.planned, { compact: true })}).`,
      severity: 'warning',
      urgency: 'HIGH',
      magnitude: overBudgetLine.actual - overBudgetLine.planned,
    })
  }

  return insights
}

function pickTopInsights(all: Insight[], n: number): Insight[] {
  return [...all]
    .sort((a, b) => {
      const dr = URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency]
      if (dr !== 0) return dr
      return b.magnitude - a.magnitude
    })
    .slice(0, n)
}

const SEVERITY_ICON: Record<InsightSeverity, LucideIcon> = {
  positive: TrendingUp,
  warning: AlertTriangle,
  neutral: Activity,
}
const SEVERITY_COLOR: Record<InsightSeverity, string> = {
  positive: 'text-emerald-600',
  warning: 'text-amber-600',
  neutral: 'text-gray-600',
}

function InsightsCard(props: InsightsCardProps) {
  const { fyMode, lastEditedAt } = props
  // Future FY: heuristic rules don't apply (no actuals to compare). Show a
  // single informational message and skip the rule pipeline entirely.
  const futureMessage = useMemo(() => {
    if (fyMode !== 'future') return null
    const editedDate = (() => {
      if (!lastEditedAt) return null
      const d = new Date(lastEditedAt)
      if (Number.isNaN(d.getTime())) return null
      return d.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    })()
    return editedDate
      ? `Forecast based on assumptions set on ${editedDate}. Edit the plan to update projections.`
      : `Forecast based on plan assumptions. Edit the plan to update projections.`
  }, [fyMode, lastEditedAt])

  const allInsights = useMemo(
    () => (fyMode === 'future' ? [] : generateInsights(props)),
    [fyMode, props],
  )
  const top = useMemo(() => pickTopInsights(allInsights, 3), [allInsights])

  const heading =
    fyMode === 'prior' ? 'Year in review' : fyMode === 'future' ? 'Forecast notes' : 'Insights this month'
  const subhead =
    fyMode === 'prior'
      ? 'How the year played out vs your plan'
      : fyMode === 'future'
      ? 'No actuals yet — adjust the plan to change projections'
      : 'Auto-generated commentary based on your numbers'

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-navy" />
            {heading}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{subhead}</p>
        </div>
      </header>

      {fyMode === 'future' ? (
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <Activity className="w-4 h-4 mt-0.5 shrink-0 text-gray-600" strokeWidth={2.25} />
            <span className="text-sm text-gray-700 leading-relaxed">{futureMessage}</span>
          </li>
        </ul>
      ) : top.length === 0 ? (
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 text-sm text-gray-700">
          {fyMode === 'prior'
            ? "The year tracked close to plan — no major variances to flag."
            : "Everything's tracking close to plan. Solid month."}
        </div>
      ) : (
        <ul className="space-y-3">
          {top.map((ins) => {
            const Icon = SEVERITY_ICON[ins.severity]
            return (
              <li key={ins.id} className="flex items-start gap-3">
                <Icon
                  className={`w-4 h-4 mt-0.5 shrink-0 ${SEVERITY_COLOR[ins.severity]}`}
                  strokeWidth={2.25}
                />
                <span className="text-sm text-gray-700 leading-relaxed">{ins.text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — Footer drill-down links
// ─────────────────────────────────────────────────────────────────────────────

interface FooterLinksProps {
  onEditPlan: () => void
  onOpenPL: () => void
  onOpenVersions: () => void
}

function FooterLinks({ onEditPlan, onOpenPL, onOpenVersions }: FooterLinksProps) {
  return (
    <nav className="pt-2 pb-4 flex items-center justify-center gap-3 sm:gap-4 text-sm text-gray-500 flex-wrap">
      <button
        type="button"
        onClick={onEditPlan}
        className="hover:text-brand-navy hover:underline underline-offset-4 transition-colors"
      >
        Edit Plan
      </button>
      <span className="text-gray-300" aria-hidden>·</span>
      <button
        type="button"
        onClick={onOpenPL}
        className="hover:text-brand-navy hover:underline underline-offset-4 transition-colors"
      >
        Full P&amp;L
      </button>
      <span className="text-gray-300" aria-hidden>·</span>
      <button
        type="button"
        onClick={onOpenVersions}
        className="hover:text-brand-navy hover:underline underline-offset-4 transition-colors"
      >
        Versions
      </button>
    </nav>
  )
}
