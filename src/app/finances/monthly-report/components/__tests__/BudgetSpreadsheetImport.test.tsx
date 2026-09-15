// Package P5 — the coach previews a budget spreadsheet before any of it is
// saved: which rows matched an account, which are budget-only, which match
// nothing, and the year's totals. Save is offered only when nothing is left
// unmatched (IICT-08, DRG-04).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import BudgetSpreadsheetImport from '../BudgetSpreadsheetImport'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const blockedPreview = {
  preview: {
    months: ['2026-07'],
    can_save: false,
    problems: [],
    blocking: ['1 row could not be matched to an account: row 4 (9999 A Calxa-only account).'],
    scopes: [{
      scope: 'drg',
      display_name: 'Dragon Roofing Pty Ltd',
      currency: 'AUD',
      totals: { matched: 1, budget_only: 0, unmatched: 1, skipped: 0, by_type: { revenue: 0, cogs: 0, opex: 312_276, other_income: 0, other_expense: 0 }, net_profit: -312_276 },
      rows: [
        { row: 2, code: '477', name: 'Wages and Salaries - Admin', status: 'matched', account_code: '477', account_name: 'Wages and Salaries - Admin', account_type: 'opex', annual: 312_276, note: null },
        { row: 4, code: '9999', name: 'A Calxa-only account', status: 'unmatched', account_code: '9999', account_name: 'A Calxa-only account', account_type: null, annual: 12_000, note: 'No account with this code or name.' },
      ],
    }],
  },
  accounts: [{ tenant_id: 'drg', code: '485', name: 'Subscriptions' }],
  effective_from: '2026-07',
}

const fetchMock = vi.fn()

function open() {
  render(
    <BudgetSpreadsheetImport
      isOpen
      onClose={vi.fn()}
      businessId="biz-1"
      fiscalYear={2027}
      organisations={[{ tenant_id: 'drg', name: 'Dragon Roofing Pty Ltd' }, { tenant_id: 'ehc', name: 'Easy Hail Claim Pty Ltd' }]}
    />,
  )
  const input = screen.getByLabelText('Spreadsheet', { exact: false }) as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['a,b'], 'FY27 Budget.csv', { type: 'text/csv' })] } })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('BudgetSpreadsheetImport', () => {
  it('shows every row and offers no save while one matches nothing', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => blockedPreview })
    open()
    fireEvent.click(screen.getByText('Preview'))
    await waitFor(() => expect(screen.getByText('Dragon Roofing Pty Ltd · AUD')).toBeTruthy())
    expect(screen.getByText('Matched')).toBeTruthy()
    expect(screen.getByText('No account')).toBeTruthy()
    expect(screen.getByText(/1 row could not be matched/)).toBeTruthy()
    expect((screen.getByText('Save budget') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Takes effect from 2026-07')).toBeTruthy()
    // Preview writes nothing: one request, mode=preview.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0][1].body as FormData).get('mode')).toBe('preview')
  })

  it("sends the coach's budget-only choice with the next preview, and then saves", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => blockedPreview })
    open()
    fireEvent.click(screen.getByText('Preview'))
    await waitFor(() => expect(screen.getByText('No account')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('Budget-only type for row 4'), { target: { value: 'opex' } })
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ...blockedPreview, preview: { ...blockedPreview.preview, can_save: true, blocking: [] } }),
    })
    fireEvent.click(screen.getByText('Preview'))
    await waitFor(() => expect((screen.getByText('Save budget') as HTMLButtonElement).disabled).toBe(false))
    expect(JSON.parse((fetchMock.mock.calls[1][1].body as FormData).get('choices') as string)).toEqual({
      4: { action: 'budget_only', account_type: 'opex' },
    })

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, versions: [{ display_name: 'Dragon Roofing Pty Ltd', label: 'FY27 Budget', version_number: 1, effective_from: '2026-07', line_count: 12 }] }),
    })
    fireEvent.click(screen.getByText('Save budget'))
    await waitFor(() => expect(screen.getByText('Imported.')).toBeTruthy())
    expect((fetchMock.mock.calls[2][1].body as FormData).get('mode')).toBe('save')
    expect(screen.getByText(/FY27 Budget v1, effective 2026-07, 12 lines/)).toBeTruthy()
  })
})
