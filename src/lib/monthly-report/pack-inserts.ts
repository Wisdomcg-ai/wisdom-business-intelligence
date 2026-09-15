/**
 * Uploaded pages: the pages of a monthly pack that come from outside Xero as a
 * PDF, uploaded by the coach for the month.
 *
 * Every Calxa pack has a page or two WisdomBI does not build and should not:
 * Distinct Directions' Lumary income analysis, Dragon's Cash vs Accruals,
 * IICT's Employment Hero payroll. The plan (audit §5) is to upload them. A
 * coach places an "Uploaded page" (widget type `uploaded_insert`) where the
 * page belongs, names it, and uploads that month's PDF against the placement;
 * the export merges the file's pages in at that position.
 *
 * This module is the part every caller agrees on and that needs no PDF
 * library: which placements a layout has, what the pack says for each, and the
 * pre-flight row. The PDF work is pack-insert-pdf; the database read is
 * pack-inserts-load; the one function that builds a pack with its uploads is
 * services/pack-pdf.
 */
import type { LayoutWidget, PDFLayout } from '@/app/finances/monthly-report/types/pdf-layout'

/** The private Storage bucket (migration 20260916031500_monthly_report_inserts). */
export const REPORT_INSERTS_BUCKET = 'report-inserts'

/**
 * The largest pack file Approve & Send will email, in bytes.
 *
 * The send posts the whole PDF, base64, through a Vercel function whose
 * request body is capped at 4.5 MB — over it the platform answers with a page
 * the status bar cannot read. Base64 makes 3,000,000 bytes 4,000,000
 * characters, which leaves the rest of the body for the snapshot riding with
 * it. Approve & Send refuses a merged pack over this, and pre-flight measures
 * the built pack against the same number, so the two cannot disagree.
 */
export const SENDABLE_PACK_BYTES = 3_000_000

/**
 * The largest file the route accepts, in bytes.
 *
 * Not the storage bucket's 20 MB, and not a promise that a pack with the file
 * in it can be emailed: that depends on the pack's own pages, which run from a
 * few hundred KB to over 2 MB (Distinct Directions' August 2026 export is
2,144,349 bytes),
 * so only the built file can say — pre-flight and Approve & Send measure it
 * (packTooLargeToEmailReason). This limit refuses the file no email could
 * carry in any pack: at 2 MB a lean pack's pages still fit beside it. The
 * Lumary, payroll and cash-vs-accruals pages this exists for are a few
 * hundred KB.
 */
export const MAX_INSERT_BYTES = 2 * 1024 * 1024

const MB = 1024 * 1024

function megabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(1).replace(/\.0$/, '')} MB`
}

/** A file's size as a coach reads it: whole KB under a megabyte, else MB to one place. */
function fileSize(bytes: number, round: 'nearest' | 'up' = 'nearest'): string {
  if (bytes < MB) return `${round === 'up' ? Math.ceil(bytes / 1024) : Math.round(bytes / 1024)} KB`
  return round === 'up' ? megabytes(Math.ceil(bytes / (MB / 10)) * (MB / 10)) : megabytes(bytes)
}

/** Why a file over MAX_INSERT_BYTES is refused. */
export function insertTooLargeReason(size: number, maxBytes: number = MAX_INSERT_BYTES): string {
  return `the file is ${megabytes(size)}; an uploaded page can be at most ${megabytes(maxBytes)}, because the whole pack has to fit in the email Approve & Send posts`
}

/** More pages than any insert in the reference packs by a wide margin — a guard against the wrong file. */
export const MAX_INSERT_PAGES = 20

/** A placement's name when the coach has not given it one. */
export const DEFAULT_INSERT_LABEL = 'Uploaded page'

export interface InsertPlacement {
  widgetId: string
  label: string
}

/** The name a placement prints and the upload panel lists it under. */
export function insertLabel(widget: Pick<LayoutWidget, 'titleOverride'>): string {
  return widget.titleOverride?.trim() || DEFAULT_INSERT_LABEL
}

/** Every uploaded-page placement in a layout, in page order. */
export function insertPlacements(layout: PDFLayout | null | undefined): InsertPlacement[] {
  const out: InsertPlacement[] = []
  for (const page of layout?.pages ?? []) {
    for (const w of page.widgets ?? []) {
      if (w.type === 'uploaded_insert' && typeof w.id === 'string' && w.id) {
        out.push({ widgetId: w.id, label: insertLabel(w) })
      }
    }
  }
  return out
}

/**
 * What the pack knows about one placement's upload for the month.
 *
 * - ready: a readable PDF of `pageCount` pages and `sizeBytes` bytes; the
 *   export reserves that many pages at the placement and merges the file into
 *   them.
 * - missing: nothing uploaded for this month. The page still prints — a card
 *   saying so — never a pack that is silently a page short.
 * - unavailable: could not check, or the file cannot be used. The page prints
 *   that it couldn't be added; `reason` is for the coach (pre-flight, the
 *   harness), never printed on the client's page.
 */
export type PackInsertState =
  | { status: 'ready'; pageCount: number; filename: string; sizeBytes: number }
  | { status: 'missing' }
  | { status: 'unavailable'; reason: string }

/**
 * What a caller hands the pack builder for one placement: the file's bytes, or
 * why there are none. The builder opens the bytes and decides `ready` itself —
 * the stored page_count is a record, the file is the truth.
 */
export type PackInsertSource =
  | { status: 'file'; bytes: Uint8Array; filename: string }
  | { status: 'missing' }
  | { status: 'unavailable'; reason: string }

/** Keyed by LayoutWidget.id. */
export type PackInsertSources = Record<string, PackInsertSource>

/** Said on every placement when the export did not load the uploads at all. */
export const INSERTS_NOT_LOADED_REASON = 'the uploaded pages were not loaded for this export'

/** One row of monthly_report_inserts. */
export interface PackInsertRecord {
  id: string
  business_id: string
  report_month: string
  widget_id: string
  label: string | null
  storage_path: string
  filename: string
  page_count: number
  size_bytes: number
  uploaded_by: string | null
  created_at: string
}

/** The newest upload per placement. Rows in any order. */
export function latestInsertByWidget(rows: readonly PackInsertRecord[]): Map<string, PackInsertRecord> {
  const latest = new Map<string, PackInsertRecord>()
  for (const r of rows) {
    const held = latest.get(r.widget_id)
    if (!held || r.created_at > held.created_at || (r.created_at === held.created_at && r.id > held.id)) {
      latest.set(r.widget_id, r)
    }
  }
  return latest
}

/** Where an upload is kept. The first folder is the business, which the bucket's read policy keys on. */
export function insertStoragePath(businessId: string, reportMonth: string, widgetId: string, uploadId: string): string {
  return `${businessId}/${reportMonth}/${widgetId}/${uploadId}.pdf`
}

/** A placement id is a layout id (generateId); anything else is not ours to put in a storage path. */
export function isValidWidgetId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)
}

export function isValidReportMonth(month: unknown): month is string {
  return typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
}

/**
 * The table or its bucket is not there yet — the migration is applied by hand
 * after merge, so the code reaches prod first. Postgres undefined_table, or
 * PostgREST's schema cache not knowing the table (or a column) yet.
 */
export function isInsertsSchemaMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error?.code ?? '')
}

/** Migration 20260916031500_monthly_report_inserts creates the table and the bucket. */
export const INSERTS_NOT_SET_UP_REASON = "uploaded pages aren't set up in the database yet"

function monthName(reportMonth: string): string {
  const [y, m] = reportMonth.split('-').map(Number)
  if (!y || !m) return reportMonth
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * The card a placement prints when there is no file to merge.
 *
 * The pack goes to the client, and a card must say why "in words the owner can
 * act on" — the owner can act on neither a failed download nor a database not
 * yet migrated. So the card says only what is true for them: the month's page
 * wasn't uploaded, or couldn't be added to this pack. Why is the coach's to fix
 * and reaches the coach: the pre-flight row, the upload panel, Sentry.
 */
export function insertCardMessage(label: string, reportMonth: string, state: Exclude<PackInsertState, { status: 'ready' }>): string {
  const month = monthName(reportMonth)
  if (state.status === 'missing') {
    return `The ${label} page for ${month} hasn't been uploaded.`
  }
  return `The ${label} page for ${month} couldn't be added to this pack.`
}

