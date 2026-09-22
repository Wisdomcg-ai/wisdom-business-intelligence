'use client'

/**
 * "Start from Xero budget" — the button, its one-line status, and the picker.
 *
 * Shared by the forecast empty state and the Forecast Builder selector so
 * both surfaces say the same thing for the same availability state:
 *   available     → enabled button + "“Overall Budget” · covers 12 of 12 months"
 *   scope_missing → disabled button + "Reconnect Xero" into Integrations
 *   none          → one quiet sentence (no button)
 *   error/failed  → "Couldn't check Xero for a budget" + Retry (no button)
 *   not_connected / checking → nothing
 *
 * Opt-in by construction: nothing is posted until the operator clicks, and
 * with more than one budget on offer they choose in the picker first.
 */
import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { describeCoverage, type BudgetChoice } from '@/lib/forecast/xero-budget-seed-client'
import type { BudgetAvailability } from './useBudgetAvailability'
import { BudgetPicker } from './BudgetPicker'

export interface XeroBudgetSeedChoice {
  tenantId: string
  budgetId: string
  budgetName: string
  /** The empty forecast to seed when the surface knows it (selector); else the page decides. */
  forecastId?: string
  /** That forecast's current name, so the wizard keeps it rather than defaulting on Generate. */
  forecastName?: string | null
}

export interface XeroBudgetStartProps {
  availability: BudgetAvailability
  fiscalYear: number
  onSeed: (choice: XeroBudgetSeedChoice) => void
  /** True while the seed POST is in flight. */
  busy?: boolean
  /** Another start (prior-year seed, blank) is in flight — disable this one too. */
  otherBusy?: boolean
  /** Where "Reconnect Xero" goes; the caller keeps coach-client context. */
  integrationsHref: string
  /** Button size: the empty state's hero row or the selector's compact footer. */
  size?: 'lg' | 'md'
  /** Render only the status line (the caller places the button itself). */
  lineOnly?: boolean
  className?: string
}

export function integrationsHrefFor(pathname: string | null | undefined): string {
  const p = pathname ?? ''
  return p.includes('/coach/clients/') ? p.replace(/\/view\/.*$/, '/view/integrations') : '/integrations'
}

export function XeroBudgetStartButton({
  availability,
  onClick,
  busy = false,
  otherBusy = false,
  size = 'lg',
}: {
  availability: BudgetAvailability
  onClick: () => void
  busy?: boolean
  otherBusy?: boolean
  size?: 'lg' | 'md'
}) {
  if (!availability.ctaVisible) return null
  const sizing = size === 'lg' ? 'px-5 py-3 text-base' : 'px-4 py-3 text-sm'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={availability.state !== 'available' || busy || otherBusy}
      title={availability.state === 'scope_missing' ? 'Reconnect Xero to grant access to budgets' : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${sizing}`}
    >
      <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
      {busy ? 'Importing…' : 'Start from Xero budget'}
    </button>
  )
}

export function XeroBudgetAvailabilityLine({
  availability,
  fiscalYear,
  integrationsHref,
  className = '',
}: {
  availability: BudgetAvailability
  fiscalYear: number
  integrationsHref: string
  className?: string
}) {
  const { state, singleChoice, choices, orgCount, retry } = availability
  const base = `text-sm ${className}`
  if (state === 'available' && singleChoice) {
    return (
      <p className={`${base} text-gray-600`} data-testid="budget-availability">
        Xero budget <span className="font-medium text-gray-900">“{singleChoice.name}”</span>
        {orgCount > 1 ? <> ({singleChoice.orgName})</> : null}
        {' · '}{describeCoverage(singleChoice.coverage, fiscalYear)}
      </p>
    )
  }
  if (state === 'available' && choices.length > 1) {
    return (
      <p className={`${base} text-gray-600`} data-testid="budget-availability">
        {choices.length} Xero budgets found for FY{fiscalYear} — you&apos;ll choose one.
      </p>
    )
  }
  if (state === 'scope_missing') {
    return (
      <p className={`${base} text-gray-600`} data-testid="budget-availability">
        <Link href={integrationsHref} className="font-medium text-brand-navy hover:underline">
          Reconnect Xero
        </Link>{' '}
        to enable importing this year&apos;s budget — the connection predates budget access.
      </p>
    )
  }
  if (state === 'none') {
    return (
      <p className={`${base} text-gray-500`} data-testid="budget-availability">
        No budget found in Xero for FY{fiscalYear}.
      </p>
    )
  }
  if (state === 'failed' || state === 'error') {
    return (
      <p className={`${base} text-amber-700 inline-flex items-center gap-1.5`} data-testid="budget-availability">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Couldn&apos;t check Xero for a budget.
        <button type="button" onClick={retry} className="inline-flex items-center gap-1 font-medium underline">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
        </button>
      </p>
    )
  }
  if (state === 'checking') {
    // The check round-trips to Xero for every budget the org has (4–8s on
    // Urban Road). Without this line the button simply appears late and the
    // operator has no idea anything is happening.
    return (
      <p className={`${base} text-gray-400 inline-flex items-center gap-1.5`} data-testid="budget-availability" aria-live="polite">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Checking Xero for a budget…
      </p>
    )
  }
  return null
}

/**
 * Owns the click → (seed | open picker) decision and the picker itself.
 * Renders the button (unless `lineOnly`) and, separately, the status line so
 * callers can lay them out; wrap in a fragment-friendly container.
 */
export function XeroBudgetStart({
  availability,
  fiscalYear,
  onSeed,
  busy = false,
  otherBusy = false,
  integrationsHref,
  size = 'lg',
  lineOnly = false,
  className = '',
}: XeroBudgetStartProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { choices, singleChoice } = availability

  const start = () => {
    if (choices.length === 0) return
    if (singleChoice) {
      onSeed({ tenantId: singleChoice.tenantId, budgetId: singleChoice.budgetId, budgetName: singleChoice.name })
      return
    }
    setPickerOpen(true)
  }

  const confirm = (c: BudgetChoice) => {
    setPickerOpen(false)
    onSeed({ tenantId: c.tenantId, budgetId: c.budgetId, budgetName: c.name })
  }

  return (
    <>
      {!lineOnly && (
        <XeroBudgetStartButton availability={availability} onClick={start} busy={busy} otherBusy={otherBusy} size={size} />
      )}
      <XeroBudgetAvailabilityLine
        availability={availability}
        fiscalYear={fiscalYear}
        integrationsHref={integrationsHref}
        className={className}
      />
      {pickerOpen && (
        <BudgetPicker
          choices={choices}
          fiscalYear={fiscalYear}
          busy={busy}
          onCancel={() => setPickerOpen(false)}
          onConfirm={confirm}
        />
      )}
    </>
  )
}
