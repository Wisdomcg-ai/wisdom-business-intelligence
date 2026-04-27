'use client'
// Phase 42 Plan 02: pure save-indicator surface. State machine lives in useAutoSaveReport.
//
// Renders the visible UX for the auto-save lifecycle (D-08, D-09, D-12):
//   - idle / saved → "All changes saved" (gray, no spinner)
//   - saving → "Saving..." (gray, Loader2 spinner)
//   - retrying → "Unsaved — retrying..." (amber, Loader2 spinner)
//   - failed → "Unsaved — click to retry" + Save Now button (rose)
//
// This component is purely presentational — no React state hooks, no effects,
// no fetch calls. All state lives in `useAutoSaveReport` (Plan 42-01).
// The `SaveStatus` discriminated union is owned by the hook and imported here
// as a type-only import so the indicator and the hook stay in lockstep.
import { Loader2 } from 'lucide-react'
import type { SaveStatus } from '../hooks/useAutoSaveReport'

export interface SaveIndicatorProps {
  status: SaveStatus
  onRetry: () => void
}

export default function SaveIndicator({ status, onRetry }: SaveIndicatorProps) {
  switch (status.kind) {
    case 'idle':
    case 'saved':
      return (
        <div
          data-testid="save-indicator"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500"
        >
          <span>All changes saved</span>
        </div>
      )
    case 'saving':
      return (
        <div
          data-testid="save-indicator"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Saving...</span>
        </div>
      )
    case 'retrying':
      return (
        <div
          data-testid="save-indicator"
          className="inline-flex items-center gap-1.5 text-sm text-amber-600"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Unsaved — retrying...</span>
        </div>
      )
    case 'failed':
      return (
        <div
          data-testid="save-indicator"
          className="inline-flex items-center gap-2 text-sm text-rose-700"
        >
          <span>Unsaved — click to retry</span>
          <button
            type="button"
            onClick={onRetry}
            className="px-2 py-0.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded"
          >
            Save Now
          </button>
        </div>
      )
    default: {
      // Exhaustiveness guard — TypeScript will error here if a new SaveStatus
      // variant is added without a corresponding case above.
      const _exhaustive: never = status
      void _exhaustive
      return null
    }
  }
}
