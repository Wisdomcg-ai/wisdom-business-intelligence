/**
 * Phase 44.2 Plan 44.2-09 — DataIntegrityBanner.
 *
 * Surfaces the read-path quality signal computed by ForecastReadService
 * (44.2-07) and propagated through the 4 consumer routes (44.2-08).
 *
 * Behavior contract (D-44.2-02 / CONTEXT.md UX decision):
 *   - quality === 'verified'  → renders nothing (returns null)
 *   - otherwise               → faded-with-overlay alert above content;
 *                               numbers stay visible but de-emphasized
 *
 * Detail drawer opens on partial-quality "View detail"; surfaces the
 * per-tenant breakdown so coaches can pinpoint which Xero connection is
 * the source of any discrepancy.
 */
'use client'

import { useState } from 'react'
import { AlertTriangle, XCircle, CloudOff, Clock } from 'lucide-react'
import type { DataQuality, PerTenantQuality } from '@/lib/services/forecast-read-service'
import { DataIntegrityDetailDrawer } from './DataIntegrityDetailDrawer'

export interface DataIntegrityBannerProps {
  quality: DataQuality
  perTenantQuality: PerTenantQuality[]
  /** ISO timestamp of the latest sync across tenants (any tenant — for headline copy). */
  lastSyncAt?: string | null
  /** Optional re-sync trigger; surfaces a "Re-sync now" CTA when present. */
  onResync?: () => void
}

const STYLE_BY_QUALITY: Record<
  Exclude<DataQuality, 'verified'>,
  { bg: string; border: string; text: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  partial: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', Icon: AlertTriangle },
  failed: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', Icon: XCircle },
  no_sync: { bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-700', Icon: CloudOff },
  stale: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', Icon: Clock },
}

function copyFor(
  q: Exclude<DataQuality, 'verified'>,
  perTenant: PerTenantQuality[],
  lastSyncAt?: string | null,
): { headline: string; detail: string; cta: string } {
  const ts = lastSyncAt ? new Date(lastSyncAt).toLocaleString('en-AU') : 'unknown'
  const totalDiscrepancies = perTenant.reduce((s, t) => s + t.discrepancy_count, 0)
  const ageHours = lastSyncAt ? Math.round((Date.now() - new Date(lastSyncAt).getTime()) / 3600000) : null
  const age = ageHours != null ? `${ageHours}h ago` : 'unknown time ago'
  switch (q) {
    case 'partial':
      return {
        headline: 'Data verification in progress',
        detail: `Last sync at ${ts} found ${totalDiscrepancies} account${totalDiscrepancies === 1 ? '' : 's'} that don't reconcile to Xero.`,
        cta: 'View detail',
      }
    case 'failed':
      return {
        headline: 'Last Xero sync failed',
        detail: `Sync at ${ts} did not complete. Numbers may be from ${age}.`,
        cta: 'Re-sync now',
      }
    case 'no_sync':
      return {
        headline: 'Xero not yet synced for this business',
        detail: 'Connect Xero or trigger initial sync to load actuals.',
        cta: 'Re-sync now',
      }
    case 'stale':
      return {
        headline: `Xero data hasn't refreshed in ${age}`,
        detail: `Last successful sync at ${ts}. Numbers may be out of date.`,
        cta: 'Re-sync now',
      }
  }
}

export function DataIntegrityBanner({
  quality,
  perTenantQuality,
  lastSyncAt,
  onResync,
}: DataIntegrityBannerProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  if (quality === 'verified') return null
  const style = STYLE_BY_QUALITY[quality]
  const copy = copyFor(quality, perTenantQuality, lastSyncAt)
  // Partial → drawer (per-tenant detail). Other tiers → re-sync CTA when wired.
  const showDetail = quality === 'partial'
  const showResync = quality !== 'partial' && !!onResync
  const Icon = style.Icon
  return (
    <>
      <div
        data-integrity="degraded"
        data-quality={quality}
        className={`flex items-start gap-3 rounded border px-4 py-3 ${style.bg} ${style.border} ${style.text}`}
        role="alert"
      >
        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{copy.headline}</div>
          <div className="text-sm mt-0.5">{copy.detail}</div>
        </div>
        {showDetail && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="text-sm underline hover:no-underline whitespace-nowrap"
          >
            {copy.cta}
          </button>
        )}
        {showResync && (
          <button
            type="button"
            onClick={onResync}
            className="text-sm underline hover:no-underline whitespace-nowrap"
          >
            {copy.cta}
          </button>
        )}
      </div>
      <DataIntegrityDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        perTenantQuality={perTenantQuality}
      />
    </>
  )
}
