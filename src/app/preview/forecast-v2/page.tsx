'use client'

/**
 * PROTOTYPE — World-class forecast dashboard
 *
 * Sandbox route at /preview/forecast-v2 for design evaluation only.
 * NO real data, NO Supabase, NO Xero. Pure static UI with hardcoded mock data.
 * Every interactive element toasts a "(prototype)" placeholder.
 *
 * Information architecture: Fathom HQ
 * Visual restraint:        Mercury / Pry
 * Trajectory polish:       Pry / Causal
 * Auto-commentary:         Spotlight Reporting
 *
 * Six sections:
 *   1. Period KPI strip (Revenue / GP / NP / Cash)
 *   2. Trajectory chart with metric toggle
 *   3. Monthly trend P&L table — the CFO money shot
 *   4. KPI scorecard with traffic lights
 *   5. Smart insights / commentary
 *   6. Quiet drill-down footer
 *
 * This file does NOT touch the production forecast at /finances/forecast.
 */

import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Target,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ComposedChart,
  Bar,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Label,
} from 'recharts'
import PageHeader from '@/components/ui/PageHeader'

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — internally consistent
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
] as const

// Revenue by month (Jul → Jun). Last entry is forecast.
const REVENUE_MONTHLY = [
  38_000, 42_000, 39_500, 45_000, 41_000, 48_000,
  43_500, 40_000, 44_000, 49_000, 50_000, 50_000,
]
const FORECAST_INDEX = 11 // Jun
const ACTUALS_LAST_INDEX = 10 // May (latest actual)

// Derived monthly series
const COGS_MONTHLY = REVENUE_MONTHLY.map((r) => Math.round(r * 0.38))
const GROSS_PROFIT_MONTHLY = REVENUE_MONTHLY.map((r, i) => r - COGS_MONTHLY[i])
const TEAM_MONTHLY = [
  12_000, 12_000, 13_000, 13_000, 13_000, 14_000,
  14_000, 14_000, 14_000, 14_000, 14_000, 15_000,
]
const OPEX_MONTHLY = [
  5_000, 6_000, 5_000, 6_000, 5_000, 6_000,
  5_000, 5_000, 5_000, 6_000, 7_000, 6_000,
]
const SUBS_MONTHLY = Array(12).fill(1_000)
const NET_PROFIT_MONTHLY = REVENUE_MONTHLY.map(
  (r, i) => GROSS_PROFIT_MONTHLY[i] - TEAM_MONTHLY[i] - OPEX_MONTHLY[i] - SUBS_MONTHLY[i],
)

// Plan / target lines (for variance flags)
const PLAN_REVENUE_MONTHLY = Array(12).fill(41_667) // $500k / 12
const PLAN_GP_MONTHLY = PLAN_REVENUE_MONTHLY.map((r) => Math.round(r * 0.6)) // 60% target
const PLAN_NP_MONTHLY = PLAN_REVENUE_MONTHLY.map((r) => Math.round(r * 0.15)) // 15% target

// Aggregates
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const sumActuals = (xs: number[]) => sum(xs.slice(0, ACTUALS_LAST_INDEX + 1))
const sumYTD = sumActuals // Jul–May = YTD

const REVENUE_YTD = sumYTD(REVENUE_MONTHLY) // 480k
const REVENUE_FORECAST = sum(REVENUE_MONTHLY) // 530k
const REVENUE_PLAN = 500_000

const GP_YTD = sumYTD(GROSS_PROFIT_MONTHLY)
const GP_FORECAST = sum(GROSS_PROFIT_MONTHLY)
const GP_PLAN = 300_000

const NP_YTD = sumYTD(NET_PROFIT_MONTHLY)
const NP_FORECAST = sum(NET_PROFIT_MONTHLY)
const NP_PLAN = 75_000

const CASH_NOW = 245_000

