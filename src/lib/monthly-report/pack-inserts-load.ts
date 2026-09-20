/**
 * The read half of uploaded pages: the month's newest upload per placement, and
 * the bytes of each file a pack places.
 *
 * Shared by GET /api/monthly-report/inserts, the monthly report page's export
 * (through that route) and scripts/preview-pack.ts. Reads only; the caller
 * supplies the client, is responsible for authorisation, and says how a stored
 * file's bytes are fetched — the route through Storage, the page through the
 * route, the harness through a GET.
 *
 * The table arrives by a migration applied by hand after merge, so this reaches
 * prod first: a schema without it is 'unavailable', and every placement prints
 * that reason rather than claiming nothing was uploaded.
 */
import * as Sentry from '@sentry/nextjs'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import type { PDFLayout } from '@/app/finances/monthly-report/types/pdf-layout'
import {
  INSERTS_NOT_SET_UP_REASON,
  insertPlacements,
  isInsertsSchemaMissing,
  latestInsertByWidget,
  type PackInsertRecord,
  type PackInsertSources,
} from './pack-inserts'

type Client = { from: (table: string) => any }

export const INSERT_RECORD_COLUMNS =
  'id, business_id, report_month, widget_id, label, storage_path, filename, page_count, size_bytes, uploaded_by, created_at'

export type PackInsertRecordsLoad =
  | { status: 'ok'; latest: Map<string, PackInsertRecord> }
  | { status: 'unavailable'; reason: string }

export async function loadPackInsertRecords(supabase: Client, businessId: string, reportMonth: string): Promise<PackInsertRecordsLoad> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)
  // Ordered newest first and capped well above any month's uploads, so a cap
  // could only ever drop the OLDEST replacements, never the file that prints.
  const { data, error } = await supabase
    .from('monthly_report_inserts')
    .select(INSERT_RECORD_COLUMNS)
    .eq('business_id', ids.businessId)
    .eq('report_month', reportMonth)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    if (isInsertsSchemaMissing(error)) return { status: 'unavailable', reason: INSERTS_NOT_SET_UP_REASON }
    throw error
  }
  return { status: 'ok', latest: latestInsertByWidget((data ?? []) as PackInsertRecord[]) }
}

/**
 * What a pack builder is handed for each of a layout's uploaded pages: the
 * newest file's bytes, `missing`, or why neither could be said. A download
 * that fails is could-not-check on that page — never `missing`, which would
 * tell the coach to upload a file that is already there.
 */
export async function insertSourcesFromRecords(
  layout: PDFLayout | null | undefined,
  records: PackInsertRecordsLoad,
  download: (record: PackInsertRecord) => Promise<Uint8Array>,
): Promise<PackInsertSources> {
  const sources: PackInsertSources = {}
  for (const placement of insertPlacements(layout)) {
    if (records.status === 'unavailable') {
      sources[placement.widgetId] = { status: 'unavailable', reason: records.reason }
      continue
    }
    const record = records.latest.get(placement.widgetId)
    if (!record) {
      sources[placement.widgetId] = { status: 'missing' }
      continue
    }
    try {
      sources[placement.widgetId] = { status: 'file', bytes: await download(record), filename: record.filename }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { invariant: 'pack-insert-download' },
        extra: { widgetId: placement.widgetId, insertId: record.id, reportMonth: record.report_month },
      } as never)
      sources[placement.widgetId] = { status: 'unavailable', reason: `the uploaded file ${record.filename} could not be downloaded` }
    }
  }
  return sources
}
