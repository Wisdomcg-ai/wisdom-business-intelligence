/**
 * The one way a monthly pack becomes a file.
 *
 * Export PDF, Approve & Send / Resend (approve-and-send) and the preview
 * harness (scripts/preview-pack.ts) all call buildPackPdf, so all three
 * produce the same file — uploaded pages included. Before uploaded pages the
 * file was simply jsPDF's output, and for a pack that places none it still is,
 * byte for byte: no PDF library is loaded and the service is handed exactly
 * the options it was handed before.
 *
 * With uploaded pages it is two passes: the service draws the pack with a
 * placeholder sheet for each page of each usable upload, then pdf-lib swaps
 * the uploads' pages in and numbers them (lib/monthly-report/pack-insert-pdf).
 */
import type jsPDF from 'jspdf'
import type { PDFDocument } from 'pdf-lib'
import * as Sentry from '@sentry/nextjs'
import { MonthlyReportPDFService } from './monthly-report-pdf-service'
import type { PDFLayout } from '../types/pdf-layout'
import {
  INSERTS_NOT_LOADED_REASON,
  insertPlacements,
  type InsertPlacement,
  type PackInsertSources,
  type PackInsertState,
} from '@/lib/monthly-report/pack-inserts'
import { inspectInsertPdf, mergePackInserts } from '@/lib/monthly-report/pack-insert-pdf'

type ServiceOptions = NonNullable<ConstructorParameters<typeof MonthlyReportPDFService>[1]>
export type PackPdfOptions = Omit<ServiceOptions, 'inserts'>

export type PlacedInsert = InsertPlacement & { state: PackInsertState }

/**
 * A layout's uploaded pages with their files opened — what the pre-flight
 * panel reads and what buildPackPdf merges, opened once for both.
 */
export interface PreparedPackInserts {
  readonly kind: 'prepared'
  placements: PlacedInsert[]
  docs: Map<string, PDFDocument>
}

/**
 * Open each placement's file and say what the pack will print for it. A file
 * that cannot be used prints that it couldn't be added, carries its reason for
 * the coach's pre-flight — and is reported, because a coach uploaded it
 * believing it would go out.
 */
export async function preparePackInserts(
  layout: PDFLayout | null | undefined,
  sources: PackInsertSources | null | undefined,
): Promise<PreparedPackInserts> {
  const placements: PlacedInsert[] = []
  const docs = new Map<string, PDFDocument>()
  for (const placement of insertPlacements(layout)) {
    const source = sources?.[placement.widgetId]
    if (!source) {
      placements.push({ ...placement, state: { status: 'unavailable', reason: INSERTS_NOT_LOADED_REASON } })
      continue
    }
    if (source.status !== 'file') {
      placements.push({ ...placement, state: source })
      continue
    }
    const inspection = await inspectInsertPdf(source.bytes)
    if (inspection.ok) {
      docs.set(placement.widgetId, inspection.doc)
      placements.push({
        ...placement,
        state: { status: 'ready', pageCount: inspection.pageCount, filename: source.filename, sizeBytes: source.bytes.length },
      })
    } else {
      Sentry.captureMessage(`[PDF] uploaded page "${placement.label}" can't be used: ${inspection.reason}`, {
        level: 'warning',
        tags: { invariant: 'pack-insert-unreadable', kind: inspection.kind },
        extra: { widgetId: placement.widgetId, filename: source.filename, size: source.bytes.length },
      } as never)
      placements.push({ ...placement, state: { status: 'unavailable', reason: inspection.reason } })
    }
  }
  return { kind: 'prepared', placements, docs }
}

export interface PackPdf {
  /** What jsPDF drew — with placeholder sheets where uploads were merged. */
  doc: jsPDF
  /** The pack's file. */
  bytes: Uint8Array
  /** True when uploaded pages were merged into `bytes`; false means `bytes` is jsPDF's own output. */
  merged: boolean
  service: MonthlyReportPDFService
  inserts: PlacedInsert[]
}

function isPrepared(x: PreparedPackInserts | PackInsertSources | null | undefined): x is PreparedPackInserts {
  return !!x && (x as { kind?: unknown }).kind === 'prepared' && Array.isArray((x as PreparedPackInserts).placements)
}

export async function buildPackPdf(
  report: ConstructorParameters<typeof MonthlyReportPDFService>[0],
  options: PackPdfOptions,
  inserts: PreparedPackInserts | PackInsertSources | null | undefined,
  hooks: { beforeGenerate?: (service: MonthlyReportPDFService) => void } = {},
): Promise<PackPdf> {
  const render = (serviceOptions: ServiceOptions) => {
    const service = new MonthlyReportPDFService(report, serviceOptions)
    hooks.beforeGenerate?.(service)
    const doc = service.generate()
    return { service, doc, bytes: new Uint8Array(doc.output('arraybuffer') as ArrayBuffer) }
  }

  if (insertPlacements(options.pdfLayout).length === 0) {
    const { service, doc, bytes } = render(options)
    return { doc, bytes, merged: false, service, inserts: [] }
  }

  const prepared = isPrepared(inserts) ? inserts : await preparePackInserts(options.pdfLayout, inserts)
  const states = (placements: PlacedInsert[]) => Object.fromEntries(placements.map((p) => [p.widgetId, p.state]))
  const first = render({ ...options, inserts: states(prepared.placements) })
  // Mocked services in tests, and a layout that fell back to the legacy order, have none.
  const placeholders = first.service.insertPlaceholders ?? []
  if (placeholders.length === 0) {
    return { doc: first.doc, bytes: first.bytes, merged: false, service: first.service, inserts: prepared.placements }
  }

  try {
    const merged = await mergePackInserts(first.bytes, placeholders, prepared.docs)
    return { doc: first.doc, bytes: merged, merged: true, service: first.service, inserts: prepared.placements }
  } catch (err) {
    // The files opened and still would not merge. Draw the pack again with
    // those placements saying so — a pack whose placeholder sheets went out as
    // pages is the failure this must not produce.
    Sentry.captureException(err, {
      tags: { invariant: 'pack-insert-merge' },
      extra: { placeholders, reportMonth: (report as { report_month?: string }).report_month },
    } as never)
    const fallback = prepared.placements.map((p): PlacedInsert =>
      p.state.status === 'ready'
        ? { ...p, state: { status: 'unavailable', reason: `the uploaded file ${p.state.filename} could not be merged into the pack` } }
        : p,
    )
    const second = render({ ...options, inserts: states(fallback) })
    return { doc: second.doc, bytes: second.bytes, merged: false, service: second.service, inserts: fallback }
  }
}