// Latest-month "this month" values (May actual)
const REVENUE_THIS = REVENUE_MONTHLY[ACTUALS_LAST_INDEX]
const GP_THIS = GROSS_PROFIT_MONTHLY[ACTUALS_LAST_INDEX]
const NP_THIS = NET_PROFIT_MONTHLY[ACTUALS_LAST_INDEX]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtMoney(n: number, opts: { compact?: boolean; signed?: boolean; full?: boolean } = {}) {
  const { compact = false, signed = false, full = false } = opts
  const abs = Math.abs(n)
  let body: string
  if (full) {
    body = `$${abs.toLocaleString('en-US')}`
  } else if (compact && abs >= 1000) {
    body = `$${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`
  } else {
    body = `$${abs.toLocaleString('en-US')}`
  }
  if (signed) return n >= 0 ? `+${body}` : `−${body}`
  return n < 0 ? `−${body}` : body
}

function fmtCellMoney(n: number) {
  // Compact for table cells: $38k, $1k, $245k
  if (n === 0) return '—'
  const abs = Math.abs(n)
  if (abs >= 1000) {
    const v = (abs / 1000).toFixed(abs < 10_000 ? 1 : 0)
    return `${n < 0 ? '−' : ''}$${v}k`
  }
  return `${n < 0 ? '−' : ''}$${abs}`
}

function fmtPct(n: number, opts: { signed?: boolean; pt?: boolean } = {}) {
  const { signed = false, pt = false } = opts
  const v = Math.round(n * 10) / 10
  const body = `${Math.abs(v)}${pt ? 'pt' : '%'}`
  if (signed) return n >= 0 ? `+${body}` : `−${body}`
  return n < 0 ? `−${body}` : body
}

function notifyPrototype(label: string) {
  toast(`${label} (prototype)`)
}

