'use client'

/**
 * ForecastEmptyState — first-impression surface for tenants with no forecast.
 *
 * Phase 58.3: replaces the legacy auto-show ForecastSelector flow that fired
 * when a tenant landed on /finances/forecast without ever having built a
 * forecast. SMB owners now get an inviting inline empty state with:
 *   1. Headline + sub-text explaining the dashboard's value
 *   2. Primary CTA — "Create Forecast" — opens the wizard
 *   3. Optional Xero YTD summary card so first-load isn't completely blank
 *      when historical data is already available
 *   4. Connect-Xero prompt when no historical data exists
 *   5. (Sep 2026, budget-seed PR 4) "Start from Xero budget" — an OPT-IN
 *      third start when the org has a Budget Manager budget for this FY.
 *      Never assumed: the operator chooses it, and it is one-shot.
 *
 * Data fetched here:
 *   - GET /api/Xero/pl-summary?business_id=&fiscal_year= → HistoricalPLSummary
 *     { has_xero_data, current_ytd: { total_revenue, gross_profit, net_profit, … } }
 *   - GET /api/Xero/budgets?business_id=&fiscal_year= → BudgetAvailabilityResponse
 *     five-state: available | none | scope_missing | not_connected | error.
 *     A failed CHECK is shown as "couldn't check", never as "no budget".
 *
 * Errors / no-Xero state are silently absorbed — the empty state always
 * renders the headline + CTA, and only adds the YTD card when data is
 * positively present. Never blocks the user from clicking through.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, ArrowRight, FileSpreadsheet, Plug, RefreshCw, Sparkles, TrendingUp, X } from 'lucide-react'
import type { HistoricalPLSummary } from '../types'
import { DEFAULT_YEAR_START_MONTH, getCurrentFiscalYear } from '@/lib/utils/fiscal-year-utils'
import type { BudgetAvailabilityResponse } from '@/lib/xero/budget-availability'
import {
  describeCoverage,
  hasMixedCurrencies,
  listBudgetChoices,
  pickDefaultBudget,
  type BudgetChoice,
} from '@/lib/forecast/xero-budget-seed-client'

export interface ForecastEmptyStateProps {
  businessId: string
  fiscalYear: number
  /** Opens the wizard with startFresh=true. */
  onCreateForecast: () => void
  /**
   * When provided alongside priorFiscalYearWithForecast, surfaces a
   * "Seed from FY{prior}" primary CTA so the operator can copy last
   * year's revenue/COGS/OpEx/team lines into the new forecast.
   */
  onSeedForecast?: () => void
  /** True while POST /api/forecast/seed-from-prior is in flight. Disables the seed button. */
  isSeedingForecast?: boolean
  /**
   * Budget-seed entry point. When provided, the empty state checks Xero for a
   * Budget Manager budget covering this FY and offers "Start from Xero budget".
   * Called with the operator's explicit (org, budget) choice.
   */
  onSeedFromXeroBudget?: (choice: { tenantId: string; budgetId: string; budgetName: string }) => void
  /** True while POST /api/forecast/seed-from-xero-budget is in flight. */
  isSeedingFromBudget?: boolean
  /**
   * Prior FY for which a saved forecast exists. When set, the empty state
   * surfaces a discrete "View/edit FYxx" affordance so a user landed on a
   * planning-season default (e.g. FY27) can still reach last year's forecast.
   */
  priorFiscalYearWithForecast?: number | null
  /** Switch the page's selected fiscal year. */
  onSwitchFiscalYear?: (fy: number) => void
  /** Business's fiscal year start month (1-12). Defaults to 7 (AU FY). */
  yearStartMonth?: number
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  let body: string
  if (abs >= 1_000_000) {
    body = `$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  } else if (abs >= 1000) {
    body = `$${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`
  } else {
    body = `$${Math.round(abs).toLocaleString('en-US')}`
  }
  return n < 0 ? `−${body}` : body
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(1)}%`
}

type BudgetCheck =
  | { status: 'idle' | 'loading' }
  | { status: 'ok'; response: BudgetAvailabilityResponse }
  | { status: 'failed' }

export default function ForecastEmptyState({
  businessId,
  fiscalYear,
  onCreateForecast,
  onSeedForecast,
  isSeedingForecast = false,
  onSeedFromXeroBudget,
  isSeedingFromBudget = false,
  priorFiscalYearWithForecast,
  onSwitchFiscalYear,
  yearStartMonth = DEFAULT_YEAR_START_MONTH,
}: ForecastEmptyStateProps) {
  const [summary, setSummary] = useState<HistoricalPLSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [budgetCheck, setBudgetCheck] = useState<BudgetCheck>({ status: 'idle' })
  const [budgetCheckKey, setBudgetCheckKey] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Coach view lives under /coach/clients/<id>/view/…; the reconnect link must
  // stay inside that client's context. Same rule the wizard shell applies.
  const pathname = usePathname() ?? ''
  const integrationsHref = pathname.includes('/coach/clients/')
    ? pathname.replace(/\/view\/.*$/, '/view/integrations')
    : '/integrations'

  // When the wizard target FY is the upcoming year (planning-season default),
  // pulling Xero "YTD" data for that future FY returns nothing. Clamp the
  // actuals fetch to whichever year contains today.
  const actualsFiscalYear = Math.min(fiscalYear, getCurrentFiscalYear(yearStartMonth))

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    setIsLoading(true)

    fetch(`/api/Xero/pl-summary?business_id=${encodeURIComponent(businessId)}&fiscal_year=${actualsFiscalYear}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as { summary: HistoricalPLSummary }
      })
      .then((json) => {
        if (cancelled) return
        setSummary(json.summary ?? null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.warn('[ForecastEmptyState] pl-summary fetch failed', err)
        setSummary(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [businessId, actualsFiscalYear])

  // Budget availability — only when the page can act on it. The TARGET FY is
  // what matters here (the budget is for the year being planned), unlike the
  // actuals card above.
  useEffect(() => {
    if (!businessId || !onSeedFromXeroBudget) return
    let cancelled = false
    setBudgetCheck({ status: 'loading' })

    fetch(`/api/Xero/budgets?business_id=${encodeURIComponent(businessId)}&fiscal_year=${fiscalYear}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as BudgetAvailabilityResponse
      })
      .then((json) => {
        if (cancelled) return
        setBudgetCheck({ status: 'ok', response: json })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.warn('[ForecastEmptyState] budgets fetch failed', err)
        setBudgetCheck({ status: 'failed' })
      })

    return () => {
      cancelled = true
    }
    // budgetCheckKey re-runs the check on "Retry".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, fiscalYear, !!onSeedFromXeroBudget, budgetCheckKey])

  const retryBudgetCheck = useCallback(() => setBudgetCheckKey((k) => k + 1), [])

  const ytd = summary?.current_ytd
  const hasXeroData = !!summary?.has_xero_data && !!ytd && ytd.months_count > 0

  const budgetState: BudgetAvailabilityResponse['state'] | 'checking' | 'failed' | null =
    !onSeedFromXeroBudget
      ? null
      : budgetCheck.status === 'ok'
        ? budgetCheck.response.state
        : budgetCheck.status === 'failed'
          ? 'failed'
          : 'checking'
  const choices = budgetCheck.status === 'ok' ? listBudgetChoices(budgetCheck.response) : []
  const singleChoice = choices.length === 1 ? choices[0] : null
  const budgetCtaVisible = budgetState === 'available' || budgetState === 'scope_missing'

  const startFromBudget = () => {
    if (!onSeedFromXeroBudget || choices.length === 0) return
    if (singleChoice) {
      onSeedFromXeroBudget({ tenantId: singleChoice.tenantId, budgetId: singleChoice.budgetId, budgetName: singleChoice.name })
      return
    }
    setPickerOpen(true)
  }

  const hasPriorSeed = !!(priorFiscalYearWithForecast && onSeedForecast)
  const hasAlternatives = hasPriorSeed || budgetCtaVisible

  return (
    <div className="min-h-[60vh] flex items-start justify-center pt-8 sm:pt-16 px-4">
      <div className="max-w-2xl w-full text-center">
        {/* Icon + headline */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy-800 mb-5 shadow-sm">
          <TrendingUp className="w-7 h-7 text-white" strokeWidth={2} />
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight">
          Build your FY{fiscalYear} forecast
        </h1>
        <p className="mt-3 text-base sm:text-lg text-gray-600 max-w-xl mx-auto leading-relaxed">
          See your year-end trajectory, monthly trends, and key insights at a
          glance. Your forecast keeps you on track all year.
        </p>

        {/* Primary CTA */}
        <div className="mt-7">
          {hasAlternatives ? (
            /* Multi-CTA layout: seeds (primary) + blank (secondary) */
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
              {hasPriorSeed && (
                <button
                  type="button"
                  onClick={onSeedForecast}
                  disabled={isSeedingForecast || isSeedingFromBudget}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                  {isSeedingForecast ? 'Seeding…' : `Seed from FY${priorFiscalYearWithForecast}`}
                </button>
              )}
              {budgetCtaVisible && (
                <button
                  type="button"
                  onClick={startFromBudget}
                  disabled={budgetState !== 'available' || isSeedingFromBudget || isSeedingForecast}
                  title={budgetState === 'scope_missing' ? 'Reconnect Xero to grant access to budgets' : undefined}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
                  {isSeedingFromBudget ? 'Importing…' : 'Start from Xero budget'}
                </button>
              )}
              <button
                type="button"
                onClick={onCreateForecast}
                disabled={isSeedingForecast || isSeedingFromBudget}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-base font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-60"
              >
                Start FY{fiscalYear} blank
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            /* Single-CTA layout: preserved exactly for the no-alternatives case */
            <button
              type="button"
              onClick={onCreateForecast}
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-orange text-white text-base font-semibold rounded-lg shadow-sm hover:bg-brand-orange-600 transition-colors"
            >
              <Sparkles className="w-5 h-5" strokeWidth={2.25} />
              Start FY{fiscalYear} Forecast
            </button>
          )}

          {/* Budget availability line — one sentence, state-specific. */}
          {budgetState === 'available' && singleChoice && (
            <p className="mt-3 text-sm text-gray-600" data-testid="budget-availability">
              Xero budget <span className="font-medium text-gray-900">“{singleChoice.name}”</span>
              {budgetCheck.status === 'ok' && budgetCheck.response.orgs.length > 1 ? <> ({singleChoice.orgName})</> : null}
              {' · '}{describeCoverage(singleChoice.coverage, fiscalYear)}
            </p>
          )}
          {budgetState === 'available' && !singleChoice && choices.length > 1 && (
            <p className="mt-3 text-sm text-gray-600" data-testid="budget-availability">
              {choices.length} Xero budgets found for FY{fiscalYear} — you&apos;ll choose one.
            </p>
          )}
          {budgetState === 'scope_missing' && (
            <p className="mt-3 text-sm text-gray-600" data-testid="budget-availability">
              <Link href={integrationsHref} className="font-medium text-brand-navy hover:underline">
                Reconnect Xero
              </Link>{' '}
              to enable importing this year&apos;s budget — the connection predates budget access.
            </p>
          )}
          {budgetState === 'none' && (
            <p className="mt-3 text-sm text-gray-500" data-testid="budget-availability">
              No budget found in Xero for FY{fiscalYear}.
            </p>
          )}
          {budgetState === 'failed' || budgetState === 'error' ? (
            <p className="mt-3 text-sm text-amber-700 inline-flex items-center gap-1.5" data-testid="budget-availability">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Couldn&apos;t check Xero for a budget.
              <button type="button" onClick={retryBudgetCheck} className="inline-flex items-center gap-1 font-medium underline">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
              </button>
            </p>
          ) : null}

          <p className="mt-3 text-xs text-gray-500">
            Takes about 5 minutes · We&apos;ll guide you through every step
          </p>
          {priorFiscalYearWithForecast && onSwitchFiscalYear && (
            <p className="mt-4 text-sm text-gray-600">
              Or{' '}
              <button
                type="button"
                onClick={() => onSwitchFiscalYear(priorFiscalYearWithForecast)}
                className="text-brand-navy font-medium hover:underline"
              >
                view/edit your FY{priorFiscalYearWithForecast} forecast
              </button>
            </p>
          )}
        </div>

        {/* YTD summary or connect-Xero prompt */}
        <div className="mt-10">
          {isLoading ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
              <div className="h-3 w-40 bg-gray-100 rounded mx-auto mb-4" />
              <div className="grid grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-16 bg-gray-100 rounded mx-auto" />
                    <div className="h-6 w-20 bg-gray-100 rounded mx-auto" />
                  </div>
                ))}
              </div>
            </div>
          ) : hasXeroData && ytd ? (
            <YtdSummaryCard ytd={ytd} fiscalYear={actualsFiscalYear} />
          ) : (
            <ConnectXeroCard />
          )}
        </div>
      </div>

      {pickerOpen && onSeedFromXeroBudget && (
        <BudgetPicker
          choices={choices}
          fiscalYear={fiscalYear}
          busy={isSeedingFromBudget}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(c) => {
            setPickerOpen(false)
            onSeedFromXeroBudget({ tenantId: c.tenantId, budgetId: c.budgetId, budgetName: c.name })
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget picker — only when more than one (org, budget) pair is on offer
// ─────────────────────────────────────────────────────────────────────────────

interface BudgetPickerProps {
  choices: BudgetChoice[]
  fiscalYear: number
  busy: boolean
  onCancel: () => void
  onConfirm: (choice: BudgetChoice) => void
}

function BudgetPicker({ choices, fiscalYear, busy, onCancel, onConfirm }: BudgetPickerProps) {
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const d = pickDefaultBudget(choices)
    return d ? `${d.tenantId}|${d.budgetId}` : ''
  })
  const selected = choices.find((c) => `${c.tenantId}|${c.budgetId}` === selectedKey) ?? null
  const mixedCurrencies = hasMixedCurrencies(choices)
  const multiOrg = new Set(choices.map((c) => c.tenantId)).size > 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl text-left">
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2 id="budget-picker-title" className="text-lg font-semibold text-gray-900">
              Which Xero budget?
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              One budget seeds the FY{fiscalYear} forecast. This is a one-off import — it is not kept in sync.
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-gray-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {choices.map((c) => {
            const key = `${c.tenantId}|${c.budgetId}`
            const checked = key === selectedKey
            return (
              <label
                key={key}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                  checked ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="xero-budget"
                  className="mt-1"
                  checked={checked}
                  onChange={() => setSelectedKey(key)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900">
                    {c.name}
                    {c.type === 'OVERALL' ? (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 align-middle">Overall</span>
                    ) : (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 align-middle">Tracking</span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {multiOrg ? <>{c.orgName} · </> : null}
                    {describeCoverage(c.coverage, fiscalYear)} · {c.lineCount} account{c.lineCount === 1 ? '' : 's'}
                    {c.functionalCurrency ? <> · {c.functionalCurrency}</> : null}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        {mixedCurrencies && (
          <p className="mx-6 mb-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            These organisations report in different currencies. The forecast takes the chosen budget&apos;s figures as they are — no conversion is applied.
          </p>
        )}

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || busy}
            onClick={() => selected && onConfirm(selected)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? 'Importing…' : 'Import this budget'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// YTD summary — shown when Xero data is available
// ─────────────────────────────────────────────────────────────────────────────

interface YtdSummaryCardProps {
  ytd: NonNullable<HistoricalPLSummary['current_ytd']>
  fiscalYear: number
}

function YtdSummaryCard({ ytd, fiscalYear }: YtdSummaryCardProps) {
  const grossMargin = ytd.total_revenue > 0 ? (ytd.gross_profit / ytd.total_revenue) * 100 : null
  const netMargin = ytd.total_revenue > 0 ? (ytd.net_profit / ytd.total_revenue) * 100 : null

  return (
    <article className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 text-left">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Your Xero data so far this year
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          FY{fiscalYear} year-to-date · {ytd.months_count} {ytd.months_count === 1 ? 'month' : 'months'} of actuals
        </p>
      </header>

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-5">
        <div>
          <dt className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Revenue YTD</dt>
          <dd className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">
            {fmtMoney(ytd.total_revenue)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Gross Profit YTD</dt>
          <dd className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">
            {fmtMoney(ytd.gross_profit)}
          </dd>
          <div className="text-xs text-gray-500 mt-0.5">{fmtPct(grossMargin)} margin</div>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Net Profit YTD</dt>
          <dd className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">
            {fmtMoney(ytd.net_profit)}
          </dd>
          <div className="text-xs text-gray-500 mt-0.5">{fmtPct(netMargin)} margin</div>
        </div>
      </dl>

      <div className="pt-4 border-t border-gray-100 text-sm text-gray-600 inline-flex items-center gap-1.5">
        Build a forecast to compare against plan and see where you&apos;ll land
        <ArrowRight className="w-4 h-4 text-brand-orange" strokeWidth={2.25} />
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Connect-Xero prompt — shown when no historical data is available
// ─────────────────────────────────────────────────────────────────────────────

function ConnectXeroCard() {
  return (
    <article className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 text-left">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
          <Plug className="w-5 h-5 text-gray-600" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">
            Connect Xero to import your historical data
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            We&apos;ll pull your last 12 months of P&amp;L automatically — no
            manual entry needed. Your forecast will start with real numbers.
          </p>
          <Link
            href="/integrations"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-navy hover:underline"
          >
            Connect Xero
            <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
          </Link>
        </div>
      </div>
    </article>
  )
}
