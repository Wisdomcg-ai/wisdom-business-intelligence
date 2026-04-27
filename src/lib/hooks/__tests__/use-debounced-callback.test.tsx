// Phase 42 Plan 42-00 Task 0.1
// Vitest fake-timer suite for the shared `useDebouncedCallback` hook.
// Mirrors the test pattern from `ReportStatusBar.test.tsx`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { useDebouncedCallback } from '../use-debounced-callback'

// Tiny harness component: invokes `useDebouncedCallback(spy, delay)` and
// exposes a single ref-based trigger so tests can fire the debounced fn
// from the outside without running into React's "no setState during render"
// rules. The harness also unmounts cleanly so we can assert the unmount
// guard (Pitfall 1).
function Harness({
  spy,
  delay,
  fnRef,
}: {
  spy: (...args: any[]) => void
  delay: number
  fnRef: React.MutableRefObject<((...args: any[]) => void) | null>
}) {
  const debounced = useDebouncedCallback(spy, delay)
  fnRef.current = debounced
  return null
}

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Test 1: does NOT invoke callback before `delay` elapses', () => {
    const spy = vi.fn()
    const fnRef = React.createRef<(...args: any[]) => void>() as React.MutableRefObject<
      ((...args: any[]) => void) | null
    >
    render(<Harness spy={spy} delay={100} fnRef={fnRef} />)

    act(() => {
      fnRef.current!('a')
    })

    act(() => {
      vi.advanceTimersByTime(99)
    })

    expect(spy).not.toHaveBeenCalled()
  })

  it('Test 2: invokes callback exactly once with the correct argument after `delay`', () => {
    const spy = vi.fn()
    const fnRef = React.createRef<(...args: any[]) => void>() as React.MutableRefObject<
      ((...args: any[]) => void) | null
    >
    render(<Harness spy={spy} delay={100} fnRef={fnRef} />)

    act(() => {
      fnRef.current!('hello')
    })

    act(() => {
      vi.advanceTimersByTime(101)
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('hello')
  })

  it('Test 3: latest-wins when a second call arrives within the window', () => {
    const spy = vi.fn()
    const fnRef = React.createRef<(...args: any[]) => void>() as React.MutableRefObject<
      ((...args: any[]) => void) | null
    >
    render(<Harness spy={spy} delay={100} fnRef={fnRef} />)

    act(() => {
      fnRef.current!('a')
    })
    act(() => {
      vi.advanceTimersByTime(50)
    })
    act(() => {
      fnRef.current!('b')
    })
    act(() => {
      vi.advanceTimersByTime(101)
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('b')
  })

  it('Test 4 (Pitfall 1 regression): unmounting before the timer fires does NOT invoke callback', () => {
    const spy = vi.fn()
    const fnRef = React.createRef<(...args: any[]) => void>() as React.MutableRefObject<
      ((...args: any[]) => void) | null
    >
    const { unmount } = render(<Harness spy={spy} delay={100} fnRef={fnRef} />)

    act(() => {
      fnRef.current!('a')
    })

    // Unmount BEFORE the timer fires.
    act(() => {
      unmount()
    })

    // Advance well past the delay; the cleanup effect should have cleared
    // the pending timer, so the spy must not be invoked.
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(spy).not.toHaveBeenCalled()
  })

  it('Test 5: two calls separated by more than `delay` invoke callback twice', () => {
    const spy = vi.fn()
    const fnRef = React.createRef<(...args: any[]) => void>() as React.MutableRefObject<
      ((...args: any[]) => void) | null
    >
    render(<Harness spy={spy} delay={100} fnRef={fnRef} />)

    act(() => {
      fnRef.current!('first')
    })
    act(() => {
      vi.advanceTimersByTime(101)
    })

    act(() => {
      fnRef.current!('second')
    })
    act(() => {
      vi.advanceTimersByTime(101)
    })

    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenNthCalledWith(1, 'first')
    expect(spy).toHaveBeenNthCalledWith(2, 'second')
  })
})