function listed(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * Why a pack with uploaded pages merged into it can't be emailed, or null when
 * it can: the pack's size, and how much smaller its uploads have to be —
 * rounded up, so making that cut is enough. Approve & Send refuses with it and
 * pre-flight warns with it, from the same built file.
 */
export function packTooLargeToEmailReason(
  packBytes: number,
  placements: readonly (InsertPlacement & { state: PackInsertState })[],
): string | null {
  if (packBytes <= SENDABLE_PACK_BYTES) return null
  const head = `the pack with its uploaded pages is ${megabytes(packBytes)}, too large to email`
  const ready = placements.flatMap((p) => (p.state.status === 'ready' ? [{ label: p.label, sizeBytes: p.state.sizeBytes }] : []))
  if (ready.length === 0) return head
  const files = listed(ready.map((f) => `${f.label} (${fileSize(f.sizeBytes)})`))
  const over = packBytes - SENDABLE_PACK_BYTES
  if (over > ready.reduce((s, f) => s + f.sizeBytes, 0)) return `${head} even without ${files}`
  return ready.length === 1
    ? `${head}: ${files} has to be at least ${fileSize(over, 'up')} smaller`
    : `${head}: ${files} have to be at least ${fileSize(over, 'up')} smaller between them`
}

/**
 * The pre-flight row, or null when the pack places no uploaded page — a check
 * about a page the pack does not have would be a new row on every other
 * client's panel.
 *
 * `packBytes` is the built pack's size when uploaded pages were merged into it
 * (services/pack-pdf, `merged`): a pack Approve & Send would refuse to email
 * warns here first. Absent, the size was not measured and the row speaks only
 * to the files.
 */
export function insertPreflightRow(
  placements: readonly (InsertPlacement & { state: PackInsertState })[] | null | undefined,
  reportMonth: string,
  packBytes?: number | null,
): { key: string; label: string; status: 'pass' | 'warn'; detail: string } | null {
  if (!placements || placements.length === 0) return null
  const month = monthName(reportMonth)
  const missing = placements.filter((p) => p.state.status === 'missing')
  const unavailable = placements.filter((p) => p.state.status === 'unavailable')
  const tooLarge = packBytes == null ? null : packTooLargeToEmailReason(packBytes, placements)
  const refused = ' — Approve & Send will refuse it until then.'
  if (missing.length === 0 && unavailable.length === 0) {
    const pages = placements.reduce((s, p) => s + (p.state.status === 'ready' ? p.state.pageCount : 0), 0)
    const merged = `${placements.length} uploaded page${placements.length === 1 ? '' : 's'} for ${month} (${pages} sheet${pages === 1 ? '' : 's'}) will be merged in`
    return tooLarge
      ? { key: 'uploaded_pages', label: 'Uploaded pages', status: 'warn', detail: `${merged}, but ${tooLarge}${refused}` }
      : { key: 'uploaded_pages', label: 'Uploaded pages', status: 'pass', detail: `${merged}.` }
  }
  const parts: string[] = []
  if (missing.length > 0) {
    parts.push(`${missing.map((p) => p.label).join(', ')} ${missing.length === 1 ? 'has' : 'have'} not been uploaded for ${month} — the pack prints a notice in ${missing.length === 1 ? 'its' : 'their'} place. Upload on the External Data tab.`)
  }
  for (const p of unavailable) {
    parts.push(`${p.label} can't be added: ${(p.state as { reason: string }).reason.replace(/\.$/, '')}.`)
  }
  if (tooLarge) parts.push(`${tooLarge.charAt(0).toUpperCase()}${tooLarge.slice(1)}${refused}`)
  return { key: 'uploaded_pages', label: 'Uploaded pages', status: 'warn', detail: parts.join(' ') }
}
