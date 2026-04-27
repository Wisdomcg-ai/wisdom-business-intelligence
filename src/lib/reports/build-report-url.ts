// Phase 35 D-22: Forward-compatible report URL builder.
// Today: returns `/reports/view/[token]` (public, HMAC-signed).
// Phase 36 hook: if businesses.portal_slug is set, return `/portal/[slug]?month=YYYY-MM`.
// Emails sent before Phase 36 keep their token links working — this helper is only consulted
// at send time.
import { signReportToken } from './report-token'

export interface BuildReportUrlParams {
  statusId: string
  portalSlug?: string | null
  periodMonth: string  // 'YYYY-MM-DD' (from cfo_report_status.period_month) — 'YYYY-MM' also accepted
  appUrl?: string
}

function resolveAppUrl(explicit?: string): string {
  const raw = explicit ?? process.env.NEXT_PUBLIC_APP_URL
  if (!raw) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured (required to build report URLs)')
  }
  return raw.replace(/\/+$/, '')
}

function toYYYYMM(periodMonth: string): string {
  // Accepts 'YYYY-MM-DD' or 'YYYY-MM'; returns 'YYYY-MM'
  const match = /^(\d{4})-(\d{2})/.exec(periodMonth)
  if (!match) {
    throw new Error(`buildReportUrl: invalid periodMonth '${periodMonth}' (expected YYYY-MM-DD)`)
  }
  return `${match[1]}-${match[2]}`
}

export function buildReportUrl(params: BuildReportUrlParams): string {
  const base = resolveAppUrl(params.appUrl)

  if (params.portalSlug) {
    const month = toYYYYMM(params.periodMonth)
    return `${base}/portal/${encodeURIComponent(params.portalSlug)}?month=${month}`
  }

  const token = signReportToken(params.statusId)
  return `${base}/reports/view/${token}`
}
