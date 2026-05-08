'use client'

/**
 * PROTOTYPE — Medium-level forecast page restructure preview
 *
 * Sandbox route at /finances/forecast/preview-v2 for Matt to evaluate the
 * proposed UX direction. NO real data, NO Supabase, NO Xero. Pure static UI
 * with mock data inline. Buttons toast a placeholder message.
 *
 * This file does NOT touch the production forecast at /finances/forecast.
 */

import { useState } from 'react'
import {
  TrendingUp,
  Edit3,
  Save,
  Lock,
  Cloud,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Copy,
  Download,
  Check,
  Users,
  Target,
  DollarSign,
  ArrowUpRight,
} from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/ui/PageHeader'

// ─────────────────────────────────────────────────────────────────────────────
// Mock data (inline — prototype only)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK = {
  business: 'Demo Co',
  fiscalYearLabel: 'FY25',
  status: 'Active' as const,
  lastSavedRelative: '2 minutes ago',
  xero: {
    connected: true,
    lastSyncRelative: '1h ago',
  },
  plan: {
    revenue: {
      value: '$500k',
      delta: '+5% YoY',
    },
    grossProfit: {
      value: '42%',
      delta: 'vs goal',
      direction: 'up' as const,
    },
    team: {
      value: '5 ppl',
      delta: '+1 hire',
    },
    goals: '$500k revenue, 8% net margin',
    revenueLines: [
      { name: 'Product A', amount: '$250k' },
      { name: 'Service B', amount: '$150k' },
      { name: 'Other', amount: '$100k' },
    ],
    teamSummary: '5 people on payroll, 1 hire planned Q3',
  },
} as const

type TabKey = 'assumptions' | 'pl' | 'versions'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'assumptions', label: 'Assumptions' },
  { key: 'pl', label: 'P&L Forecast' },
  { key: 'versions', label: 'Versions' },
]

const TAB_COPY: Record<TabKey, string> = {
  assumptions:
    'Plan Overview is now the primary view above. Detailed assumptions can stay here for power users — currently the same content as today’s Assumptions tab.',
  pl:
    'Same large P&L table as today — demoted to a tab for power users who want to edit cell-by-cell.',
  versions: 'Same versions list as today.',
}

