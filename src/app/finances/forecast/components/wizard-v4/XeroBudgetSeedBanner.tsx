'use client'

/**
 * Provenance banner for forecasts seeded from a Xero budget.
 *
 * Renders nothing unless `seedSource.kind === 'xero_budget'`, so every step
 * can drop it in unconditionally. The wording is the caller's — each step
 * says what the seed means for THAT step — and the frame is shared so the
 * operator recognises it as the same fact wherever it appears.
 */
import type { ReactNode } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import type { ForecastSeedSource } from '@/lib/services/xero-budget-seed-service'

export interface XeroBudgetSeedBannerProps {
  seedSource: ForecastSeedSource | null | undefined
  children: ReactNode
  className?: string
}

export function isXeroBudgetSeed(
  seedSource: ForecastSeedSource | null | undefined,
): seedSource is ForecastSeedSource {
  return !!seedSource && seedSource.kind === 'xero_budget'
}

export function XeroBudgetSeedBanner({ seedSource, children, className = '' }: XeroBudgetSeedBannerProps) {
  if (!isXeroBudgetSeed(seedSource)) return null
  return (
    <div
      role="note"
      data-testid="xero-budget-seed-banner"
      className={`flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 ${className}`}
    >
      <FileSpreadsheet className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600" aria-hidden="true" />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  )
}

/** Small inline tag for a line that came in from the budget. */
export function XeroBudgetChip({ title = 'Imported from your Xero budget' }: { title?: string }) {
  return (
    <span
      title={title}
      data-testid="xero-budget-chip"
      className="inline-flex items-center rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 whitespace-nowrap"
    >
      Xero budget
    </span>
  )
}
