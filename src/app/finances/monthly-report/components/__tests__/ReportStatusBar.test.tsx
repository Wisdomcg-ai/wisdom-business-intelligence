// Phase 35 Plan 06: Tests for ReportStatusBar + useReportStatus.
// Co-located to keep the status-pill surface in one spec.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import ReportStatusBar from '../ReportStatusBar'
import { useReportStatus } from '../../hooks/useReportStatus'

// sonner is imported by ReportStatusBar.tsx; mock it up front so toast.* calls
// don't explode in jsdom and so we can assert on the calls.
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock the browser supabase client for the hook tests. Uses a chainable mock
// with configurable .maybeSingle() result.
const maybeSingleMock = vi.fn()
const selectMock = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: (...args: unknown[]) => (selectMock(...args), {
        eq: () => ({
          eq: () => ({
            maybeSingle: maybeSingleMock,
          }),
        }),
      }),
    }),
  }),
}))

// ----------------------------------------------------------------------------
// ReportStatusBar component tests
// ----------------------------------------------------------------------------

function noop() {
  return undefined
}

describe('ReportStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 1: draft + coach — pill "Draft" AND two buttons (Mark Ready for Review + Approve & Send)', () => {
    render(
      <ReportStatusBar
        status="draft"
        sentAt={null}
        role="coach"
        onMarkReady={noop}
        onApproveAndSend={noop}
        onResend={noop}
        onRevertToDraft={noop}
      />,
    )
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mark Ready for Review/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Approve & Send/i })).toBeInTheDocument()
  })

  it('Test 2: ready_for_review + coach — pill "Ready for Review" AND Approve & Send button', () => {
    render(
      <ReportStatusBar
        status="ready_for_review"
        sentAt={null}
        role="coach"
        onMarkReady={noop}
        onApproveAndSend={noop}
        onResend={noop}
        onRevertToDraft={noop}
      />,
    )
    expect(screen.getByText('Ready for Review')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Approve & Send/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mark Ready for Review/i })).not.toBeInTheDocument()
  })

  it('Test 3: approved + coach — pill "Approved" AND Resend + Revert to Draft buttons', () => {
    render(
      <ReportStatusBar
        status="approved"
        sentAt={null}
        role="coach"
        onMarkReady={noop}
        onApproveAndSend={noop}
        onResend={noop}
        onRevertToDraft={noop}
      />,
    )
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Resend$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Revert to Draft/i })).toBeInTheDocument()
  })

  it('Test 4: sent + coach — pill "Sent" + sentAt date AND Resend + Revert to Draft buttons', () => {
    render(
      <ReportStatusBar
        status="sent"
        sentAt="2026-04-10T05:00:00.000Z"
        role="coach"
        onMarkReady={noop}
        onApproveAndSend={noop}
        onResend={noop}
        onRevertToDraft={noop}
      />,
    )
    // Pill label
    expect(screen.getByText(/Sent/)).toBeInTheDocument()
    // Formatted date appears somewhere (en-AU long-ish format includes "Apr")
    expect(screen.getByText(/Apr/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Resend$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Revert to Draft/i })).toBeInTheDocument()
  })

  it('Test 5: client role — pill visible but NO action buttons (D-04)', () => {
    const { rerender } = render(
      <ReportStatusBar
        status="draft"
        sentAt={null}
        role="client"
        onMarkReady={noop}
        onApproveAndSend={noop}
        onResend={noop}
        onRevertToDraft={noop}
      />,
    )
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    // Try other statuses too — clients never see buttons
    rerender(
      <ReportStatusBar
        status="sent"
        sentAt="2026-04-10T05:00:00.000Z"
        role="client"
        onMarkReady={noop}
        onApproveAndSend={noop}
        onResend={noop}
        onRevertToDraft={noop}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('Test 6: invalid_from_address error surfaces a contextual sender-verification message', async () => {
    const failingApprove = vi.fn().mockRejectedValue({
      body: { errorCode: 'invalid_from_address' },
    })
    render(
      <ReportStatusBar
        status="draft"
        sentAt={null}
        role="coach"
        onMarkReady={noop}
        onApproveAndSend={failingApprove}
        onResend={noop}
        onRevertToDraft={noop}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Approve & Send/i }))
    })
    await waitFor(() => {
      expect(screen.getByText(/sender email not verified/i)).toBeInTheDocument()
    })
  })

  it('Phase C: generic failures surface the thrown reason instead of the one-size-fits-all toast', async () => {
    const { toast } = await import('sonner')
    const failingApprove = vi.fn().mockRejectedValue({
      body: { error: 'No owner_email configured on this business' },
    })
    render(
      <ReportStatusBar
        status="draft"
        sentAt={null}
        role="coach"
        onMarkReady={noop}
        onApproveAndSend={failingApprove}
        onResend={noop}
        onRevertToDraft={noop}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Approve & Send/i }))
    })
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Send failed: No owner_email configured on this business',
      )
    })
  })

  it('Phase C: errors with no usable detail keep the generic resend hint', async () => {
    const { toast } = await import('sonner')
    const failingApprove = vi.fn().mockRejectedValue({})
    render(
      <ReportStatusBar
        status="draft"
        sentAt={null}
        role="coach"
        onMarkReady={noop}
        onApproveAndSend={failingApprove}
        onResend={noop}
        onRevertToDraft={noop}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Approve & Send/i }))
    })
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Email send failed — click Resend to retry',
      )
    })
  })

  // Package B: a month whose Approve & Send kept the balance sheets its PDF
  // printed goes on printing them after the first save silently flips the pill
  // back to Draft — where Revert to Draft is not offered. The bar has to say so,
  // and offer the reopen, whatever the status.
  describe('a kept sent balance sheet', () => {
    const KEPT = '2026-09-15T01:00:00.000Z'

    it('draft: says the balance sheet is the sent copy, and offers the reopen through revert_to_draft', async () => {
      const onRevert = vi.fn().mockResolvedValue(undefined)
      render(
        <ReportStatusBar
          status="draft"
          sentAt={null}
          sentBalanceSheetAt={KEPT}
          role="coach"
          onMarkReady={noop}
          onApproveAndSend={noop}
          onResend={noop}
          onRevertToDraft={onRevert}
        />,
      )
      expect(screen.getByText(/Balance sheet as sent 15 Sep/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Approve & Send/i })).toBeInTheDocument()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Reopen balance sheet/i }))
      })
      expect(onRevert).toHaveBeenCalledTimes(1)
    })

    it('ready for review: offers the reopen too', () => {
      render(
        <ReportStatusBar
          status="ready_for_review"
          sentAt={null}
          sentBalanceSheetAt={KEPT}
          role="coach"
          onMarkReady={noop}
          onApproveAndSend={noop}
          onResend={noop}
          onRevertToDraft={noop}
        />,
      )
      expect(screen.getByRole('button', { name: /Reopen balance sheet/i })).toBeInTheDocument()
    })

    it('sent: says so, and Revert to Draft stays the one reopen (no second button)', () => {
      render(
        <ReportStatusBar
          status="sent"
          sentAt={KEPT}
          sentBalanceSheetAt={KEPT}
          role="coach"
          onMarkReady={noop}
          onApproveAndSend={noop}
          onResend={noop}
          onRevertToDraft={noop}
        />,
      )
      expect(screen.getByText(/Balance sheet as sent/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Revert to Draft/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Reopen balance sheet/i })).not.toBeInTheDocument()
    })

    it('no kept copy: the bar is exactly as before', () => {
      render(
        <ReportStatusBar
          status="draft"
          sentAt={null}
          sentBalanceSheetAt={null}
          role="coach"
          onMarkReady={noop}
          onApproveAndSend={noop}
          onResend={noop}
          onRevertToDraft={noop}
        />,
      )
      expect(screen.queryByText(/Balance sheet as sent/)).not.toBeInTheDocument()
      expect(screen.getAllByRole('button')).toHaveLength(2)
    })

    it('client role: neither the note nor the button', () => {
      render(
        <ReportStatusBar
          status="draft"
          sentAt={null}
          sentBalanceSheetAt={KEPT}
          role="client"
          onMarkReady={noop}
          onApproveAndSend={noop}
          onResend={noop}
          onRevertToDraft={noop}
        />,
      )
      expect(screen.queryByText(/Balance sheet as sent/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  it('Test 7: each action button invokes its corresponding prop callback', async () => {
    const onMarkReady = vi.fn().mockResolvedValue(undefined)
    const onApprove = vi.fn().mockResolvedValue(undefined)

    const { rerender } = render(
      <ReportStatusBar
        status="draft"
        sentAt={null}
        role="coach"
        onMarkReady={onMarkReady}
        onApproveAndSend={onApprove}
        onResend={noop}
        onRevertToDraft={noop}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Mark Ready for Review/i }))
    })
    expect(onMarkReady).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Approve & Send/i }))
    })
    expect(onApprove).toHaveBeenCalledTimes(1)

    const onResend = vi.fn().mockResolvedValue(undefined)
    const onRevert = vi.fn().mockResolvedValue(undefined)

    rerender(
      <ReportStatusBar
        status="approved"
        sentAt={null}
        role="coach"
        onMarkReady={noop}
        onApproveAndSend={noop}
        onResend={onResend}
        onRevertToDraft={onRevert}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Resend$/i }))
    })
    expect(onResend).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Revert to Draft/i }))
    })
    expect(onRevert).toHaveBeenCalledTimes(1)
  })
})

