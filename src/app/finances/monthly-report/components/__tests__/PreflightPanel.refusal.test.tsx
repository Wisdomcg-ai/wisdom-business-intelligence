// Package P1 — a pre-flight failure marked `blocks` leaves no way to export:
// an IICT pack with no HKD/AUD rate would add Hong Kong dollars to Australian
// ones, and nothing on the panel makes that right to send (IICT-04). Every
// other failure still leaves the coach the choice.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import PreflightPanel from '../PreflightPanel'
import type { PreflightResult } from '@/lib/monthly-report/preflight'

const refusal: PreflightResult = {
  key: 'entity_sum',
  label: 'Entity consolidation',
  status: 'fail',
  detail: 'Export refused — no HKD/AUD exchange rate is stored for Jul 2026 and Aug 2026, so those months would add foreign-currency figures to AUD one-for-one.',
  blocks: true,
}
const ordinaryFail: PreflightResult = { key: 'draft_state', label: 'Draft state', status: 'fail', detail: 'Report is marked FINAL with 3 unreconciled transactions.' }

describe('PreflightPanel — refusals', () => {
  it('offers no export when a check blocks, only Close, and names the months', () => {
    const onProceed = vi.fn()
    const onCancel = vi.fn()
    render(<PreflightPanel results={[ordinaryFail, refusal]} onCancel={onCancel} onProceed={onProceed} />)
    expect(screen.queryByText('Export anyway')).toBeNull()
    expect(screen.queryByText('Export PDF')).toBeNull()
    expect(screen.getByText(/Jul 2026 and Aug 2026/)).toBeTruthy()
    expect(screen.getByText('Blocks export')).toBeTruthy()
    fireEvent.click(screen.getByText('Close'))
    expect(onCancel).toHaveBeenCalled()
    expect(onProceed).not.toHaveBeenCalled()
  })

  it('an ordinary failure still offers Export anyway', () => {
    render(<PreflightPanel results={[ordinaryFail]} onCancel={vi.fn()} onProceed={vi.fn()} />)
    expect(screen.getByText('Export anyway')).toBeTruthy()
    expect(screen.queryByText('Blocks export')).toBeNull()
  })
})
