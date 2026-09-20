'use client'
/**
 * The monthly report page's half of uploaded pages: fetch the month's files for
 * the layout's placements through /api/monthly-report/inserts, and save a
 * merged pack.
 *
 * Asks for nothing when the layout places no uploaded page, so every other
 * client's export makes exactly the requests it made before. Never throws: a
 * failure becomes a reason each placement prints, and is captured.
 */
import * as Sentry from '@sentry/nextjs'
import type { PDFLayout } from '../types/pdf-layout'
import {
  insertPlacements,
  type PackInsertRecord,
  type PackInsertSources,
} from '@/lib/monthly-report/pack-inserts'
import { insertSourcesFromRecords, type PackInsertRecordsLoad } from '@/lib/monthly-report/pack-inserts-load'

const COULD_NOT_LOAD = 'the uploaded pages could not be loaded'

export async function fetchPackInsertSources(
  businessId: string,
  reportMonth: string,
  layout: PDFLayout | null | undefined,
): Promise<PackInsertSources | undefined> {
  if (insertPlacements(layout).length === 0) return undefined
  const base = `/api/monthly-report/inserts?business_id=${encodeURIComponent(businessId)}`
  let records: PackInsertRecordsLoad
  try {
    const res = await fetch(`${base}&report_month=${encodeURIComponent(reportMonth)}`)
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) throw new Error(`inserts list ${res.status}`)
    records = body.status === 'unavailable'
      ? { status: 'unavailable', reason: typeof body.reason === 'string' && body.reason ? body.reason : COULD_NOT_LOAD }
      : { status: 'ok', latest: new Map(((body.inserts ?? []) as PackInsertRecord[]).map((r) => [r.widget_id, r])) }
  } catch (err) {
    Sentry.captureException(err, { tags: { invariant: 'pdf-inserts-load' }, extra: { businessId, reportMonth } } as never)
    records = { status: 'unavailable', reason: COULD_NOT_LOAD }
  }
  return insertSourcesFromRecords(layout, records, async (record) => {
    const res = await fetch(`${base}&id=${encodeURIComponent(record.id)}`)
    if (!res.ok) throw new Error(`insert file ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  })
}

/** Save a finished pack's bytes as a download — what jsPDF's doc.save does for a pack it wrote alone. */
export function savePdfBytes(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked later, not now: some browsers start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
