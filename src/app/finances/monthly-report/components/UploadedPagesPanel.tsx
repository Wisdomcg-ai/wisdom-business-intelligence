'use client'

// Uploaded pages: upload the month's PDF for each "Uploaded Page" placement in
// the saved pack layout (lib/monthly-report/pack-inserts). Sits at the top of
// the External Data tab, beside the other non-Xero inputs to the pack.
//
// House rules honoured here:
// - Three states: loading / could-not-check (with the reason) / the list. A
//   failed or not-yet-migrated lookup is never shown as "not uploaded".
// - A refused upload says why (not a PDF, too large, encrypted), in the
//   route's own words.
// - Renders nothing for a layout with no uploaded page, so every other
//   client's tab is unchanged.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle, FileUp, Loader2, RefreshCw } from 'lucide-react'
import type { PDFLayout } from '../types/pdf-layout'
import {
  MAX_INSERT_BYTES,
  insertPlacements,
  insertTooLargeReason,
  type PackInsertRecord,
} from '@/lib/monthly-report/pack-inserts'

interface UploadedPagesPanelProps {
  businessId: string
  /** 'YYYY-MM' */
  reportMonth: string
  /** The SAVED layout — the route accepts uploads only against its placements. */
  layout: PDFLayout | null | undefined
  canManage: boolean
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; reason: string }
  | { status: 'ok'; byWidget: Map<string, PackInsertRecord> }

function monthLabel(reportMonth: string): string {
  const [y, m] = reportMonth.split('-').map(Number)
  if (!y || !m) return reportMonth
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function uploadedOn(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function UploadedPagesPanel({ businessId, reportMonth, layout, canManage }: UploadedPagesPanelProps) {
  const placements = insertPlacements(layout)
  const hasPlacements = placements.length > 0
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [busyWidget, setBusyWidget] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, { kind: 'error' | 'ok'; text: string }>>({})
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  const load = useCallback(async () => {
    setList({ status: 'loading' })
    try {
      const res = await fetch(
        `/api/monthly-report/inserts?business_id=${encodeURIComponent(businessId)}&report_month=${encodeURIComponent(reportMonth)}`,
      )
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) {
        setList({ status: 'error', reason: body?.error ?? `the uploads could not be checked (${res.status})` })
      } else if (body.status === 'unavailable') {
        setList({ status: 'error', reason: body.reason ?? 'the uploads could not be checked' })
      } else {
        setList({ status: 'ok', byWidget: new Map((body.inserts as PackInsertRecord[]).map((r) => [r.widget_id, r])) })
      }
    } catch {
      setList({ status: 'error', reason: 'the uploads could not be checked — check your connection and try again' })
    }
  }, [businessId, reportMonth])

  useEffect(() => {
    setMessages({})
    if (hasPlacements) load()
  }, [hasPlacements, load])

  const upload = async (widgetId: string, file: File) => {
    setMessages(({ [widgetId]: _previous, ...rest }) => rest)
    // The route checks all of this too; saying it here saves sending a file that will be refused.
    if (file.type !== 'application/pdf') {
      setMessages((m) => ({ ...m, [widgetId]: { kind: 'error', text: 'The file must be a PDF.' } }))
      return
    }
    if (file.size > MAX_INSERT_BYTES) {
      const reason = insertTooLargeReason(file.size)
      setMessages((m) => ({ ...m, [widgetId]: { kind: 'error', text: `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.` } }))
      return
    }
    setBusyWidget(widgetId)
    try {
      const form = new FormData()
      form.append('business_id', businessId)
      form.append('report_month', reportMonth)
      form.append('widget_id', widgetId)
      form.append('file', file)
      const res = await fetch('/api/monthly-report/inserts', { method: 'POST', body: form })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setMessages((m) => ({ ...m, [widgetId]: { kind: 'error', text: body?.error ?? `The upload failed (${res.status}).` } }))
        return
      }
      const pages = body?.insert?.page_count
      setMessages((m) => ({ ...m, [widgetId]: { kind: 'ok', text: `Uploaded — ${pages} page${pages === 1 ? '' : 's'} will print here in the pack.` } }))
      await load()
    } catch {
      setMessages((m) => ({ ...m, [widgetId]: { kind: 'error', text: 'The upload failed — check your connection and try again.' } }))
    } finally {
      setBusyWidget(null)
      const input = inputs.current[widgetId]
      if (input) input.value = ''
    }
  }

  if (!hasPlacements) return null
  const month = monthLabel(reportMonth)

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FileUp className="w-5 h-5 text-brand-orange" />
            Uploaded pages — {month}
          </h3>
          <p className="text-sm text-gray-500">
            The PDF for each uploaded page in the pack layout. Its pages print where the layout puts them, numbered with
            the rest. A PDF of up to {Math.round(MAX_INSERT_BYTES / (1024 * 1024))} MB, and the pack with it has to fit in one
            email — the export&apos;s pre-flight says if it won&apos;t. Uploading again replaces the month&apos;s file.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 shrink-0"
          aria-label="Check the uploads again"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {list.status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking the uploads…
        </div>
      )}

      {list.status === 'error' && (
        <div role="status" className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Couldn&apos;t check the uploaded pages: {list.reason}.</span>
        </div>
      )}

      {list.status === 'ok' && (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
          {placements.map((p) => {
            const record = list.byWidget.get(p.widgetId)
            const message = messages[p.widgetId]
            const busy = busyWidget === p.widgetId
            return (
              <li key={p.widgetId} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.label}</p>
                    {record ? (
                      <p className="text-xs text-gray-600 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
                        <a
                          href={`/api/monthly-report/inserts?business_id=${encodeURIComponent(businessId)}&id=${encodeURIComponent(record.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline truncate"
                        >
                          {record.filename}
                        </a>
                        <span className="shrink-0">· {record.page_count} page{record.page_count === 1 ? '' : 's'} · uploaded {uploadedOn(record.created_at)}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-amber-700">Not uploaded for {month} — the pack prints a notice in its place.</p>
                    )}
                  </div>
                  {canManage && (
                    <label className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border shrink-0 ${busy ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:border-brand-orange hover:text-brand-orange'} border-gray-300 text-gray-700`}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                      {record ? 'Replace PDF' : 'Upload PDF'}
                      <input
                        ref={(el) => { inputs.current[p.widgetId] = el }}
                        type="file"
                        accept="application/pdf"
                        className="sr-only"
                        disabled={busy}
                        aria-label={`${record ? 'Replace' : 'Upload'} the PDF for ${p.label}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) upload(p.widgetId, file)
                        }}
                      />
                    </label>
                  )}
                </div>
                {message && (
                  <p role="status" className={`text-xs ${message.kind === 'error' ? 'text-red-700' : 'text-green-700'}`}>{message.text}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