type Status = 'ok' | 'watch' | 'behind'
function statusFromVariance(actualPct: number): Status {
  // actualPct is YTD progress vs plan (1.0 = on plan)
  if (actualPct >= 0.98) return 'ok'
  if (actualPct >= 0.92) return 'watch'
  return 'behind'
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ForecastV2PreviewPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Financial Performance"
        subtitle="FY25 · Demo Co · Jul 2024 – Jun 2025 · Updated 7 May 2026"
        variant="banner"
      />

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <KpiStrip />
        <TrajectoryCard />
        <MonthlyTrendCard />
        <ScorecardCard />
        <InsightsCard />
        <FooterLinks />
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Period KPI strip
// ─────────────────────────────────────────────────────────────────────────────

function KpiStrip() {
  const cards: KpiCardProps[] = [
    {
      label: 'Revenue',
      thisMonth: REVENUE_THIS,
      sparkline: REVENUE_MONTHLY,
      ytd: REVENUE_YTD,
      ytdPlanProrated: Math.round((REVENUE_PLAN / 12) * 11), // 11/12 of plan
      yearEnd: REVENUE_FORECAST,
      yearEndPlan: REVENUE_PLAN,
      accent: 'navy',
    },
    {
      label: 'Gross Profit',
      thisMonth: GP_THIS,
      sparkline: GROSS_PROFIT_MONTHLY,
      ytd: GP_YTD,
      ytdPlanProrated: Math.round((GP_PLAN / 12) * 11),
      yearEnd: GP_FORECAST,
      yearEndPlan: GP_PLAN,
      accent: 'teal',
    },
    {
      label: 'Net Profit',
      thisMonth: NP_THIS,
      sparkline: NET_PROFIT_MONTHLY,
      ytd: NP_YTD,
      ytdPlanProrated: Math.round((NP_PLAN / 12) * 11),
      yearEnd: NP_FORECAST,
      yearEndPlan: NP_PLAN,
      accent: 'orange',
    },
    {
      label: 'Cash Position',
      thisMonth: CASH_NOW,
      // Mock cash trajectory — gentle build through the year
      sparkline: [
        180_000, 185_000, 192_000, 198_000, 205_000, 215_000,
        222_000, 228_000, 234_000, 239_000, 245_000, 251_000,
      ],
      ytd: CASH_NOW,
      ytdPlanProrated: 240_000,
      yearEnd: 251_000,
      yearEndPlan: 250_000,
      accent: 'navy',
      cashMode: true,
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

type KpiCardProps = {
  label: string
  thisMonth: number
  sparkline: number[]
  ytd: number
  ytdPlanProrated: number
  yearEnd: number
  yearEndPlan: number
  accent: 'navy' | 'teal' | 'orange'
  cashMode?: boolean
}

const ACCENT_STROKE: Record<KpiCardProps['accent'], string> = {
  navy: '#1e3a8a',
  teal: '#0f766e',
  orange: '#c2410c',
}
const ACCENT_FILL: Record<KpiCardProps['accent'], string> = {
  navy: 'rgba(30, 58, 138, 0.10)',
  teal: 'rgba(15, 118, 110, 0.10)',
  orange: 'rgba(194, 65, 12, 0.10)',
}

function KpiCard({
  label,
  thisMonth,
  sparkline,
  ytd,
  ytdPlanProrated,
  yearEnd,
  yearEndPlan,
  accent,
  cashMode,
}: KpiCardProps) {
  const ytdPct = ytd / ytdPlanProrated
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
        <div className="mt-1 text-xs text-gray-500">
          {cashMode ? 'as of today' : 'this month'}
        </div>
      </div>

      <Sparkline values={sparkline} stroke={ACCENT_STROKE[accent]} fill={ACCENT_FILL[accent]} />

      <dl className="text-xs space-y-1.5 pt-1 border-t border-gray-100 mt-1">
        <div className="flex items-baseline justify-between gap-2 pt-2">
          <dt className="text-gray-500">{cashMode ? 'Today' : 'YTD'}</dt>
          <dd className="text-gray-700 tabular-nums">
            {fmtMoney(ytd, { compact: true })}
            <span className="text-gray-400">
              {' '}of {fmtMoney(cashMode ? yearEndPlan : Math.round(ytdPlanProrated * (12 / 11)), { compact: true })} plan
            </span>
            <span className={`ml-1 font-medium ${ytdPct >= 1 ? 'text-emerald-600' : ytdPct >= 0.95 ? 'text-amber-600' : 'text-red-600'}`}>
              ({Math.round(ytdPct * 100)}%)
            </span>
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
            <span className={`ml-1 font-medium ${yearEndDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              ({fmtMoney(yearEndDelta, { compact: true, signed: true })})
            </span>
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

// Inline SVG sparkline — area + stroke
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
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const stepX = width / (values.length - 1)
    const points = values.map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / range) * (height - 4) - 2
      return [x, y] as const
    })
    const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
    const area = `${path} L${width},${height} L0,${height} Z`
    return { path, area }
  }, [values, width, height])

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
// Section 2 — Trajectory chart with metric toggle
// ─────────────────────────────────────────────────────────────────────────────

type Metric = 'revenue' | 'gp' | 'np'

const METRIC_CONFIG: Record<Metric, {
  label: string
  monthly: number[]
  plan: number[]
  yearEnd: number
  yearEndPlan: number
  barColor: string
  forecastColor: string
  forecastStroke: string
}> = {
  revenue: {
    label: 'Revenue',
    monthly: REVENUE_MONTHLY,
    plan: PLAN_REVENUE_MONTHLY,
    yearEnd: REVENUE_FORECAST,
    yearEndPlan: REVENUE_PLAN,
    barColor: '#1e3a8a',
    forecastColor: '#c7d2fe',
    forecastStroke: '#6366f1',
  },
  gp: {
    label: 'Gross Profit',
    monthly: GROSS_PROFIT_MONTHLY,
    plan: PLAN_GP_MONTHLY,
    yearEnd: GP_FORECAST,
    yearEndPlan: GP_PLAN,
    barColor: '#0f766e',
    forecastColor: '#a7f3d0',
    forecastStroke: '#34d399',
  },
  np: {
    label: 'Net Profit',
    monthly: NET_PROFIT_MONTHLY,
    plan: PLAN_NP_MONTHLY,
    yearEnd: NP_FORECAST,
    yearEndPlan: NP_PLAN,
    barColor: '#c2410c',
    forecastColor: '#fed7aa',
    forecastStroke: '#fb923c',
  },
}

function TrajectoryCard() {
  const [metric, setMetric] = useState<Metric>('revenue')
  const cfg = METRIC_CONFIG[metric]

  const chartData = useMemo(
    () =>
      MONTH_LABELS.map((month, i) => ({
        month,
        value: cfg.monthly[i],
        isForecast: i === FORECAST_INDEX,
      })),
    [cfg.monthly],
  )

  const planMonthly = cfg.plan[0]
  const variance = cfg.yearEnd - cfg.yearEndPlan
  const summary =
    variance >= 0
      ? `On current trajectory you'll exceed plan by ${fmtMoney(variance, { compact: true })} for ${cfg.label.toLowerCase()}.`
      : `On current trajectory you'll miss plan by ${fmtMoney(Math.abs(variance), { compact: true })} for ${cfg.label.toLowerCase()}.`

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <header className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-navy" />
            Trajectory
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Monthly {cfg.label.toLowerCase()} vs plan ({fmtMoney(planMonthly, { compact: true })}/mo)
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Metric"
          className="inline-flex items-center bg-gray-100 rounded-lg p-1"
        >
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
                  active
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {METRIC_CONFIG[m].label}
              </button>
            )
          })}
        </div>
      </header>

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
              labelFormatter={(l) => `${l} '25`}
            />
            <ReferenceLine
              y={planMonthly}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            >
              <Label
                value={`Plan ${fmtMoney(planMonthly, { compact: true })}/mo`}
                position="insideTopRight"
                fill="#64748b"
                fontSize={11}
              />
            </ReferenceLine>
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={42}>
              {chartData.map((row, idx) => (
                <Cell
                  key={row.month}
                  fill={row.isForecast ? cfg.forecastColor : cfg.barColor}
                  stroke={row.isForecast ? cfg.forecastStroke : 'transparent'}
                  strokeDasharray={row.isForecast ? '3 3' : undefined}
                  strokeWidth={row.isForecast ? 1.5 : 0}
                >
                  {idx === chartData.length - 1 && (
                    <Label
                      value={`${fmtMoney(cfg.yearEnd, { compact: true })} forecast`}
                      position="top"
                      fill={cfg.forecastStroke}
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

      <p className="mt-4 text-sm sm:text-base text-gray-700 font-medium">{summary}</p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Monthly trend P&L table
// ─────────────────────────────────────────────────────────────────────────────

type RowKind = 'header' | 'detail' | 'sub' | 'rule'
type TableRow = {
  kind: RowKind
  label: string
  values: number[]
  /** When true, format as percent */
  isPct?: boolean
  /** Plan values for variance coloring (omitted = no coloring) */
  plan?: number[]
  /** Use plan as a percentage variance threshold (default 5) */
  varianceTol?: number
  /** Negative variance = good (e.g. costs under plan) */
  invertVariance?: boolean
}

const VARIANCE_TOL_PCT = 0.05

const MARGIN_GROSS = REVENUE_MONTHLY.map((r, i) => (GROSS_PROFIT_MONTHLY[i] / r) * 100)
const MARGIN_NET = REVENUE_MONTHLY.map((r, i) => (NET_PROFIT_MONTHLY[i] / r) * 100)

const PLAN_TEAM = Array(12).fill(13_500)
const PLAN_OPEX = Array(12).fill(5_500)
const PLAN_SUBS = Array(12).fill(900)

const TABLE_ROWS: TableRow[] = [
  { kind: 'header', label: 'Revenue', values: REVENUE_MONTHLY, plan: PLAN_REVENUE_MONTHLY },
  { kind: 'sub', label: 'COGS', values: COGS_MONTHLY },
  { kind: 'header', label: 'Gross Profit', values: GROSS_PROFIT_MONTHLY, plan: PLAN_GP_MONTHLY },
  { kind: 'sub', label: 'Margin', values: MARGIN_GROSS, isPct: true },
  { kind: 'rule', label: '', values: [] },
  { kind: 'detail', label: 'Team', values: TEAM_MONTHLY, plan: PLAN_TEAM, invertVariance: true },
  { kind: 'detail', label: 'OpEx', values: OPEX_MONTHLY, plan: PLAN_OPEX, invertVariance: true },
  { kind: 'detail', label: 'Subscriptions', values: SUBS_MONTHLY, plan: PLAN_SUBS, invertVariance: true },
  { kind: 'rule', label: '', values: [] },
  { kind: 'header', label: 'Net Profit', values: NET_PROFIT_MONTHLY, plan: PLAN_NP_MONTHLY },
  { kind: 'sub', label: 'Margin', values: MARGIN_NET, isPct: true },
]

function MonthlyTrendCard() {
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
              {MONTH_LABELS.map((m, i) => (
                <th
                  key={m}
                  scope="col"
                  className={`text-right font-semibold py-2.5 px-3 tabular-nums whitespace-nowrap ${
                    i === FORECAST_INDEX ? 'bg-indigo-50/40 text-indigo-700' : ''
                  }`}
                >
                  {m}
                  {i === FORECAST_INDEX ? <span aria-hidden>*</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TABLE_ROWS.map((row, ri) => {
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
                  className={`border-b border-gray-100 last:border-b-0 ${
                    isHeader ? 'bg-white' : ''
                  }`}
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
                    const isForecastCol = ci === FORECAST_INDEX
                    const planV = row.plan?.[ci]
                    let varianceClass = ''
                    if (planV !== undefined && !isForecastCol && planV !== 0) {
                      const delta = (v - planV) / planV
                      const tol = row.varianceTol ?? VARIANCE_TOL_PCT
                      const above = delta > tol
                      const below = delta < -tol
                      // For cost rows: above plan is bad (amber), below is good (subtle, no color)
                      // For revenue/profit rows: above plan is good (green), below is amber
                      if (row.invertVariance) {
                        if (above) varianceClass = 'text-amber-700 font-medium'
                      } else {
                        if (above) varianceClass = 'text-emerald-700 font-medium'
                        else if (below) varianceClass = 'text-amber-700 font-medium'
                      }
                    }
                    return (
                      <td
                        key={ci}
                        className={`text-right tabular-nums py-2 px-3 whitespace-nowrap ${
                          isHeader ? 'font-semibold text-gray-900' : isSub ? 'text-xs italic text-gray-500' : 'text-gray-800'
                        } ${isForecastCol ? 'bg-indigo-50/40 text-indigo-900' : ''} ${varianceClass}`}
                      >
                        {row.isPct ? `${v.toFixed(0)}%` : fmtCellMoney(v)}
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
        <span>* Jun is forecast · all other months are actuals from Xero</span>
        <button
          type="button"
          onClick={() => notifyPrototype('Open full P&L drill-down')}
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
// Section 4 — KPI scorecard with traffic lights
// ─────────────────────────────────────────────────────────────────────────────

type ScorecardItem = {
  label: string
  value: string
  target: string
  light: 'green' | 'amber' | 'red'
  helper?: string
}

const SCORECARD: ScorecardItem[] = [
  {
    label: 'Revenue Growth (YoY)',
    value: '+12%',
    target: '+10%',
    light: 'green',
    helper: 'vs FY24 same period',
  },
  {
    label: 'Gross Margin',
    value: '62%',
    target: '60%',
    light: 'green',
    helper: 'YTD blended',
  },
  {
    label: 'Net Margin',
    value: '17%',
    target: '15%',
    light: 'green',
    helper: 'YTD blended',
  },
  {
    label: 'OpEx as % Revenue',
    value: '16%',
    target: '< 18%',
    light: 'green',
    helper: 'Team + OpEx + Subs',
  },
]

const LIGHT_DOT: Record<ScorecardItem['light'], string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}
const LIGHT_TEXT: Record<ScorecardItem['light'], string> = {
  green: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
}

function ScorecardCard() {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <header className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-brand-navy" />
            KPI scorecard
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Health check vs your targets</p>
        </div>
        <span className="hidden sm:inline-flex text-xs text-gray-500 items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> On target</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Watch</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Off target</span>
        </span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {SCORECARD.map((item) => (
          <article
            key={item.label}
            className="border border-gray-200 rounded-lg p-4 flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 leading-tight">
                {item.label}
              </span>
              <span
                className={`flex-shrink-0 mt-0.5 w-2.5 h-2.5 rounded-full ${LIGHT_DOT[item.light]} ring-2 ring-white shadow-sm`}
                aria-label={`Status: ${item.light}`}
              />
            </div>
            <div className={`text-2xl font-semibold tabular-nums leading-none ${LIGHT_TEXT[item.light]}`}>
              {item.value}
            </div>
            <div className="text-xs text-gray-500 flex items-baseline justify-between">
              <span>Target {item.target}</span>
              {item.helper && <span className="text-gray-400 truncate ml-2">{item.helper}</span>}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Smart insights / commentary
// ─────────────────────────────────────────────────────────────────────────────

type Insight = {
  id: string
  icon: typeof TrendingUp
  iconClass: string
  text: string
}

const INSIGHTS: Insight[] = [
  {
    id: 'rev',
    icon: TrendingUp,
    iconClass: 'text-emerald-600 bg-emerald-50',
    text: 'Revenue is +$30k vs plan YTD, driven by strong Q3 performance (Oct & Dec each $3-7k above target).',
  },
  {
    id: 'opex',
    icon: AlertTriangle,
    iconClass: 'text-amber-600 bg-amber-50',
    text: 'Operating costs are running 8% over budget — subscriptions are the largest variance and worth a look this week.',
  },
  {
    id: 'margin',
    icon: Activity,
    iconClass: 'text-brand-navy bg-blue-50',
    text: 'Net margin has trended 0.5pt above plan since November and is holding steady at 17% blended YTD.',
  },
]

function InsightsCard() {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <header className="mb-4 sm:mb-5">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-navy" />
          Insights this month
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">Auto-generated commentary based on your numbers</p>
      </header>

      <ul className="space-y-3">
        {INSIGHTS.map((ins) => {
          const Icon = ins.icon
          return (
            <li
              key={ins.id}
              className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/40"
            >
              <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${ins.iconClass}`}>
                <Icon className="w-4 h-4" strokeWidth={2.25} />
              </span>
              <p className="text-sm sm:text-[15px] text-gray-800 leading-relaxed pt-1">{ins.text}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — Footer drill-down links
// ─────────────────────────────────────────────────────────────────────────────

function FooterLinks() {
  const links = [
    { label: 'Edit Plan', toastLabel: 'Open plan editor' },
    { label: 'Full P&L', toastLabel: 'Open P&L detail' },
    { label: 'Versions', toastLabel: 'Open version history' },
    { label: 'Export', toastLabel: 'Export to PDF / Excel' },
  ]

  return (
    <nav className="pt-2 pb-8 flex items-center justify-center gap-3 sm:gap-4 text-sm text-gray-500 flex-wrap">
      {links.map((link, i) => (
        <span key={link.label} className="flex items-center gap-3 sm:gap-4">
          {i > 0 && <span className="text-gray-300" aria-hidden>·</span>}
          <button
            type="button"
            onClick={() => notifyPrototype(link.toastLabel)}
            className="hover:text-brand-navy hover:underline underline-offset-4 transition-colors"
          >
            {link.label}
          </button>
        </span>
      ))}
    </nav>
  )
}
