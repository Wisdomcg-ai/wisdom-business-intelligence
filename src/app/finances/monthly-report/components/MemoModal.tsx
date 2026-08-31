'use client'

// WD.8 — the month's memo editor. A first-class written page (IICT's July
// insurance memo is why the client pays) stored on the month's snapshot
// (coach_notes) via the targeted PATCH — never through the full-snapshot POST,
// so writing a memo can't touch report_data or status.
//
// Self-contained: loads on open, saves on demand. updated:false from the
// PATCH means no snapshot row exists yet — the coach is told to generate the
// report first instead of the memo silently going nowhere.

import { useState, useEffect } from 'react'
import { Loader2, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface MemoModalProps {
  isOpen: boolean
  onClose: () => void
  businessId: string
  reportMonth: string
  monthLabel: string
}

export default function MemoModal({ isOpen, onClose, businessId, reportMonth, monthLabel }: MemoModalProps) {
  const [memo, setMemo] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/monthly-report/snapshot?business_id=${encodeURIComponent(businessId)}&report_month=${encodeURIComponent(reportMonth)}`,
        )
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setLoadError(data.error || 'Could not load the memo')
          return
        }
        setMemo(data.snapshot?.coach_notes ?? '')
      } catch {
        if (!cancelled) setLoadError('Could not load the memo — check your connection')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, businessId, reportMonth])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/monthly-report/snapshot', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          report_month: reportMonth,
          action: 'set_memo',
          memo: memo.trim() === '' ? null : memo,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to save the memo')
        return
      }
      if (!data.updated) {
        toast.error('No saved report for this month yet — generate the report first, then save the memo.')
        return
      }
      toast.success(memo.trim() === '' ? 'Memo cleared' : 'Memo saved — it will appear in the PDF')
      onClose()
    } catch {
      toast.error('Failed to save the memo — check your connection')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Memo — {monthLabel}</h2>
            <p className="text-sm text-gray-500">Appears as its own page in the PDF, after the executive summary.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
            </div>
          ) : loadError ? (
            <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {loadError}
            </div>
          ) : (
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={14}
              placeholder={`What should the client read this month?\n\ne.g. why insurance jumped, what the one-off in COGS was, the decision you agreed on the call…`}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || loading || !!loadError}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save memo
          </button>
        </div>
      </div>
    </div>
  )
}
