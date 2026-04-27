'use client'

// Phase 42 Plan 01: single source of truth for auto-save lifecycle.
//
// Wraps the existing `saveSnapshot` POST with:
//   - 500ms debounce (D-02) + onBlur immediate flush (D-01)
//   - Single-flight + queue (D-13) — never two parallel POSTs
//   - 3-attempt exponential backoff at 1s/2s/4s (D-11)
//   - Finalise lock + consolidation guard (D-06 + research Pitfall: consolidation)
//   - `onSaveSuccess` callback invoked on every 2xx, including mid-retry (D-15)
//   - NO toast on success (D-10); single terminal-failure toast (D-12)
//   - Watches commentary ONLY — never report.report_data (Pitfall 6 / Phase 35 D-17)
//   - Init guard via stateVersionRef (mirrors ForecastWizardV4 line 1196)
//   - Month-change clears pending queue + resets status (Pitfall 2)

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useDebouncedCallback } from '@/lib/hooks/use-debounced-callback'
import type { GeneratedReport, VarianceCommentary } from '../types'

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'retrying'; attempt: 1 | 2 | 3 }
  | { kind: 'failed' }

export interface SaveSnapshotOptions {
  status?: 'draft' | 'final'
  coachNotes?: string
  generatedBy?: string
  commentary?: VarianceCommentary
}

export interface UseAutoSaveReportArgs {
  report: GeneratedReport | null
  commentary: VarianceCommentary | undefined
  userId: string | null
  /** true when monthly_report_snapshots.status === 'final' (D-06 Finalise lock) */
  isLocked: boolean
  /** Page wires this to `useReportStatus.refresh()` (D-15) */
  onSaveSuccess?: () => void
  /** Existing saveSnapshot from useMonthlyReport — wrapped, not replaced */
  saveSnapshot: (
    reportData: GeneratedReport,
    options: SaveSnapshotOptions,
  ) => Promise<unknown>
}

export interface UseAutoSaveReportReturn {
  status: SaveStatus
  /** Debounced trigger — call from onChange handlers */
  schedule: () => void
  /** Cancel pending debounce and fire now — call from onBlur handlers */
  flushImmediately: () => void
  /** User clicked "Save Now" after retries exhausted (D-12) */
  retryNow: () => void
}

const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000]
const TERMINAL_FAILURE_MESSAGE =
  'Could not save report — click Save Now to retry'

