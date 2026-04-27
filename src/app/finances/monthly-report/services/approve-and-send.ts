'use client'
// Phase 35 Plan 06: Client-side orchestrators for the four POST actions the
// /api/cfo/report-status endpoint accepts.
//
// Runs entirely in the browser:
//   - jsPDF (inside MonthlyReportPDFService) must execute in the browser
//   - arrayBufferToBase64 uses browser-native btoa + Uint8Array
//   - fetch() talks to the Next.js route which handles auth, role gate, Resend
//
// Re-uses the existing MonthlyReportPDFService — no new PDF engine (D-07).
import { MonthlyReportPDFService } from './monthly-report-pdf-service'
import type {
  GeneratedReport,
  VarianceCommentary,
  FullYearReport,
  SubscriptionDetailData,
  WagesDetailData,
  ReportSections,
} from '../types'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import type { PDFLayout } from '../types/pdf-layout'

export interface PdfInput {
  report: GeneratedReport
  options: {
    commentary?: VarianceCommentary
    fullYearReport?: FullYearReport
    subscriptionDetail?: SubscriptionDetailData
    wagesDetail?: WagesDetailData
    cashflowForecast?: CashflowForecastData
    sections?: ReportSections
    pdfLayout?: PDFLayout | null
  }
}

// Browser-safe ArrayBuffer → base64. Chunked to avoid stack overflow on large PDFs
// (String.fromCharCode.apply has argument-count limits on some engines).
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
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

async function generatePdfBase64(pdf_input: PdfInput): Promise<string> {
  const pdfService = new MonthlyReportPDFService(pdf_input.report, pdf_input.options)
  const doc = pdfService.generate()
  const arrayBuffer = doc.output('arraybuffer') as ArrayBuffer
  return arrayBufferToBase64(arrayBuffer)
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
  const pdf_base64 = await generatePdfBase64(params.pdf_input)
  const pdf_filename = buildPdfFilename(params.business_name, params.period_month)
  return postAction({
    action: 'approve_and_send',
    business_id: params.business_id,
    period_month: params.period_month,
    snapshot_data: params.snapshot_data,
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
  const pdf_base64 = await generatePdfBase64(params.pdf_input)
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
