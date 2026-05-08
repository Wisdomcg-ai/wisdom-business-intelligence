'use client'

/**
 * PROTOTYPE — CFO-grade forecast page preview
 *
 * Sandbox route at /preview/forecast-v2 for design evaluation only.
 * NO real data, NO Supabase, NO Xero. Pure static UI with hardcoded mock data.
 * Every interactive element toasts a "(prototype)" placeholder.
 *
 * Aesthetic targets: Mercury, Linear, Causal, Stripe Atlas. Restrained colour,
 * generous whitespace, serif/tabular numerics, single accent, shadows over
 * borders. NOT a generic Tailwind-card SaaS look.
 *
 * This file does NOT touch the production forecast at /finances/forecast.
 */

import { useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Activity,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — the page is purely a visual prototype
// ─────────────────────────────────────────────────────────────────────────────

const MOCK = {
  business: 'Demo Co',
  fy: 'FY25',
  fyRange: 'Jul 2024 – Jun 2025',
  verdict: {
    tone: 'good' as const,
    headline: 'Plan healthy',
    detail: 'Tracking 96% to revenue, gross profit within 1pt of target.',
  },
  meta: {
    setOn: 'Set 5 Jan 2025',
    lastEdited: 'Last edited 2 days ago by Matt',
    version: 'v3 of 5',
  },
  status: {
    label: 'Active',
    lastSaved: 'Last saved 2 min ago',
  },
  xero: {
    connected: true,
    lastSync: 'Synced 1h ago',
  },
  kpis: [
    {
      label: 'Revenue',
      value: '$480k',
      unit: 'YTD',
      planLabel: 'Plan: $500k',
      planStatus: 'on track',
      planTone: 'good' as const,
      yoy: '+5% YoY',
      yoyDirection: 'up' as const,
      // 12 monthly points, healthy upward trend
      sparkline: [12, 18, 22, 30, 35, 40, 48, 55, 62, 70, 78, 85],
      sparkTone: 'good' as const,
    },
    {
      label: 'Gross Profit',
      value: '42.0%',
      unit: 'margin YTD',
      planLabel: 'Plan: 42.5%',
      planStatus: 'watch',
      planTone: 'warn' as const,
      yoy: '−1pt to plan',
      yoyDirection: 'down' as const,
      sparkline: [44, 43, 43, 44, 43, 42, 42, 41, 42, 42, 42, 42],
      sparkTone: 'warn' as const,
    },
    {
      label: 'Net Profit',
      value: '$51k',
      unit: 'YTD',
      planLabel: 'Plan: $48k',
      planStatus: 'ahead',
      planTone: 'good' as const,
      yoy: '+12% YoY',
      yoyDirection: 'up' as const,
      sparkline: [3, 5, 6, 9, 12, 18, 24, 30, 36, 41, 47, 51],
      sparkTone: 'good' as const,
    },
    {
      label: 'Team Cost',
      value: '$385k',
      unit: 'YTD',
      planLabel: 'Plan: $390k',
      planStatus: 'on track',
      planTone: 'good' as const,
      yoy: '5 ppl · +1 hire Sep',
      yoyDirection: 'flat' as const,
      sparkline: [30, 32, 32, 33, 33, 32, 33, 32, 32, 33, 32, 33],
      sparkTone: 'good' as const,
    },
  ],
  overview: [
    {
      label: 'Revenue mix',
      value:
        'Top 3 lines: Product A $250k · Service B $150k · Other $100k',
    },
    { label: 'COGS rate', value: '38% (in line with target 38%)' },
    {
      label: 'Team plan',
      value: '5 current · 1 hire planned Sep · $385k annual cost',
    },
    { label: 'Operating costs', value: '$180k/yr · within budget' },
    { label: 'Profit target', value: '8% net margin (current 10.6%)' },
  ],
  alerts: [
    {
      tone: 'warn' as const,
      title: 'Subscription costs trending 12% over plan',
      detail: '$24k actual vs $21k budget — review SaaS stack this quarter.',
    },
    {
      tone: 'warn' as const,
      title: 'October revenue not yet validated',
      detail: 'Pipeline at $42k — confirm against signed deals before lock.',
    },
    {
      tone: 'good' as const,
      title: 'Q3 hire on schedule',
      detail: 'Interviews scheduled · offer expected by Sep 12.',
    },
  ],
  detailTabs: ['P&L Waterfall', 'Assumptions', 'Versions', 'Export'] as const,
}

// Toast helper — every button shows the same "prototype" notice
const stub = (label: string) => () =>
  toast(`${label}`, { description: '(prototype — no action wired)' })

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ForecastPreviewV2Page() {
  const [overviewOpen, setOverviewOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<string>(MOCK.detailTabs[0])

  return (
    <div className="min-h-screen bg-stone-50 text-gray-900 antialiased">
      <main className="mx-auto max-w-[1200px] px-6 py-10 lg:px-10 lg:py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-14">
          {/* MAIN COLUMN ───────────────────────────────────────────────────── */}
          <div className="space-y-12">
            <HeroBar />
            <KpiRow />
            <PlanOverview
              open={overviewOpen}
              onToggle={() => setOverviewOpen((v) => !v)}
            />
            <Attention />
            <DetailTabs active={activeTab} onChange={setActiveTab} />
          </div>

          {/* RIGHT RAIL ────────────────────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-10 lg:self-start">
            <RightRail />
          </aside>
        </div>

        <footer className="mt-20 border-t border-gray-200 pt-6 text-xs text-gray-400">
          Prototype · /preview/forecast-v2 · mock data only
        </footer>
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero bar — the 5-second answer to "is my plan healthy?"
// ─────────────────────────────────────────────────────────────────────────────

function HeroBar() {
  const { verdict, meta, business, fy, fyRange } = MOCK
  return (
    <header className="space-y-4">
      <div className="flex items-baseline gap-3 text-xs uppercase tracking-[0.18em] text-gray-400">
        <span>{business}</span>
        <span aria-hidden className="text-gray-300">·</span>
        <span>
          {fy} Plan
        </span>
        <span aria-hidden className="text-gray-300">·</span>
        <span className="lowercase tracking-normal text-gray-400">
          {fyRange}
        </span>
      </div>

      <h1 className="font-serif text-4xl leading-tight tracking-tight text-gray-900 sm:text-5xl">
        <span className="inline-flex items-center gap-3 align-middle">
          <StatusDot tone={verdict.tone} size="lg" />
          {verdict.headline}
        </span>{' '}
        <span className="text-gray-500">— {verdict.detail}</span>
      </h1>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
        <span>{meta.setOn}</span>
        <span aria-hidden className="text-gray-300">·</span>
        <span>{meta.lastEdited}</span>
        <span aria-hidden className="text-gray-300">·</span>
        <span className="font-medium text-gray-700">{meta.version}</span>
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI row — Plan vs Actual, 4 metrics, sparklines
// ─────────────────────────────────────────────────────────────────────────────

function KpiRow() {
  return (
    <section aria-label="Plan vs Actual">
      <SectionLabel>Plan vs Actual</SectionLabel>
      <div className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-gray-200 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        {MOCK.kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>
    </section>
  )
}

interface KpiCardProps {
  kpi: (typeof MOCK.kpis)[number]
}

function KpiCard({ kpi }: KpiCardProps) {
  const trendIcon =
    kpi.yoyDirection === 'up' ? (
      <TrendingUp className="h-3.5 w-3.5" aria-hidden />
    ) : kpi.yoyDirection === 'down' ? (
      <TrendingDown className="h-3.5 w-3.5" aria-hidden />
    ) : null

  const trendColor =
    kpi.yoyDirection === 'up'
      ? 'text-emerald-600'
      : kpi.yoyDirection === 'down'
      ? 'text-amber-600'
      : 'text-gray-500'

  return (
    <article className="flex h-full flex-col justify-between bg-white p-7">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">
          {kpi.label}
        </p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-serif text-4xl font-semibold tracking-tight tabular-nums text-gray-900">
            {kpi.value}
          </span>
          <span className="text-xs text-gray-400">{kpi.unit}</span>
        </div>
        <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${trendColor}`}>
          {trendIcon}
          {kpi.yoy}
        </p>
      </div>

      <div className="mt-6">
        <Sparkline data={kpi.sparkline} tone={kpi.sparkTone} />
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-3 text-xs">
        <span className="text-gray-500">{kpi.planLabel}</span>
        <span
          className={`inline-flex items-center gap-1 font-medium ${
            kpi.planTone === 'good' ? 'text-emerald-600' : 'text-amber-600'
          }`}
        >
          <StatusDot tone={kpi.planTone} />
          {kpi.planStatus}
        </span>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline — inline SVG, single line + gradient fill
// ─────────────────────────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[]
  tone: 'good' | 'warn'
}

function Sparkline({ data, tone }: SparklineProps) {
  const w = 120
  const h = 32
  const pad = 1
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const stepX = (w - pad * 2) / (data.length - 1)
  const points = data.map((v, i) => {
    const x = pad + i * stepX
    const y = pad + (1 - (v - min) / range) * (h - pad * 2)
    return [x, y] as const
  })

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')

  const areaPath = `${linePath} L ${points[points.length - 1][0].toFixed(2)} ${h} L ${points[0][0].toFixed(2)} ${h} Z`

  const stroke = tone === 'good' ? 'stroke-emerald-500' : 'stroke-amber-500'
  const fill = tone === 'good' ? 'url(#spark-good)' : 'url(#spark-warn)'

  const lastX = points[points.length - 1][0]
  const lastY = points[points.length - 1][1]
  const dotColor = tone === 'good' ? 'fill-emerald-500' : 'fill-amber-500'

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="none"
      className="overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id="spark-good" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="spark-warn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(245 158 11)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="rgb(245 158 11)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} className={fill ? '' : ''} fill={fill} />
      <path
        d={linePath}
        className={`${stroke} fill-none`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2} className={dotColor} />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan overview — collapsible, 5 lines of plan summary
// ─────────────────────────────────────────────────────────────────────────────

interface PlanOverviewProps {
  open: boolean
  onToggle: () => void
}

function PlanOverview({ open, onToggle }: PlanOverviewProps) {
  return (
    <section aria-label="Plan overview">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center justify-between text-left"
      >
        <SectionLabel>Plan overview</SectionLabel>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 group-hover:text-gray-900">
          {open ? 'Hide' : 'Show'}
          {open ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </span>
      </button>

      {open && (
        <dl className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm">
          {MOCK.overview.map((row, i) => (
            <div
              key={row.label}
              className={`flex flex-col gap-1 px-7 py-5 sm:flex-row sm:items-baseline sm:gap-8 ${
                i !== 0 ? 'border-t border-gray-100' : ''
              }`}
            >
              <dt className="w-44 flex-shrink-0 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">
                {row.label}
              </dt>
              <dd className="text-sm leading-relaxed text-gray-800 tabular-nums">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Attention — smart alerts with restrained dot indicators
// ─────────────────────────────────────────────────────────────────────────────

function Attention() {
  return (
    <section aria-label="Attention">
      <SectionLabel>Attention</SectionLabel>
      <ul className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm">
        {MOCK.alerts.map((alert, i) => (
          <li
            key={alert.title}
            className={`flex items-start gap-4 px-7 py-5 ${
              i !== 0 ? 'border-t border-gray-100' : ''
            }`}
          >
            <div className="mt-0.5">
              {alert.tone === 'good' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{alert.title}</p>
              <p className="mt-0.5 text-sm text-gray-500">{alert.detail}</p>
            </div>
            <button
              onClick={stub(`Open: ${alert.title}`)}
              className="flex-shrink-0 text-xs font-medium text-gray-400 hover:text-gray-900"
              aria-label={`Open ${alert.title}`}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail tabs — demoted, just labels for the prototype
// ─────────────────────────────────────────────────────────────────────────────

interface DetailTabsProps {
  active: string
  onChange: (v: string) => void
}

function DetailTabs({ active, onChange }: DetailTabsProps) {
  return (
    <section aria-label="Detail">
      <SectionLabel>Detail</SectionLabel>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-b border-gray-200">
        {MOCK.detailTabs.map((tab) => {
          const isActive = active === tab
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                onChange(tab)
                stub(`Open ${tab}`)()
              }}
              className={`-mb-px border-b-2 pb-3 text-sm transition-colors ${
                isActive
                  ? 'border-gray-900 text-gray-900 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          )
        })}
      </div>
      <p className="mt-5 text-sm text-gray-500">
        Power-user views live behind these tabs — tables, raw assumptions, version history.
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Right rail — sticky on desktop, drops below on mobile
// ─────────────────────────────────────────────────────────────────────────────

function RightRail() {
  const actions: { label: string; primary?: boolean }[] = [
    { label: 'Edit Plan', primary: true },
    { label: 'Save Version' },
    { label: 'Duplicate' },
    { label: 'Lock FY' },
    { label: 'Export' },
  ]

  return (
    <div className="space-y-8">
      <RailGroup label="Status">
        <div className="flex items-center gap-2 text-sm text-gray-900">
          <StatusDot tone="good" />
          <span className="font-medium">{MOCK.status.label}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">{MOCK.status.lastSaved}</p>
      </RailGroup>

      <RailGroup label="Xero">
        <div className="flex items-center gap-2 text-sm text-gray-900">
          <Activity className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          <span className="font-medium">{MOCK.xero.lastSync}</span>
        </div>
        <button
          onClick={stub('Sync now')}
          className="mt-2 text-xs font-medium text-gray-700 underline-offset-4 hover:text-gray-900 hover:underline"
        >
          Sync now
        </button>
      </RailGroup>

      <RailGroup label="Actions">
        <div className="flex flex-col gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={stub(a.label)}
              className={
                a.primary
                  ? 'inline-flex items-center justify-between rounded-md bg-gray-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800'
                  : 'inline-flex items-center justify-between rounded-md border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-800 transition-colors hover:border-gray-300 hover:bg-gray-50'
              }
            >
              {a.label}
              <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
            </button>
          ))}
        </div>
      </RailGroup>
    </div>
  )
}

interface RailGroupProps {
  label: string
  children: React.ReactNode
}

function RailGroup({ label, children }: RailGroupProps) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400">
        {label}
      </p>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny shared bits
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-500">
      {children}
    </h2>
  )
}

interface StatusDotProps {
  tone: 'good' | 'warn' | 'bad'
  size?: 'sm' | 'lg'
}

function StatusDot({ tone, size = 'sm' }: StatusDotProps) {
  const color =
    tone === 'good'
      ? 'bg-emerald-500'
      : tone === 'warn'
      ? 'bg-amber-500'
      : 'bg-red-500'
  const dim = size === 'lg' ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5'
  return (
    <span
      aria-hidden
      className={`inline-block flex-shrink-0 rounded-full ${color} ${dim}`}
    />
  )
}
