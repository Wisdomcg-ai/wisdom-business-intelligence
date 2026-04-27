// Phase 42 Plan 42-02 Task 2.1 — RTL tests for the <SaveIndicator/> presentational component.
// Covers D-08 (idle/saved/saving/retrying wording), D-09 (data-testid), D-12 (failed-state retry button).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import SaveIndicator from '../SaveIndicator'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

describe('SaveIndicator (Phase 42)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // D-08: indicator wording per status.kind
  it('D-08: renders "All changes saved" when status.kind === idle', () => {
    render(<SaveIndicator status={{ kind: 'idle' }} onRetry={vi.fn()} />)
    expect(screen.getByText('All changes saved')).toBeTruthy()
  })

  it('D-08: renders "All changes saved" when status.kind === saved', () => {
    render(
      <SaveIndicator
        status={{ kind: 'saved', at: new Date() }}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText('All changes saved')).toBeTruthy()
  })

  it('D-08: renders "Saving..." with Loader2 spinner when status.kind === saving', () => {
    const { container } = render(
      <SaveIndicator status={{ kind: 'saving' }} onRetry={vi.fn()} />,
    )
    expect(screen.getByText('Saving...')).toBeTruthy()
    // Loader2 from lucide-react renders an svg with the animate-spin class applied
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('D-08: renders "Unsaved — retrying..." when status.kind === retrying', () => {
    render(
      <SaveIndicator
        status={{ kind: 'retrying', attempt: 1 }}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText(/Unsaved — retrying/)).toBeTruthy()
  })

  // D-12: terminal-failure UX (manual retry button + visible label)
  it('D-12: renders "Unsaved — click to retry" + Save Now button when status.kind === failed', () => {
    render(<SaveIndicator status={{ kind: 'failed' }} onRetry={vi.fn()} />)
    expect(screen.getByText('Unsaved — click to retry')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save Now' })).toBeTruthy()
  })

  it('D-12: clicking Save Now calls onRetry', () => {
    const onRetry = vi.fn()
    render(<SaveIndicator status={{ kind: 'failed' }} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save Now' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  // D-09: indicator and pill coexist; indicator has stable testid
  it('D-09: indicator has data-testid="save-indicator" for sibling test', () => {
    render(<SaveIndicator status={{ kind: 'idle' }} onRetry={vi.fn()} />)
    expect(screen.getByTestId('save-indicator')).toBeTruthy()
  })
})