// Toast helper used by every prototype button.
const stub = (label: string) => () =>
  toast.success(`${label} (prototype — no action)`)

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ForecastPreviewV2Page() {
  const [overviewOpen, setOverviewOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('assumptions')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Banner header — matches existing forecast page visual language */}
      <PageHeader
        variant="banner"
        title="Financial Forecast"
        subtitle={`${MOCK.fiscalYearLabel} — ${MOCK.business} (Preview v2)`}
        icon={TrendingUp}
        actions={
          <>
            <button
              onClick={stub('Edit Plan')}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 border border-white/20 rounded-lg transition-colors shadow-sm"
            >
              <Edit3 className="w-4 h-4" />
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={stub('Save')}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">Save</span>
            </button>
            <button
              onClick={stub('Lock FY')}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-lg transition-colors shadow-sm"
            >
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </>
        }
      />

      <div className="max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-6">
          {/* MAIN COLUMN ───────────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Status pill row */}
            <StatusPillRow />

            {/* Xero connection card */}
            <XeroConnectionCard />

            {/* Plan Overview (collapsible) */}
            <PlanOverviewCard
              open={overviewOpen}
              onToggle={() => setOverviewOpen((v) => !v)}
            />

            {/* Tabs row */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex border-b border-gray-200" role="tablist">
                {TABS.map((t) => {
                  const active = activeTab === t.key
                  return (
                    <button
                      key={t.key}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveTab(t.key)}
                      className={`px-4 sm:px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                        active
                          ? 'border-brand-orange text-brand-navy'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>

              {/* Tab content placeholder */}
              <div className="p-6 sm:p-8">
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 sm:p-8 text-center">
                  <p className="text-sm text-gray-600 max-w-2xl mx-auto leading-relaxed">
                    {TAB_COPY[activeTab]}
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-wide text-gray-400">
                    Prototype placeholder
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SIDEBAR ───────────────────────────────────────────────────────── */}
          <aside className="md:sticky md:top-28 md:self-start">
            <QuickActionsSidebar />
          </aside>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatusPillRow() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Status: {MOCK.status}
      </span>
      <span className="text-xs sm:text-sm text-gray-500">
        Last saved {MOCK.lastSavedRelative}
      </span>
    </div>
  )
}

function XeroConnectionCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
          <Check className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-gray-400" />
            Xero Connected
          </p>
          <p className="text-xs text-gray-500">
            Last sync {MOCK.xero.lastSyncRelative}
          </p>
        </div>
      </div>
      <button
        onClick={stub('Sync now')}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-brand-navy bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Sync now
      </button>
    </div>
  )
}

interface PlanOverviewCardProps {
  open: boolean
  onToggle: () => void
}

function PlanOverviewCard({ open, onToggle }: PlanOverviewCardProps) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 sm:px-6 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-orange/10 border border-brand-orange/20 flex items-center justify-center">
            <Target className="w-4 h-4 text-brand-orange" />
          </div>
          <div className="text-left">
            <h2 className="text-sm sm:text-base font-semibold text-gray-900 uppercase tracking-wide">
              Plan Overview
            </h2>
            <p className="text-xs text-gray-500">
              Goals, revenue lines, and team — your plan at a glance
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 sm:px-6 py-5 space-y-6">
          {/* KPI tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiTile
              icon={DollarSign}
              label="Revenue"
              value={MOCK.plan.revenue.value}
              delta={MOCK.plan.revenue.delta}
              onEdit={stub('Edit Revenue')}
              accent="orange"
            />
            <KpiTile
              icon={ArrowUpRight}
              label="GP%"
              value={MOCK.plan.grossProfit.value}
              delta={MOCK.plan.grossProfit.delta}
              onEdit={stub('Edit GP%')}
              accent="navy"
              showTrend
            />
            <KpiTile
              icon={Users}
              label="Team"
              value={MOCK.plan.team.value}
              delta={MOCK.plan.team.delta}
              onEdit={stub('Edit Team')}
              accent="emerald"
            />
          </div>

          {/* Plan summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Goals
              </h3>
              <p className="text-sm text-gray-800 leading-relaxed">
                {MOCK.plan.goals}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Top revenue lines
              </h3>
              <ul className="space-y-1.5">
                {MOCK.plan.revenueLines.map((line) => (
                  <li
                    key={line.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-700">• {line.name}</span>
                    <span className="font-medium text-gray-900 tabular-nums">
                      {line.amount}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Team
              </h3>
              <p className="text-sm text-gray-800 leading-relaxed">
                {MOCK.plan.teamSummary}
              </p>
            </div>
          </div>

          {/* Edit row */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            <SmallEditButton onClick={stub('Edit Goals')} label="Edit Goals" />
            <SmallEditButton
              onClick={stub('Edit Revenue')}
              label="Edit Revenue"
            />
            <SmallEditButton onClick={stub('Edit Team')} label="Edit Team" />
          </div>
        </div>
      )}
    </section>
  )
}

interface KpiTileProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  delta: string
  onEdit: () => void
  accent: 'orange' | 'navy' | 'emerald'
  showTrend?: boolean
}

function KpiTile({
  icon: Icon,
  label,
  value,
  delta,
  onEdit,
  accent,
  showTrend = false,
}: KpiTileProps) {
  const accentClasses = {
    orange: 'bg-brand-orange/10 text-brand-orange border-brand-orange/20',
    navy: 'bg-brand-navy/10 text-brand-navy border-brand-navy/20',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  }[accent]

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div
          className={`w-8 h-8 rounded-md border flex items-center justify-center ${accentClasses}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <button
          onClick={onEdit}
          className="text-xs font-medium text-gray-500 hover:text-brand-navy transition-colors inline-flex items-center gap-1"
          aria-label={`Edit ${label}`}
        >
          <Edit3 className="w-3 h-3" />
          Edit
        </button>
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5 tabular-nums">
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
        {showTrend && (
          <ArrowUpRight className="w-3 h-3 text-emerald-600" />
        )}
        {delta}
      </p>
    </div>
  )
}

interface SmallEditButtonProps {
  label: string
  onClick: () => void
}

function SmallEditButton({ label, onClick }: SmallEditButtonProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-navy bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
    >
      <Edit3 className="w-3 h-3" />
      {label}
    </button>
  )
}

function QuickActionsSidebar() {
  const items: { label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { label: 'Edit Plan', icon: Edit3 },
    { label: 'Save Version', icon: Save },
    { label: 'Duplicate', icon: Copy },
    { label: 'Lock FY', icon: Lock },
    { label: 'Export', icon: Download },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Quick Actions
        </h3>
      </div>
      <div className="p-2 flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              onClick={stub(item.label)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-brand-navy rounded-md transition-colors text-left"
            >
              <Icon className="w-4 h-4 text-gray-400" />
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
