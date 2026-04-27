// Phase 42 Plan 01 — useAutoSaveReport vitest fake-timer suite.
// Covers D-01, D-02, D-03, D-06, D-10, D-11, D-12, D-13, D-14, D-15 and
// Pitfall 6 (commentary-only watch, never report.report_data).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { toast } from 'sonner'
import {
  useAutoSaveReport,
  type UseAutoSaveReportReturn,
  type SaveStatus,
} from '../useAutoSaveReport'
import type { GeneratedReport, VarianceCommentary } from '../../types'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<GeneratedReport> = {}): GeneratedReport {
  return {
    business_id: 'biz-1',
    report_month: '2026-03',
    fiscal_year: 2026,
    settings: {
      business_id: 'biz-1',
      sections: {} as any,
      show_prior_year: false,
      show_ytd: true,
      show_unspent_budget: false,
      show_budget_next_month: false,
      show_budget_annual_total: false,
      budget_forecast_id: null,
    } as any,
    sections: [],
    summary: {} as any,
    gross_profit_row: {} as any,
    net_profit_row: {} as any,
    is_draft: true,
    unreconciled_count: 0,
    has_budget: false,
    is_consolidation: false,
    ...overrides,
  } as GeneratedReport
}

// Harness: mounts the hook and exposes its return on a mutable ref, plus
// re-renders whenever props change.
function makeHarness() {
  const apiRef: { current: UseAutoSaveReportReturn | null } = { current: null }
  const statusRef: { current: SaveStatus | null } = { current: null }

  function Harness(props: {
    report: GeneratedReport | null
    commentary: VarianceCommentary | undefined
    userId: string | null
    isLocked: boolean
    onSaveSuccess?: () => void
    saveSnapshot: (
      reportData: GeneratedReport,
      options: any,
    ) => Promise<unknown>
  }) {
    const api = useAutoSaveReport({
      report: props.report,
      commentary: props.commentary,
      userId: props.userId,
      isLocked: props.isLocked,
      onSaveSuccess: props.onSaveSuccess,
      saveSnapshot: props.saveSnapshot,
    })
    apiRef.current = api
    statusRef.current = api.status
    return null
  }

  return { Harness, apiRef, statusRef }
}

