'use client'

import { useEffect, useState } from 'react'
import { FileUp, X } from 'lucide-react'
import type { LayoutWidget } from '../../types/pdf-layout'

/**
 * An uploaded page's one setting: its name. The name heads the notice the pack
 * prints when a month's file is missing, and is how the External Data tab
 * lists the page to upload against — so "Cash vs Accruals" and "Hubstaff" are
 * told apart there.
 */
interface InsertSettingsPanelProps {
  widget: LayoutWidget
  onCancel: () => void
  onApply: (patch: { config: Record<string, unknown>; titleOverride: string | undefined }) => void
}

const MAX_NAME = 80

export default function InsertSettingsPanel({ widget, onCancel, onApply }: InsertSettingsPanelProps) {
  const [name, setName] = useState(widget.titleOverride ?? '')

  // The editor's own shortcuts are suspended while this is open; Escape here
  // cancels the panel and leaves the layout exactly as it was.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  const apply = () => {
    const trimmed = name.trim()
    // No settings of its own beyond the name: whatever config it carried rides through.
    onApply({ config: widget.config ?? {}, titleOverride: trimmed ? trimmed : undefined })
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="insert-settings-heading"
        className="relative w-full max-w-[420px] h-full bg-white shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 id="insert-settings-heading" className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <FileUp className="w-4 h-4 text-brand-orange" />
            Uploaded page
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            aria-label="Close without applying"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          className="flex-1 flex flex-col"
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3 leading-relaxed">
              This page is a PDF you upload each month — a Lumary income analysis, a payroll report from Employment
              Hero. After you save the layout, upload the month&apos;s file on the <strong>External Data</strong> tab.
              Its pages print here, numbered with the rest of the pack. A month with no file prints a notice saying so.
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-700">Page name</span>
              <input
                type="text"
                autoFocus
                value={name}
                maxLength={MAX_NAME}
                placeholder="e.g. Income Analysis"
                onChange={(e) => setName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange"
              />
            </label>
          </div>

          <div className="border-t border-gray-200 px-4 py-3 space-y-2 bg-white">
            <p className="text-[11px] text-gray-500">Apply updates this page in the layout. Press Save Layout to keep it.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-md"
              >
                Apply
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
