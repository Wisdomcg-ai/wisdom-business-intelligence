// Phase 35 Plan 04: POST /api/cfo/report-status
//
// Single endpoint orchestrating every server-side state change for the monthly-report
// approval workflow. Mirrors the CFO role-check pattern from flag-client/summaries.
//
// Actions (body.action):
//   - mark_ready        : draft → ready_for_review (D-01)
//   - approve_and_send  : * → approved (+ snapshot), Resend send, → sent on success (D-02/D-11/D-15)
//   - revert_to_draft   : approved|sent → draft, preserving snapshot (D-03/D-18)
//   - resend            : re-send an already-approved/sent report (D-13)
//
// Transaction ordering follows 35-RESEARCH.md §Pitfall 2 exactly so that a
// Resend failure NEVER leaves the row at status='sent'.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { sendMonthlyReport } from '@/lib/email/send-report'
import { buildReportUrl } from '@/lib/reports/build-report-url'
import { revertReportIfApproved } from '@/lib/reports/revert-report'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

// Module-level service-role client (mirrors flag-client/route.ts)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

// ~7.5MB decoded — guards against runaway uploads while staying well under
// Resend's 40MB attachment cap.
const MAX_PDF_BASE64_BYTES = 10_000_000

type ApproveSendBody = {
  action: 'approve_and_send'
  business_id: string
  period_month: string
  snapshot_data: unknown
  pdf_base64: string
  pdf_filename: string
  coach_name: string
  coach_email: string
  business_name: string
  month_label: string
  client_greeting_name: string
  recipient_email: string
  portal_slug?: string | null
}

type ResendBody = {
  action: 'resend'
  business_id: string
  period_month: string
  pdf_base64: string
  pdf_filename: string
  coach_name: string
  coach_email: string
  business_name: string
  month_label: string
  client_greeting_name: string
  recipient_email: string
  portal_slug?: string | null
}

