/**
 * The PDF half of uploaded pages: open an upload, and merge uploads into a
 * finished pack.
 *
 * jsPDF, which draws the pack, cannot embed another PDF's pages. So the pack
 * is drawn first with a placeholder sheet for every page an upload will fill —
 * which keeps "Page X of N" right on every other page, because N already
 * counts them — and pdf-lib then swaps each run of placeholders for the
 * uploaded pages and stamps the pack's page number on them.
 *
 * pdf-lib is imported when a pack actually has an upload, so the other
 * clients' export never loads it.
 *
 * Used by the upload route (inspect) and by services/pack-pdf (both).
 */
import type { PDFDocument } from 'pdf-lib'
import { MAX_INSERT_PAGES, insertTooLargeReason } from './pack-inserts'

export type InsertInspection =
  | { ok: true; pageCount: number; doc: PDFDocument }
  | {
      ok: false
      kind: 'empty' | 'too_large' | 'not_pdf' | 'encrypted' | 'unreadable' | 'no_pages' | 'too_many_pages'
      /** Finishes the coach's "can't be added: …" (pre-flight) and "the upload was refused: …". */
      reason: string
    }

/** A PDF starts with %PDF- within its first kilobyte (some writers put junk first). */
function hasPdfHeader(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 1024)
  for (let i = 0; i + 4 < head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) return true
  }
  return false
}

/**
 * Whether these bytes are a PDF the pack can use, and how many pages it has.
 *
 * An encrypted file is refused even when it opens without a password (Xero and
 * payroll exports are sometimes owner-locked): its page content is encrypted
 * under a key pdf-lib does not apply, so the merged pages would be blank or
 * garbage. The pages are copied into a scratch document here, so a file that
 * parses but cannot be copied is refused at upload rather than at export.
 */
export async function inspectInsertPdf(bytes: Uint8Array, opts: { maxBytes?: number } = {}): Promise<InsertInspection> {
  if (!bytes || bytes.length === 0) return { ok: false, kind: 'empty', reason: 'the file is empty' }
  if (opts.maxBytes !== undefined && bytes.length > opts.maxBytes) {
    return { ok: false, kind: 'too_large', reason: insertTooLargeReason(bytes.length, opts.maxBytes) }
  }
  if (!hasPdfHeader(bytes)) return { ok: false, kind: 'not_pdf', reason: 'the file is not a PDF' }

  const { PDFDocument } = await import('pdf-lib')
  let doc: PDFDocument
  try {
    // Opened past its encryption only to ask whether it has any: pdf-lib's
    // EncryptedPDFError does not survive bundling as a recognisable class.
    doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true })
  } catch (err) {
    return { ok: false, kind: 'unreadable', reason: `the PDF could not be read (${(err as Error)?.message ?? 'unknown error'})` }
  }
  if (doc.isEncrypted) {
    return {
      ok: false,
      kind: 'encrypted',
      reason: 'the PDF is encrypted or password-protected — open it and print it to a new PDF, then upload that',
    }
  }

  const pageCount = doc.getPageCount()
  if (pageCount === 0) return { ok: false, kind: 'no_pages', reason: 'the PDF has no pages' }
  if (pageCount > MAX_INSERT_PAGES) {
    return { ok: false, kind: 'too_many_pages', reason: `the PDF has ${pageCount} pages; an uploaded page can be at most ${MAX_INSERT_PAGES} — is it the right file?` }
  }
  try {
    const scratch = await PDFDocument.create()
    await scratch.copyPages(doc, doc.getPageIndices())
  } catch (err) {
    return { ok: false, kind: 'unreadable', reason: `the PDF's pages could not be copied (${(err as Error)?.message ?? 'unknown error'})` }
  }
  return { ok: true, pageCount, doc }
}

/** Where a run of placeholder sheets sits in the jsPDF pack. 1-based, as jsPDF numbers pages. */
export interface InsertPlaceholder {
  widgetId: string
  firstPage: number
  pageCount: number
}

const MM = 72 / 25.4
/** addAllFooters: 10pt, 15mm in from the right edge, baseline 10mm up from the bottom. */
const FOOTER_RIGHT = 15 * MM
const FOOTER_BOTTOM = 10 * MM
const FOOTER_SIZE = 10