export function useAutoSaveReport(
  args: UseAutoSaveReportArgs,
): UseAutoSaveReportReturn {
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' })

  // Refs hold latest values so the debounced/queued/retried fire-time
  // closure always sees fresh data (Pitfall 2 — stale closure).
  const reportRef = useRef(args.report)
  reportRef.current = args.report
  const commentaryRef = useRef(args.commentary)
  commentaryRef.current = args.commentary
  const userIdRef = useRef(args.userId)
  userIdRef.current = args.userId
  const isLockedRef = useRef(args.isLocked)
  isLockedRef.current = args.isLocked
  const onSaveSuccessRef = useRef(args.onSaveSuccess)
  onSaveSuccessRef.current = args.onSaveSuccess
  const saveSnapshotRef = useRef(args.saveSnapshot)
  saveSnapshotRef.current = args.saveSnapshot

  // Single-flight + queue (D-13). pendingRef = true means "fire another save
  // when the current one resolves; latest payload always read from refs."
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)

  // Mounted guard (Pitfall 1 — async resolves after unmount).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Retry-timeout cleanup so unmount mid-backoff cancels the pending fire.
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
    }
  }, [])

  // Cancellable sleep helper that stores its handle in retryTimeoutRef.
  const sleep = useCallback((ms: number): Promise<void> => {
    return new Promise<void>((resolve) => {
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null
        resolve()
      }, ms)
    })
  }, [])

  // Run the 3-attempt exponential backoff. Returns true on mid-retry success,
  // false if all attempts failed (caller transitions status accordingly).
  const runRetries = useCallback(async (): Promise<boolean> => {
    const reportNow = reportRef.current
    if (!reportNow) return false

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (mountedRef.current) {
        setStatus({ kind: 'retrying', attempt: attempt as 1 | 2 | 3 })
      }
      await sleep(RETRY_DELAYS_MS[attempt - 1])
      if (!mountedRef.current) return false

      // Refresh refs on each attempt — month/commentary may have shifted.
      const reportForAttempt = reportRef.current
      if (!reportForAttempt) return false
      try {
        await saveSnapshotRef.current(reportForAttempt, {
          status: 'draft',
          generatedBy: userIdRef.current ?? undefined,
          commentary: commentaryRef.current,
        })
        if (!mountedRef.current) return true
        setStatus({ kind: 'saved', at: new Date() })
        // D-15: onSaveSuccess fires on every 2xx, including mid-retry.
        onSaveSuccessRef.current?.()
        return true
      } catch {
        // continue to next attempt
      }
    }
    return false
  }, [sleep])

  // Core save routine — guarded, single-flight, queue-aware, retry-aware.
  const performSave = useCallback(async (): Promise<void> => {
    // D-06: Finalise lock — never POST while locked.
    if (isLockedRef.current) return
    const reportNow = reportRef.current
    if (!reportNow) return
    // Consolidation guard — saveSnapshot throws for consolidation reports.
    if (reportNow.is_consolidation) return

    // Single-flight: queue a follow-up if one is already in flight.
    if (inFlightRef.current) {
      pendingRef.current = true
      return
    }

    inFlightRef.current = true
    if (mountedRef.current) setStatus({ kind: 'saving' })

    try {
      await saveSnapshotRef.current(reportNow, {
        status: 'draft',
        generatedBy: userIdRef.current ?? undefined,
        commentary: commentaryRef.current,
      })
      if (mountedRef.current) {
        setStatus({ kind: 'saved', at: new Date() })
        onSaveSuccessRef.current?.()
      }
    } catch {
      // First attempt failed — enter retry loop (D-11).
      const recovered = await runRetries()
      if (!recovered && mountedRef.current) {
        setStatus({ kind: 'failed' })
        // D-12: single error toast on terminal failure.
        toast.error(TERMINAL_FAILURE_MESSAGE, {
          duration: Infinity,
          dismissible: false,
        })
      }
    } finally {
      inFlightRef.current = false
      // Drain the queue if a save was scheduled mid-flight (D-13).
      if (pendingRef.current && mountedRef.current && !isLockedRef.current) {
        pendingRef.current = false
        // Fire-and-forget the next save with latest refs.
        void performSave()
      } else {
        pendingRef.current = false
      }
    }
  }, [runRetries])

  // 500ms debounced fire — D-02.
  const debouncedFire = useDebouncedCallback(() => {
    void performSave()
  }, 500)

  const schedule = useCallback(() => {
    if (isLockedRef.current) return
    if (!reportRef.current) return
    if (reportRef.current.is_consolidation) return
    debouncedFire()
  }, [debouncedFire])

  const flushImmediately = useCallback(() => {
    if (isLockedRef.current) return
    if (!reportRef.current) return
    if (reportRef.current.is_consolidation) return
    // D-01 (blur): cancel pending debounce by replacing it with an
    // immediate fire. The performSave path is single-flight-safe so even
    // if a debounce fire races, only one POST goes out.
    void performSave()
  }, [performSave])

  const retryNow = useCallback(() => {
    if (isLockedRef.current) return
    if (!reportRef.current) return
    if (reportRef.current.is_consolidation) return
    if (mountedRef.current) setStatus({ kind: 'saving' })
    void performSave()
  }, [performSave])

  // ------------------------------------------------------------------
  // Watched-state effect — Pitfall 6: commentary ONLY, never report_data.
  // ------------------------------------------------------------------
  // First N invocations are mount/load churn; skip them so we don't fire
  // a save against the just-loaded snapshot. Mirrors ForecastWizardV4
  // line 1196 (`stateVersionRef.current < 3`); we use < 2 because this
  // hook only watches one piece of state (commentary), not three.
  const stateVersionRef = useRef(0)
  useEffect(() => {
    stateVersionRef.current += 1
    if (stateVersionRef.current < 2) return
    schedule()
    // INTENTIONALLY does not include args.report — see Pitfall 6.
  }, [args.commentary, schedule])

  // ------------------------------------------------------------------
  // beforeunload guard — Phase 42 D-12 / Pitfall 5.
  // ------------------------------------------------------------------
  // When status is 'failed', the user has unsaved data and the auto-save
  // retries are exhausted. Register a `beforeunload` listener so the browser
  // shows its native confirm dialog if the user tries to close the tab or
  // navigate away. The listener is removed as soon as status leaves 'failed'
  // (e.g. retryNow succeeds → 'saved'), so no spurious dialogs in normal use.
  useEffect(() => {
    if (status.kind !== 'failed') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Legacy Chrome/Edge requires a non-empty returnValue; modern browsers
      // ignore the string and show their generic message.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status.kind])

  // ------------------------------------------------------------------
  // Month-change cancel guard — Pitfall 2.
  // When the coach switches months, drop any pending queue + retry timer
  // and reset status. Re-arm the init guard so the post-load setReport
  // doesn't trigger a save.
  // ------------------------------------------------------------------
  const lastMonthRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const month = args.report?.report_month
    if (lastMonthRef.current !== undefined && month !== lastMonthRef.current) {
      pendingRef.current = false
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      if (mountedRef.current) setStatus({ kind: 'idle' })
      stateVersionRef.current = 0
    }
    lastMonthRef.current = month
  }, [args.report?.report_month])

  return { status, schedule, flushImmediately, retryNow }
}
