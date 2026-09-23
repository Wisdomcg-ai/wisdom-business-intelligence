/**
 * Helpers for the uploaded-page tests: build an "uploaded" PDF, and read back
 * what each page of a finished pack says and how big it is.
 *
 * The uploaded pages are US Letter (612 × 792 pt) — portrait and landscape —
 * so a page's size alone says whether it is one of them or one of the pack's
 * A4 sheets (595.28 × 841.89).
 */
import { PDFDocument, PDFArray, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib'
import { jsPDF } from 'jspdf'

export const LETTER: [number, number] = [612, 792]
export const LETTER_LANDSCAPE: [number, number] = [792, 612]

/** A PDF of `sizes.length` pages, each saying `${marker} ${n}`. */
export async function uploadedPdf(marker: string, sizes: [number, number][] = [LETTER, LETTER_LANDSCAPE]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  sizes.forEach((size, i) => {
    doc.addPage(size).drawText(`${marker} ${i + 1}`, { x: 50, y: size[1] - 80, size: 20, font })
  })
  return doc.save()
}

/** An owner-and-user-password PDF, as jsPDF encrypts one. */
export function encryptedPdf(): Uint8Array {
  const doc = new jsPDF({ encryption: { userPassword: 'client', ownerPassword: 'owner', userPermissions: ['print'] } })
  doc.text('payroll', 20, 20)
  return new Uint8Array(doc.output('arraybuffer'))
}

export interface ReadPage {
  size: [number, number]
  /** Every string the page shows, literal or hex, joined by newlines. */
  text: string
}

function shownStrings(content: string): string[] {
  const out: string[] = []
  for (const m of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
    out.push(m[1].match(/../g)!.map((h) => String.fromCharCode(parseInt(h, 16))).join(''))
  }
  for (const m of content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) out.push(m[1].replace(/\\([()\\])/g, '$1'))
  return out
}

export async function readPages(bytes: Uint8Array): Promise<ReadPage[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return doc.getPages().map((page) => {
    const contents = page.node.Contents()
    const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents]
    const content = streams
      .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
      .join('\n')
    const { width, height } = page.getSize()
    return { size: [Math.round(width * 100) / 100, Math.round(height * 100) / 100], text: shownStrings(content).join('\n') }
  })
}

export const A4: [number, number] = [595.28, 841.89]
export const A4_LANDSCAPE: [number, number] = [841.89, 595.28]
