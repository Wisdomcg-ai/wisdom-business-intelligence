'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { ManualSyncResponse } from '@/lib/xero/manual-sync-response'

interface XeroSyncButtonProps {
  businessId: string
  onSyncComplete?: () => void
}

type Verdict = {
  tone: 'success' | 'warning' | 'info' | 'error'
  message: string
  /** Fresh Xero data landed, so what the page shows should be re-read. */
  landed: boolean
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Read the route's answer. Green only for an explicit "synced" — a bare 200,
 * an unreadable body or an outcome this button doesn't know is a sync nobody
 * can vouch for, and says so.
 */
function verdictFor(status: number, body: Partial<ManualSyncResponse> | null): Verdict {
  const orgs = Array.isArray(body?.orgs) ? body.orgs : []
  const notSynced = orgs.filter((o) => o.status === 'error' || o.status === 'paused' || o.status === 'disconnected')

  if (status === 200 && body?.outcome === 'synced') {
    return {
      tone: 'success',
      message: orgs.length > 1 ? `Xero synced — all ${orgs.length} organisations` : 'Xero synced',
      landed: true,
    }
  }
  if (status === 200 && body?.outcome === 'partial') {
    if (notSynced.length > 0) {
      return {
        tone: 'warning',
        message:
          `Synced ${orgs.length - notSynced.length} of ${orgs.length} Xero organisations. ` +
          `${joinNames(notSynced.map((o) => o.name))} couldn't be synced, so ` +
          `${notSynced.length === 1 ? 'its' : 'their'} numbers may be out of date.`,
        landed: true,
      }
    }
    return {
      tone: 'warning',
      message: "Xero synced, but some figures couldn't be fully checked against Xero and may be incomplete.",
      landed: true,
    }
  }
  if (status === 409 && body?.outcome === 'in_progress') {
    return { tone: 'info', message: 'A Xero sync is already running — check back in a few minutes.', landed: false }
  }
  if (status === 404 && body?.outcome === 'not_connected') {
    return orgs.some((o) => o.status === 'disconnected')
      ? { tone: 'error', message: "Xero is disconnected for this business, so it can't sync until Xero is reconnected.", landed: false }
      : { tone: 'info', message: "This business isn't connected to Xero.", landed: false }
  }
  if (status === 403) {
    return { tone: 'error', message: "You don't have access to sync Xero for this business.", landed: false }
  }
  if (status === 502 && body?.outcome === 'failed' && orgs.length > 0 && orgs.every((o) => o.status === 'paused')) {
    return { tone: 'error', message: "Couldn't sync Xero — its daily request limit has been reached. Try again tomorrow.", landed: false }
  }
  return {
    tone: 'error',
    message: "Couldn't sync Xero — try again later. If it keeps failing, Xero may need reconnecting.",
    landed: false,
  }
}

export function XeroSyncButton({ businessId, onSyncComplete }: XeroSyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastVerdict, setLastVerdict] = useState<Verdict | null>(null)

  const handleSync = async () => {
    if (isSyncing) return

    setIsSyncing(true)
    setLastVerdict(null)
    const toastId = toast.loading('Syncing Xero — this can take a few minutes…')

    let verdict: Verdict
    try {
      const response = await fetch('/api/Xero/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })
      const body = await response.json().catch(() => null)
      verdict = verdictFor(response.status, body)
    } catch {
      verdict = verdictFor(0, null)
    }

    if (verdict.tone === 'success') toast.success(verdict.message, { id: toastId })
    else if (verdict.tone === 'warning') toast.warning(verdict.message, { id: toastId, duration: 12000 })
    else if (verdict.tone === 'info') toast.info(verdict.message, { id: toastId })
    else toast.error(verdict.message, { id: toastId, duration: 8000 })

    setLastVerdict(verdict)
    setIsSyncing(false)
    if (verdict.landed) onSyncComplete?.()
    // The green tick fades; a warning or failure stays on the button until the next sync.
    if (verdict.tone === 'success') {
      setTimeout(() => setLastVerdict((v) => (v === verdict ? null : v)), 3000)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      title={lastVerdict && lastVerdict.tone !== 'success' ? lastVerdict.message : undefined}
      className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {lastVerdict?.tone === 'success' ? (
        <CheckCircle className="w-4 h-4 text-green-500" data-testid="xero-sync-success" />
      ) : lastVerdict?.tone === 'warning' ? (
        <AlertTriangle className="w-4 h-4 text-amber-500" data-testid="xero-sync-warning" />
      ) : lastVerdict?.tone === 'error' ? (
        <XCircle className="w-4 h-4 text-red-500" data-testid="xero-sync-error" />
      ) : (
        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
      )}
      <span className="hidden sm:inline">{isSyncing ? 'Syncing…' : 'Sync Xero'}</span>
    </button>
  )
}
