'use client'

// WF.1 — the pre-flight panel: fourteen rows, four honest states, shown
// before every export. Warnings and failures never block (the coach
// decides); they inform, and the run is persisted either way so the pack
// can prove months later what was true when it went out.

import { CheckCircle, AlertTriangle, XCircle, MinusCircle, Loader2 } from 'lucide-react'
import type { PreflightResult } from '@/lib/monthly-report/preflight'

interface PreflightPanelProps {
  results: PreflightResult[]
  onCancel: () => void
  onProceed: () => void
  isExporting?: boolean
}

const STATUS_META = {
  pass: { icon: CheckCircle, cls: 'text-green-600' },
  warn: { icon: AlertTriangle, cls: 'text-amber-500' },
  fail: { icon: XCircle, cls: 'text-red-600' },
  skip: { icon: MinusCircle, cls: 'text-gray-300' },
} as const

export default function PreflightPanel({ results, onCancel, onProceed, isExporting }: PreflightPanelProps) {
  const fails = results.filter((r) => r.status === 'fail').length
  const warns = results.filter((r) => r.status === 'warn').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Pre-flight checks</h2>
          <p className="text-sm text-gray-500">
            {fails > 0
              ? `${fails} failed, ${warns} warning${warns === 1 ? '' : 's'} — you can still export, but the pack will carry these issues.`
              : warns > 0
                ? `${warns} warning${warns === 1 ? '' : 's'} — review before sending.`
                : 'All checks passed.'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3 divide-y divide-gray-100">
          {results.map((r) => {
            const meta = STATUS_META[r.status]
            const Icon = meta.icon
            return (
              <div key={r.key} className="flex items-start gap-3 py-2">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.cls}`} />
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${r.status === 'skip' ? 'text-gray-400' : 'text-gray-900'}`}>{r.label}</p>
                  <p className={`text-xs ${r.status === 'fail' ? 'text-red-700' : r.status === 'warn' ? 'text-amber-700' : 'text-gray-500'}`}>{r.detail}</p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={onProceed}
            disabled={isExporting}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 ${
              fails > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {fails > 0 ? 'Export anyway' : 'Export PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