/**
 * Where the page number goes on an uploaded page, in the page's own
 * (unrotated) coordinates, so it reads bottom-right as the page is SHOWN.
 *
 * An uploaded page need not be A4, need not start at the origin (its crop box
 * can be offset), and can carry /Rotate — a landscape report is often a
 * portrait page rotated 90°. /Rotate turns the page clockwise for display, so
 * the visual corner maps back through the inverse turn, and the text is turned
 * the same way to run left to right on screen.
 */
export function footerPlacement(
  box: { x: number; y: number; width: number; height: number },
  rotation: number,
  textWidth: number,
): { x: number; y: number; rotate: number } {
  const turn = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360
  const visualWidth = turn === 90 || turn === 270 ? box.height : box.width
  const vx = visualWidth - FOOTER_RIGHT - textWidth
  const vy = FOOTER_BOTTOM
  switch (turn) {
    case 90:
      return { x: box.x + box.width - vy, y: box.y + vx, rotate: 90 }
    case 180:
      return { x: box.x + box.width - vx, y: box.y + box.height - vy, rotate: 180 }
    case 270:
      return { x: box.x + vy, y: box.y + box.height - vx, rotate: 270 }
    default:
      return { x: box.x + vx, y: box.y + vy, rotate: 0 }
  }
}

/**
 * Swap each run of placeholder sheets in `packBytes` for its upload's pages,
 * and number them as the pack numbers its own.
 *
 * Throws when a placeholder does not line up with its document (a count that
 * differs, a page past the end) — the caller decides what the pack says then;
 * a pack with a page quietly missing is the one outcome not on offer.
 */
export async function mergePackInserts(
  packBytes: Uint8Array,
  placeholders: readonly InsertPlaceholder[],
  docs: ReadonlyMap<string, PDFDocument>,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, degrees, rgb } = await import('pdf-lib')
  // updateMetadata: false keeps jsPDF's creation date and producer rather
  // than stamping pdf-lib's over them.
  const out = await PDFDocument.load(packBytes, { updateMetadata: false })
  const total = out.getPageCount()

  const runs = [...placeholders].sort((a, b) => a.firstPage - b.firstPage)
  runs.forEach((run, i) => {
    const doc = docs.get(run.widgetId)
    if (!doc) throw new Error(`no document for uploaded page ${run.widgetId}`)
    if (doc.getPageCount() !== run.pageCount) {
      throw new Error(`uploaded page ${run.widgetId} has ${doc.getPageCount()} pages but ${run.pageCount} were reserved`)
    }
    if (run.firstPage < 1 || run.firstPage + run.pageCount - 1 > total) {
      throw new Error(`uploaded page ${run.widgetId} reserved pages ${run.firstPage}-${run.firstPage + run.pageCount - 1} of ${total}`)
    }
    const next = runs[i + 1]
    if (next && next.firstPage < run.firstPage + run.pageCount) {
      throw new Error(`uploaded pages ${run.widgetId} and ${next.widgetId} reserved overlapping pages`)
    }
  })

  // Last run first, so the page indices of the runs before it do not move.
  const inserted: number[] = []
  for (const run of [...runs].reverse()) {
    const doc = docs.get(run.widgetId)!
    const copied = await out.copyPages(doc, doc.getPageIndices())
    const start = run.firstPage - 1
    for (let i = run.pageCount - 1; i >= 0; i--) out.removePage(start + i)
    copied.forEach((page, i) => out.insertPage(start + i, page))
    for (let i = 0; i < run.pageCount; i++) inserted.push(start + i)
  }

  const font = await out.embedFont(StandardFonts.Helvetica)
  const pages = out.getPages()
  for (const index of inserted) {
    const page = pages[index]
    const text = `Page ${index + 1} of ${total}`
    const at = footerPlacement(page.getCropBox(), page.getRotation().angle, font.widthOfTextAtSize(text, FOOTER_SIZE))
    page.drawText(text, {
      x: at.x,
      y: at.y,
      size: FOOTER_SIZE,
      font,
      color: rgb(128 / 255, 128 / 255, 128 / 255),
      rotate: degrees(at.rotate),
    })
  }

  return out.save()
}
