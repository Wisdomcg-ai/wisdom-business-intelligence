// Phase 35: Resend wrapper for monthly CFO report delivery.
// Runtime: Next.js App Router API route (Node.js runtime). NOT a Vercel Workflows module.
// See .planning/phases/35-report-approval-delivery-workflow/35-CONTEXT.md decisions D-05..D-13,
// and 35-RESEARCH.md §Pattern 2 for the verified Resend SDK shape.
//
// Why this file exists separately from src/lib/email/resend.ts: the monthly-report send has
// per-coach From addresses, PDF attachments, and a 15-second deadline that don't fit the
// generic sendEmail() helper. Isolating it here keeps it testable and auditable.

import { Resend } from 'resend'

const BRAND_ORANGE = '#F5821F'
const LOGO_URL = 'https://wisdombi.ai/images/logo-main.png'

/**
 * Escape HTML entities to prevent XSS in email templates.
 * Mirrors the helper in src/lib/email/resend.ts.
 */
function escapeHtml(text: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return text.replace(/[&<>"']/g, (c) => entities[c])
}

export interface SendMonthlyReportParams {
  /** Single recipient — businesses.owner_email (D-10). */
  to: string
  /** Assigned coach's verified sender email (D-09). Must be verified in Resend. */
  fromEmail: string
  /** Coach display name for the From header. */
  fromName: string
  /** Reply-To address; typically the same as fromEmail (D-09). */
  replyToEmail: string
  /** Business name used in subject + body (e.g. "Urban Road"). */
  businessName: string
  /** Human-readable month label (e.g. "March 2026"). */
  monthLabel: string
  /** Greeting first-name for the email body (e.g. "Sarah"). */
  clientGreetingName: string
  /** Signed snapshot URL produced by buildReportUrl(). */
  reportUrl: string
  /** Decoded client-side-generated PDF as a Node Buffer (D-07). */
  pdfBuffer: Buffer
  /** Attachment filename (e.g. "urban-road-2026-03-report.pdf"). */
  pdfFilename: string
  /** Race deadline in milliseconds. Defaults to 15_000 (D-12). */
  timeoutMs?: number
}

export interface SendMonthlyReportResult {
  success: boolean
  /** Resend message id, populated on success. */
  id?: string
  /** Human-readable error message on failure. */
  error?: string
  /** Resend error code (e.g. 'invalid_from_address'). */
  errorCode?: string
  /** HTTP-like status code; 200 on success. */
  statusCode?: number
  /** True when the 15-second deadline won the race (D-12). */
  timedOut?: boolean
}

/**
 * Build the minimal email HTML body per D-06:
 *   - Greeting + CTA button linking to the snapshot URL.
 *   - NO headline numbers, NO AI narrative.
 *   - PDF is attached separately (not referenced inline).
 */
function buildHtml(p: SendMonthlyReportParams): string {
  return `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: rgb(23, 34, 56); max-width: 600px; margin: 0 auto; padding: 24px;">
  <div style="text-align:center;margin-bottom:24px;">
    <img src="${LOGO_URL}" alt="WisdomBI" style="max-width:180px;height:auto;" />
  </div>
  <p>Hi ${escapeHtml(p.clientGreetingName)},</p>
  <p>Your ${escapeHtml(p.monthLabel)} financial report for ${escapeHtml(p.businessName)} is ready.</p>
  <p>Click the button below to view it online, or see the PDF attached to this email.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="${p.reportUrl}" style="display:inline-block;background:${BRAND_ORANGE};color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:16px;">View Report</a>
  </div>
  <p>As always, reply to this email if you have any questions.</p>
  <p>— ${escapeHtml(p.fromName)}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;" />
  <p style="color:#9ca3af;font-size:12px;text-align:center;">
    WisdomBI - Business Intelligence Platform<br>
    This email was sent to ${escapeHtml(p.to)}
  </p>
</body></html>`
}

/**
 * Deadline promise backed by AbortSignal.timeout (Node >= 17.3; our Node 20 runtime
 * has this natively). We race this against the Resend SDK call. We do NOT pass the
 * signal to Resend because the installed SDK (v6.6.0) does not expose an abort option
 * on `emails.send`; instead we race promises and accept that a timed-out send may
 * still complete on Resend's side (we simply stop waiting for it).
 */
function deadline(ms: number): Promise<SendMonthlyReportResult> {
  return new Promise((resolve) => {
    const signal = AbortSignal.timeout(ms)
    signal.addEventListener(
      'abort',
      () => {
        resolve({
          success: false,
          timedOut: true,
          error: `Resend call exceeded ${ms}ms timeout`,
        })
      },
      { once: true },
    )
  })
}

/**
 * Send the monthly CFO report via Resend.
 *
 * Throws synchronously (before any network call) if RESEND_API_KEY is unset — this
 * mirrors the "fail loudly" guidance so a misconfigured environment never silently
 * drops a send.
 *
 * On success: `{ success: true, id: <resend-message-id>, statusCode: 200 }`.
 * On Resend error: `{ success: false, errorCode, error, ... }`.
 * On timeout: `{ success: false, timedOut: true, error }`.
 */
export async function sendMonthlyReport(
  params: SendMonthlyReportParams,
): Promise<SendMonthlyReportResult> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const timeoutMs = params.timeoutMs ?? 15_000
  const from = `${params.fromName} <${params.fromEmail}>`
  const subject = `${params.businessName} — ${params.monthLabel} financial report`

  const sendPromise: Promise<SendMonthlyReportResult> = (async () => {
    try {
      const { data, error } = await resend.emails.send({
        from,
        to: params.to, // D-10: single recipient, string (not array)
        replyTo: params.replyToEmail,
        subject,
        html: buildHtml(params),
        attachments: [
          {
            filename: params.pdfFilename,
            content: params.pdfBuffer, // D-07: Buffer, not a URL path
          },
        ],
      })

      if (error) {
        return {
          success: false,
          errorCode: error.name,
          error: error.message,
        }
      }

      return {
        success: true,
        id: data?.id,
        statusCode: 200,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown Resend failure',
      }
    }
  })()

  return Promise.race([sendPromise, deadline(timeoutMs)])
}
