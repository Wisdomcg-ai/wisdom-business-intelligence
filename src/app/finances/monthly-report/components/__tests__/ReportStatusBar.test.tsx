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
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
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
