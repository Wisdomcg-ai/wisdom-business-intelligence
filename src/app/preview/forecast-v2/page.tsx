'use client'

/**
 * PROTOTYPE — CLIENT-CENTRIC forecast page
 *
 * Sandbox route at /preview/forecast-v2 for design evaluation only.
 * NO real data, NO Supabase, NO Xero. Pure static UI with hardcoded mock data.
 * Every interactive element toasts a "(prototype)" placeholder.
 *
 * Audience: small business owner ("not a numbers person"). They want to
 * answer 3 questions in 5 seconds:
 *   1. Am I winning?
 *   2. Where do I stand by year-end?
 *   3. What should I do this week?
 *
 * Layout:
 *   - PageHeader (banner)
 *   - Card 1: hero verdict (plain English)
 *   - Card 2: revenue trajectory chart
 *   - Card 3: 3 focus items for the week
 *   - Footer: 3 quiet drill-down links
 *
 * Visual language matches production app: PageHeader banner, white cards
 * with border + rounded-xl, lucide-react icons, brand palette.
 *
 * This file does NOT touch the production forecast at /finances/forecast.
 */

import {
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
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
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

type MonthRow = {
  month: string
  actual: number | null
  forecast: number | null
  /** Combined value used for bar height (actual ?? forecast) */
  value: number
  isForecast: boolean
}

const RAW_MONTHS: Array<{ month: string; actual: number | null; forecast: number | null }> = [
  { month: 'Jul', actual: 38000, forecast: null },
  { month: 'Aug', actual: 42000, forecast: null },
  { month: 'Sep', actual: 39500, forecast: null },
  { month: 'Oct', actual: 45000, forecast: null },
  { month: 'Nov', actual: 41000, forecast: null },
  { month: 'Dec', actual: 48000, forecast: null },
  { month: 'Jan', actual: 43500, forecast: null },
  { month: 'Feb', actual: 40000, forecast: null },
  { month: 'Mar', actual: 44000, forecast: null },
  { month: 'Apr', actual: 49000, forecast: null },
  { month: 'May', actual: 50000, forecast: null },
  { month: 'Jun', actual: null, forecast: 50000 },
]

const FY_MONTHS: MonthRow[] = RAW_MONTHS.map((m) => ({
  ...m,
  value: (m.actual ?? m.forecast) ?? 0,
  isForecast: m.actual === null,
}))

// $500k plan / 12 months
const PLAN_MONTHLY = 41_667
const PLAN_TOTAL = 500_000
// Year-end forecast = sum of actuals + forecast Jun
const YEAR_END_FORECAST = FY_MONTHS.reduce((sum, m) => sum + m.value, 0) // 530,000
const VARIANCE = YEAR_END_FORECAST - PLAN_TOTAL // +30,000

// Profit / margin verdict numbers (illustrative)
const PROFIT_VARIANCE = 3_000 // +$3k vs plan
const MARGIN_DELTA_PT = -0.5 // -0.5pt vs target

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtMoney(n: number, opts: { compact?: boolean; signed?: boolean } = {}) {
  const { compact = false, signed = false } = opts
  const abs = Math.abs(n)
  let body: string
  if (compact && abs >= 1000) {
    body = `$${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`
  } else {
    body = `$${abs.toLocaleString('en-US')}`
  }
  if (signed) return n >= 0 ? `+${body}` : `−${body}`
  return n < 0 ? `−${body}` : body
}

function notifyPrototype(label: string) {
  toast(`${label} (prototype)`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ForecastV2PreviewPage() {
  const onTrack = VARIANCE >= 0

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Financial Performance"
        subtitle="FY25 · Demo Co · Jul 2024 – Jun 2025"
        variant="banner"
      />

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5 sm:space-y-6">
        <VerdictCard onTrack={onTrack} />
        <TrajectoryCard onTrack={onTrack} />
        <FocusCard />
        <FooterLinks />
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 1 — Hero verdict
// ─────────────────────────────────────────────────────────────────────────────

function VerdictCard({ onTrack }: { onTrack: boolean }) {
  const StatusIcon = onTrack ? CheckCircle2 : AlertTriangle
  const iconColor = onTrack ? 'text-emerald-600' : 'text-amber-600'
  const iconBg = onTrack ? 'bg-emerald-50' : 'bg-amber-50'

  const headline = onTrack ? "You're ahead of plan" : "You're behind plan"
  const sub = onTrack
    ? `Heading to ${fmtMoney(YEAR_END_FORECAST, { compact: true })} by Jun 30 (${fmtMoney(VARIANCE, { compact: true, signed: true })} above target)`
    : `Heading to ${fmtMoney(YEAR_END_FORECAST, { compact: true })} by Jun 30 (${fmtMoney(VARIANCE, { compact: true, signed: true })} vs target)`

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-7">
      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 ${iconBg} rounded-xl flex items-center justify-center`}>
          <StatusIcon className={`w-7 h-7 sm:w-8 sm:h-8 ${iconColor}`} strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
            {headline}
          </h2>
          <p className="mt-2 text-base sm:text-lg text-gray-600 leading-snug">
            {sub}
          </p>
        </div>
      </div>

      {/* Variance row */}
      <div className="mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
        <VarianceRow
          label="Profit"
          value={`${fmtMoney(PROFIT_VARIANCE, { signed: true, compact: true })} above plan`}
          good
        />
        <VarianceRow
          label="Margin"
          value={`${MARGIN_DELTA_PT > 0 ? '+' : ''}${MARGIN_DELTA_PT}pt below target`}
          good={MARGIN_DELTA_PT >= 0}
        />
      </div>
    </section>
  )
}

function VarianceRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  const Icon = good ? CheckCircle2 : AlertTriangle
  const color = good ? 'text-emerald-600' : 'text-amber-600'
  return (
    <div className="flex items-center gap-2.5 text-sm sm:text-base">
      <span className="text-gray-500 font-medium w-16 sm:w-20">{label}:</span>
      <span className="text-gray-900">{value}</span>
      <Icon className={`w-4 h-4 ${color}`} strokeWidth={2.5} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 2 — Revenue trajectory
// ─────────────────────────────────────────────────────────────────────────────

function TrajectoryCard({ onTrack }: { onTrack: boolean }) {
  const summary = onTrack
    ? `On current trajectory you'll exceed plan by ${fmtMoney(VARIANCE, { compact: true })}.`
    : `On current trajectory you'll miss plan by ${fmtMoney(Math.abs(VARIANCE), { compact: true })}.`

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-7">
      <header className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-5 h-5 text-brand-navy" />
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Revenue trajectory</h2>
      </header>
      <p className="text-sm text-gray-500 mb-5">
        Monthly revenue vs plan ({fmtMoney(PLAN_MONTHLY, { compact: true })}/mo)
      </p>

      <div className="w-full h-[240px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={FY_MONTHS}
            margin={{ top: 24, right: 24, left: 0, bottom: 4 }}
          >
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
              formatter={(value: number, _name, item) => {
                const row = item.payload as MonthRow
                const label = row.isForecast ? 'Forecast' : 'Actual'
                return [fmtMoney(value, { compact: true }), label]
              }}
              labelFormatter={(l) => `${l} '25`}
            />
            <ReferenceLine
              y={PLAN_MONTHLY}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            >
              <Label
                value={`Plan ${fmtMoney(PLAN_MONTHLY, { compact: true })}/mo`}
                position="insideTopRight"
                fill="#64748b"
                fontSize={11}
              />
            </ReferenceLine>
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={42}>
              {FY_MONTHS.map((row, idx) => (
                <Cell
                  key={row.month}
                  fill={row.isForecast ? '#a7f3d0' : '#10b981'}
                  stroke={row.isForecast ? '#34d399' : 'transparent'}
                  strokeDasharray={row.isForecast ? '3 3' : undefined}
                  strokeWidth={row.isForecast ? 1.5 : 0}
                >
                  {idx === FY_MONTHS.length - 1 && (
                    <Label
                      value={`${fmtMoney(YEAR_END_FORECAST, { compact: true })} forecast`}
                      position="top"
                      fill="#0f766e"
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

      <p className="mt-4 text-sm sm:text-base text-gray-700 font-medium">
        {summary}
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 3 — Focus this week
// ─────────────────────────────────────────────────────────────────────────────

type FocusItem = {
  id: string
  status: 'warn' | 'ok'
  text: string
  cta?: { label: string; toastLabel: string }
}

const FOCUS_ITEMS: FocusItem[] = [
  {
    id: 'oct-rev',
    status: 'warn',
    text: 'Review October revenue against pipeline',
    cta: { label: 'Review', toastLabel: 'Open October revenue review' },
  },
  {
    id: 'subs',
    status: 'warn',
    text: 'Cut subscriptions by $3k',
    cta: { label: 'Adjust', toastLabel: 'Open subscriptions adjustment' },
  },
  {
    id: 'q3-hire',
    status: 'ok',
    text: 'Q3 hire on schedule (no action)',
  },
]

function FocusCard() {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-7">
      <header className="mb-4 sm:mb-5">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Focus this week</h2>
        <p className="text-sm text-gray-500 mt-0.5">3 things that will move the needle most</p>
      </header>

      <ul className="divide-y divide-gray-100">
        {FOCUS_ITEMS.map((item) => (
          <FocusRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}

function FocusRow({ item }: { item: FocusItem }) {
  const Icon = item.status === 'warn' ? AlertTriangle : CheckCircle2
  const color = item.status === 'warn' ? 'text-amber-600' : 'text-emerald-600'

  return (
    <li className="py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
      <Icon className={`flex-shrink-0 w-5 h-5 ${color}`} strokeWidth={2.25} />
      <span className="flex-1 text-sm sm:text-base text-gray-800">
        {item.text}
      </span>
      {item.cta && (
        <button
          type="button"
          onClick={() => notifyPrototype(item.cta!.toastLabel)}
          className="flex-shrink-0 inline-flex items-center px-3 py-1.5 text-sm font-medium text-brand-navy bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors"
        >
          {item.cta.label}
        </button>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer drill-down links
// ─────────────────────────────────────────────────────────────────────────────

function FooterLinks() {
  const links = [
    { label: 'View P&L', toastLabel: 'Open P&L detail' },
    { label: 'Edit Plan', toastLabel: 'Open plan editor' },
    { label: 'Versions', toastLabel: 'Open version history' },
  ]

  return (
    <nav className="pt-2 pb-6 flex items-center justify-center gap-3 sm:gap-4 text-sm text-gray-500">
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