function errorResponse(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status })
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const authClient = await createRouteHandlerClient()
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    // 2. Role gate — coach or super_admin only
    const { data: roleRow } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    const isSuperAdmin = roleRow?.role === 'super_admin'
    const isCoach = roleRow?.role === 'coach'
    if (!isSuperAdmin && !isCoach) {
      return errorResponse('Access denied', 403)
    }

    // 3. Parse body
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return errorResponse('Invalid JSON body', 400)
    }
    const { action, business_id, period_month } = body as {
      action?: unknown
      business_id?: unknown
      period_month?: unknown
    }
    if (
      typeof action !== 'string' ||
      typeof business_id !== 'string' ||
      typeof period_month !== 'string'
    ) {
      return errorResponse('action, business_id, period_month required', 400)
    }

    // 4. Coach-assignment guard (super_admin exempt)
    if (!isSuperAdmin) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('assigned_coach_id')
        .eq('id', business_id)
        .maybeSingle()
      if (!biz || biz.assigned_coach_id !== user.id) {
        return errorResponse('Not your assigned client', 403)
      }
    }

    // 5. Body-size guard (before dispatch — cheap reject for runaway uploads)
    const maybePdfB64 = (body as Record<string, unknown>).pdf_base64
    if (typeof maybePdfB64 === 'string' && maybePdfB64.length > MAX_PDF_BASE64_BYTES) {
      return errorResponse('PDF attachment too large (>10MB base64)', 413)
    }

    // 6. Dispatch
    switch (action) {
      case 'mark_ready':
        return await handleMarkReady(user.id, business_id, period_month)
      case 'revert_to_draft':
        return await handleRevert(business_id, period_month)
      case 'approve_and_send':
        return await handleApproveAndSend(user.id, body as ApproveSendBody)
      case 'resend':
        return await handleResend(user.id, body as ResendBody)
      default:
        return errorResponse(`Unknown action: ${action}`, 400)
    }
  } catch (err) {
    console.error('[report-status] error:', err)
    return errorResponse('Internal server error', 500)
  }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleMarkReady(userId: string, businessId: string, periodMonth: string) {
  // D-01: draft → ready_for_review (coach-only gate enforced upstream).
  const { error } = await supabase
    .from('cfo_report_status')
    .upsert(
      {
        business_id: businessId,
        period_month: periodMonth,
        status: 'ready_for_review',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id,period_month' },
    )
    .select()
    .single()

  if (error) {
    console.error('[report-status] mark_ready upsert failed:', error)
    return errorResponse('Failed to update status', 500)
  }
  return NextResponse.json({ success: true, status: 'ready_for_review' })
}

async function handleRevert(businessId: string, periodMonth: string) {
  // D-03/D-18: revert approved|sent → draft, preserve frozen payload.
  await revertReportIfApproved(supabase as any, businessId, periodMonth)
  return NextResponse.json({ success: true, status: 'draft' })
}

async function handleApproveAndSend(userId: string, body: ApproveSendBody) {
  // Validate required fields for this action up front.
  const requiredStrings = [
    'pdf_base64',
    'pdf_filename',
    'coach_name',
    'coach_email',
    'business_name',
    'month_label',
    'client_greeting_name',
    'recipient_email',
  ] as const
  for (const key of requiredStrings) {
    if (typeof body[key] !== 'string' || !body[key]) {
      return errorResponse(`Missing required field: ${key}`, 400)
    }
  }
  if (!body.snapshot_data) {
    return errorResponse('snapshot_data is required', 400)
  }

  const nowIso = new Date().toISOString()

  // Pitfall 2 step 3: write approved + snapshot BEFORE any Resend call.
  const { data: approvedRow, error: approveErr } = await supabase
    .from('cfo_report_status')
    .upsert(
      {
        business_id: body.business_id,
        period_month: body.period_month,
        status: 'approved',
        approved_by: userId,
        approved_at: nowIso,
        snapshot_data: body.snapshot_data,
        snapshot_taken_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'business_id,period_month' },
    )
    .select()
    .single()

  if (approveErr || !approvedRow) {
    console.error('[report-status] approve upsert failed:', approveErr)
    return errorResponse('Failed to write approval state', 500)
  }

  // Pitfall 2 step 4: insert cfo_email_log as pending (status_code=null).
  const { data: logRow, error: logInsertErr } = await supabase
    .from('cfo_email_log')
    .insert({
      cfo_report_status_id: approvedRow.id,
      business_id: body.business_id,
      period_month: body.period_month,
      attempted_at: nowIso,
      triggered_by: userId,
      recipient_email: body.recipient_email,
      resend_message_id: null,
      status_code: null,
      error_message: null,
    })
    .select()
    .single()

  if (logInsertErr || !logRow) {
    console.error('[report-status] email log insert failed:', logInsertErr)
    return errorResponse('Failed to record email attempt', 500)
  }

  // Pitfall 2 step 5-7: decode pdf, build URL, dispatch send.
  const pdfBuffer = Buffer.from(body.pdf_base64, 'base64')
  const reportUrl = buildReportUrl({
    statusId: approvedRow.id,
    portalSlug: body.portal_slug ?? null,
    periodMonth: body.period_month,
  })

  const sendResult = await sendMonthlyReport({
    to: body.recipient_email,
    fromEmail: body.coach_email,
    fromName: body.coach_name,
    replyToEmail: body.coach_email,
    businessName: body.business_name,
    monthLabel: body.month_label,
    clientGreetingName: body.client_greeting_name,
    reportUrl,
    pdfBuffer,
    pdfFilename: body.pdf_filename,
  })

  if (sendResult.success) {
    // Pitfall 2 step 8: update row to sent, update log with message id.
    const sentAt = new Date().toISOString()
    await supabase
      .from('cfo_report_status')
      .update({
        status: 'sent',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', approvedRow.id)

    await supabase
      .from('cfo_email_log')
      .update({
        resend_message_id: sendResult.id ?? null,
        status_code: sendResult.statusCode ?? 200,
      })
      .eq('id', logRow.id)

    return NextResponse.json({
      success: true,
      status: 'sent',
      sent_at: sentAt,
      resend_message_id: sendResult.id,
      recipient_email: body.recipient_email,
    })
  }

  // Pitfall 2 step 9: leave status='approved'; update log with error details.
  await supabase
    .from('cfo_email_log')
    .update({
      status_code: sendResult.timedOut ? null : null, // Resend errors carry no SMTP code
      error_message: sendResult.error ?? 'Unknown send failure',
    })
    .eq('id', logRow.id)

  return NextResponse.json(
    {
      success: false,
      status: 'approved',
      error: sendResult.error ?? 'Email send failed',
      errorCode: sendResult.errorCode,
      timedOut: sendResult.timedOut ?? false,
    },
    { status: 207 },
  )
}

async function handleResend(userId: string, body: ResendBody) {
  // D-13: resend already-approved/sent report. No snapshot recapture.
  const requiredStrings = [
    'pdf_base64',
    'pdf_filename',
    'coach_name',
    'coach_email',
    'business_name',
    'month_label',
    'client_greeting_name',
    'recipient_email',
  ] as const
  for (const key of requiredStrings) {
    if (typeof body[key] !== 'string' || !body[key]) {
      return errorResponse(`Missing required field: ${key}`, 400)
    }
  }

  // Lookup the current row — must be approved or sent.
  const { data: row } = await supabase
    .from('cfo_report_status')
    .select('id, status')
    .eq('business_id', body.business_id)
    .eq('period_month', body.period_month)
    .maybeSingle()

  if (!row) {
    return errorResponse('Report status row not found — approve first', 409)
  }
  if (row.status !== 'approved' && row.status !== 'sent') {
    return errorResponse(
      `Cannot resend from status='${row.status}'; require approved or sent`,
      409,
    )
  }

  const nowIso = new Date().toISOString()

  // Insert a fresh pending email log.
  const { data: logRow, error: logInsertErr } = await supabase
    .from('cfo_email_log')
    .insert({
      cfo_report_status_id: row.id,
      business_id: body.business_id,
      period_month: body.period_month,
      attempted_at: nowIso,
      triggered_by: userId,
      recipient_email: body.recipient_email,
      resend_message_id: null,
      status_code: null,
      error_message: null,
    })
    .select()
    .single()

  if (logInsertErr || !logRow) {
    console.error('[report-status] resend log insert failed:', logInsertErr)
    return errorResponse('Failed to record resend attempt', 500)
  }

  const pdfBuffer = Buffer.from(body.pdf_base64, 'base64')
  const reportUrl = buildReportUrl({
    statusId: row.id,
    portalSlug: body.portal_slug ?? null,
    periodMonth: body.period_month,
  })

  const sendResult = await sendMonthlyReport({
    to: body.recipient_email,
    fromEmail: body.coach_email,
    fromName: body.coach_name,
    replyToEmail: body.coach_email,
    businessName: body.business_name,
    monthLabel: body.month_label,
    clientGreetingName: body.client_greeting_name,
    reportUrl,
    pdfBuffer,
    pdfFilename: body.pdf_filename,
  })

  if (sendResult.success) {
    const sentAt = new Date().toISOString()
    // Set status='sent' (covers approved→sent on first successful resend).
    await supabase
      .from('cfo_report_status')
      .update({
        status: 'sent',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', row.id)

    await supabase
      .from('cfo_email_log')
      .update({
        resend_message_id: sendResult.id ?? null,
        status_code: sendResult.statusCode ?? 200,
      })
      .eq('id', logRow.id)

    return NextResponse.json({
      success: true,
      status: 'sent',
      sent_at: sentAt,
      resend_message_id: sendResult.id,
      recipient_email: body.recipient_email,
    })
  }

  await supabase
    .from('cfo_email_log')
    .update({
      status_code: null,
      error_message: sendResult.error ?? 'Unknown send failure',
    })
    .eq('id', logRow.id)

  return NextResponse.json(
    {
      success: false,
      status: row.status,
      error: sendResult.error ?? 'Email send failed',
      errorCode: sendResult.errorCode,
      timedOut: sendResult.timedOut ?? false,
    },
    { status: 207 },
  )
}
