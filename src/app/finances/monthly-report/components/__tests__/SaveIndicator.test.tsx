// Phase 42 Plan 42-00 Task 0.2 — Wave 0 test scaffold for <SaveIndicator/>.
// Filled in by Plan 42-02. All entries here are `it.todo` placeholders.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'

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
  it.todo('D-08: renders "All changes saved" when status.kind === idle or saved')
  it.todo('D-08: renders "Saving..." with Loader2 spinner when status.kind === saving')
  it.todo('D-08: renders "Unsaved — retrying..." when status.kind === retrying')

  // D-12: terminal-failure UX (manual retry button + visible label)
  it.todo('D-12: renders "Unsaved — click to retry" + Save Now button when status.kind === failed')
  it.todo('D-12: clicking Save Now calls onRetry')

  // D-09: indicator and pill coexist; indicator has stable testid
  it.todo('D-09: indicator has data-testid="save-indicator" for sibling test')
})
