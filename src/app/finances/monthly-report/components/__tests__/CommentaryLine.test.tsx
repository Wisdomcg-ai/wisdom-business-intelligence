// Phase 42 Plan 42-00 Task 0.2 — Wave 0 test scaffold for CommentaryLine.
// Filled in by Plan 42-03 when the green ✓ button is removed (D-04) and the
// always-editable textarea pattern lands (D-14). All entries are `it.todo`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

describe('CommentaryLine (Phase 42)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // D-04: per-note green ✓ button removed entirely
  it.todo('D-04: no element with title="Save note" or rendering Check icon exists')
  it.todo('D-04: no element with title="Cancel" exists')
  it.todo('D-04: textarea is always rendered (no edit/view mode toggle)')

  // D-14: optimistic UI — every keystroke flows up
  it.todo('D-14: typing into textarea fires onNoteChange on every keystroke')

  // D-01: blur emits a flush signal
  it.todo('D-01: blur event fires onCommitBlur with accountName')

  // UX continuity: empty-state "Add note" button still focuses the textarea
  it.todo('Add note button still focuses textarea when coachNote is empty (UX continuity)')
})