// ----------------------------------------------------------------------------
// useReportStatus hook tests
// ----------------------------------------------------------------------------

describe('useReportStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    maybeSingleMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // Test harness — a component that exposes the hook state via data-*
  function Harness(props: { businessId: string | null; periodMonth: string | null }) {
    const s = useReportStatus(props.businessId, props.periodMonth)
    const onClick = () => { s.refresh() }
    return React.createElement(
      'div',
      {
        'data-status': s.status ?? '',
        'data-sent-at': s.sentAt ?? '',
        'data-sent-balance-sheet-at': s.sentBalanceSheetAt ?? '',
        'data-loading': String(s.loading),
        'data-error': s.error ?? '',
      },
      React.createElement('button', { onClick }, 'refresh'),
    )
  }

  it('Test H1: resolves from loading → status when Supabase returns a row', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { status: 'sent', sent_at: '2026-04-10T00:00:00Z', approved_at: '2026-04-09T00:00:00Z' },
      error: null,
    })
    const { container } = render(<Harness businessId="biz-1" periodMonth="2026-03-01" />)
    const div = container.querySelector('div')!
    // Initially loading
    expect(div.getAttribute('data-loading')).toBe('true')
    await waitFor(() => {
      expect(div.getAttribute('data-loading')).toBe('false')
    })
    expect(div.getAttribute('data-status')).toBe('sent')
    expect(div.getAttribute('data-sent-at')).toBe('2026-04-10T00:00:00Z')
  })

  it('Package B: reads the kept sent balance sheet off snapshot_data — its time while not reopened, null once reopened', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        status: 'draft',
        sent_at: null,
        approved_at: null,
        sent_balance_sheet_at: '2026-09-15T01:00:00.000Z',
        sent_balance_sheet_reopened_at: null,
      },
      error: null,
    })
    const { container, unmount } = render(<Harness businessId="biz-1" periodMonth="2026-08-01" />)
    const div = container.querySelector('div')!
    await waitFor(() => {
      expect(div.getAttribute('data-loading')).toBe('false')
    })
    expect(div.getAttribute('data-sent-balance-sheet-at')).toBe('2026-09-15T01:00:00.000Z')
    // Only the two stamps travel, never the sheets themselves.
    expect(selectMock).toHaveBeenCalledWith(
      expect.stringContaining('sent_balance_sheet_at:snapshot_data->frozen_balance_sheets->>frozen_at'),
    )
    expect(selectMock).toHaveBeenCalledWith(
      expect.stringContaining('sent_balance_sheet_reopened_at:snapshot_data->frozen_balance_sheets->>reopened_at'),
    )
    unmount()

    maybeSingleMock.mockResolvedValue({
      data: {
        status: 'draft',
        sent_at: null,
        approved_at: null,
        sent_balance_sheet_at: '2026-09-15T01:00:00.000Z',
        sent_balance_sheet_reopened_at: '2026-09-16T01:00:00.000Z',
      },
      error: null,
    })
    const again = render(<Harness businessId="biz-1" periodMonth="2026-08-01" />)
    const div2 = again.container.querySelector('div')!
    await waitFor(() => {
      expect(div2.getAttribute('data-loading')).toBe('false')
    })
    expect(div2.getAttribute('data-sent-balance-sheet-at')).toBe('')
  })

  it('Test H2: refresh() re-queries the table', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'draft', sent_at: null, approved_at: null }, error: null })
    const { container } = render(<Harness businessId="biz-1" periodMonth="2026-03-01" />)
    const div = container.querySelector('div')!
    await waitFor(() => {
      expect(div.getAttribute('data-loading')).toBe('false')
    })
    const callsBefore = maybeSingleMock.mock.calls.length
    const btn = container.querySelector('button')!
    await act(async () => {
      btn.click()
    })
    await waitFor(() => {
      expect(maybeSingleMock.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })
})
