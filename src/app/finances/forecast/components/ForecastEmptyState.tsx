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
 *
 * Data fetched here:
 *   - GET /api/Xero/pl-summary?business_id=&fiscal_year= → HistoricalPLSummary
 *     { has_xero_data, current_ytd: { total_revenue, gross_profit, net_profit, … } }
 *
 * Errors / no-Xero state are silently absorbed — the empty state always
 * renders the headline + CTA, and only adds the YTD card when data is
 * positively present. Never blocks the user from clicking through.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Plug, Sparkles, TrendingUp } from 'lucide-react'
import type { HistoricalPLSummary } from '../types'
import { DEFAULT_YEAR_START_MONTH, getCurrentFiscalYear } from '@/lib/utils/fiscal-year-utils'

export interface ForecastEmptyStateProps {
  businessId: string
  fiscalYear: number
  /** Opens the wizard with startFresh=true. */
  onCreateForecast: () => void
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

export default function ForecastEmptyState({
  businessId,
  fiscalYear,
  onCreateForecast,
  priorFiscalYearWithForecast,
  onSwitchFiscalYear,
  yearStartMonth = DEFAULT_YEAR_START_MONTH,
}: ForecastEmptyStateProps) {
  const [summary, setSummary] = useState<HistoricalPLSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  const ytd = summary?.current_ytd
  const hasXeroData = !!summary?.has_xero_data && !!ytd && ytd.months_count > 0

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
          <button
            type="button"
            onClick={onCreateForecast}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-orange text-white text-base font-semibold rounded-lg shadow-sm hover:bg-brand-orange-600 transition-colors"
          >
            <Sparkles className="w-5 h-5" strokeWidth={2.25} />
            Start FY{fiscalYear} Forecast
          </button>
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
