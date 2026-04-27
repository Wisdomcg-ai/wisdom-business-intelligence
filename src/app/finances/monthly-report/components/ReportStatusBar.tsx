'use client'
// Phase 35 Plan 06 (APPR-01): Status pill + contextual action buttons for the
// monthly-report top bar.
//
// Role-gated visibility (D-04): clients see the pill, no buttons.
// Actions call the orchestrator service which POSTs /api/cfo/report-status.
import { useState } from 'react'
import { toast } from 'sonner'

const REPORT_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  ready_for_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  sent: 'bg-emerald-100 text-emerald-800',
}

const REPORT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  ready_for_review: 'Ready for Review',
  approved: 'Approved',
  sent: 'Sent',
}

export type ReportStatus = 'draft' | 'ready_for_review' | 'approved' | 'sent'
export type UserRole = 'coach' | 'super_admin' | 'client'

export interface ReportStatusBarProps {
  status: ReportStatus | null
  sentAt: string | null
  role: UserRole
  onMarkReady: () => Promise<void> | void
  onApproveAndSend: () => Promise<void> | void
  onResend: () => Promise<void> | void
  onRevertToDraft: () => Promise<void> | void
}

function formatSentAt(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

type ErrorLike = {
  errorCode?: string
  body?: { errorCode?: string; timedOut?: boolean; error?: string }
}

export default function ReportStatusBar(props: ReportStatusBarProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null)

  const status: ReportStatus = props.status ?? 'draft'
  const isCoach = props.role === 'coach' || props.role === 'super_admin'
  const label = REPORT_STATUS_LABELS[status] ?? 'Draft'
  const pillClass = REPORT_STATUS_STYLES[status] ?? REPORT_STATUS_STYLES.draft

  async function run(
    actionKey: string,
    fn: () => Promise<void> | void,
    successMsg: string,
  ) {
    setBusy(actionKey)
    setLastErrorCode(null)
    try {
      await fn()
      toast.success(successMsg)
    } catch (err) {
      const e = (err ?? {}) as ErrorLike
      const code = e.errorCode ?? e.body?.errorCode ?? null
      setLastErrorCode(code)
      if (code === 'invalid_from_address') {
        toast.error(
          "Your coach sender email isn't verified in Resend yet. Contact admin to set up.",
        )
      } else if (e.body?.timedOut) {
        toast.error('Email send timed out — click Resend to retry')
      } else {
        toast.error('Email send failed — click Resend to retry')
      }
    } finally {
      setBusy(null)
    }
  }

  const sentAtLabel = status === 'sent' && props.sentAt ? formatSentAt(props.sentAt) : ''

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${pillClass}`}
      >
        {label}
        {sentAtLabel ? ` · ${sentAtLabel}` : ''}
      </span>
      {isCoach && status === 'draft' && (
        <>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run('mark_ready', props.onMarkReady, 'Marked ready for review')
            }
            className="px-3 py-1.5 rounded-md text-sm border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            Mark Ready for Review
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run('approve_and_send', props.onApproveAndSend, 'Report sent')
            }
            className="px-3 py-1.5 rounded-md text-sm bg-[#F5821F] text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy === 'approve_and_send' ? 'Sending…' : 'Approve & Send'}
          </button>
        </>
      )}
      {isCoach && status === 'ready_for_review' && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run('approve_and_send', props.onApproveAndSend, 'Report sent')
          }
          className="px-3 py-1.5 rounded-md text-sm bg-[#F5821F] text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy === 'approve_and_send' ? 'Sending…' : 'Approve & Send'}
        </button>
      )}
      {isCoach && (status === 'approved' || status === 'sent') && (
        <>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('resend', props.onResend, 'Report resent')}
            className="px-3 py-1.5 rounded-md text-sm border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy === 'resend' ? 'Sending…' : 'Resend'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run('revert', props.onRevertToDraft, 'Reverted to draft')
            }
            className="px-3 py-1.5 rounded-md text-sm text-slate-600 hover:text-slate-900 disabled:opacity-60"
          >
            Revert to Draft
          </button>
        </>
      )}
      {lastErrorCode === 'invalid_from_address' && (
        <span className="text-xs text-rose-700">
          sender email not verified — contact admin
        </span>
      )}
    </div>
  )
}
