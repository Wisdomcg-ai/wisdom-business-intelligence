'use client'
// Phase 35 Plan 06: Client-side orchestrators for the four POST actions the
// /api/cfo/report-status endpoint accepts.
//
// Runs entirely in the browser:
//   - jsPDF (inside MonthlyReportPDFService) must execute in the browser
//   - arrayBufferToBase64 uses browser-native btoa + Uint8Array
//   - fetch() talks to the Next.js route which handles auth, role gate, Resend
//
// Re-uses the existing MonthlyReportPDFService — no new PDF engine (D-07) —
// through buildPackPdf, the one builder Export PDF and the preview harness
// also call, so the attachment is the file Export saves, uploaded pages and all.
import { buildPackPdf, type PackPdfOptions, type PreparedPackInserts } from './pack-pdf'
import type { PackInsertSources } from '@/lib/monthly-report/pack-inserts'
import type { GeneratedReport } from '../types'
import { printedBalanceSheets } from '@/lib/monthly-report/balance-sheet-freeze'

export interface PdfInput {
  report: GeneratedReport
  /** Everything the pack prints from — the service's own options (see pack-pdf). */
  options: PackPdfOptions
  /**
   * The layout's uploaded pages for the month (services/pack-pdf) — opened
   * already, or the files to open. Absent: a placed uploaded page prints that
   * the uploads were not loaded.
   */
  inserts?: PreparedPackInserts | PackInsertSources | null
}

// Browser-safe ArrayBuffer → base64. Chunked to avoid stack overflow on large PDFs
// (String.fromCharCode.apply has argument-count limits on some engines).
function arrayBufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = ArrayBuffer.isView(buf) ? buf : new Uint8Array(buf)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    )
  }
  return btoa(binary)
}

function sluggify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildPdfFilename(business_name: string, period_month: string): string {
  const yyyymm = period_month.slice(0, 7)
  const slug = sluggify(business_name || 'report') || 'report'
  return `${slug}-${yyyymm}-report.pdf`
}

/**
 * The send posts the pack base64 through a Vercel function, whose request body
 * is capped at 4.5 MB — over it the platform answers with a page the status bar
 * cannot read. Only a pack with an uploaded page gets near it, so only that
 * pack is checked, and the coach is told which fix is theirs to make.
 */
const SENDABLE_PDF_BASE64_CHARS = 4_000_000

async function generatePdfBase64(pdf_input: PdfInput): Promise<{ pdf_base64: string; refusal: ReportStatusApiResult | null }> {
  const pack = await buildPackPdf(pdf_input.report, pdf_input.options, pdf_input.inserts)
  const pdf_base64 = arrayBufferToBase64(pack.bytes)
  if (pack.merged && pdf_base64.length > SENDABLE_PDF_BASE64_CHARS) {
    const mb = (pack.bytes.length / (1024 * 1024)).toFixed(1)
    return {
      pdf_base64,
      refusal: {
        ok: false,
        httpStatus: 413,
        body: {
          success: false,
          errorCode: 'pdf_too_large',
          error: `the pack with its uploaded pages is ${mb} MB, too large to email. Upload a smaller PDF for ${pack.inserts.filter((i) => i.state.status === 'ready').map((i) => i.label).join(', ')} and send again.`,
        },
      },
    }
  }
  return { pdf_base64, refusal: null }
}

export interface ApproveAndSendParams {
  business_id: string
  period_month: string // 'YYYY-MM-DD'
  business_name: string
  business_slug?: string | null
  portal_slug?: string | null
  month_label: string // e.g. 'March 2026'
  client_greeting_name: string
  recipient_email: string
  coach_name: string
  coach_email: string
  pdf_input: PdfInput
  snapshot_data: unknown // ReportSnapshotV1 — assembled by caller
}

export type ResendReportParams = ApproveAndSendParams

export interface ReportStatusApiResult {
  ok: boolean
  httpStatus: number
  body: {
    success: boolean
    status?: string
    sent_at?: string
    resend_message_id?: string
    recipient_email?: string
    error?: string
    errorCode?: string
    timedOut?: boolean
  }
}

async function postAction(
  body: Record<string, unknown>,
): Promise<ReportStatusApiResult> {
  const res = await fetch('/api/cfo/report-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res
    .json()
    .catch(() => ({ success: false, error: 'Invalid JSON from server' }))
  return { ok: res.ok, httpStatus: res.status, body: json }
}

export async function markReady(
  business_id: string,
  period_month: string,
): Promise<ReportStatusApiResult> {
  return postAction({ action: 'mark_ready', business_id, period_month })
}

export async function revertToDraft(
  business_id: string,
  period_month: string,
): Promise<ReportStatusApiResult> {
  return postAction({ action: 'revert_to_draft', business_id, period_month })
}

export async function approveAndSend(
  params: ApproveAndSendParams,
): Promise<ReportStatusApiResult> {
  const { pdf_base64, refusal } = await generatePdfBase64(params.pdf_input)
  if (refusal) return refusal
  const pdf_filename = buildPdfFilename(params.business_name, params.period_month)
  return postAction({
    action: 'approve_and_send',
    business_id: params.business_id,
    period_month: params.period_month,
    snapshot_data: params.snapshot_data,
    // Package B: the balance sheets the PDF above was built from — the same
    // pdf_input, not a second fetch — kept by the route as the month's sent
    // copy. Absent (undefined, dropped by JSON) when the pack has no balance
    // sheet page. A resend posts none: it prints that copy and never rewrites it.
    balance_sheets: printedBalanceSheets(params.pdf_input.options.balanceSheets),
    pdf_base64,
    pdf_filename,
    coach_name: params.coach_name,
    coach_email: params.coach_email,
    business_name: params.business_name,
    month_label: params.month_label,
    client_greeting_name: params.client_greeting_name,
    recipient_email: params.recipient_email,
    portal_slug: params.portal_slug ?? null,
  })
}

export async function resendReport(
  params: ResendReportParams,
): Promise<ReportStatusApiResult> {
  const { pdf_base64, refusal } = await generatePdfBase64(params.pdf_input)
  if (refusal) return refusal
  const pdf_filename = buildPdfFilename(params.business_name, params.period_month)
  return postAction({
    action: 'resend',
    business_id: params.business_id,
    period_month: params.period_month,
    pdf_base64,
    pdf_filename,
    coach_name: params.coach_name,
    coach_email: params.coach_email,
    business_name: params.business_name,
    month_label: params.month_label,
    client_greeting_name: params.client_greeting_name,
    recipient_email: params.recipient_email,
    portal_slug: params.portal_slug ?? null,
  })
}
