// Phase 42 Plan 42-03 — CommentaryLine RTL tests.
// Verifies D-04 (Save/Cancel/Pencil button removal), D-14 (every-keystroke onNoteChange),
// D-01 (blur fires onCommitBlur), and Pattern 3 (always-editable inline textarea).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { CommentaryLine } from '../BudgetVsActualTable'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const ACCOUNT = 'Subscriptions'

function renderLine(overrides: Partial<React.ComponentProps<typeof CommentaryLine>> = {}) {
  const props: React.ComponentProps<typeof CommentaryLine> = {
    accountName: ACCOUNT,
    variance: -1234,
    vendors: [],
    coachNote: '',
    onNoteChange: vi.fn(),
    onCommitBlur: vi.fn(),
    ...overrides,
  }
  const utils = render(<CommentaryLine {...props} />)
  return { ...utils, props }
}

describe('CommentaryLine (Phase 42)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // D-04: per-note green ✓ button removed entirely
  it('D-04: no element with title="Save note" exists', () => {
    renderLine({ coachNote: 'existing note' })
    expect(screen.queryByTitle('Save note')).toBeNull()
  })

  it('D-04: no element with title="Cancel" exists', () => {
    renderLine({ coachNote: 'existing note' })
    expect(screen.queryByTitle('Cancel')).toBeNull()
  })

  it('D-04: textarea is always rendered (no edit/view mode toggle)', () => {
    // Empty state — textarea should still be present (no Add Note button gate).
    const { unmount } = renderLine({ coachNote: '' })
    expect(screen.getByTestId(`commentary-textarea-${ACCOUNT}`)).toBeTruthy()
    unmount()

    // Pre-filled state — textarea is there too (no Edit-mode toggle).
    renderLine({ coachNote: 'this is a coach note' })
    expect(screen.getByTestId(`commentary-textarea-${ACCOUNT}`)).toBeTruthy()
    // No pencil affordance, no separate display surface.
    expect(screen.queryByTitle('Edit note')).toBeNull()
  })

  // D-14: optimistic UI — every keystroke flows up
  it('D-14: typing into textarea fires onNoteChange on every keystroke', () => {
    const { props } = renderLine({ coachNote: '' })
    const textarea = screen.getByTestId(`commentary-textarea-${ACCOUNT}`) as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: 'h' } })
    fireEvent.change(textarea, { target: { value: 'he' } })
    fireEvent.change(textarea, { target: { value: 'hel' } })

    expect(props.onNoteChange).toHaveBeenCalledTimes(3)
    expect(props.onNoteChange).toHaveBeenNthCalledWith(1, ACCOUNT, 'h')
    expect(props.onNoteChange).toHaveBeenNthCalledWith(2, ACCOUNT, 'he')
    expect(props.onNoteChange).toHaveBeenNthCalledWith(3, ACCOUNT, 'hel')
  })

  // D-01: blur emits a flush signal
  it('D-01: blur event fires onCommitBlur with accountName', () => {
    const { props } = renderLine({ coachNote: 'some text' })
    const textarea = screen.getByTestId(`commentary-textarea-${ACCOUNT}`)

    fireEvent.blur(textarea)

    expect(props.onCommitBlur).toHaveBeenCalledTimes(1)
    expect(props.onCommitBlur).toHaveBeenCalledWith(ACCOUNT)
  })

  // Pattern 3: empty-note placeholder
  it('placeholder text appears when coachNote is empty', () => {
    renderLine({ coachNote: '' })
    const textarea = screen.getByTestId(`commentary-textarea-${ACCOUNT}`) as HTMLTextAreaElement
    expect(textarea.placeholder).toContain('Add your coaching note')
  })

  // UX continuity: textarea pre-fills with coachNote (controlled by parent — D-14)
  it('textarea is controlled by coachNote prop (no internal state)', () => {
    const { rerender } = renderLine({ coachNote: 'first' })
    let textarea = screen.getByTestId(`commentary-textarea-${ACCOUNT}`) as HTMLTextAreaElement
    expect(textarea.value).toBe('first')

    // Parent updates coachNote → textarea reflects new value (no internal editText state).
    rerender(
      <CommentaryLine
        accountName={ACCOUNT}
        variance={-1234}
        vendors={[]}
        coachNote="second"
        onNoteChange={vi.fn()}
        onCommitBlur={vi.fn()}
      />
    )
    textarea = screen.getByTestId(`commentary-textarea-${ACCOUNT}`) as HTMLTextAreaElement
    expect(textarea.value).toBe('second')
  })
})
