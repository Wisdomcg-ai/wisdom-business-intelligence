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
  getFiscalMonthLabels,
} from '@/lib/utils/fiscal-year-utils'

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
}

// ─────────────────────────────────────────────────────────────────────────────
// Category classification (mirrors /api/forecast/dashboard-actuals)
// ─────────────────────────────────────────────────────────────────────────────

const REVENUE_CATEGORIES = ['revenue', 'trading revenue', 'other revenue']
const COGS_CATEGORIES = ['cost of sales', 'cogs', 'direct costs', 'cost of goods sold']
const TEAM_HINTS = ['wages', 'salary', 'salaries', 'payroll', 'super', 'team', 'employee']
const SUBS_HINTS = ['subscription', 'software', 'saas', 'licence', 'license']

function isRevenue(line: Pick<PLLine, 'category' | 'account_type'>): boolean {
  if (line.account_type && line.account_type.toLowerCase() === 'revenue') return true
  if (!line.category) return false
  return REVENUE_CATEGORIES.includes(line.category.toLowerCase())
}

function isCOGS(line: Pick<PLLine, 'category'>): boolean {
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
  /** Index of the last fully-actual month (-1 if none). */
  lastActualIndex: number
}

function buildMonthlyTotals(
  plLines: PLLine[],
  monthKeys: readonly string[],
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

  // The "last actual" index is the highest index that had any actuals
  let lastActualIndex = -1
  for (let i = hasActuals.length - 1; i >= 0; i -= 1) {
    if (hasActuals[i]) {
      lastActualIndex = i
      break
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
}: ForecastOverviewProps) {
  const monthKeys = useMemo(
    () => generateFiscalMonthKeys(fiscalYear, yearStartMonth),
    [fiscalYear, yearStartMonth],
  )
  const monthLabels = useMemo(
    () => getFiscalMonthLabels(yearStartMonth),
    [yearStartMonth],
  )

  const totals = useMemo(() => buildMonthlyTotals(plLines, monthKeys), [plLines, monthKeys])

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

  return (
    <div className="space-y-6">
      <KpiStrip totals={totals} revenuePlan={revenuePlan} grossPlan={grossPlan} netPlan={netPlan} />
      <TrajectoryCard
        businessId={businessId}
        fiscalYear={fiscalYear}
        yearStartMonth={yearStartMonth}
        monthLabels={monthLabels}
        revenuePlan={revenuePlan}
        grossPlan={grossPlan}
        netPlan={netPlan}
      />
      <MonthlyTrendCard
        totals={totals}
        monthLabels={monthLabels}
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
      />
      <InsightsPlaceholder />
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
}

function KpiStrip({ totals, revenuePlan, grossPlan, netPlan }: KpiStripProps) {
  const lastActualIndex = totals.lastActualIndex
  const monthsElapsed = lastActualIndex + 1 // number of months with actuals so far
  const ytdProrate = (annualPlan: number) =>
    monthsElapsed > 0 ? Math.round((annualPlan / 12) * monthsElapsed) : 0

  // YTD = sum of actual months only (slice up to lastActualIndex inclusive)
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
  const thisMonthIdx = lastActualIndex >= 0 ? lastActualIndex : 0
  const thisMonth = (xs: number[]) => xs[thisMonthIdx] || 0

  const cards: KpiCardProps[] = [
    {
      label: 'Revenue',
      thisMonth: thisMonth(totals.revenue),
      sparkline: sparkline(totals.revenue),
      ytd: ytdSlice(totals.revenue),
      ytdPlanProrated: ytdProrate(revenuePlan),
      yearEnd: yearTotal(totals.revenue),
      yearEndPlan: revenuePlan,
      accent: 'navy',
    },
    {
      label: 'Gross Profit',
      thisMonth: thisMonth(totals.grossProfit),
      sparkline: sparkline(totals.grossProfit),
      ytd: ytdSlice(totals.grossProfit),
      ytdPlanProrated: ytdProrate(grossPlan),
      yearEnd: yearTotal(totals.grossProfit),
      yearEndPlan: grossPlan,
      accent: 'teal',
    },
    {
      label: 'Net Profit',
      thisMonth: thisMonth(totals.netProfit),
      sparkline: sparkline(totals.netProfit),
      ytd: ytdSlice(totals.netProfit),
      ytdPlanProrated: ytdProrate(netPlan),
      yearEnd: yearTotal(totals.netProfit),
      yearEndPlan: netPlan,
      accent: 'orange',
    },
    {
      label: 'Cash Position',
      cashMode: true,
      accent: 'navy',
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
      label: string
      thisMonth: number
      sparkline: number[]
      ytd: number
      ytdPlanProrated: number
      yearEnd: number
      yearEndPlan: number
      accent: 'navy' | 'teal' | 'orange'
      cashMode?: false
    }
  | {
      label: string
      accent: 'navy' | 'teal' | 'orange'
      cashMode: true
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
  if (props.cashMode) {
    return (
      <article className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3.5">
        <header className="flex items-start justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
            {props.label}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">
            Coming soon
          </span>
        </header>
        <div>
          <div className="text-3xl font-semibold text-gray-300 tabular-nums leading-none">—</div>
          <div className="mt-1 text-xs text-gray-400">Cash from Xero · Phase 58.3</div>
        </div>
        <div className="h-9" />
        <p className="text-xs text-gray-400 pt-1 border-t border-gray-100 mt-1 pt-3">
          We&apos;ll wire your live bank balance from Xero in the next release.
        </p>
      </article>
    )
  }

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
          {lastActualIndex >= 0
            ? `* Months after ${monthLabels[lastActualIndex]} are forecast — earlier columns are actuals from Xero`
            : '* All months are forecast — connect Xero to load actuals'}
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
// Four traffic-light cards computed YTD from forecast_pl_lines:
//   1. YoY Revenue Growth — current FY YTD vs prior FY same-period (target 10%)
//   2. Gross Margin       — current FY YTD GP / Revenue          (target 60%)
//   3. Net Margin         — current FY YTD NP / Revenue          (target 15%)
//   4. OpEx Ratio         — current FY YTD OpEx / Revenue        (target ≤ 18%)
//
// Targets default to the values above and are overridable via wizard
// assumptions.goals.year1 (revenue + grossProfitPct + netProfitPct only — no
// dedicated growth or OpEx target lives in the schema yet).
// ─────────────────────────────────────────────────────────────────────────────

const SCORECARD_DEFAULTS = {
  revenueGrowthPct: 10, // %
  grossMarginPct: 60, // %
  netMarginPct: 15, // %
  opexRatioPct: 18, // %  (max — lower is better)
} as const

type ScoreStatus = 'green' | 'amber' | 'red'

interface ScorecardCardProps {
  plLines: PLLine[]
  totals: MonthlyTotals
  fiscalYear: number
  yearStartMonth: number
  assumptions: ForecastAssumptions | null
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
}: ScorecardCardProps) {
  const monthsElapsed = totals.lastActualIndex + 1

  // YTD slices (actuals only — same as KPI strip)
  const ytdSlice = (xs: number[]) =>
    monthsElapsed > 0 ? sum(xs.slice(0, monthsElapsed)) : 0

  const ytdRevenue = ytdSlice(totals.revenue)
  const ytdGP = ytdSlice(totals.grossProfit)
  const ytdNP = ytdSlice(totals.netProfit)
  const ytdOpEx =
    ytdSlice(totals.team) + ytdSlice(totals.opex) + ytdSlice(totals.subs)

  // Targets — wizard assumptions override defaults where available
  const grossMarginTarget =
    assumptions?.goals?.year1?.grossProfitPct ?? SCORECARD_DEFAULTS.grossMarginPct
  const netMarginTarget =
    assumptions?.goals?.year1?.netProfitPct ?? SCORECARD_DEFAULTS.netMarginPct
  const opexRatioTarget = SCORECARD_DEFAULTS.opexRatioPct
  const revenueGrowthTarget = SCORECARD_DEFAULTS.revenueGrowthPct

  // Calculations
  const priorRevYTD = useMemo(
    () => computePriorYearRevenueYTD(plLines, fiscalYear, yearStartMonth, monthsElapsed),
    [plLines, fiscalYear, yearStartMonth, monthsElapsed],
  )
  const growthPct =
    priorRevYTD != null && priorRevYTD > 0
      ? ((ytdRevenue / priorRevYTD) - 1) * 100
      : null

  const grossMarginPct = ytdRevenue > 0 ? (ytdGP / ytdRevenue) * 100 : null
  const netMarginPct = ytdRevenue > 0 ? (ytdNP / ytdRevenue) * 100 : null
  const opexRatioPct = ytdRevenue > 0 ? (ytdOpEx / ytdRevenue) * 100 : null

  const cards: ScorecardItem[] = [
    {
      label: 'Revenue Growth',
      value: growthPct,
      status: growthPct != null ? statusForGrowth(growthPct, revenueGrowthTarget) : null,
      target: `${revenueGrowthTarget}%`,
      helper: growthPct != null ? 'vs prior year YTD' : 'Need prior year data',
      formatter: (v) => fmtPct(v, { signed: true }),
    },
    {
      label: 'Gross Margin',
      value: grossMarginPct,
      status: grossMarginPct != null ? statusForMargin(grossMarginPct, grossMarginTarget) : null,
      target: `${grossMarginTarget}%`,
      helper: 'GP / Revenue YTD',
      formatter: (v) => fmtPct(v, { digits: 1 }),
    },
    {
      label: 'Net Margin',
      value: netMarginPct,
      status: netMarginPct != null ? statusForMargin(netMarginPct, netMarginTarget) : null,
      target: `${netMarginTarget}%`,
      helper: 'NP / Revenue YTD',
      formatter: (v) => fmtPct(v, { digits: 1 }),
    },
    {
      label: 'OpEx Ratio',
      value: opexRatioPct,
      status: opexRatioPct != null ? statusForOpExRatio(opexRatioPct, opexRatioTarget) : null,
      target: `≤ ${opexRatioTarget}%`,
      helper: 'OpEx / Revenue YTD',
      formatter: (v) => fmtPct(v, { digits: 1 }),
    },
  ]

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-brand-navy" />
            KPI scorecard
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Health check vs your targets · year-to-date
          </p>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
}

function ScorecardItemCard({ label, value, status, target, helper, formatter }: ScorecardItem) {
  const valueDisplay = value == null ? '—' : formatter(value)
  const valueColor = status == null ? 'text-gray-400' : STATUS_TEXT[status]
  return (
    <article className="relative bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2">
      {status != null && (
        <span
          className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`}
          aria-label={`Status: ${status}`}
        />
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
// Section 5 — Insights placeholder (real implementation in Phase 58.2 — Part 2)
// ─────────────────────────────────────────────────────────────────────────────

function InsightsPlaceholder() {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-navy" />
            Insights this month
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Auto-generated commentary based on your numbers</p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">
          Coming soon · 58.2
        </span>
      </header>
      <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
        Heuristic commentary (variance vs plan, trend changes, cost ratios) ships in Phase 58.2.
      </div>
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