// Helper: defer a promise so tests can control resolution timing.
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: any) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Helper to run microtasks while fake timers are active.
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('useAutoSaveReport (Phase 42)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  // ---------- D-01: debounce + onBlur ----------

  it('D-01: fires save 500ms after last keystroke', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue({ id: 's1' })
    const { Harness, apiRef } = makeHarness()
    const report = makeReport()
    const { rerender } = render(
      <Harness
        report={report}
        commentary={{}}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    // Bump commentary to fire the watched-state effect twice (init guard <2).
    rerender(
      <Harness
        report={report}
        commentary={{ A: { text: 'x' } as any }}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    // Advance 499ms — should NOT yet fire.
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(saveSnapshot).not.toHaveBeenCalled()
    // Advance the final 1ms.
    act(() => {
      vi.advanceTimersByTime(2)
    })
    await flushMicrotasks()
    expect(saveSnapshot).toHaveBeenCalledTimes(1)
    expect(apiRef.current).not.toBeNull()
  })

  it('D-01: flushImmediately() bypasses debounce and fires synchronously', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue({ id: 's1' })
    const { Harness, apiRef } = makeHarness()
    render(
      <Harness
        report={makeReport()}
        commentary={{}}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    expect(saveSnapshot).not.toHaveBeenCalled()
    await act(async () => {
      apiRef.current!.flushImmediately()
      await Promise.resolve()
    })
    expect(saveSnapshot).toHaveBeenCalledTimes(1)
  })

  // ---------- D-02: 500ms window ----------

  it('D-02: two changes within 400ms result in 1 save', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue({ id: 's1' })
    const { Harness } = makeHarness()
    const report = makeReport()
    const { rerender } = render(
      <Harness
        report={report}
        commentary={{}}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    rerender(
      <Harness
        report={report}
        commentary={{ A: { text: 'x' } as any }}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(400)
    })
    rerender(
      <Harness
        report={report}
        commentary={{ A: { text: 'xy' } as any }}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    // Even though 800ms elapsed total, the second change reset the timer at t=400,
    // so the fire is at t=400+500=900. Advance 500 more from now (t=900).
    act(() => {
      vi.advanceTimersByTime(501)
    })
    await flushMicrotasks()
    expect(saveSnapshot).toHaveBeenCalledTimes(1)
  })

  it('D-02: two changes >500ms apart result in 2 saves', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue({ id: 's1' })
    const { Harness } = makeHarness()
    const report = makeReport()
    const { rerender } = render(
      <Harness
        report={report}
        commentary={{}}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    rerender(
      <Harness
        report={report}
        commentary={{ A: { text: 'x' } as any }}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(600)
    })
    await flushMicrotasks()
    expect(saveSnapshot).toHaveBeenCalledTimes(1)
    rerender(
      <Harness
        report={report}
        commentary={{ A: { text: 'xy' } as any }}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(600)
    })
    await flushMicrotasks()
    expect(saveSnapshot).toHaveBeenCalledTimes(2)
  })

  // ---------- D-03: full-snapshot replay POST shape ----------

  it('D-03: saveSnapshot called with full report and {status: draft, commentary, generatedBy}', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue({ id: 's1' })
    const { Harness, apiRef } = makeHarness()
    const report = makeReport()
    const commentary = { A: { text: 'note' } as any } as VarianceCommentary
    render(
      <Harness
        report={report}
        commentary={commentary}
        userId="user-42"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    await act(async () => {
      apiRef.current!.flushImmediately()
      await Promise.resolve()
    })
    expect(saveSnapshot).toHaveBeenCalledTimes(1)
    const [calledReport, calledOpts] = saveSnapshot.mock.calls[0]
    expect(calledReport).toBe(report)
    expect(calledOpts).toMatchObject({
      status: 'draft',
      generatedBy: 'user-42',
      commentary,
    })
  })

  // ---------- D-06: Finalise lock ----------

  it('D-06: when isLocked=true, schedule() and flushImmediately() are no-ops', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue({ id: 's1' })
    const { Harness, apiRef, statusRef } = makeHarness()
    const report = makeReport()
    const { rerender } = render(
      <Harness
        report={report}
        commentary={{}}
        userId="u1"
        isLocked={true}
        saveSnapshot={saveSnapshot}
      />,
    )
    rerender(
      <Harness
        report={report}
        commentary={{ A: { text: 'x' } as any }}
        userId="u1"
        isLocked={true}
        saveSnapshot={saveSnapshot}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    await flushMicrotasks()
    apiRef.current!.flushImmediately()
    apiRef.current!.schedule()
    await flushMicrotasks()
    expect(saveSnapshot).not.toHaveBeenCalled()
    expect(statusRef.current).toEqual({ kind: 'idle' })
  })

  it('Consolidation guard: is_consolidation=true short-circuits save', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue({ id: 's1' })
    const { Harness, apiRef } = makeHarness()
    render(
      <Harness
        report={makeReport({ is_consolidation: true })}
        commentary={{}}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    apiRef.current!.flushImmediately()
    apiRef.current!.schedule()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    await flushMicrotasks()
    expect(saveSnapshot).not.toHaveBeenCalled()
  })

  // ---------- D-10: no toast on success ----------

  it('D-10: success path does NOT call toast.success', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue({ id: 's1' })
    const { Harness, apiRef } = makeHarness()
    render(
      <Harness
        report={makeReport()}
        commentary={{}}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    await act(async () => {
      apiRef.current!.flushImmediately()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(saveSnapshot).toHaveBeenCalledTimes(1)
    expect((toast.success as any).mock.calls.length).toBe(0)
    expect((toast.error as any).mock.calls.length).toBe(0)
  })

  // ---------- D-11: 3-attempt exponential backoff ----------

  it('D-11: 500 → retries at 1s, 2s, 4s; 4th attempt does NOT fire', async () => {
    const saveSnapshot = vi
      .fn()
      .mockRejectedValue(new Error('500'))
    const { Harness, apiRef, statusRef } = makeHarness()
    render(
      <Harness
        report={makeReport()}
        commentary={{}}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    // Fire the initial save.
    await act(async () => {
      apiRef.current!.flushImmediately()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    // After 1st failure → status retrying attempt 1, sleeping 1000ms.
    expect(saveSnapshot).toHaveBeenCalledTimes(1)
    expect(statusRef.current).toEqual({ kind: 'retrying', attempt: 1 })

    // Advance through the 1s wait → 2nd attempt fires.
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(saveSnapshot).toHaveBeenCalledTimes(2)
    expect(statusRef.current).toEqual({ kind: 'retrying', attempt: 2 })

    // 2s wait → 3rd attempt fires.
    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(saveSnapshot).toHaveBeenCalledTimes(3)
    expect(statusRef.current).toEqual({ kind: 'retrying', attempt: 3 })

    // 4s wait → 4th attempt fires (the third retry).
    await act(async () => {
      vi.advanceTimersByTime(4000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    // Total calls: initial + 3 retries = 4. After 4th failure → status=failed.
    expect(saveSnapshot).toHaveBeenCalledTimes(4)
    expect(statusRef.current).toEqual({ kind: 'failed' })

    // Advance 10s more — no further attempts.
    await act(async () => {
      vi.advanceTimersByTime(10_000)
      await Promise.resolve()
    })
    expect(saveSnapshot).toHaveBeenCalledTimes(4)
  })

  // ---------- D-12: terminal failure → status=failed + single toast.error ----------

  it('D-12: after 3 retries fail, status=failed and toast.error fires exactly once with durable options', async () => {
    const saveSnapshot = vi.fn().mockRejectedValue(new Error('boom'))
    const { Harness, apiRef, statusRef } = makeHarness()
    render(
      <Harness
        report={makeReport()}
        commentary={{}}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    await act(async () => {
      apiRef.current!.flushImmediately()
      await Promise.resolve()
      await Promise.resolve()
    })
    // Run all retries to exhaustion.
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      vi.advanceTimersByTime(4000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(statusRef.current).toEqual({ kind: 'failed' })
    expect((toast.error as any).mock.calls.length).toBe(1)
    // Verify durable options were passed (D-12: non-dismissable until resolved).
    const [, opts] = (toast.error as any).mock.calls[0]
    expect(opts).toBeDefined()
    expect(opts.duration).toBe(Infinity)
    expect(opts.dismissible).toBe(false)
  })

  // ---------- D-13: queue during in-flight ----------

  it('D-13: edits during in-flight save are queued and fired after current resolves', async () => {
    const d1 = deferred<{ id: string }>()
    const d2 = deferred<{ id: string }>()
    const saveSnapshot = vi
      .fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise)
    const { Harness, apiRef } = makeHarness()
    render(
      <Harness
        report={makeReport()}
        commentary={{}}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    // Fire 1st save (in-flight, not yet resolved).
    apiRef.current!.flushImmediately()
    await flushMicrotasks()
    expect(saveSnapshot).toHaveBeenCalledTimes(1)
    // Schedule a 2nd save while 1st is still pending — should be queued, not fired in parallel.
    apiRef.current!.flushImmediately()
    await flushMicrotasks()
    expect(saveSnapshot).toHaveBeenCalledTimes(1) // still 1 — queued
    // Resolve the 1st — queued 2nd should now fire.
    await act(async () => {
      d1.resolve({ id: 's1' })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(saveSnapshot).toHaveBeenCalledTimes(2)
    // Resolve the 2nd to clean up.
    await act(async () => {
      d2.resolve({ id: 's2' })
      await Promise.resolve()
    })
  })

  // ---------- D-14: optimistic UI — value not reverted on failure ----------

  it('D-14: hook does NOT mutate commentary or report on failure', async () => {
    const saveSnapshot = vi.fn().mockRejectedValue(new Error('500'))
    const { Harness, apiRef } = makeHarness()
    const report = makeReport()
    const commentary: VarianceCommentary = {
      A: { text: 'preserved' } as any,
    }
    const reportSnapshot = JSON.parse(JSON.stringify(report))
    const commentarySnapshot = JSON.parse(JSON.stringify(commentary))
    render(
      <Harness
        report={report}
        commentary={commentary}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    await act(async () => {
      apiRef.current!.flushImmediately()
      await Promise.resolve()
      await Promise.resolve()
    })
    // Run retries to exhaustion.
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      vi.advanceTimersByTime(4000)
      await Promise.resolve()
      await Promise.resolve()
    })
    // Caller-owned state is untouched.
    expect(report).toEqual(reportSnapshot)
    expect(commentary).toEqual(commentarySnapshot)
  })

  // ---------- D-15: onSaveSuccess fires on every 2xx ----------

  it('D-15: onSaveSuccess called on initial 2xx', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue({ id: 's1' })
    const onSaveSuccess = vi.fn()
    const { Harness, apiRef } = makeHarness()
    render(
      <Harness
        report={makeReport()}
        commentary={{}}
        userId="u1"
        isLocked={false}
        onSaveSuccess={onSaveSuccess}
        saveSnapshot={saveSnapshot}
      />,
    )
    await act(async () => {
      apiRef.current!.flushImmediately()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onSaveSuccess).toHaveBeenCalledTimes(1)
  })

  it('D-15: onSaveSuccess called on mid-retry success', async () => {
    const saveSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new Error('500'))
      .mockResolvedValueOnce({ id: 's1' }) // 2nd attempt (1st retry) succeeds
    const onSaveSuccess = vi.fn()
    const { Harness, apiRef } = makeHarness()
    render(
      <Harness
        report={makeReport()}
        commentary={{}}
        userId="u1"
        isLocked={false}
        onSaveSuccess={onSaveSuccess}
        saveSnapshot={saveSnapshot}
      />,
    )
    await act(async () => {
      apiRef.current!.flushImmediately()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onSaveSuccess).not.toHaveBeenCalled()
    // 1s sleep → retry fires and succeeds.
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(saveSnapshot).toHaveBeenCalledTimes(2)
    expect(onSaveSuccess).toHaveBeenCalledTimes(1)
  })

  // ---------- Pitfall 6: report.report_data churn must NOT trigger save ----------

  // ---------- D-12 / Pitfall 5: beforeunload guard ----------

  describe('beforeunload guard (D-12 / Pitfall 5)', () => {
    let addSpy: ReturnType<typeof vi.spyOn>
    let removeSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      addSpy = vi.spyOn(window, 'addEventListener')
      removeSpy = vi.spyOn(window, 'removeEventListener')
    })
    afterEach(() => {
      addSpy.mockRestore()
      removeSpy.mockRestore()
    })

    function beforeunloadAddCalls() {
      return addSpy.mock.calls.filter((c) => c[0] === 'beforeunload')
    }
    function beforeunloadRemoveCalls() {
      return removeSpy.mock.calls.filter((c) => c[0] === 'beforeunload')
    }

    it('does NOT register beforeunload during normal flow (idle/saving/saved)', async () => {
      const saveSnapshot = vi.fn().mockResolvedValue({ id: 's1' })
      const { Harness, apiRef } = makeHarness()
      render(
        <Harness
          report={makeReport()}
          commentary={{}}
          userId="u1"
          isLocked={false}
          saveSnapshot={saveSnapshot}
        />,
      )
      // Trigger a normal save → status walks idle → saving → saved.
      await act(async () => {
        apiRef.current!.flushImmediately()
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(saveSnapshot).toHaveBeenCalledTimes(1)
      // No beforeunload registration during the happy path.
      expect(beforeunloadAddCalls()).toHaveLength(0)
    })

    it('registers beforeunload exactly once when status transitions to failed', async () => {
      const saveSnapshot = vi.fn().mockRejectedValue(new Error('500'))
      const { Harness, apiRef, statusRef } = makeHarness()
      render(
        <Harness
          report={makeReport()}
          commentary={{}}
          userId="u1"
          isLocked={false}
          saveSnapshot={saveSnapshot}
        />,
      )
      // Fire initial save → fails → enters retry loop.
      await act(async () => {
        apiRef.current!.flushImmediately()
        await Promise.resolve()
        await Promise.resolve()
      })
      // Walk through the 3 retries (1s + 2s + 4s) → terminal failure.
      await act(async () => {
        vi.advanceTimersByTime(1000)
        await Promise.resolve()
        await Promise.resolve()
      })
      await act(async () => {
        vi.advanceTimersByTime(2000)
        await Promise.resolve()
        await Promise.resolve()
      })
      await act(async () => {
        vi.advanceTimersByTime(4000)
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(statusRef.current).toEqual({ kind: 'failed' })
      // Listener registered exactly once on the failed transition.
      expect(beforeunloadAddCalls()).toHaveLength(1)
      // Handler is a function.
      expect(typeof beforeunloadAddCalls()[0][1]).toBe('function')
    })

    it('removes beforeunload listener when status leaves failed (retryNow success)', async () => {
      // 4 failures (initial + 3 retries) → reach failed; then retryNow succeeds.
      const saveSnapshot = vi
        .fn()
        .mockRejectedValueOnce(new Error('500'))
        .mockRejectedValueOnce(new Error('500'))
        .mockRejectedValueOnce(new Error('500'))
        .mockRejectedValueOnce(new Error('500'))
        .mockResolvedValueOnce({ id: 's-recovered' })
      const { Harness, apiRef, statusRef } = makeHarness()
      render(
        <Harness
          report={makeReport()}
          commentary={{}}
          userId="u1"
          isLocked={false}
          saveSnapshot={saveSnapshot}
        />,
      )
      await act(async () => {
        apiRef.current!.flushImmediately()
        await Promise.resolve()
        await Promise.resolve()
      })
      await act(async () => {
        vi.advanceTimersByTime(1000)
        await Promise.resolve()
        await Promise.resolve()
      })
      await act(async () => {
        vi.advanceTimersByTime(2000)
        await Promise.resolve()
        await Promise.resolve()
      })
      await act(async () => {
        vi.advanceTimersByTime(4000)
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(statusRef.current).toEqual({ kind: 'failed' })
      expect(beforeunloadAddCalls()).toHaveLength(1)
      const registeredHandler = beforeunloadAddCalls()[0][1]

      // User clicks Save Now → succeeds.
      await act(async () => {
        apiRef.current!.retryNow()
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(statusRef.current).toMatchObject({ kind: 'saved' })
      // The same handler reference is now removed.
      const removeMatches = beforeunloadRemoveCalls().filter(
        (c) => c[1] === registeredHandler,
      )
      expect(removeMatches.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('Pitfall 6: changes to report (not commentary) do NOT trigger a save', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue({ id: 's1' })
    const { Harness } = makeHarness()
    const r1 = makeReport({ summary: { revenue: { actual: 100 } } as any })
    const r2 = makeReport({ summary: { revenue: { actual: 999 } } as any })
    const commentary: VarianceCommentary = {}
    const { rerender } = render(
      <Harness
        report={r1}
        commentary={commentary}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    // Simulate Xero refresh — same commentary, different report.
    rerender(
      <Harness
        report={r2}
        commentary={commentary}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    rerender(
      <Harness
        report={r2}
        commentary={commentary}
        userId="u1"
        isLocked={false}
        saveSnapshot={saveSnapshot}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    await flushMicrotasks()
    expect(saveSnapshot).not.toHaveBeenCalled()
  })
})
