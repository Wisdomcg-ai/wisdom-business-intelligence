/**
 * Phase 44.2 Plan 44.2-09 — DataIntegrityDetailDrawer.
 *
 * Right-side sliding panel surfacing the per-tenant breakdown when a
 * coach clicks "View detail" on the partial-quality DataIntegrityBanner.
 *
 * Backdrop click + Esc close. Right-side fixed at z-50 so it overlays
 * the wizard / report content. Width caps at md to keep narrow on
 * smaller laptops without obscuring content.
 */
'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { DataQuality, PerTenantQuality } from '@/lib/services/forecast-read-service'

interface DataIntegrityDetailDrawerProps {
  open: boolean
  onClose: () => void
  perTenantQuality: PerTenantQuality[]
}

const BADGE_BY_QUALITY: Record<DataQuality, string> = {
  verified: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  no_sync: 'bg-slate-100 text-slate-700',
  stale: 'bg-yellow-100 text-yellow-700',
}

export function DataIntegrityDetailDrawer({
  open,
  onClose,
  perTenantQuality,
}: DataIntegrityDetailDrawerProps) {
  // Esc-to-close. useEffect early-returns when closed so we don't bind
  // listeners unnecessarily.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        className="flex-1 bg-black/40"
        onClick={onClose}
        aria-label="Close drawer"
      />
      <aside
        className="w-full max-w-md bg-white shadow-xl overflow-y-auto"
        role="dialog"
        aria-label="Data integrity detail"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">Data integrity by tenant</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {perTenantQuality.length === 0 && (
            <div className="text-sm text-slate-500">No tenant data available.</div>
          )}
          {perTenantQuality.map((t) => (
            <div key={t.tenant_id} className="rounded border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div className="font-mono text-xs text-slate-500 truncate">{t.tenant_id}</div>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium ${BADGE_BY_QUALITY[t.data_quality]}`}
                >
                  {t.data_quality}
                </span>
              </div>
              <div className="mt-2 text-sm text-slate-700 space-y-0.5">
                <div>
                  Last sync:{' '}
                  {t.last_sync_at ? new Date(t.last_sync_at).toLocaleString('en-AU') : 'never'}
                </div>
                <div>Status: {t.last_sync_status ?? 'n/a'}</div>
                <div>Discrepant accounts: {t.discrepancy_count}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
