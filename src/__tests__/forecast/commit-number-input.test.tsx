/**
 * CommitNumberInput — the wizard's single commit-on-blur numeric primitive.
 *
 * Extracted after the same remount-as-sync hack (uncontrolled input whose React
 * key embedded the edited value) was found in THREE step files: Step 5's budget
 * cells (fixed first, #380), Step 3's monthly-total cells and Step 4's
 * rate/hours cells. Each copy carried the same two defects: Enter destroyed the
 * focused node, and clearing a field committed a hard 0. The semantics are
 * pinned here once; the steps are thin wrappers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { CommitNumberInput } from '@/app/finances/forecast/components/wizard-v4/components/CommitNumberInput'

afterEach(cleanup)

function setup(props: Partial<React.ComponentProps<typeof CommitNumberInput>> = {}) {
  const onCommit = vi.fn()
  render(<CommitNumberInput value={100} onCommit={onCommit} {...props} />)
  const input = screen.getByRole('textbox') as HTMLInputElement
  return { input, onCommit, user: userEvent.setup() }
}

describe('CommitNumberInput', () => {
  it('commits on Enter and keeps focus (the remount hack lost it to <body>)', async () => {
    const { input, onCommit, user } = setup()
    await user.click(input)
    await user.clear(input)
    await user.type(input, '250{Enter}')
    expect(onCommit).toHaveBeenCalledWith(250)
    expect(document.activeElement).toBe(input)
  })

  it('empty input reverts and never commits — clearing used to book a hard 0', async () => {
    const { input, onCommit, user } = setup()
    await user.click(input)
    await user.clear(input)
    await user.tab()
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('100')
  })

  it('an explicit 0 still commits', async () => {
    const { input, onCommit, user } = setup()
    await user.click(input)
    await user.clear(input)
    await user.type(input, '0')
    await user.tab()
    expect(onCommit).toHaveBeenCalledWith(0)
  })

  it('negatives revert unless allowNegative', async () => {
    const { input, onCommit, user } = setup()
    await user.click(input)
    await user.clear(input)
    await user.type(input, '-50')
    await user.tab()
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('100')
  })

  it('decimals survive typing and parse on commit', async () => {
    const { input, onCommit, user } = setup()
    await user.click(input)
    await user.clear(input)
    await user.type(input, '12.5')
    expect(input.value).toBe('12.5')
    await user.tab()
    expect(onCommit).toHaveBeenCalledWith(12.5)
  })

  it('Escape restores the canonical value without committing', async () => {
    const { input, onCommit, user } = setup()
    await user.click(input)
    await user.clear(input)
    await user.type(input, '999{Escape}')
    expect(input.value).toBe('100')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('re-syncs from the prop only while NOT focused', async () => {
    const onCommit = vi.fn()
    const { rerender } = render(<CommitNumberInput value={100} onCommit={onCommit} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    const user = userEvent.setup()

    // Focused + mid-edit: an external state change must not clobber typing —
    // the original controlled inputs reformatted per keystroke, which is what
    // drove the author to the remount hack in the first place.
    await user.click(input)
    await user.clear(input)
    await user.type(input, '55')
    rerender(<CommitNumberInput value={777} onCommit={onCommit} />)
    expect(input.value).toBe('55')

    // Blurred: the same external change now syncs in.
    await user.tab()
    rerender(<CommitNumberInput value={888} onCommit={onCommit} />)
    expect(input.value).toBe('888')
  })

  it('zeroAsEmpty renders 0 as an empty grid cell', () => {
    const onCommit = vi.fn()
    render(<CommitNumberInput value={0} onCommit={onCommit} placeholder="0" />)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })

  it('is a textbox, not a spinbutton — no scroll/arrow mutation hazard', () => {
    const { input } = setup()
    expect(input.type).toBe('text')
    expect(input.getAttribute('inputmode')).toBe('decimal')
  })
})
